import React, { useState, useEffect } from 'react';
import { db, handleRTDBError, OperationType } from '../firebase';
import { ref, onValue, push, set, remove, update } from 'firebase/database';
import { UserProfile, Room as RoomType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Users, Lock, LogIn } from 'lucide-react';

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
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(usersRef, (snap) => {
      const data = snap.val();
      if (data) {
        setAllUsers(Object.entries(data).map(([uid, val]: [string, any]) => ({ uid, ...val } as UserProfile)));
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
        // Sort by createdAt desc manually since RTDB doesn't have orderBy like Firestore in simple onValue
        roomList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRooms(roomList);
      } else {
        setRooms([]);
      }
    }, (error) => {
      handleRTDBError(error, OperationType.LIST, 'rooms');
    });
    return () => unsubscribe();
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    try {
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

      setNewRoomName('');
      setNewRoomDesc('');
      setNewRoomPass('');
      setShowCreate(false);
    } catch (error) {
      handleRTDBError(error, OperationType.CREATE, 'rooms');
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteRoom = async (id: string) => {
    try {
      await remove(ref(db, `rooms/${id}`));
      setDeletingId(null);
    } catch (error) {
      handleRTDBError(error, OperationType.DELETE, `rooms/${id}`);
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
                {allUsers.map((u) => (
                  <div key={u.uid} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-white/5 rounded-xl gap-3 sm:gap-4">
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
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-center w-full sm:text-left sm:w-auto">Ruangan Tersedia</h2>
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
            <form onSubmit={handleCreateRoom} className="glass-card p-4 sm:p-6 space-y-4">
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
                <button type="submit" className="btn-primary flex-1 py-3">Buat</button>
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1 py-3">Batal</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {rooms.map((room) => (
          <motion.div 
            key={room.id}
            layout
            className={`glass-card p-3 sm:p-6 flex flex-col justify-between transition-all ${activeRoomId === room.id ? 'ring-2 ring-indigo-500 bg-indigo-500/5' : ''}`}
          >
            <div>
              <div className="flex items-start justify-between mb-1 sm:mb-2">
                <div className="flex items-center gap-1 sm:gap-2">
                  <h3 className="text-sm sm:text-xl font-bold truncate max-w-[80px] sm:max-w-none">{room.name}</h3>
                  {activeRoomId === room.id && (
                    <span className="bg-green-500/20 text-green-400 text-[8px] sm:text-[10px] uppercase px-1.5 sm:px-2 py-0.5 rounded-full font-bold">Aktif</span>
                  )}
                </div>
                {room.hasPassword && <Lock className="w-3 h-3 sm:w-4 sm:h-4 text-slate-500" />}
              </div>
              {room.description && (
                <p className="text-[10px] sm:text-sm text-slate-300 mb-2 sm:mb-4 line-clamp-1 sm:line-clamp-2">{room.description}</p>
              )}
              <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-sm text-slate-400 mb-3 sm:mb-6">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4" /> {Object.keys(room.participants || {}).length}
                </span>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2">
              <button 
                onClick={() => activeRoomId === room.id ? onReturnToRoom?.() : onJoinRoom(room)}
                className={`btn-primary py-1.5 sm:py-2 flex-1 flex items-center justify-center gap-1 sm:gap-2 text-[10px] sm:text-sm ${activeRoomId === room.id ? 'bg-indigo-600' : ''}`}
              >
                <LogIn className="w-3 h-3 sm:w-4 sm:h-4" /> {activeRoomId === room.id ? 'Kembali' : 'Gabung'}
              </button>
              {profile.role === 'admin' && (
                <button 
                  onClick={() => setDeletingId(room.id)}
                  className="p-1.5 sm:p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg sm:rounded-xl transition-colors flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              )}
            </div>
          </motion.div>
        ))}
        {rooms.length === 0 && (
          <div className="col-span-full py-20 text-center glass-card">
            <p className="text-slate-500">Tidak ada ruangan tersedia. {profile.role === 'admin' ? 'Buat satu untuk memulai!' : 'Tunggu admin membuat ruangan.'}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
