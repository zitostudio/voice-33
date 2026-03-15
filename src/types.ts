import { IAgoraRTCClient } from 'agora-rtc-sdk-ng';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'host' | 'listener';
  createdAt: any;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  password?: string;
  hasPassword: boolean;
  createdBy: string;
  createdAt: any;
  activeHosts: Record<string, boolean>;
  participants?: Record<string, boolean>;
  mutedUsers?: Record<string, boolean>;
  audioUrl?: string;
  isPlaying?: boolean;
}

export interface VoiceState {
  isMuted: boolean;
  isJoined: boolean;
  remoteUsers: string[];
}
