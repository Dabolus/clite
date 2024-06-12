// This API is heavily based on: https://github.com/gcui-art/suno-api/blob/eb484df/src/lib/SunoApi.ts
// But it has been simplified and debloated.

import {
  AudioInfo,
  BillingInformation,
  ClerkToken,
  Clip,
  GenerateResponse,
  Lyrics,
  LyricsJob,
  type ClerkClient,
} from './model';

export const DEFAULT_MODEL = 'chirp-v3-5';

export class SunoApi {
  private static BASE_URL = 'https://studio-api.suno.ai';
  private static CLERK_BASE_URL = 'https://clerk.suno.com';
  private static USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  private sid?: string;
  private currentToken?: string;
  private cookie?: string;

  /**
   * Pause for a specified number of seconds.
   * @param x Minimum number of seconds.
   * @param y Maximum number of seconds (optional).
   */
  private sleep(x: number, y = x): Promise<void> {
    let timeout = x * 1000;
    if (y !== x) {
      const min = Math.min(x, y);
      const max = Math.max(x, y);
      timeout = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
    }
    return new Promise(resolve => setTimeout(resolve, timeout));
  }

  private async fetchSunoApi<T = Record<string, unknown>>(
    baseUrl: typeof SunoApi.BASE_URL | typeof SunoApi.CLERK_BASE_URL,
    path: string,
    {
      body,
      headers,
      ...options
    }: Omit<RequestInit, 'body'> & {
      body?: FormData | Record<string, unknown>;
    } = {},
  ): Promise<T> {
    const res = await fetch(`${baseUrl}/${path}`, {
      ...options,
      headers: {
        'content-type':
          body instanceof FormData ? 'multipart/form-data' : 'application/json',
        ...(this.currentToken && {
          authorization: `Bearer ${this.currentToken}`,
        }),
        accept: 'application/json',
        credentials: 'include',
        'user-agent': SunoApi.USER_AGENT,
        cookie: this.cookie ?? '',
        ...headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${path}`);
    }
    const json = await res.json();
    return json;
  }

  public async init(cookie: string): Promise<SunoApi> {
    this.cookie = cookie;
    await this.getAuthToken();
    await this.keepAlive();
    return this;
  }

  public async deinit(): Promise<SunoApi> {
    this.cookie = undefined;
    this.sid = undefined;
    this.currentToken = undefined;
    return this;
  }

  /**
   * Get the session ID and save it for later use.
   */
  private async getAuthToken() {
    // Get session ID
    const sessionResponse = await this.fetchSunoApi<ClerkClient>(
      SunoApi.CLERK_BASE_URL,
      '/v1/client?_clerk_js_version=4.73.2',
    );
    if (!sessionResponse?.response?.last_active_session_id) {
      throw new Error(
        'Failed to get session id, you may need to update the Suno cookie.',
      );
    }
    // Save session ID for later use
    this.sid = sessionResponse.response.last_active_session_id;
  }

  /**
   * Keep the session alive.
   * @param isWait Indicates if the method should wait for the session to be fully renewed before returning.
   */
  public async keepAlive(isWait?: boolean): Promise<void> {
    if (!this.sid) {
      throw new Error('Session ID is not set. Cannot renew token.');
    }
    // URL to renew session token
    // Renew session token
    const renewResponse = await this.fetchSunoApi<ClerkToken>(
      SunoApi.CLERK_BASE_URL,
      `/v1/client/sessions/${this.sid}/tokens?_clerk_js_version==4.73.2`,
      {
        method: 'POST',
      },
    );
    if (isWait) {
      await this.sleep(1, 2);
    }
    // Update Authorization field in request header with the new JWT token
    this.currentToken = renewResponse.jwt;
  }

  /**
   * Generate a song based on the prompt.
   * @param prompt The text prompt to generate audio from.
   * @param make_instrumental Indicates if the generated audio should be instrumental.
   * @param wait_audio Indicates if the method should wait for the audio file to be fully generated before returning.
   * @returns
   */
  public async generate(
    prompt: string,
    make_instrumental: boolean = false,
    model?: string,
    wait_audio: boolean = false,
  ): Promise<AudioInfo[]> {
    await this.keepAlive(false);
    const startTime = Date.now();
    const audios = this.generateSongs(
      prompt,
      false,
      undefined,
      undefined,
      make_instrumental,
      model,
      wait_audio,
    );
    const costTime = Date.now() - startTime;
    return audios;
  }

  /**
   * Calls the concatenate endpoint for a clip to generate the whole song.
   * @param clip_id The ID of the audio clip to concatenate.
   * @returns A promise that resolves to an AudioInfo object representing the concatenated audio.
   * @throws Error if the response status is not 200.
   */
  public async concatenate(clip_id: string): Promise<AudioInfo> {
    await this.keepAlive(false);
    const response = await this.fetchSunoApi<AudioInfo>(
      SunoApi.BASE_URL,
      `/api/generate/concat/v2/`,
      {
        method: 'POST',
        body: { clip_id },
      },
    );
    return response;
  }

  /**
   * Generates custom audio based on provided parameters.
   *
   * @param prompt The text prompt to generate audio from.
   * @param tags Tags to categorize the generated audio.
   * @param title The title for the generated audio.
   * @param make_instrumental Indicates if the generated audio should be instrumental.
   * @param wait_audio Indicates if the method should wait for the audio file to be fully generated before returning.
   * @returns A promise that resolves to an array of AudioInfo objects representing the generated audios.
   */
  public async customGenerate(
    prompt: string,
    tags: string,
    title: string,
    make_instrumental: boolean = false,
    model?: string,
    wait_audio: boolean = false,
  ): Promise<AudioInfo[]> {
    const startTime = Date.now();
    const audios = await this.generateSongs(
      prompt,
      true,
      tags,
      title,
      make_instrumental,
      model,
      wait_audio,
    );
    const costTime = Date.now() - startTime;
    return audios;
  }

  /**
   * Generates songs based on the provided parameters.
   *
   * @param prompt The text prompt to generate songs from.
   * @param isCustom Indicates if the generation should consider custom parameters like tags and title.
   * @param tags Optional tags to categorize the song, used only if isCustom is true.
   * @param title Optional title for the song, used only if isCustom is true.
   * @param make_instrumental Indicates if the generated song should be instrumental.
   * @param wait_audio Indicates if the method should wait for the audio file to be fully generated before returning.
   * @returns A promise that resolves to an array of AudioInfo objects representing the generated songs.
   */
  private async generateSongs(
    prompt: string,
    isCustom: boolean,
    tags?: string,
    title?: string,
    make_instrumental?: boolean,
    model?: string,
    wait_audio: boolean = false,
  ): Promise<AudioInfo[]> {
    await this.keepAlive(false);
    const payload: any = {
      make_instrumental: make_instrumental == true,
      mv: model || DEFAULT_MODEL,
      prompt: '',
    };
    if (isCustom) {
      payload.tags = tags;
      payload.title = title;
      payload.prompt = prompt;
    } else {
      payload.gpt_description_prompt = prompt;
    }
    const response = await this.fetchSunoApi<GenerateResponse>(
      SunoApi.BASE_URL,
      '/api/generate/v2/',
      {
        method: 'POST',
        body: payload,
      },
    );
    const songIds = response.clips.map(({ id }) => id);
    //Want to wait for music file generation
    if (wait_audio) {
      const startTime = Date.now();
      let lastResponse: AudioInfo[] = [];
      await this.sleep(5);
      while (Date.now() - startTime < 100000) {
        const response = await this.get(songIds);
        const allCompleted = response.every(
          audio => audio.status === 'streaming' || audio.status === 'complete',
        );
        const allError = response.every(audio => audio.status === 'error');
        if (allCompleted || allError) {
          return response;
        }
        lastResponse = response;
        await this.sleep(3, 6);
        await this.keepAlive(true);
      }
      return lastResponse;
    } else {
      await this.keepAlive(true);
      return response.clips.map(audio => ({
        id: audio.id,
        title: audio.title,
        image_url: audio.image_url,
        lyric: audio.metadata.prompt,
        audio_url: audio.audio_url,
        video_url: audio.video_url,
        created_at: audio.created_at,
        model_name: audio.model_name,
        status: audio.status,
        gpt_description_prompt: audio.metadata.gpt_description_prompt,
        prompt: audio.metadata.prompt,
        type: audio.metadata.type,
        tags: audio.metadata.tags,
        duration: audio.metadata.duration_formatted,
        error_message: audio.metadata.error_message,
      }));
    }
  }

  /**
   * Generates lyrics based on a given prompt.
   * @param prompt The prompt for generating lyrics.
   * @returns The generated lyrics text.
   */
  public async generateLyrics(prompt: string): Promise<Lyrics> {
    await this.keepAlive(false);
    // Initiate lyrics generation
    const generateResponse = await this.fetchSunoApi<{ id: string }>(
      SunoApi.BASE_URL,
      '/api/generate/lyrics/',
      {
        method: 'POST',
        body: { prompt },
      },
    );
    const generateId = generateResponse.id;

    // Poll for lyrics completion
    let lyricsResponse = await this.fetchSunoApi<LyricsJob>(
      SunoApi.BASE_URL,
      `/api/generate/lyrics/${generateId}`,
    );
    while (lyricsResponse?.status !== 'complete') {
      await this.sleep(2); // Wait for 2 seconds before polling again
      lyricsResponse = await this.fetchSunoApi<LyricsJob>(
        SunoApi.BASE_URL,
        `/api/generate/lyrics/${generateId}`,
      );
    }

    // Return the generated lyrics text
    return {
      title: lyricsResponse.title,
      text: lyricsResponse.text,
    };
  }

  /**
   * Extends an existing audio clip by generating additional content based on the provided prompt.
   *
   * @param audioId The ID of the audio clip to extend.
   * @param prompt The prompt for generating additional content.
   * @param continueAt Extend a new clip from a song at mm:ss(e.g. 00:30). Default extends from the end of the song.
   * @param tags Style of Music.
   * @param title Title of the song.
   * @returns A promise that resolves to an AudioInfo object representing the extended audio clip.
   */
  public async extendAudio(
    audioId: string,
    prompt = '',
    continueAt = '0',
    tags = '',
    title = '',
    model = DEFAULT_MODEL,
  ): Promise<AudioInfo> {
    const response = await this.fetchSunoApi<AudioInfo>(
      SunoApi.BASE_URL,
      '/api/generate/v2/',
      {
        method: 'POST',
        body: {
          continue_clip_id: audioId,
          continue_at: continueAt,
          mv: model,
          prompt,
          tags,
          title,
        },
      },
    );
    return response;
  }

  /**
   * Processes the lyrics (prompt) from the audio metadata into a more readable format.
   * @param prompt The original lyrics text.
   * @returns The processed lyrics text.
   */
  private parseLyrics(prompt: string): string {
    // Assuming the original lyrics are separated by a specific delimiter (e.g., newline), we can convert it into a more readable format.
    // The implementation here can be adjusted according to the actual lyrics format.
    // For example, if the lyrics exist as continuous text, it might be necessary to split them based on specific markers (such as periods, commas, etc.).
    // The following implementation assumes that the lyrics are already separated by newlines.

    // Split the lyrics using newline and ensure to remove empty lines.
    const lines = prompt.split('\n').filter(line => line.trim() !== '');

    // Reassemble the processed lyrics lines into a single string, separated by newlines between each line.
    // Additional formatting logic can be added here, such as adding specific markers or handling special lines.
    return lines.join('\n');
  }

  /**
   * Retrieves audio information for the given song IDs.
   * @param songIds An optional array of song IDs to retrieve information for.
   * @returns A promise that resolves to an array of AudioInfo objects.
   */
  public async get(songIds?: string[]): Promise<AudioInfo[]> {
    await this.keepAlive(false);
    const response = await this.fetchSunoApi<AudioInfo[]>(
      SunoApi.BASE_URL,
      `/api/feed/${songIds ? `?ids=${songIds.join(',')}` : ''}`,
    );
    return response.map((audio: any) => ({
      id: audio.id,
      title: audio.title,
      image_url: audio.image_url,
      lyric: audio.metadata.prompt
        ? this.parseLyrics(audio.metadata.prompt)
        : '',
      audio_url: audio.audio_url,
      video_url: audio.video_url,
      created_at: audio.created_at,
      model_name: audio.model_name,
      status: audio.status,
      gpt_description_prompt: audio.metadata.gpt_description_prompt,
      prompt: audio.metadata.prompt,
      type: audio.metadata.type,
      tags: audio.metadata.tags,
      duration: audio.metadata.duration_formatted,
      error_message: audio.metadata.error_message,
    }));
  }

  /**
   * Retrieves information for a specific audio clip.
   * @param clipId The ID of the audio clip to retrieve information for.
   * @returns A promise that resolves to an object containing the audio clip information.
   */
  public async getClip(clipId: string): Promise<Clip> {
    await this.keepAlive(false);
    const response = await this.fetchSunoApi<Clip>(
      SunoApi.BASE_URL,
      `/api/clip/${clipId}`,
    );
    return response;
  }

  public async getCredits(): Promise<BillingInformation> {
    await this.keepAlive(false);
    const response = await this.fetchSunoApi<BillingInformation>(
      SunoApi.BASE_URL,
      '/api/billing/info/',
    );
    return response;
  }
}
