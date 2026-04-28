'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from './AuthProvider';

type Tab = 'login' | 'signup';

export default function AuthScreen() {
  const { signIn, signUp, signInWithOAuth } = useAuth();

  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetForm = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    setError(null);
    setMessage(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (tab === 'signup') {
      if (password !== confirmPassword) {
        setError('パスワードが一致しません');
        return;
      }
      if (password.length < 8) {
        setError('パスワードは8文字以上にしてください');
        return;
      }
    }

    setBusy(true);
    try {
      if (tab === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          setError(translateError(error.message));
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          setError(translateError(error.message));
        } else {
          setMessage('確認メールを送信しました。メールのリンクをクリックしてください。');
          setEmail('');
          setPassword('');
          setConfirmPassword('');
        }
      }
    } finally {
      setBusy(false);
    }
  }, [tab, email, password, confirmPassword, signIn, signUp]);

  const handleOAuth = useCallback(async (provider: 'github' | 'google') => {
    setError(null);
    setBusy(true);
    try {
      const { error } = await signInWithOAuth(provider);
      if (error) setError(translateError(error.message));
    } finally {
      setBusy(false);
    }
  }, [signInWithOAuth]);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
      {/* CRT scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Title */}
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold tracking-widest mb-1"
            style={{ color: '#4ade80', fontFamily: 'monospace', textShadow: '0 0 16px #4ade80' }}
          >
            MECHA-ROGUE
          </h1>
          <p className="text-xs tracking-widest" style={{ color: '#6b7280', fontFamily: 'monospace' }}>
            機甲迷宮探索記
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-sm p-6"
          style={{
            background: 'rgba(0,20,0,0.9)',
            border: '1px solid #166534',
            boxShadow: '0 0 24px rgba(74,222,128,0.1)',
          }}
        >
          {/* Tabs */}
          <div className="flex mb-6 border-b" style={{ borderColor: '#166534' }}>
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => resetForm(t)}
                className="flex-1 py-2 text-sm tracking-widest transition-colors"
                style={{
                  fontFamily: 'monospace',
                  color: tab === t ? '#4ade80' : '#4b5563',
                  borderBottom: tab === t ? '2px solid #4ade80' : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                {t === 'login' ? 'ログイン' : '新規登録'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField
              label="メールアドレス"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete={tab === 'login' ? 'username' : 'email'}
              disabled={busy}
            />
            <InputField
              label="パスワード"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              disabled={busy}
            />
            {tab === 'signup' && (
              <InputField
                label="パスワード（確認）"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                disabled={busy}
              />
            )}

            {error && (
              <p className="text-xs py-2 px-3 rounded-sm" style={{ color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontFamily: 'monospace' }}>
                {error}
              </p>
            )}
            {message && (
              <p className="text-xs py-2 px-3 rounded-sm" style={{ color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', fontFamily: 'monospace' }}>
                {message}
              </p>
            )}

            <SubmitButton busy={busy} label={tab === 'login' ? 'ログイン' : '登録する'} />
          </form>

          {/* Divider */}
          <div className="flex items-center my-5">
            <div className="flex-1 h-px" style={{ background: '#166534' }} />
            <span className="px-3 text-xs" style={{ color: '#4b5563', fontFamily: 'monospace' }}>OR</span>
            <div className="flex-1 h-px" style={{ background: '#166534' }} />
          </div>

          {/* OAuth */}
          <div className="space-y-2">
            <OAuthButton
              onClick={() => handleOAuth('github')}
              disabled={busy}
              label="GitHub でログイン"
              icon={<GithubIcon />}
            />
            <OAuthButton
              onClick={() => handleOAuth('google')}
              disabled={busy}
              label="Google でログイン"
              icon={<GoogleIcon />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

function InputField({
  label, type, value, onChange, autoComplete, disabled,
}: {
  label: string;
  type: 'email' | 'password';
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: '#6b7280', fontFamily: 'monospace' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        disabled={disabled}
        className="w-full px-3 py-2 text-sm rounded-sm outline-none transition-all"
        style={{
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid #166534',
          color: '#d1fae5',
          fontFamily: 'monospace',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#166534'; }}
      />
    </div>
  );
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full py-2 text-sm tracking-widest transition-all rounded-sm"
      style={{
        background: busy ? 'rgba(74,222,128,0.2)' : 'rgba(74,222,128,0.15)',
        border: '1px solid #4ade80',
        color: busy ? '#6b7280' : '#4ade80',
        fontFamily: 'monospace',
        cursor: busy ? 'not-allowed' : 'pointer',
        boxShadow: busy ? 'none' : '0 0 8px rgba(74,222,128,0.2)',
      }}
    >
      {busy ? '処理中...' : label}
    </button>
  );
}

function OAuthButton({
  onClick, disabled, label, icon,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-3 py-2 text-sm tracking-wider transition-all rounded-sm"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #374151',
        color: '#9ca3af',
        fontFamily: 'monospace',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = '#4b5563'; e.currentTarget.style.color = '#d1d5db'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.color = '#9ca3af'; }}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SVG アイコン
// ---------------------------------------------------------------------------

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// エラーメッセージ日本語化
// ---------------------------------------------------------------------------

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'メールアドレスまたはパスワードが正しくありません';
  if (msg.includes('Email not confirmed')) return 'メールアドレスが確認されていません。確認メールをご確認ください';
  if (msg.includes('User already registered')) return 'このメールアドレスはすでに登録されています';
  if (msg.includes('Password should be')) return 'パスワードは8文字以上にしてください';
  if (msg.includes('Unable to validate email')) return '有効なメールアドレスを入力してください';
  if (msg.includes('Email rate limit exceeded')) return 'しばらく時間をおいてから再試行してください';
  if (msg.includes('network') || msg.includes('fetch')) return 'ネットワークエラーが発生しました';
  return msg;
}
