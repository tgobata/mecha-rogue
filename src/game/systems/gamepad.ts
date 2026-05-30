/**
 * @fileoverview PS4・Xbox / 標準ゲームパッド入力システム
 * Gamepad API をポーリングして PlayerAction / UIAction に変換する React フックを提供する。
 *
 * 標準ゲームパッドレイアウトのボタンインデックス（PS4 / Xbox 共通）:
 *   0: × / A        1: ○ / B        2: □ / X        3: △ / Y
 *   4: L1 / LB      5: R1 / RB      6: L2 / LT      7: R2 / RT
 *   8: Share / View  9: Options / Menu  10: L3       11: R3
 *  12: D-pad Up    13: D-pad Down  14: D-pad Left  15: D-pad Right
 * 左スティック: axes[0] (横) / axes[1] (縦)
 */

'use client';

import { useEffect, useRef } from 'react';
import type { PlayerAction } from '../core/turn-system';
import type { UIAction } from './input';

// ---------------------------------------------------------------------------
// ボタンインデックス定数（標準ゲームパッドレイアウト）
// ---------------------------------------------------------------------------

const BTN_CROSS    = 0;
const BTN_CIRCLE   = 1;
const BTN_SQUARE   = 2;
const BTN_TRIANGLE = 3;
const BTN_L1       = 4;
const BTN_R1       = 5;
// const BTN_L2    = 6;  // 未使用
// const BTN_R2    = 7;  // 未使用
// const BTN_SHARE = 8;  // 未使用
const BTN_OPTIONS  = 9;
// const BTN_L3    = 10; // 未使用
// const BTN_R3    = 11; // 未使用
const BTN_DPAD_UP    = 12;
const BTN_DPAD_DOWN  = 13;
const BTN_DPAD_LEFT  = 14;
const BTN_DPAD_RIGHT = 15;

/** 左スティックの入力とみなす閾値 */
const STICK_THRESHOLD = 0.5;
/** 方向ボタン押しっぱなし時の最初のリピートまでの待機時間 (ms) */
const REPEAT_DELAY_MS = 400;
/** リピート間隔 (ms) */
const REPEAT_INTERVAL_MS = 150;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** キーリピート管理用の内部状態 */
interface RepeatState {
  startTime: number;
  lastRepeat: number;
}

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 方向（up/down/left/right）とメニュー開閉状態から発火すべきアクションを返す。
 * メニュー開放中は left/right を無視し、上下のみ menu_up/menu_down を返す。
 */
function resolveDirectional(
  dir: 'up' | 'down' | 'left' | 'right',
  menuOpen: boolean,
): { action: PlayerAction | UIAction; isUI: boolean } | null {
  if (menuOpen) {
    if (dir === 'up')   return { action: 'menu_up',   isUI: true };
    if (dir === 'down') return { action: 'menu_down', isUI: true };
    return null;
  }
  const moveMap: Record<string, PlayerAction> = {
    up: 'move_up', down: 'move_down', left: 'move_left', right: 'move_right',
  };
  return { action: moveMap[dir], isUI: false };
}

// ---------------------------------------------------------------------------
// React フック
// ---------------------------------------------------------------------------

/**
 * Gamepad API をポーリングして PlayerAction / UIAction を発行する React フック。
 *
 * - requestAnimationFrame ベースのポーリングループを使用する。
 * - ボタン押下のエッジ検出（keydown 相当）を行い、hold リピートも実装する。
 * - 左スティックも方向入力として機能する（ドミナント軸のみ採用）。
 * - アンマウント時にループを自動停止する。
 * - ブラウザが Gamepad API に非対応の場合は何もしない。
 *
 * @param onAction   - PlayerAction が発生したときに呼ぶコールバック
 * @param enabled    - フックを有効にするかどうか
 * @param onUIAction - UIAction が発生したときに呼ぶコールバック（省略可）
 * @param menuOpen   - メニューが開いているかどうか（省略時は false）
 */
export function useGamepadInput(
  onAction: (action: PlayerAction) => void,
  enabled: boolean,
  onUIAction?: (action: UIAction) => void,
  menuOpen?: boolean,
): void {
  const prevButtonsRef = useRef<boolean[]>([]);
  const rafRef         = useRef<number>(0);
  const repeatRef      = useRef<Map<string, RepeatState>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

    const fire = (action: PlayerAction | UIAction, isUI: boolean) => {
      if (isUI) { onUIAction?.(action as UIAction); }
      else      { onAction(action as PlayerAction); }
    };

    const handleDirectional = (key: string, dir: 'up' | 'down' | 'left' | 'right', isPressed: boolean, timestamp: number) => {
      const result = resolveDirectional(dir, menuOpen ?? false);
      if (!result) {
        repeatRef.current.delete(key);
        return;
      }

      const prev = repeatRef.current.get(key);
      if (isPressed) {
        if (!prev) {
          fire(result.action, result.isUI);
          repeatRef.current.set(key, { startTime: timestamp, lastRepeat: timestamp });
        } else {
          const elapsed = timestamp - prev.startTime;
          if (elapsed >= REPEAT_DELAY_MS) {
            const sinceLastRepeat = timestamp - prev.lastRepeat;
            if (sinceLastRepeat >= REPEAT_INTERVAL_MS) {
              fire(result.action, result.isUI);
              prev.lastRepeat = timestamp;
            }
          }
        }
      } else {
        repeatRef.current.delete(key);
      }
    };

    const poll = (timestamp: number) => {
      const gamepads = navigator.getGamepads();
      let gp: Gamepad | null = null;
      for (const g of gamepads) {
        if (g !== null) { gp = g; break; }
      }

      if (gp) {
        const prev = prevButtonsRef.current;
        const curr = Array.from(gp.buttons).map((b) => b.pressed);

        // ── エッジ検出（押した瞬間のみ）──────────────────────────────
        const wasJustPressed = (idx: number) => curr[idx] && !prev[idx];

        // × → 攻撃（ゲーム中）/ 決定（メニュー中）
        if (wasJustPressed(BTN_CROSS)) {
          if (menuOpen) { onUIAction?.('menu_select'); }
          else          { onAction('attack'); }
        }

        // ○ → メニューを閉じる
        if (wasJustPressed(BTN_CIRCLE)) { onUIAction?.('close_menu'); }

        // □ → 足元アイテム操作
        if (wasJustPressed(BTN_SQUARE)) { onUIAction?.('open_floor_item'); }

        // △ → ヘルプ
        if (wasJustPressed(BTN_TRIANGLE)) { onUIAction?.('open_help'); }

        // L1 → インベントリ
        if (wasJustPressed(BTN_L1)) { onUIAction?.('open_inventory'); }

        // R1 → 武器パネル
        if (wasJustPressed(BTN_R1)) { onUIAction?.('open_weapons'); }

        // Options → メニューを閉じる
        if (wasJustPressed(BTN_OPTIONS)) { onUIAction?.('close_menu'); }

        // ── 方向ボタン（リピートあり）──────────────────────────────
        handleDirectional('btn_up',    'up',    curr[BTN_DPAD_UP],    timestamp);
        handleDirectional('btn_down',  'down',  curr[BTN_DPAD_DOWN],  timestamp);
        handleDirectional('btn_left',  'left',  curr[BTN_DPAD_LEFT],  timestamp);
        handleDirectional('btn_right', 'right', curr[BTN_DPAD_RIGHT], timestamp);

        // ── 左スティック（ドミナント軸のみ採用）────────────────────
        const axisX = gp.axes[0] ?? 0;
        const axisY = gp.axes[1] ?? 0;
        const dominantAxis = Math.abs(axisX) >= Math.abs(axisY) ? 'horizontal' : 'vertical';

        handleDirectional('stick_up',    'up',    axisY < -STICK_THRESHOLD && dominantAxis === 'vertical',   timestamp);
        handleDirectional('stick_down',  'down',  axisY >  STICK_THRESHOLD && dominantAxis === 'vertical',   timestamp);
        handleDirectional('stick_left',  'left',  axisX < -STICK_THRESHOLD && dominantAxis === 'horizontal', timestamp);
        handleDirectional('stick_right', 'right', axisX >  STICK_THRESHOLD && dominantAxis === 'horizontal', timestamp);

        prevButtonsRef.current = curr;
      }

      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [onAction, enabled, onUIAction, menuOpen]);
}
