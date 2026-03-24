import GameCanvas from '@/game/ui/GameCanvas';

/**
 * メカローグ メインページ。
 * ゲーム画面を画面いっぱいに表示する。
 * GameCanvas は 'use client' のクライアントコンポーネントなので
 * このページはサーバーコンポーネントのままにできる。
 */
export default function Home() {
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <GameCanvas />
    </div>
  );
}
