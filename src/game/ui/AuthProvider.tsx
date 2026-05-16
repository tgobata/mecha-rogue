'use client';

import React, { createContext, useContext } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type OAuthProvider = 'github' | 'google';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider — 認証無効化スタブ
// 再有効化: git diff HEAD~1 -- src/game/ui/AuthProvider.tsx で元の実装を参照
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{
      session: null,
      user: null,
      loading: false,
      signUp: async () => ({ error: null }),
      signIn: async () => ({ error: null }),
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => {},
      deleteAccount: async () => ({ error: null }),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
