/**
 * @fileoverview 入力デバイス種別トラッキング
 * キーボードとゲームパッドのどちらが最後に操作されたかを返す React フック。
 * ゲームの操作ガイド表示切り替えに利用する。
 */

'use client';

import { useState, useEffect, useRef } from 'react';

export type InputMode = 'keyboard' | 'gamepad';

/** ゲームパッドのスティック入力とみなす閾値（ドリフト誤検知防止） */
const AXIS_THRESHOLD = 0.5;

/**
 * 最後に操作された入力デバイスを返すフック。
 * - キーボードの keydown → 'keyboard'
 * - ゲームパッドのボタン押下 / スティック操作 → 'gamepad'
 */
export function useInputMode(): InputMode {
  const [mode, setMode] = useState<InputMode>('keyboard');
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onKeyDown = () => setMode('keyboard');
    window.addEventListener('keydown', onKeyDown);

    const poll = () => {
      if (typeof navigator.getGamepads === 'function') {
        for (const gp of navigator.getGamepads()) {
          if (!gp) continue;
          const hasButtonPress = gp.buttons.some((b) => b.pressed);
          const hasAxisInput   = gp.axes.some((a) => Math.abs(a) > AXIS_THRESHOLD);
          if (hasButtonPress || hasAxisInput) {
            setMode('gamepad');
            break;
          }
        }
      }
      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return mode;
}
