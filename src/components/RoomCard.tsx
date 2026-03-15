import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Users, Lock, LogIn, Trash2, Edit } from 'lucide-react';
import { UserProfile, Room as RoomType } from '../types';

interface RoomCardProps {
  room: RoomType;
  activeRoomId?: string;
  onJoinRoom: (room: RoomType) => void;
  onReturnToRoom?: () => void;
  profile: UserProfile;
  onDelete: (id: string) => void;
  onEdit: (room: RoomType) => void;
  key?: string | number;
}

export default function RoomCard({ room, activeRoomId, onJoinRoom, onReturnToRoom, profile, onDelete, onEdit }: RoomCardProps) {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      setIsOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth);
    }
  }, [room.description]);

  const textLength = room.description?.length || 0;
  const duration = Math.max(10, textLength / 3);

  return (
    <motion.div 
      layout
      key={room.id}
      className={`glass-card p-3 sm:p-6 flex flex-col justify-between transition-all ${activeRoomId === room.id ? 'ring-2 ring-indigo-500 bg-indigo-500/5' : ''}`}
    >
      <div>
        <div className="flex items-start justify-between mb-1 sm:mb-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <h3 className="text-sm sm:text-xl font-bold break-words">{room.name}</h3>
            {activeRoomId === room.id && (
              <span className="bg-green-500/20 text-green-400 text-[8px] sm:text-[10px] uppercase px-1.5 sm:px-2 py-0.5 rounded-full font-bold">Aktif</span>
            )}
          </div>
          {room.hasPassword && <Lock className="w-3 h-3 sm:w-4 sm:h-4 text-slate-500" />}
        </div>
        {room.description && (
          <div ref={containerRef} className="overflow-hidden whitespace-nowrap mb-2 sm:mb-4">
            <motion.p
              ref={textRef}
              className="text-[10px] sm:text-sm text-slate-300 inline-block"
              animate={isOverflowing ? { 
                x: ["0%", "-50%"],
                opacity: [1, 0.5, 1],
                textShadow: ["0 0 0px #fff", "0 0 8px #fff", "0 0 0px #fff"]
              } : { x: 0 }}
              transition={isOverflowing ? { 
                x: { repeat: Infinity, duration: duration, ease: "linear", repeatType: "reverse" },
                opacity: { repeat: Infinity, duration: 1.5, ease: "easeInOut", repeatType: "reverse" },
                textShadow: { repeat: Infinity, duration: 1.5, ease: "easeInOut", repeatType: "reverse" }
              } : {}}
            >
              {room.description}
            </motion.p>
          </div>
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
          <div className="flex gap-2">
            <button 
              onClick={() => onEdit(room)}
              className="p-1.5 sm:p-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 rounded-lg sm:rounded-xl transition-colors flex items-center justify-center"
            >
              <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            {activeRoomId !== room.id && (
              <button 
                onClick={() => onDelete(room.id)}
                className="p-1.5 sm:p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg sm:rounded-xl transition-colors flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
