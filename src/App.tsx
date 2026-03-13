import React, { useState, useEffect } from 'react';
import { auth, db, signInWithGoogle, logout, firebaseConfig, handleRTDBError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ref, get, set, onValue, remove, onDisconnect, goOffline, goOnline } from 'firebase/database';
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
  const [view, setView] = useState<'dashboard' | 'room'>('dashboard');

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    
    if (currentRoom && profile) {
      try {
        // Remove from database immediately so they disappear for others in real-time
        const removeHostsPromise = remove(ref(db, `rooms/${currentRoom.id}/activeHosts/${profile.uid}`)).catch(console.error);
        const removeParticipantsPromise = remove(ref(db, `rooms/${currentRoom.id}/participants/${profile.uid}`)).catch(console.error);
        
        onDisconnect(ref(db, `rooms/${currentRoom.id}/activeHosts/${profile.uid}`)).cancel().catch(console.error);
        onDisconnect(ref(db, `rooms/${currentRoom.id}/participants/${profile.uid}`)).cancel().catch(console.error);
        
        await Promise.all([removeHostsPromise, removeParticipantsPromise, agoraService.leave().catch(console.error)]);
      } catch (error) {
        console.error("Error leaving room on logout", error);
      }
    } else {
      // Just in case they are not in a room but Agora is connected
      await agoraService.leave().catch(console.error);
    }
    
    // Force disconnect to trigger any remaining onDisconnect handlers on the server
    goOffline(db);
    
    try {
      await logout();
    } catch (error) {
      console.error("Error during Firebase logout", error);
    }
    
    // Reconnect for the next user or login screen
    goOnline(db);
    
    // Clear all local states
    setCurrentRoom(null);
    setView('dashboard');
    setUser(null);
    setProfile(null);
    setIsLoggingOut(false);
    
    // Hard reload to completely clear React state, Agora cache, and memory
    window.location.href = '/';
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
          <button 
            onClick={handleLogout} 
            disabled={isLoggingOut}
            className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Keluar...</span>
              </>
            ) : (
              'Logout'
            )}
          </button>
        </header>

        {currentRoom && (
          <div className={view === 'room' ? 'block' : 'absolute opacity-0 pointer-events-none -z-10 w-0 h-0 overflow-hidden'}>
            <Room 
              key={currentRoom.id}
              room={currentRoom} 
              profile={profile} 
              onLeave={() => {
                setCurrentRoom(null);
                setView('dashboard');
              }} 
              onBack={() => setView('dashboard')}
            />
          </div>
        )}

        {view === 'dashboard' && (
          <Dashboard 
            profile={profile} 
            onJoinRoom={(room) => {
              setCurrentRoom(room);
              setView('room');
            }} 
            activeRoomId={currentRoom?.id}
            onReturnToRoom={() => setView('room')}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
