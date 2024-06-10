export interface BaseResponse {
  success: boolean;
}

export interface Model {
  model_token: string;
  tts_model_type: string;
  creator_user_token: string;
  creator_username: string;
  creator_display_name: string;
  creator_gravatar_hash: string;
  title: string;
  ietf_language_tag: string;
  ietf_primary_language_subtag: string;
  is_front_page_featured: false;
  is_twitch_featured: false;
  maybe_suggested_unique_bot_command: string | null;
  creator_set_visibility: string;
  user_ratings: {
    positive_count: number;
    negative_count: number;
    total_count: number;
  };
  category_tokens: string[];
  created_at: string;
  updated_at: string;
}

export interface Job {
  job_token: string;
  status:
    | 'pending'
    | 'started'
    | 'complete_success'
    | 'complete_failure'
    | 'attempt_failed'
    | 'dead';
  maybe_extra_status_description: string | null;
  attempt_count: number;
  maybe_result_token: string | null;
  maybe_public_bucket_wav_audio_path: string | null;
  model_token: string;
  tts_model_type: string;
  title: string;
  raw_inference_text: string;
  created_at: string;
  updated_at: string;
}

export interface TextToSpeechOptions {
  pollInterval?: number;
}

export interface VoiceToVoiceOptions extends TextToSpeechOptions {
  source?: 'file' | 'device';
  autoPredictF0?: boolean;
  overrideF0Method?: 'rmvpe' | 'crepe' | 'harvest';
  transpose?: number;
  voiceConversionModelToken?: string;
}
