import type {
  BaseResponse,
  Model,
  Job,
  TextToSpeechOptions,
  VoiceToVoiceOptions,
} from './model.js';

export class FakeYou {
  private sessionCookie?: string;

  private static escapeForRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async fetchFakeYouApi(
    path: string,
    {
      body,
      headers,
      ...options
    }: Omit<RequestInit, 'body'> & {
      body?: FormData | Record<string, unknown>;
    } = {},
  ): Promise<Response> {
    const res = await fetch(`https://api.fakeyou.com/${path}`, {
      ...options,
      ...(body && {
        body: body instanceof FormData ? body : JSON.stringify(body),
      }),
      headers: {
        'content-type':
          body instanceof FormData ? 'multipart/form-data' : 'application/json',
        accept: 'application/json',
        credentials: 'include',
        ...(this.sessionCookie && { cookie: `visitor=${this.sessionCookie}` }),
        ...headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${path}`);
    }
    return res;
  }

  private request = async <
    T = Record<string, unknown>,
    F extends string = string,
  >(
    path: string,
    resultField: F,
    options?: Omit<RequestInit, 'body'> & {
      body?: FormData | Record<string, unknown>;
    },
  ): Promise<T> => {
    const res = await this.fetchFakeYouApi(path, options);
    const json = (await res.json()) as BaseResponse & {
      [key in typeof resultField]: T;
    };
    if (!json.success) {
      throw new Error(`Failed to fetch ${path}`);
    }
    return json[resultField];
  };

  async init(usernameOrEmail: string, password: string): Promise<FakeYou> {
    const res = await this.fetchFakeYouApi('v1/login', {
      method: 'POST',
      body: {
        username_or_email: usernameOrEmail,
        password: password,
      },
    });
    const { success } = (await res.json()) as BaseResponse;
    if (!success) {
      throw new Error('Login failed');
    }
    this.sessionCookie = res.headers
      .get('set-cookie')
      ?.match(/^\w+.=([^;]+)/)?.[1];
    return this;
  }

  async deinit(): Promise<FakeYou> {
    const res = await this.fetchFakeYouApi('v1/logout', {
      method: 'POST',
    });
    const { success } = (await res.json()) as BaseResponse;
    if (!success) {
      throw new Error('Logout failed');
    }
    this.sessionCookie = undefined;
    return this;
  }

  listModels(): Promise<Model[]> {
    return this.request<Model[]>('tts/list', 'models');
  }

  async searchModel(query: string, language?: string): Promise<Model[]> {
    const filterRegex = new RegExp(
      FakeYou.escapeForRegex(query.trim()).replace(/\s+/g, '\\s+'),
      'i',
    );
    const models = await this.listModels();
    const candidates = models.filter(model => filterRegex.test(model.title));
    // Give priority to language matches, then to title matches
    const sortedMatches = candidates.sort((a, b) => {
      if (language) {
        if (a.ietf_language_tag.slice(0, 2) === language) {
          return -1;
        }
        if (b.ietf_language_tag.slice(0, 2) === language) {
          return 1;
        }
      }
      return a.title.localeCompare(b.title);
    });
    return sortedMatches;
  }

  async waitForJobCompletion(
    jobToken: string,
    pollInterval = 2000,
  ): Promise<Job> {
    let job: Job;
    do {
      job = await this.request<Job>(`tts/job/${jobToken}`, 'state');
      if (job.status === 'pending' || job.status === 'started') {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    } while (job.status === 'pending' || job.status === 'started');
    if (job.status !== 'complete_success') {
      throw new Error(`TTS job failed with status: ${job.status}`);
    }
    return job;
  }

  async textToSpeech(
    modelToken: string,
    text: string,
    { pollInterval = 2000 }: TextToSpeechOptions = {},
  ): Promise<ArrayBuffer> {
    const jobToken = await this.request<string>(
      'tts/inference',
      'inference_job_token',
      {
        method: 'POST',
        body: {
          uuid_idempotency_token: crypto.randomUUID(),
          tts_model_token: modelToken,
          inference_text: text
            // Add newlines after punctuation marks to improve TTS quality
            .replace(/[.,!?:;]/g, '$&\n'),
        },
      },
    );
    const job = await this.waitForJobCompletion(jobToken, pollInterval);
    if (!job.maybe_public_bucket_wav_audio_path) {
      throw new Error('Failed to get TTS inference result');
    }
    const ttsRes = await fetch(
      `https://storage.googleapis.com/vocodes-public${job.maybe_public_bucket_wav_audio_path}`,
    );
    return ttsRes.arrayBuffer();
  }

  async voiceToVoice(
    modelToken: string,
    voice: ArrayBuffer,
    {
      source = 'file',
      autoPredictF0 = false,
      overrideF0Method = 'rmvpe',
      transpose = 0,
      pollInterval = 2000,
    }: VoiceToVoiceOptions = {},
  ): Promise<ArrayBuffer> {
    const formData = new FormData();
    formData.append('uuid_idempotency_token', crypto.randomUUID());
    formData.append(
      'file',
      new Blob([voice], { type: 'audio/wav' }),
      'voice.wav',
    );
    formData.append('source', source);

    const uploadToken = await this.request<string>(
      'v1/media_uploads/upload_audio',
      'upload_token',
      {
        method: 'POST',
        body: formData,
      },
    );

    const jobToken = await this.request<string>(
      'v1/voice_conversion/inference',
      'inference_job_token',
      {
        body: {
          auto_predict_f0: autoPredictF0,
          override_f0_method: overrideF0Method,
          transpose: transpose,
          source_media_upload_token: uploadToken,
          uuid_idempotency_token: crypto.randomUUID(),
          voice_conversion_model_token: modelToken,
        },
      },
    );
    const job = await this.waitForJobCompletion(jobToken, pollInterval);
    if (!job.maybe_public_bucket_wav_audio_path) {
      throw new Error('Failed to get TTS inference result');
    }
    const ttsRes = await fetch(
      `https://storage.googleapis.com/vocodes-public${job.maybe_public_bucket_wav_audio_path}`,
    );
    return ttsRes.arrayBuffer();
  }
}
