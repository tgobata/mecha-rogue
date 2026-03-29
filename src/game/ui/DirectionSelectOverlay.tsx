'use client';

/**
 * @fileoverview 方向選択オーバーレイコンポーネント
 *
 * 投げる方向を選択するための4方向ボタンオーバーレイ。
 * Canvas の上に absolute 配置で中央に表示する。
 */

import type { Direction } from '../core/game-state';

interface DirectionSelectOverlayProps {
  /** 選択肢のタイトル（例: "○○ を投げる方向"） */
  title: string;
  /** 方向選択コールバック */
  onSelect: (dir: Direction) => void;
  /** キャンセルコールバック */
  onCancel: () => void;
}

const OVERLAY_Z_INDEX = 30;

export default function DirectionSelectOverlay({
  title,
  onSelect,
  onCancel,
}: DirectionSelectOverlayProps) {
  return (
    <div
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: OVERLAY_Z_INDEX,
        backgroundColor: 'rgba(0,0,0,0.65)',
        pointerEvents: 'auto',
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(10, 10, 26, 0.97)',
          border: '1px solid #556677',
          borderRadius: 10,
          padding: '16px 20px',
          fontFamily: 'monospace',
          color: '#ccddee',
          minWidth: 180,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 14, color: '#ffcc88', fontWeight: 'bold' }}>
          {title}
        </div>

        {/* 上ボタン */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <DirectionButton label="↑ 上" onClick={() => onSelect('up')} />
        </div>

        {/* 左・右ボタン */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
          <DirectionButton label="← 左" onClick={() => onSelect('left')} />
          <div style={{ width: 48 }} />
          <DirectionButton label="右 →" onClick={() => onSelect('right')} />
        </div>

        {/* 下ボタン */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <DirectionButton label="↓ 下" onClick={() => onSelect('down')} />
        </div>

        {/* キャンセルボタン */}
        <button
          onPointerDown={onCancel}
          style={{
            padding: '4px 16px',
            fontSize: 12,
            backgroundColor: '#332222',
            border: '1px solid #554444',
            borderRadius: 5,
            color: '#cc9999',
            cursor: 'pointer',
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

function DirectionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onPointerDown={onClick}
      style={{
        padding: '6px 14px',
        fontSize: 13,
        fontFamily: 'monospace',
        backgroundColor: '#1a3355',
        border: '1px solid #3366aa',
        borderRadius: 6,
        color: '#88ccff',
        cursor: 'pointer',
        minWidth: 64,
        fontWeight: 'bold',
      }}
    >
      {label}
    </button>
  );
}
