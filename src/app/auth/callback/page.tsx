'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

/**
 * OAuth・メール確認のコールバックページ。
 * Supabase が ?code= パラメータ付きでここにリダイレクトする。
 * exchangeCodeForSession() でセッションに変換してトップへ遷移する。
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) {
      setError('認証コードが見つかりません');
      return;
    }

    getSupabase().auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setError(error.message);
      } else {
        router.replace('/');
      }
    });
  }, [router]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
      {error ? (
        <>
          <p className="text-sm" style={{ color: '#f87171', fontFamily: 'monospace' }}>
            認証エラー: {error}
          </p>
          <button
            onClick={() => router.replace('/')}
            className="text-xs px-4 py-2 rounded-sm"
            style={{ color: '#4ade80', border: '1px solid #4ade80', fontFamily: 'monospace', background: 'none', cursor: 'pointer' }}
          >
            トップに戻る
          </button>
        </>
      ) : (
        <p
          className="text-sm tracking-widest animate-pulse"
          style={{ color: '#4ade80', fontFamily: 'monospace' }}
        >
          認証中...
        </p>
      )}
    </div>
  );
}
