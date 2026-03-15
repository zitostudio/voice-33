import React, { useState, useEffect } from 'react';
import { db, handleRTDBError, OperationType } from '../firebase';
import { ref, onValue, push, set, remove, update } from 'firebase/database';
import { UserProfile, Room as RoomType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Users, Lock, LogIn } from 'lucide-react';
import RoomCard from './RoomCard';

interface DashboardProps {
  profile: UserProfile;
  onJoinRoom: (room: RoomType) => void;
  activeRoomId?: string;
  onReturnToRoom?: () => void;
}

export default function Dashboard({ profile, onJoinRoom, activeRoomId, onReturnToRoom }: DashboardProps) {
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomPass, setNewRoomPass] = useState('');
  const [editingRoom, setEditingRoom] = useState<RoomType | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(usersRef, (snap) => {
      const data = snap.val();
      if (data) {
        const users = Object.entries(data).map(([uid, val]: [string, any]) => ({ uid, ...val } as UserProfile));
        const uniqueUsers = Array.from(new Map(users.map(u => [u.uid, u])).values());
        setAllUsers(uniqueUsers);
      } else {
        setAllUsers([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const updateUserRole = async (userId: string, newRole: 'host' | 'listener' | 'admin') => {
    try {
      await update(ref(db, `users/${userId}`), { role: newRole });
    } catch (error) {
      handleRTDBError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  useEffect(() => {
    const roomsRef = ref(db, 'rooms');
    const unsubscribe = onValue(roomsRef, (snap) => {
      const data = snap.val();
      if (data) {
        const roomList = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val
        }) as RoomType);
        const uniqueRooms = Array.from(new Map(roomList.map(r => [r.id, r])).values());
        // Sort by createdAt desc manually since RTDB doesn't have orderBy like Firestore in simple onValue
        uniqueRooms.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRooms(uniqueRooms);
      } else {
        setRooms([]);
      }
    }, (error) => {
      handleRTDBError(error, OperationType.LIST, 'rooms');
    });
    return () => unsubscribe();
  }, []);

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    try {
      if (editingRoom) {
        await update(ref(db, `rooms/${editingRoom.id}`), {
          name: newRoomName,
          description: newRoomDesc || null,
          password: newRoomPass || null,
          hasPassword: !!newRoomPass,
        });
      } else {
        const roomsRef = ref(db, 'rooms');
        const newRoomRef = push(roomsRef);
        await set(newRoomRef, {
          name: newRoomName,
          description: newRoomDesc || null,
          password: newRoomPass || null,
          hasPassword: !!newRoomPass,
          createdBy: profile.uid,
          createdAt: new Date().toISOString(),
          activeHosts: []
        });
      }

      setNewRoomName('');
      setNewRoomDesc('');
      setNewRoomPass('');
      setEditingRoom(null);
      setShowCreate(false);
    } catch (error) {
      handleRTDBError(error, editingRoom ? OperationType.UPDATE : OperationType.CREATE, 'rooms');
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteRoom = async (id: string) => {
    try {
      await remove(ref(db, `rooms/${id}`));
    } catch (error) {
      handleRTDBError(error, OperationType.DELETE, `rooms/${id}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <AnimatePresence>
        {activeRoomId && onReturnToRoom && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-indigo-600/20 border border-indigo-500/30 p-4 rounded-2xl flex items-center justify-between gap-4 mb-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <p className="text-sm font-medium">Anda masih terhubung di sebuah ruangan</p>
            </div>
            <button 
              onClick={onReturnToRoom}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            >
              Kembali ke Ruangan
            </button>
          </motion.div>
        )}
        {deletingId && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 w-full max-w-md text-center"
            >
              <h2 className="text-2xl font-bold mb-4 text-red-500">Hapus Ruangan?</h2>
              <p className="text-slate-400 mb-8">Tindakan ini tidak dapat dibatalkan. Semua data untuk ruangan ini akan dihapus secara permanen.</p>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleDeleteRoom(deletingId)} 
                  className="bg-red-500 hover:bg-red-600 text-white py-3 px-6 rounded-xl font-bold flex-1 transition-colors"
                >
                  Ya, Hapus
                </button>
                <button 
                  onClick={() => setDeletingId(null)} 
                  className="btn-secondary flex-1"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {showUserManagement && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-4 sm:p-6 w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Manajemen Pengguna</h2>
                <button onClick={() => setShowUserManagement(false)} className="text-slate-400 hover:text-white">Tutup</button>
              </div>
              <div className="space-y-4">
                {(() => {
                  const seenKeys = new Set();
                  return allUsers.map((u) => {
                    if (!u.uid) return null;
                    if (seenKeys.has(u.uid)) {
                      console.error('Duplicate key detected in Dashboard user list:', u.uid);
                    }
                    seenKeys.add(u.uid);
                    return (
                      <div key={`dashboard-user-${u.uid}`} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-white/5 rounded-xl gap-3 sm:gap-4">
                        <div className="flex items-center gap-3">
                          <img src={u.photoURL} alt={u.displayName} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full" />
                          <div>
                            <p className="font-bold text-sm sm:text-base">{u.displayName}</p>
                            <p className="text-xs sm:text-sm text-slate-400">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <select 
                            value={u.role}
                            onChange={(e) => updateUserRole(u.uid, e.target.value as any)}
                            className="bg-white/10 border border-white/10 rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm w-full sm:w-auto"
                          >
                            <option value="admin">Admin</option>
                            <option value="host">Host</option>
                            <option value="listener">Pendengar</option>
                          </select>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <motion.h2 
          className="text-2xl font-bold text-center w-full sm:text-left sm:w-auto"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          Realtime Voice
        </motion.h2>
        <div className="flex gap-2 w-full sm:w-auto">
          {profile.role === 'admin' && (
            <button 
              onClick={() => setShowUserManagement(true)}
              className="btn-secondary py-2 px-4 flex items-center justify-center gap-2 flex-1 sm:flex-none"
            >
              <Users className="w-4 h-4" /> Kelola Pengguna
            </button>
          )}
          {profile.role === 'admin' && (
            <button 
              onClick={() => setShowCreate(true)}
              className="btn-primary py-2 px-4 flex items-center justify-center gap-2 flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4" /> Buat Ruangan
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSaveRoom} className="glass-card p-4 sm:p-6 space-y-4">
              <h2 className="text-xl font-bold">{editingRoom ? 'Edit Ruangan' : 'Buat Ruangan'}</h2>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Nama Ruangan</label>
                <input 
                  type="text" 
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="contoh: Hangout Mingguan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Deskripsi (Opsional)</label>
                <input 
                  type="text" 
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Tentang apa ruangan ini?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Kata Sandi (Opsional)</label>
                <input 
                  type="password" 
                  value={newRoomPass}
                  onChange={(e) => setNewRoomPass(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Biarkan kosong untuk publik"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1 py-3">{editingRoom ? 'Simpan' : 'Buat'}</button>
                <button type="button" onClick={() => {setShowCreate(false); setEditingRoom(null);}} className="btn-secondary flex-1 py-3">Batal</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {(() => {
          const seenKeys = new Set();
          return rooms.map((room) => {
            if (!room.id) return null;
            if (seenKeys.has(room.id)) {
              console.error('Duplicate key detected in Dashboard room list:', room.id);
            }
            seenKeys.add(room.id);
            return (
              <RoomCard 
                key={`room-${room.id}`}
                room={room}
                activeRoomId={activeRoomId}
                onJoinRoom={onJoinRoom}
                onReturnToRoom={onReturnToRoom}
                profile={profile}
                onDelete={setDeletingId}
                onEdit={(room) => {
                  setEditingRoom(room);
                  setNewRoomName(room.name);
                  setNewRoomDesc(room.description || '');
                  setNewRoomPass(room.password || '');
                  setShowCreate(true);
                }}
              />
            );
          });
        })()}
        {rooms.length === 0 && (
          <div className="col-span-full py-20 text-center glass-card">
            <p className="text-slate-500">Tidak ada ruangan tersedia. {profile.role === 'admin' ? 'Buat satu untuk memulai!' : 'Tunggu admin membuat ruangan.'}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
