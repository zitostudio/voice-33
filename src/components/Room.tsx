import React, { useState, useEffect, useRef } from 'react';
import { db, handleRTDBError, OperationType } from '../firebase';
import { ref, onValue, update, remove, set, onDisconnect } from 'firebase/database';
import { UserProfile, Room as RoomType } from '../types';
import { agoraService } from '../lib/agora';
import { motion } from 'motion/react';
import { Mic, MicOff, Power, Users, Shield, User as UserIcon } from 'lucide-react';

interface RoomProps {
  room: RoomType;
  profile: UserProfile;
  onLeave: () => void;
}

export default function Room({ room, profile, onLeave }: RoomProps) {
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [roomData, setRoomData] = useState<RoomType>(room);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassModal, setShowPassModal] = useState(room.hasPassword && profile.role === 'listener');
  const [activeSpeakers, setActiveSpeakers] = useState<Record<string, number>>({});
  const prevRoleRef = useRef(profile.role);
  const onLeaveRef = useRef(onLeave);

  useEffect(() => {
    onLeaveRef.current = onLeave;
  }, [onLeave]);

  useEffect(() => {
    if (prevRoleRef.current !== profile.role) {
      prevRoleRef.current = profile.role;
      if (isJoined) {
        agoraService.changeRole(profile.role === 'listener' ? 'listener' : 'host').then(() => {
          if (profile.role !== 'listener') {
            setIsMuted(false);
            set(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`), true).catch(() => {});
            onDisconnect(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`)).remove().catch(() => {});
          } else {
            remove(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`)).catch(() => {});
            onDisconnect(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`)).cancel().catch(() => {});
          }
        }).catch(err => {
          console.error('Failed to change role in voice channel', err);
          if (err.message === 'MIC_DENIED') {
            setIsMuted(true);
            set(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`), true).catch(() => {});
            onDisconnect(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`)).remove().catch(() => {});
            setError('You have been made a host, but microphone access was denied or requires your permission. Please click the microphone icon to enable it.');
          } else {
            setError(err instanceof Error ? err.message : 'Failed to change voice role.');
          }
        });
      }
    }
  }, [profile.role, isJoined, room.id, profile.uid]);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${room.id}`);
    const unsubscribe = onValue(roomRef, (snap) => {
      if (snap.exists()) {
        setRoomData({ id: snap.key, ...snap.val() } as RoomType);
      } else {
        onLeaveRef.current();
      }
    }, (error) => {
      handleRTDBError(error, OperationType.GET, `rooms/${room.id}`);
    });

    // Fetch all users to show roles/profiles
    const usersRef = ref(db, 'users');
    const usersUnsubscribe = onValue(usersRef, (snap) => {
      const data = snap.val();
      if (data) {
        setAllUsers(Object.values(data) as UserProfile[]);
      } else {
        setAllUsers([]);
      }
    }, (error) => {
      handleRTDBError(error, OperationType.LIST, 'users');
    });

    agoraService.onVolumeChange = (volumes) => {
      const speakers: Record<string, number> = {};
      volumes.forEach(v => {
        // Agora volume level is 0-100. Let's say > 5 is speaking.
        if (v.level > 5) {
          const speakerUid = v.uid === "0" ? profile.uid : v.uid;
          speakers[speakerUid] = v.level;
        }
      });
      setActiveSpeakers(speakers);
    };

    return () => {
      unsubscribe();
      usersUnsubscribe();
      agoraService.onVolumeChange = null;
      // Cleanup voice connection safely
      agoraService.leave().catch(err => console.error('Error during voice cleanup', err));
      remove(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`)).catch(() => {});
      remove(ref(db, `rooms/${room.id}/participants/${profile.uid}`)).catch(() => {});
      onDisconnect(ref(db, `rooms/${room.id}/participants/${profile.uid}`)).cancel().catch(() => {});
      onDisconnect(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`)).cancel().catch(() => {});
    };
  }, [room.id, profile.uid]);

  const handleJoin = async () => {
    if (!room.id || !profile.uid) return;

    if (roomData.hasPassword && profile.role === 'listener' && password !== roomData.password) {
      setError('Incorrect password. Please try again.');
      return;
    }

    try {
      await agoraService.join(room.id, profile.uid, profile.role === 'listener' ? 'listener' : 'host');
      setIsJoined(true);
      setShowPassModal(false);
      setError(null);
      
      if (profile.role !== 'listener') {
        const hasMic = agoraService.hasLocalAudioTrack();
        setIsMuted(!hasMic);
        if (!hasMic) {
          setError('Microphone access denied or requires permission. Please click the microphone icon to enable it.');
        } else {
          setIsMuted(false);
        }
        try {
          // Use set on the specific child to match security rules
          await set(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`), true);
          onDisconnect(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`)).remove();
        } catch (error) {
          handleRTDBError(error, OperationType.UPDATE, `rooms/${room.id}/activeHosts/${profile.uid}`);
        }
      }

      try {
        await set(ref(db, `rooms/${room.id}/participants/${profile.uid}`), true);
        onDisconnect(ref(db, `rooms/${room.id}/participants/${profile.uid}`)).remove();
      } catch (error) {
        handleRTDBError(error, OperationType.UPDATE, `rooms/${room.id}/participants/${profile.uid}`);
      }
    } catch (error: any) {
      if (error?.message?.includes('OPERATION_ABORTED') || error?.message?.includes('cancel token canceled')) {
        // Ignore this error, it's caused by React Strict Mode or rapid leave/join
        return;
      }
      console.error('Failed to join voice channel', error);
      setError(error instanceof Error ? error.message : 'Failed to connect to voice server. Please try again.');
    }
  };

  useEffect(() => {
    if (!showPassModal && !isJoined) {
      handleJoin();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPassModal, isJoined]);

  const handleLeave = async () => {
    await agoraService.leave();
    try {
      await remove(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`));
      onDisconnect(ref(db, `rooms/${room.id}/activeHosts/${profile.uid}`)).cancel();
    } catch (error) {
      handleRTDBError(error, OperationType.DELETE, `rooms/${room.id}/activeHosts/${profile.uid}`);
    }
    try {
      await remove(ref(db, `rooms/${room.id}/participants/${profile.uid}`));
      onDisconnect(ref(db, `rooms/${room.id}/participants/${profile.uid}`)).cancel();
    } catch (error) {
      handleRTDBError(error, OperationType.DELETE, `rooms/${room.id}/participants/${profile.uid}`);
    }
    onLeave();
  };

  const toggleMute = async () => {
    try {
      const newMuted = !isMuted;
      await agoraService.setMute(newMuted);
      setIsMuted(newMuted);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to toggle microphone.');
    }
  };

  const updateUserRole = async (userId: string, newRole: 'host' | 'listener') => {
    if (profile.role !== 'admin') return;
    try {
      await update(ref(db, `users/${userId}`), { role: newRole });
    } catch (error) {
      handleRTDBError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  if (showPassModal) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-card p-8 w-full max-w-md"
        >
          <h2 className="text-2xl font-bold mb-4">Kata Sandi Ruangan</h2>
          {error && <p className="text-red-500 text-sm mb-4 bg-red-500/10 p-3 rounded-lg">{error}</p>}
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:border-indigo-500"
            placeholder="Masukkan kata sandi"
          />
          <div className="flex gap-2">
            <button onClick={handleJoin} className="btn-primary flex-1">Gabung</button>
            <button onClick={onLeave} className="btn-secondary">Batal</button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="glass-card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{roomData.name}</h2>
            {roomData.description && (
              <p className="text-sm text-slate-400 mt-1">{roomData.description}</p>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-4 md:gap-6 text-sm bg-white/5 p-3 rounded-xl border border-white/10">
            <div className="flex flex-col">
              <span className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">Status</span>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isJoined ? 'bg-green-500' : 'bg-slate-500'}`} />
                <span className={isJoined ? 'text-green-400 font-medium' : 'text-slate-400'}>
                  {isJoined ? 'Terhubung' : 'Terputus'}
                </span>
              </div>
            </div>
            
            <div className="w-px h-8 bg-white/10 hidden sm:block" />
            
            <div className="flex flex-col">
              <span className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">Peran Anda</span>
              <span className="capitalize text-indigo-400 font-medium">{profile.role}</span>
            </div>
            
            <div className="w-px h-8 bg-white/10 hidden sm:block" />
            
            <div className="flex flex-col">
              <span className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">Host Aktif</span>
              <span className="font-medium">{Object.keys(roomData.activeHosts || {}).length}</span>
            </div>

            {!isJoined && (
              <>
                <div className="w-px h-8 bg-white/10 hidden sm:block" />
                <div className="flex items-center">
                  {error ? (
                    <button onClick={handleJoin} className="btn-primary bg-red-500 hover:bg-red-600 py-1 px-3 text-xs">Coba Lagi</button>
                  ) : (
                    <span className="text-xs text-slate-400 animate-pulse">Menghubungkan...</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {error && <p className="text-red-500 text-sm bg-red-500/10 p-3 rounded-lg mt-4">{error}</p>}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500" /> Peserta
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {allUsers.filter(u => (roomData.participants && roomData.participants[u.uid]) || (roomData.activeHosts && roomData.activeHosts[u.uid])).map((u) => {
              const isActiveHost = !!(roomData.activeHosts && roomData.activeHosts[u.uid]);
              const isSpeaking = isActiveHost && activeSpeakers[u.uid] > 5;
              const speakerScale = isSpeaking ? 1 + (activeSpeakers[u.uid] / 100) * 0.3 : 1;
              
              return (
                <div key={u.uid} className={`glass-card p-4 text-center relative ${isActiveHost ? 'ring-2 ring-indigo-500' : ''}`}>
                  <div className="relative w-16 h-16 mx-auto mb-2">
                    {isSpeaking && (
                      <motion.div 
                        className="absolute inset-0 rounded-full bg-indigo-500/50 blur-md"
                        animate={{ scale: speakerScale, opacity: 0.8 }}
                        transition={{ duration: 0.1 }}
                      />
                    )}
                    <img 
                      src={u.photoURL} 
                      alt={u.displayName} 
                      className={`relative z-10 w-16 h-16 rounded-full border-2 ${isSpeaking ? 'border-indigo-400' : 'border-white/10'} transition-colors duration-200`}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <p className="font-medium truncate text-sm">{u.displayName}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{u.role}</p>
                  
                  {u.uid === profile.uid && (
                    <div className="mt-3 flex justify-center gap-2">
                      {profile.role !== 'listener' && isJoined && (
                        <button 
                          onClick={toggleMute}
                          className={`p-2 rounded-lg transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                          title={isMuted ? 'Nyalakan Mikrofon' : 'Matikan Mikrofon'}
                        >
                          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
                      )}
                      <button 
                        onClick={handleLeave} 
                        className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all shadow-md"
                        title="Matikan"
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {profile.role === 'admin' && u.uid !== profile.uid && (
                    <div className="mt-3 flex justify-center gap-1">
                      <button 
                        onClick={() => updateUserRole(u.uid, u.role === 'host' ? 'listener' : 'host')}
                        className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                        title={u.role === 'host' ? 'Jadikan Pendengar' : 'Jadikan Host'}
                      >
                        <Shield className={`w-3.5 h-3.5 ${u.role === 'host' ? 'text-indigo-400' : 'text-slate-400'}`} />
                      </button>
                    </div>
                  )}
                  
                  {isActiveHost && (
                    <div className="absolute top-2 right-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
    </motion.div>
  );
}
