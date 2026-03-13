import AgoraRTC, { IAgoraRTCClient, ILocalAudioTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng';

// Use environment variable for Agora App ID
const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID; 
// Force token to be null since we require "App ID only" mode for dynamic rooms
const AGORA_TOKEN = null;

export class AgoraService {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: ILocalAudioTrack | null = null;
  private isJoining = false;
  private currentJoinId = 0;
  private leavePromise: Promise<void> | null = null;
  public onVolumeChange: ((volumes: { uid: string, level: number }[]) => void) | null = null;
  public onConnectionStateChange: ((state: string) => void) | null = null;
  private remoteAudioTracks: Map<string, IRemoteAudioTrack> = new Map();

  private initClient() {
    if (!this.client) {
      this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      
      this.client.enableAudioVolumeIndicator();

      this.client.on('connection-state-change', (curState, revState, reason) => {
        console.log(`Agora Connection State Change: ${revState} -> ${curState}, reason: ${reason}`);
        if (this.onConnectionStateChange) {
          this.onConnectionStateChange(curState);
        }
      });

      this.client.on('volume-indicator', (volumes) => {
        if (this.onVolumeChange) {
          this.onVolumeChange(volumes.map(v => ({ uid: String(v.uid), level: v.level })));
        }
      });

      this.client.on('user-published', async (user, mediaType: 'audio' | 'video') => {
        try {
          await this.client?.subscribe(user, mediaType);
          if (mediaType === 'audio' && user.audioTrack) {
            this.remoteAudioTracks.set(String(user.uid), user.audioTrack);
            try {
              user.audioTrack.play();
            } catch (playError: any) {
              const msg = playError?.message || String(playError);
              if (!msg.includes('The play() request was interrupted')) {
                console.warn('Agora audio play interrupted:', playError);
              }
            }
          }
        } catch (error) {
          console.error('Error subscribing to user', error);
        }
      });

      this.client.on('user-unpublished', (user) => {
        if (user.audioTrack) {
          user.audioTrack.stop();
          this.remoteAudioTracks.delete(String(user.uid));
        }
      });
    }
    return this.client;
  }

  async setRemoteMute(muted: boolean) {
    for (const track of this.remoteAudioTracks.values()) {
      try {
        if (muted) {
          track.stop();
        } else {
          track.play();
        }
      } catch (error: any) {
        const msg = error?.message || String(error);
        if (!msg.includes('The play() request was interrupted')) {
          console.error('Error toggling remote mute', error);
        }
      }
    }
  }

  async join(channel: string, uid: string, role: 'host' | 'listener') {
    if (!AGORA_APP_ID) {
      throw new Error("Agora App ID is missing. Please set VITE_AGORA_APP_ID in environment variables.");
    }

    // Wait if another join is in progress
    while (this.isJoining) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Wait for any pending leave to finish
    if (this.leavePromise) {
      await this.leavePromise;
    }

    this.isJoining = true;
    const joinId = ++this.currentJoinId;

    try {
      const client = this.initClient();
      
      // Ensure we are not already in a channel
      if (client.connectionState !== 'DISCONNECTED') {
        try {
          await client.leave();
        } catch (e) {
          // Ignore errors here
        }
      }

      if (joinId !== this.currentJoinId) throw new Error("OPERATION_ABORTED: Join cancelled");

      // Join the channel
      // If you get "dynamic use static key", it means your Agora project has "App Certificate" enabled.
      // You must either:
      // 1. Disable "App Certificate" in Agora Console (switch to "App ID only" for testing)
      // 2. Provide a valid token via VITE_AGORA_TOKEN
      try {
        await client.join(AGORA_APP_ID, channel, AGORA_TOKEN, uid);
      } catch (error: any) {
        if (error.message?.includes('Client already left')) {
          throw new Error("OPERATION_ABORTED: Join cancelled");
        } else if (error.message?.includes('dynamic use static key')) {
          throw new Error("Agora Security Mismatch: Your Agora project has 'App Certificate' enabled. For this app to work, you must create a NEW Agora project and select 'App ID' as the authentication mechanism, then use that new App ID.");
        } else if (error.message?.includes('invalid token')) {
          if (!AGORA_TOKEN) {
            throw new Error("Agora Error: Your project requires a token, which means 'App Certificate' is still enabled. You MUST create a completely NEW project in Agora Console, select 'App ID' (without certificate) during creation, and replace your VITE_AGORA_APP_ID.");
          } else {
            throw new Error("Agora Error: The token in VITE_AGORA_TOKEN is invalid. Please delete the VITE_AGORA_TOKEN variable entirely, create a NEW Agora project with 'App ID' only, and update VITE_AGORA_APP_ID.");
          }
        } else if (error.code === 'CAN_NOT_GET_GATEWAY_SERVER') {
          throw new Error(`Agora Connection Error: ${error.message}`);
        }
        throw error;
      }

      if (joinId !== this.currentJoinId) {
        try { await client.leave(); } catch (e) {}
        throw new Error("OPERATION_ABORTED: Join cancelled");
      }

      if (role === 'host') {
        try {
          this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          
          if (joinId !== this.currentJoinId) {
            this.localAudioTrack.stop();
            this.localAudioTrack.close();
            this.localAudioTrack = null;
            try { await client.leave(); } catch (e) {}
            throw new Error("OPERATION_ABORTED: Join cancelled");
          }
          
          try {
            await client.publish([this.localAudioTrack]);
          } catch (error: any) {
            if (error.message?.includes('Client already left')) {
              throw new Error("OPERATION_ABORTED: Join cancelled");
            }
            throw error;
          }
        } catch (error: any) {
          if (error.message?.includes('OPERATION_ABORTED')) throw error;
          console.error('Microphone access denied', error);
          // Proceed without mic if denied
          this.localAudioTrack = null;
        }
      }
    } finally {
      if (joinId === this.currentJoinId) {
        this.isJoining = false;
      } else {
        // If another join started, let it handle its own state
        // But we should make sure we don't leave isJoining true forever if we were the last one
        // Actually, if joinId !== this.currentJoinId, it means leave() was called.
        // wait, leave() increments currentJoinId!
      }
    }
  }

  async leave() {
    this.currentJoinId++; // Invalidate any ongoing joins
    this.isJoining = false; // Reset joining state so new joins can start immediately
    
    const doLeave = async () => {
      if (this.client) {
        try {
          if (this.localAudioTrack && this.client.connectionState === 'CONNECTED') {
            await this.client.unpublish([this.localAudioTrack]);
          }
        } catch (e) {
          console.warn('Error unpublishing during leave', e);
        }
      }

      if (this.localAudioTrack) {
        try {
          this.localAudioTrack.stop();
          this.localAudioTrack.close();
        } catch (e) {
          console.warn('Error closing track during leave', e);
        }
        this.localAudioTrack = null;
      }

      if (this.client) {
        try {
          if (this.client.connectionState !== 'DISCONNECTED') {
            await this.client.leave();
          }
        } catch (error: any) {
          if (!error.message?.includes('Client already left')) {
            console.error('Error leaving Agora channel', error);
          }
        }
      }
      this.remoteAudioTracks.clear();
    };

    if (this.leavePromise) {
      this.leavePromise = this.leavePromise.then(doLeave);
    } else {
      this.leavePromise = doLeave();
    }

    const currentPromise = this.leavePromise;
    try {
      await currentPromise;
    } finally {
      if (this.leavePromise === currentPromise) {
        this.leavePromise = null;
      }
    }
  }

  hasLocalAudioTrack() {
    return this.localAudioTrack !== null;
  }

  async changeRole(role: 'host' | 'listener') {
    if (!this.client || this.client.connectionState === 'DISCONNECTED') {
      return; // Not joined yet
    }

    if (role === 'host') {
      if (!this.localAudioTrack) {
        try {
          this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          await this.client.publish([this.localAudioTrack]);
        } catch (error) {
          console.error('Error publishing microphone', error);
          this.localAudioTrack = null;
          throw new Error("MIC_DENIED");
        }
      }
    } else {
      if (this.localAudioTrack) {
        try {
          await this.client.unpublish([this.localAudioTrack]);
        } catch (e) {
          console.error('Error unpublishing', e);
        }
        this.localAudioTrack.stop();
        this.localAudioTrack.close();
        this.localAudioTrack = null;
      }
    }
  }

  async setMute(muted: boolean) {
    if (!muted && !this.localAudioTrack) {
      try {
        this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (this.client && this.client.connectionState !== 'DISCONNECTED') {
          await this.client.publish([this.localAudioTrack]);
        }
      } catch (error) {
        console.error('Error creating/publishing microphone', error);
        throw new Error("Microphone access denied. Please allow microphone permissions.");
      }
    } else if (this.localAudioTrack) {
      try {
        await this.localAudioTrack.setEnabled(!muted);
      } catch (error) {
        console.error('Error toggling mute', error);
        throw error;
      }
    }
  }
}

export const agoraService = new AgoraService();
