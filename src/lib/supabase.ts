import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * ブラウザで初めて呼ばれた時だけクライアントを生成するシングルトン。
 * モジュール読み込み時には createClient を呼ばないため、
 * SSR プリレンダリング時に env vars が未設定でもビルドが失敗しない。
 */
export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY) are not set');
    _client = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}
