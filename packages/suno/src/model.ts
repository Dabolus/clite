export interface AudioInfo {
  id: string; // Unique identifier for the audio
  title: string | null; // Title of the audio
  image_url: string | null; // URL of the image associated with the audio
  lyric: string | null; // Lyrics of the audio
  audio_url: string | null; // URL of the audio file
  video_url: string | null; // URL of the video associated with the audio
  created_at: string; // Date and time when the audio was created
  model_name: string; // Name of the model used for audio generation
  gpt_description_prompt: string | null; // Prompt for GPT description
  prompt: string | null; // Prompt for audio generation
  status: string; // Status
  type: string | null;
  tags: string | null; // Genre of music.
  duration: string | null; // Duration of the audio
  error_message: string | null; // Error message if any
}

export interface ClerkToken {
  object: 'token';
  jwt: string;
}

export interface ClerkSession {
  object: 'session';
  id: string;
  status: string;
  expire_at: number;
  abandon_at: number;
  last_active_at: number;
  last_active_organization_id: string | null;
  actor: null;
  user: {
    id: string;
    object: 'user';
    username: null;
    first_name: string;
    last_name: string;
    image_url: string;
    has_image: boolean;
    primary_email_address_id: string | null;
    primary_phone_number_id: string | null;
    primary_web3_wallet_id: string | null;
    password_enabled: boolean;
    two_factor_enabled: boolean;
    totp_enabled: boolean;
    backup_code_enabled: boolean;
    email_addresses: {
      id: string;
      object: 'email_address';
      email_address: string;
      reserved: boolean;
      verification: {
        status: string;
        strategy: string;
        attempts: number | null;
        expire_at: number | null;
      };
      linked_to: unknown[];
      created_at: number;
      updated_at: number;
    }[];
    phone_numbers: unknown[];
    web3_wallets: unknown[];
    passkeys: unknown[];
    external_accounts: unknown[];
    saml_accounts: unknown[];
    public_metadata: unknown;
    unsafe_metadata: unknown;
    external_id: string | null;
    last_sign_in_at: number;
    banned: boolean;
    locked: boolean;
    lockout_expires_in_seconds: number | null;
    verification_attempts_remaining: number;
    created_at: number;
    updated_at: number;
    delete_self_enabled: boolean;
    create_organization_enabled: boolean;
    last_active_at: number | null;
    mfa_enabled_at: number | null;
    mfa_disabled_at: number | null;
    profile_image_url: string;
    organization_memberships: unknown[];
  };
  public_user_data: {
    first_name: string;
    last_name: string;
    image_url: string;
    has_image: boolean;
    identifier: string;
    profile_image_url: string;
  };
  created_at: number;
  updated_at: number;
  last_active_token: ClerkToken;
}

export interface ClerkClient {
  response: {
    object: 'client';
    id: string;
    sessions: ClerkSession[];
    sign_in: unknown;
    sign_up: unknown;
    last_active_session_id: string;
    created_at: number;
    updated_at: number;
  };
  client: unknown;
}

export interface ClipMetadata {
  tags: string;
  prompt: string;
  gpt_description_prompt: string | null;
  audio_prompt_id: string | null;
  history: string | null;
  concat_history: string | null;
  type: 'gen';
  duration: number | null;
  duration_formatted: string | null;
  refund_credits: null;
  stream: boolean;
  infill: null;
  has_vocal: null;
  is_audio_upload_tos_accepted: null;
  error_type: null;
  error_message: null;
}

export interface Clip {
  id: string;
  video_url: string;
  audio_url: string;
  image_url: string | null;
  image_large_url: string | null;
  is_video_pending: boolean;
  major_model_version: string;
  model_name: string;
  metadata: ClipMetadata;
  is_liked: boolean;
  user_id: string;
  display_name: string;
  handle: string;
  is_handle_updated: boolean;
  avatar_image_url: string | null;
  is_trashed: boolean;
  reaction: null;
  created_at: string;
  status: string;
  title: string;
  play_count: number;
  upvote_count: number;
  is_public: boolean;
}

export interface GenerateResponse {
  id: string;
  clips: Clip[];
  metadata: ClipMetadata;
  major_model_version: string;
  status: string;
  created_at: string;
  batch_size: number;
}

export interface LyricsJob {
  status: string;
  title: string;
  text: string;
}

export type Lyrics = Omit<LyricsJob, 'status'>;

export interface BillingInformation {
  total_credits_left: number;
  period: string;
  monthly_limit: number;
  monthly_usage: number;
}
