/**
 * @fileoverview キーボード入力システム
 * キーボードイベントを PlayerAction / UIAction に変換する純粋関数と、
 * React フックを提供する。
 */

'use client';

import { useEffect } from 'react';
import type { PlayerAction } from '../core/turn-system';

// ---------------------------------------------------------------------------
// UIAction 型定義
// ---------------------------------------------------------------------------

/**
 * メニュー・パネル操作に関するアクション型。
 * PlayerAction とは分離して管理する。
 *
 * - open_inventory  : I キー — アイテムパネル開閉
 * - open_weapons    : E キー — 武器/装備パネル開閉
 * - open_floor_item : F キー — 足元アイテム操作
 * - close_menu      : Escape キー — 開いているパネルを閉じる
 * - menu_up         : ↑/W — メニューカーソルを上へ
 * - menu_down       : ↓/S — メニューカーソルを下へ
 * - menu_select     : Enter/Z — 選択確定
 */
export type UIAction =
  | 'open_inventory'
  | 'open_weapons'
  | 'open_status'
  | 'open_help'
  | 'open_floor_item'
  | 'close_menu'
  | 'menu_up'
  | 'menu_down'
  | 'menu_select';

// ---------------------------------------------------------------------------
// キーマッピング
// ---------------------------------------------------------------------------

/**
 * キーボードイベントの key 文字列を PlayerAction に変換する。
 * 対応していないキーは null を返す。
 *
 * キーマッピング:
 * - W / ArrowUp    → move_up
 * - S / ArrowDown  → move_down
 * - A / ArrowLeft  → move_left
 * - D / ArrowRight → move_right
 * - Space          → wait
 * - z / Z / x / X → attack
 *
 * @param key - KeyboardEvent.key の値
 * @returns 対応する PlayerAction、または null（未対応キー）
 */
export function keyToAction(key: string): PlayerAction | null {
  switch (key) {
    case 'w':
    case 'W':
    case 'ArrowUp':
      return 'move_up';

    case 's':
    case 'S':
    case 'ArrowDown':
      return 'move_down';

    case 'a':
    case 'A':
    case 'ArrowLeft':
      return 'move_left';

    case 'd':
    case 'D':
    case 'ArrowRight':
      return 'move_right';

    case ' ':
      return 'wait';

    case 'z':
    case 'Z':
    case 'x':
    case 'X':
      return 'attack';

    default:
      return null;
  }
}

/**
 * キーボードイベントの key 文字列を UIAction に変換する。
 * 対応していないキーは null を返す。
 *
 * キーマッピング:
 * - i / I      → open_inventory
 * - e / E      → open_weapons
 * - Escape     → close_menu
 * - ArrowUp/W  → menu_up
 * - ArrowDown/S → menu_down
 * - Enter/Z    → menu_select
 *
 * @param key - KeyboardEvent.key の値
 * @returns 対応する UIAction、または null（未対応キー）
 */
export function keyToUIAction(key: string): UIAction | null {
  switch (key) {
    case 'i':
    case 'I':
      return 'open_inventory';

    case 'e':
    case 'E':
      return 'open_weapons';

    case 'c':
    case 'C':
      return 'open_status';

    case 'h':
    case 'H':
      return 'open_help';

    case 'f':
    case 'F':
      return 'open_floor_item';

    case 'Escape':
      return 'close_menu';

    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'menu_up';

    case 'ArrowDown':
    case 's':
    case 'S':
      return 'menu_down';

    case 'Enter':
    case 'z':
    case 'Z':
      return 'menu_select';

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// React フック
// ---------------------------------------------------------------------------

/**
 * キーボードイベントを購読して PlayerAction / UIAction を発行する React フック。
 *
 * - アンマウント時にイベントリスナーを自動で除去する。
 * - enabled が false の場合はキーボードイベントを無視する。
 * - keydown イベントのみ処理する（キーリピートも含む）。
 * - menuOpen が true のとき、移動キー（WASD/矢印）を menu_up/menu_down に解釈し
 *   PlayerAction としては処理しない。
 *
 * @param onAction    - PlayerAction が発生したときに呼ぶコールバック
 * @param enabled     - フックを有効にするかどうか
 * @param onUIAction  - UIAction が発生したときに呼ぶコールバック（省略可）
 * @param menuOpen    - メニューが開いているかどうか（省略時は false）
 */
export function useGameInput(
  onAction: (action: PlayerAction) => void,
  enabled: boolean,
  onUIAction?: (action: UIAction) => void,
  menuOpen?: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // テキスト入力中は無視する（将来の実装のため）
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // UIAction を優先処理する
      // I/E/Escape は常に UIAction として処理
      // Enter も常に UIAction
      // メニュー開放中: WASD/矢印 → menu_up/menu_down、Z → menu_select
      const isMenuKey =
        event.key === 'i' || event.key === 'I' ||
        event.key === 'e' || event.key === 'E' ||
        event.key === 'c' || event.key === 'C' ||
        event.key === 'h' || event.key === 'H' ||
        event.key === 'f' || event.key === 'F' ||
        event.key === 'Escape' ||
        event.key === 'Enter';

      const isMenuNavKey =
        event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
        event.key === 'w' || event.key === 'W' ||
        event.key === 's' || event.key === 'S' ||
        event.key === 'z' || event.key === 'Z';

      if (onUIAction && (isMenuKey || (menuOpen && isMenuNavKey))) {
        const uiAction = keyToUIAction(event.key);
        if (uiAction !== null) {
          event.preventDefault();
          onUIAction(uiAction);
          // メニュー開放中の場合はここで終了（PlayerAction として処理しない）
          if (menuOpen || isMenuKey) return;
        }
      }

      // Ctrl+方向キー → 方向転換のみ（ターン消費なし）
      if (event.ctrlKey) {
        const turnMap: Record<string, PlayerAction> = {
          ArrowUp: 'turn_up', w: 'turn_up', W: 'turn_up',
          ArrowDown: 'turn_down', s: 'turn_down', S: 'turn_down',
          ArrowLeft: 'turn_left', a: 'turn_left', A: 'turn_left',
          ArrowRight: 'turn_right', d: 'turn_right', D: 'turn_right',
        };
        const turnAction = turnMap[event.key];
        if (turnAction && !menuOpen) {
          event.preventDefault();
          onAction(turnAction);
          return;
        }
      }

      // メニューが閉じているとき、または UIAction に該当しないキーは PlayerAction として処理
      if (!menuOpen) {
        const action = keyToAction(event.key);
        if (action !== null) {
          event.preventDefault();
          onAction(action);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onAction, enabled, onUIAction, menuOpen]);
}
