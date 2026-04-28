'use client';

import React from 'react';
import { useAuth } from './AuthProvider';
import AuthScreen from './AuthScreen';
import GameCanvas from './GameCanvas';

export default function AuthGate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <p
          className="text-sm tracking-widest animate-pulse"
          style={{ color: '#4ade80', fontFamily: 'monospace' }}
        >
          LOADING...
        </p>
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  return <GameCanvas />;
}
