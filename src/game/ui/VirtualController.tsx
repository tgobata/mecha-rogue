"use client";

/**
 * @fileoverview 仮想コントローラーコンポーネント（スマホ向け）
 *
 * レイアウト:
 *      [▲]
 * [◀] [向] [▶]   |  [攻] [待]  |  [アイ] [装備]
 *      [▼]
 *
 * - 方向ボタン: 64x64px、Dpad配置
 * - 向きトグルボタン: Dpad中央、押すたびに turnMode を切り替え
 * - turnMode=true 時: 方向ボタンが turn_* アクションを emit する
 * - 攻撃ボタン: 64x64px、赤系
 * - 待機ボタン: 64x64px、青系
 * - アイテムボタン: 60x44px、紫系
 * - 装備ボタン: 60x44px、緑系
 * - touch-action: none でスクロール防止
 * - onPointerDown でアクション発火
 */

import { useState } from "react";
import type { PlayerAction } from "../core/turn-system";
import type { UIAction } from "../systems/input";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** Dpad ボタンサイズ (px) */
const DPAD_BUTTON_SIZE = 64;
/** アクションボタンサイズ (px) */
const ACTION_BUTTON_SIZE = 64;
/** メニューボタン幅 (px) */
const MENU_BUTTON_W = 60;
/** メニューボタン高さ (px) */
const MENU_BUTTON_H = 44;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** スキルスロット情報（仮想コントローラー表示用） */
export interface SkillSlot {
  /** 表示名（短縮OK） */
  name: string;
  /** 残クールダウンターン数（0=使用可能） */
  cooldown: number;
}

interface VirtualControllerProps {
  /** PlayerAction 発火コールバック */
  onAction: (action: PlayerAction) => void;
  /** UIAction 発火コールバック（省略可） */
  onUIAction?: (action: UIAction) => void;
  /** スキルスロット情報（省略時はスキルボタンを非表示） */
  skillSlots?: SkillSlot[];
  /** スキル使用コールバック（スロットインデックスを渡す） */
  onSkillUse?: (slotIndex: number) => void;
  /** true の間はボタンを無効化する */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// ボタン共通スタイル
// ---------------------------------------------------------------------------

/** Dpad ボタンの基底スタイル */
const DPAD_BUTTON_STYLE: React.CSSProperties = {
  width: DPAD_BUTTON_SIZE,
  height: DPAD_BUTTON_SIZE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(80,80,100,0.85)",
  border: "2px solid rgba(160,160,180,0.5)",
  borderRadius: 8,
  color: "#ffffff",
  fontSize: 22,
  fontWeight: "bold",
  touchAction: "none",
  userSelect: "none",
  cursor: "pointer",
  WebkitUserSelect: "none",
} as const;

/** アクションボタン（攻撃・待機）の基底スタイル */
const ACTION_BUTTON_BASE: React.CSSProperties = {
  width: ACTION_BUTTON_SIZE,
  height: ACTION_BUTTON_SIZE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2px solid rgba(255,255,255,0.3)",
  borderRadius: 12,
  color: "#ffffff",
  fontSize: 18,
  fontWeight: "bold",
  touchAction: "none",
  userSelect: "none",
  cursor: "pointer",
  WebkitUserSelect: "none",
} as const;

/** メニューボタン（アイテム・装備）の基底スタイル */
const MENU_BUTTON_BASE: React.CSSProperties = {
  width: MENU_BUTTON_W,
  height: MENU_BUTTON_H,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2px solid rgba(255,255,255,0.25)",
  borderRadius: 8,
  color: "#ffffff",
  fontSize: 13,
  fontWeight: "bold",
  touchAction: "none",
  userSelect: "none",
  cursor: "pointer",
  WebkitUserSelect: "none",
} as const;

// ---------------------------------------------------------------------------
// VirtualController コンポーネント
// ---------------------------------------------------------------------------

/**
 * スマホ向け仮想コントローラー。
 * Dpad（方向4ボタン）、アクションボタン（攻撃・待機）、メニューボタン（アイテム・装備）
 * を横並びに配置する。
 */
export default function VirtualController({
  onAction,
  onUIAction,
  skillSlots,
  onSkillUse,
  disabled = false,
}: VirtualControllerProps) {
  /** 向きモード: true のとき方向ボタンが move_* の代わりに turn_* を emit する */
  const [turnMode, setTurnMode] = useState(false);

  /**
   * onPointerDown ハンドラを生成する（PlayerAction 用）。
   * turnMode が true のとき moveAction の代わりに turnAction を使う。
   * onPointerDown を使うことでモバイルでも遅延なく即時発火する。
   */
  const makeDirHandler =
    (
      moveAction: PlayerAction,
      turnAction: PlayerAction,
    ) =>
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (!disabled) {
        onAction(turnMode ? turnAction : moveAction);
      }
    };

  /**
   * onPointerDown ハンドラを生成する（PlayerAction 用、向き無関係）。
   */
  const makeHandler =
    (action: PlayerAction) => (e: React.PointerEvent) => {
      e.preventDefault();
      if (!disabled) {
        onAction(action);
      }
    };

  /**
   * onPointerDown ハンドラを生成する（UIAction 用）。
   */
  const makeUIHandler =
    (action: UIAction) => (e: React.PointerEvent) => {
      e.preventDefault();
      if (!disabled && onUIAction) {
        onUIAction(action);
      }
    };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "12px 20px",
        backgroundColor: "rgba(0,0,0,0.5)",
        borderRadius: 16,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      aria-label="仮想コントローラー"
    >
      {/* ── Dpad ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${DPAD_BUTTON_SIZE}px ${DPAD_BUTTON_SIZE}px ${DPAD_BUTTON_SIZE}px`,
          gridTemplateRows: `${DPAD_BUTTON_SIZE}px ${DPAD_BUTTON_SIZE}px ${DPAD_BUTTON_SIZE}px`,
          gap: 4,
        }}
      >
        {/* 上ボタン: 1行2列 */}
        <div style={{ gridColumn: 2, gridRow: 1 }}>
          <button
            onPointerDown={makeDirHandler("move_up", "turn_up")}
            style={DPAD_BUTTON_STYLE}
            aria-label={turnMode ? "上を向く" : "上移動"}
          >
            {turnMode ? "↑" : "▲"}
          </button>
        </div>

        {/* 左ボタン: 2行1列 */}
        <div style={{ gridColumn: 1, gridRow: 2 }}>
          <button
            onPointerDown={makeDirHandler("move_left", "turn_left")}
            style={DPAD_BUTTON_STYLE}
            aria-label={turnMode ? "左を向く" : "左移動"}
          >
            {turnMode ? "←" : "◀"}
          </button>
        </div>

        {/* 中央セル（向きモードトグルボタン）: 2行2列 */}
        <div style={{ gridColumn: 2, gridRow: 2 }}>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled) setTurnMode((prev) => !prev);
            }}
            style={{
              width: DPAD_BUTTON_SIZE,
              height: DPAD_BUTTON_SIZE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: turnMode
                ? "rgba(68,102,136,0.95)"
                : "rgba(40,40,60,0.75)",
              border: turnMode
                ? "2px solid rgba(136,204,255,0.7)"
                : "2px solid rgba(100,100,140,0.4)",
              borderRadius: 8,
              color: turnMode ? "#cceeff" : "#888899",
              fontSize: 15,
              fontWeight: "bold",
              touchAction: "none",
              userSelect: "none",
              cursor: "pointer",
              WebkitUserSelect: "none",
            }}
            aria-label="向きモード切替"
            aria-pressed={turnMode}
          >
            向
          </button>
        </div>

        {/* 右ボタン: 2行3列 */}
        <div style={{ gridColumn: 3, gridRow: 2 }}>
          <button
            onPointerDown={makeDirHandler("move_right", "turn_right")}
            style={DPAD_BUTTON_STYLE}
            aria-label={turnMode ? "右を向く" : "右移動"}
          >
            {turnMode ? "→" : "▶"}
          </button>
        </div>

        {/* 下ボタン: 3行2列 */}
        <div style={{ gridColumn: 2, gridRow: 3 }}>
          <button
            onPointerDown={makeDirHandler("move_down", "turn_down")}
            style={DPAD_BUTTON_STYLE}
            aria-label={turnMode ? "下を向く" : "下移動"}
          >
            {turnMode ? "↓" : "▼"}
          </button>
        </div>
      </div>

      {/* ── アクションボタン ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
        }}
      >
        {/* 攻撃ボタン */}
        <button
          onPointerDown={makeHandler("attack")}
          style={{ ...ACTION_BUTTON_BASE, backgroundColor: "#cc2222" }}
          aria-label="攻撃"
        >
          攻
        </button>

        {/* 待機ボタン */}
        <button
          onPointerDown={makeHandler("wait")}
          style={{ ...ACTION_BUTTON_BASE, backgroundColor: "#224488" }}
          aria-label="待機"
        >
          待
        </button>
      </div>

      {/* ── メニューボタン（アイテム・装備） ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: "center",
        }}
      >
        {/* ステータスボタン */}
        <button
          onPointerDown={makeUIHandler("open_status")}
          style={{ ...MENU_BUTTON_BASE, backgroundColor: "#885533" }}
          aria-label="ステータスパネルを開く"
        >
          能力
        </button>

        {/* アイテムボタン */}
        <button
          onPointerDown={makeUIHandler("open_inventory")}
          style={{ ...MENU_BUTTON_BASE, backgroundColor: "#553388" }}
          aria-label="アイテムパネルを開く"
        >
          アイ
        </button>

        {/* 装備ボタン */}
        <button
          onPointerDown={makeUIHandler("open_weapons")}
          style={{ ...MENU_BUTTON_BASE, backgroundColor: "#225533" }}
          aria-label="装備パネルを開く"
        >
          装備
        </button>
      </div>

      {/* ── スキルボタン（習得済みアクティブスキルのみ表示） ── */}
      {skillSlots && skillSlots.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "#aaaacc",
              marginBottom: 2,
              fontWeight: "bold",
              letterSpacing: "0.05em",
            }}
          >
            スキル
          </div>
          {skillSlots.map((slot, idx) => {
            const ready = slot.cooldown === 0;
            return (
              <button
                key={idx}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!disabled && ready && onSkillUse) {
                    onSkillUse(idx);
                  }
                }}
                style={{
                  width: MENU_BUTTON_W + 4,
                  height: MENU_BUTTON_H,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  border: ready
                    ? "2px solid rgba(100,180,255,0.6)"
                    : "2px solid rgba(100,100,140,0.3)",
                  borderRadius: 8,
                  backgroundColor: ready ? "#1a3a5e" : "#1a1a2a",
                  color: ready ? "#88ccff" : "#666688",
                  fontSize: 10,
                  fontWeight: "bold",
                  touchAction: "none",
                  userSelect: "none",
                  cursor: ready ? "pointer" : "default",
                  WebkitUserSelect: "none",
                  opacity: disabled ? 0.5 : 1,
                  gap: 1,
                }}
                aria-label={`スキル${idx + 1}: ${slot.name}${ready ? " (使用可能)" : ` (CD:${slot.cooldown})`}`}
                aria-disabled={!ready}
              >
                <span style={{ fontSize: 9, color: ready ? "#6699cc" : "#445566" }}>
                  [{idx + 1}]
                </span>
                <span style={{ fontSize: 10, lineHeight: 1 }}>
                  {slot.name.length > 5 ? slot.name.slice(0, 5) + "…" : slot.name}
                </span>
                <span style={{ fontSize: 9, color: ready ? "#44bb88" : "#996644" }}>
                  {ready ? "Ready" : `CD:${slot.cooldown}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
