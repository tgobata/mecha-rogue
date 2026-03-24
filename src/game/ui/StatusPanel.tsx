'use client';

/**
 * @fileoverview ステータスパネルオーバーレイコンポーネント
 *
 * Canvas の上に absolute 配置で重ね、パイロット・機体のステータスを表示する。
 * Escape または閉じるボタンで操作する。
 */

import type { Player, PilotStats } from '../core/game-state';
import { getLevelData } from '../core/level-system';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 300;
const PANEL_MAX_HEIGHT = 400;
const PANEL_Z_INDEX = 20;
const PANEL_BG = 'rgba(10, 10, 26, 0.96)';
const PANEL_BORDER = '1px solid #445566';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface StatusPanelProps {
  player: Player;
  pilot: PilotStats;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// StatusPanel コンポーネント
// ---------------------------------------------------------------------------

export default function StatusPanel({
  player,
  pilot,
  onClose,
}: StatusPanelProps) {
  const nextExp = pilot.level < 20 ? getLevelData(pilot.level + 1).exp_required : 'MAX';
  
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: PANEL_Z_INDEX,
        pointerEvents: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: PANEL_WIDTH,
          maxHeight: PANEL_MAX_HEIGHT,
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'monospace',
          color: '#ccddee',
        }}
        onClick={(e) => e.stopPropagation()} // パネル内クリックで閉じないように
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: '1px solid #334455',
            backgroundColor: 'rgba(20, 20, 40, 0.9)',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 'bold' }}>
            📊 ステータス
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8899aa',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* ── ステータス詳細 ── */}
        <div style={{ padding: '16px 12px', fontSize: 14, lineHeight: '1.6' }}>
          
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#88aaff', fontSize: 12, borderBottom: '1px solid #334455', marginBottom: 4 }}>
              パイロット情報
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>レベル</span>
              <span style={{ color: '#fff' }}>Lv {pilot.level}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>EXP</span>
              <span style={{ color: '#fff' }}>{pilot.exp} / {nextExp}</span>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#ffaa88', fontSize: 12, borderBottom: '1px solid #334455', marginBottom: 4 }}>
              機体情報
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>HP</span>
              <span style={{ color: player.hp < player.maxHp * 0.3 ? '#ff4444' : '#55ff55' }}>
                {player.hp} / {player.maxHp}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>攻撃力 (ATK)</span>
              <span style={{ color: '#ff8888' }}>{player.atk}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>防御力 (DEF)</span>
              <span style={{ color: '#88ff88' }}>{player.def}</span>
            </div>
          </div>
          
          <div>
            <div style={{ color: '#cc88ff', fontSize: 12, borderBottom: '1px solid #334455', marginBottom: 4 }}>
              装備
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>メイン武器</span>
              <span style={{ color: player.equippedWeapon ? '#fff' : '#8899aa' }}>
                {player.equippedWeapon ? player.equippedWeapon.name : '（なし）'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
