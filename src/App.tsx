import React, { useState, useEffect } from 'react';
import { auth, db, signInWithGoogle, logout, firebaseConfig, handleRTDBError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ref, get, set, onValue, remove, onDisconnect } from 'firebase/database';
import { UserProfile, Room as RoomType } from './types';
import { agoraService } from './lib/agora';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Room from './components/Room';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRoom, setCurrentRoom] = useState<RoomType | null>(null);

  const handleLogout = async () => {
    if (currentRoom && profile) {
      try {
        await agoraService.leave();
        await remove(ref(db, `rooms/${currentRoom.id}/activeHosts/${profile.uid}`));
        onDisconnect(ref(db, `rooms/${currentRoom.id}/activeHosts/${profile.uid}`)).cancel();
        await remove(ref(db, `rooms/${currentRoom.id}/participants/${profile.uid}`));
        onDisconnect(ref(db, `rooms/${currentRoom.id}/participants/${profile.uid}`)).cancel();
      } catch (error) {
        console.error("Error leaving room on logout", error);
      }
    }
    await logout();
  };

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      setUser(firebaseUser);
      if (firebaseUser) {
        const userRef = ref(db, `users/${firebaseUser.uid}`);
        
        profileUnsubscribe = onValue(userRef, async (snap) => {
          if (snap.exists()) {
            setProfile(snap.val() as UserProfile);
            setLoading(false);
          } else {
            // Create new profile
            const isAdmin = firebaseUser.email === "lawangindoofficial@gmail.com";
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'User',
              photoURL: firebaseUser.photoURL || '',
              role: isAdmin ? 'admin' : 'listener',
              createdAt: new Date().toISOString()
            };
            try {
              await set(userRef, newProfile);
            } catch (error) {
              handleRTDBError(error, OperationType.CREATE, `users/${firebaseUser.uid}`);
              setLoading(false);
            }
          }
        }, (error) => {
          handleRTDBError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          setLoading(false);
        });
      } else {
        if (profileUnsubscribe) {
          profileUnsubscribe();
          profileUnsubscribe = null;
        }
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Login onLogin={signInWithGoogle} />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <header className="flex items-center justify-between mb-8 glass-card p-4">
          <div className="flex items-center gap-3">
            <img 
              src={profile.photoURL} 
              alt={profile.displayName} 
              className="w-10 h-10 rounded-full border-2 border-indigo-500"
              referrerPolicy="no-referrer"
            />
            <div>
              <h1 className="font-bold text-lg leading-none">Voice 33</h1>
              <p className="text-xs text-slate-400 capitalize">{profile.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-white transition-colors">
            Logout
          </button>
        </header>

        {currentRoom ? (
          <Room 
            room={currentRoom} 
            profile={profile} 
            onLeave={() => setCurrentRoom(null)} 
          />
        ) : (
          <Dashboard 
            profile={profile} 
            onJoinRoom={setCurrentRoom} 
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
