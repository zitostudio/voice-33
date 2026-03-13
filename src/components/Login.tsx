import React from 'react';
import { motion } from 'motion/react';
import { Mic } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 w-full max-w-md text-center"
      >
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/30">
          <Mic className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Voice 33</h1>
        <p className="text-slate-400 mb-8">Terhubung dan berbicara di ruangan suara waktu nyata.</p>
        
        <button 
          onClick={onLogin}
          className="w-full btn-primary flex items-center justify-center gap-3"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Masuk dengan Google
        </button>
      </motion.div>
    </div>
  );
}
