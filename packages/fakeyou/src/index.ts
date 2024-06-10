import type {
  BaseResponse,
  Model,
  Job,
  TextToSpeechOptions,
  VoiceToVoiceOptions,
} from './model.js';

let sessionCookie: string | undefined;

const escapeForRegex = (string: string) =>
  string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fetchFakeYouApi = async (
  path: string,
  {
    body,
    headers,
    ...options
  }: Omit<RequestInit, 'body'> & {
    body?: FormData | Record<string, unknown>;
  } = {},
): Promise<Response> => {
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
      ...(sessionCookie && { cookie: `visitor=${sessionCookie}` }),
      ...headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return res;
};

const request = async <T = Record<string, unknown>, F extends string = string>(
  path: string,
  resultField: F,
  options?: Omit<RequestInit, 'body'> & {
    body?: FormData | Record<string, unknown>;
  },
): Promise<T> => {
  const res = await fetchFakeYouApi(path, options);
  const json = (await res.json()) as BaseResponse & {
    [key in typeof resultField]: T;
  };
  if (!json.success) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return json[resultField];
};

export const login = async (
  usernameOrEmail: string,
  password: string,
): Promise<void> => {
  const res = await fetchFakeYouApi('v1/login', {
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
  sessionCookie = res.headers.get('set-cookie')?.match(/^\w+.=([^;]+)/)?.[1];
};

export const logout = async (): Promise<void> => {
  const res = await fetchFakeYouApi('v1/logout', {
    method: 'POST',
  });
  const { success } = (await res.json()) as BaseResponse;
  if (!success) {
    throw new Error('Logout failed');
  }
  sessionCookie = undefined;
};

export const listModels = (): Promise<Model[]> =>
  request<Model[]>('tts/list', 'models');

export const searchModel = async (
  query: string,
  language?: string,
): Promise<Model[]> => {
  const filterRegex = new RegExp(
    escapeForRegex(query.trim()).replace(/\s+/g, '\\s+'),
    'i',
  );
  const models = await listModels();
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
};

const waitForJobCompletion = async (
  jobToken: string,
  pollInterval = 2000,
): Promise<Job> => {
  let job: Job;
  do {
    job = await request<Job>(`tts/job/${jobToken}`, 'state');
    if (job.status === 'pending' || job.status === 'started') {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  } while (job.status === 'pending' || job.status === 'started');
  if (job.status !== 'complete_success') {
    throw new Error(`TTS job failed with status: ${job.status}`);
  }
  return job;
};

export const textToSpeech = async (
  modelToken: string,
  text: string,
  { pollInterval = 2000 }: TextToSpeechOptions = {},
): Promise<ArrayBuffer> => {
  const jobToken = await request<string>(
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
  const job = await waitForJobCompletion(jobToken, pollInterval);
  if (!job.maybe_public_bucket_wav_audio_path) {
    throw new Error('Failed to get TTS inference result');
  }
  const ttsRes = await fetch(
    `https://storage.googleapis.com/vocodes-public${job.maybe_public_bucket_wav_audio_path}`,
  );
  return ttsRes.arrayBuffer();
};

export const voiceToVoice = async (
  modelToken: string,
  voice: ArrayBuffer,
  {
    source = 'file',
    autoPredictF0 = false,
    overrideF0Method = 'rmvpe',
    transpose = 0,
    pollInterval = 2000,
  }: VoiceToVoiceOptions = {},
): Promise<ArrayBuffer> => {
  const formData = new FormData();
  formData.append('uuid_idempotency_token', crypto.randomUUID());
  formData.append(
    'file',
    new Blob([voice], { type: 'audio/wav' }),
    'voice.wav',
  );
  formData.append('source', source);

  const uploadToken = await request<string>(
    'v1/media_uploads/upload_audio',
    'upload_token',
    {
      method: 'POST',
      body: formData,
    },
  );

  const jobToken = await request<string>(
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
  const job = await waitForJobCompletion(jobToken, pollInterval);
  if (!job.maybe_public_bucket_wav_audio_path) {
    throw new Error('Failed to get TTS inference result');
  }
  const ttsRes = await fetch(
    `https://storage.googleapis.com/vocodes-public${job.maybe_public_bucket_wav_audio_path}`,
  );
  return ttsRes.arrayBuffer();
};
