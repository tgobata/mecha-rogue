'use client';

import React from 'react';
import GameCanvas from './GameCanvas';

// 認証無効化中 — 認証ゲートをパススルーに変更
// 再有効化: git diff HEAD~1 -- src/game/ui/AuthGate.tsx で元の実装を参照

export default function AuthGate() {
  return <GameCanvas />;
}
