export type UserRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'active' | 'suspended';
export type MediaType = 'photo' | 'video';
export type MediaStatus = 'queued' | 'processing' | 'ready' | 'failed';
export type PermTarget = 'user' | 'group';

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface Group {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Category {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  cover_media_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Event {
  id: string;
  category_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  location_name: string | null;
  cover_media_id: string | null;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface EventPermission {
  id: string;
  event_id: string;
  target_type: PermTarget;
  target_id: string;
  granted_by: string;
  granted_at: Date;
}

export interface Media {
  id: string;
  event_id: string;
  uploader_id: string | null;
  media_type: MediaType;
  status: MediaStatus;
  original_filename: string;
  original_path: string;
  original_size_bytes: number | null;
  mime_type: string | null;
  thumb_path: string | null;
  preview_path: string | null;
  video_path: string | null;
  width: number | null;
  height: number | null;
  duration_secs: number | null;
  taken_at: Date | null;
  camera_make: string | null;
  camera_model: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
}

// Tell @fastify/jwt what shape the decoded JWT payload has.
// This makes request.user properly typed without conflicting with fastify's own declarations.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; role: UserRole; status: UserStatus };
    user: { id: string; role: UserRole; status: UserStatus };
  }
}
