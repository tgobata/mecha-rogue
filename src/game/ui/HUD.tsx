'use client';

/**
 * @fileoverview HUD（ヘッドアップディスプレイ）コンポーネント
 *
 * canvas オーバーレイに表示する要素のみを担当:
 * - 左上: HPバー
 * - 上部中央: ボスHPバー
 * - 右上: 階数 + ミニマップ
 * - 下部: バトルログ
 * - スマホ左側半透明パネル: 装備武器 + アイテム
 *
 * キーボード操作ガイド・PC装備パネルは GameCanvas の視界枠下エリアに表示。
 */

import type { Player, Enemy, Inventory } from '../core/game-state';
import type { Floor } from '../core/types';
import { VIEW_RADIUS } from '../core/constants';
import MiniMap from './MiniMap';
import bossesRaw from '../assets/data/bosses.json';
import { getItemName } from '../core/tool-system';

const bosses = bossesRaw as any[];

function getBossDisplayName(enemyType: string): string {
  if (enemyType === 'last_boss_shadow') return 'ラストボスシャドウ';
  if (enemyType === 'death_machine') return 'デスマシン';
  const data = bosses.find((b: any) => b.id === enemyType);
  return data ? data.name : enemyType;
}

// (LogType と LOG_COLOR は GameCanvas 側に移動したため HUD では不使用)

interface HUDProps {
  player: Player;
  floorNumber: number;
  floor: Floor | null;
  enemies: Enemy[];
  isMenuOpen?: boolean;
  inventory: Inventory;
  /** パイロットレベル */
  level: number;
  /** 所持金 */
  gold: number;
}

function getHpBarColor(hp: number, maxHp: number): string {
  const ratio = hp / maxHp;
  if (ratio > 0.5) return '#44ff44';
  if (ratio > 0.25) return '#ffcc00';
  return '#ff4444';
}


export default function HUD({ player, floorNumber, floor, enemies, inventory, level, gold }: HUDProps) {
  const hpBarColor = getHpBarColor(player.hp, player.maxHp);
  const hpPercent  = `${Math.max(0, Math.floor((player.hp / player.maxHp) * 100))}%`;
  const boss = enemies.find(
    (e) => e.aiType === 'boss' || e.enemyType === 'last_boss_shadow' ||
           e.enemyType === 'death_machine' || bosses.some(b => b.id === e.enemyType)
  );

  // スマホ用装備表示
  const equippedWeapon = player.equippedWeapon;
  const items = inventory.items.slice(0, 5);

  return (
    <div className="absolute inset-0 pointer-events-none select-none">

      {/* ── 左上: HPバー ── */}
      <div className="absolute top-2 left-2 flex flex-col gap-1 min-w-[140px]">
        <span className="text-xs font-bold text-white drop-shadow" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <span className="text-yellow-300">Lv.{level}</span>
          {'  '}
          <span>HP {player.hp}/{player.maxHp}</span>
          {'  '}
          <span className="text-yellow-200">G {gold}</span>
        </span>
        <div
          className="w-36 h-3 rounded-sm overflow-hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', border: '1px solid #555' }}
          role="progressbar"
          aria-valuenow={player.hp}
          aria-valuemin={0}
          aria-valuemax={player.maxHp}
          aria-label="HP"
        >
          <div
            className="h-full rounded-sm transition-all duration-200"
            style={{ width: hpPercent, backgroundColor: hpBarColor, boxShadow: `0 0 4px ${hpBarColor}` }}
          />
        </div>
      </div>

      {/* ── 上部中央: ボスHPバー ── */}
      {boss && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 w-64 z-10">
          <span className="text-sm font-bold text-red-500 drop-shadow-md" style={{ fontFamily: 'monospace', textShadow: '0 0 4px #000' }}>
            {getBossDisplayName(boss.enemyType)}
          </span>
          <div
            className="w-full h-4 rounded-sm overflow-hidden relative"
            style={{ backgroundColor: 'rgba(50,0,0,0.8)', border: '2px solid #880000' }}
          >
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`, backgroundColor: '#ff3333', boxShadow: '0 0 8px #ff0000' }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-md">
              {boss.hp} / {boss.maxHp}
            </span>
          </div>
        </div>
      )}

      {/* ── 右上: 階数 + ミニマップ ── */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-2 z-10">
        <div
          className="flex flex-col items-center gap-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', border: '1px solid #554400', borderRadius: 4, padding: '4px 6px' }}
        >
          <span className="text-sm font-bold text-yellow-300" style={{ fontFamily: 'monospace' }}>
            B{floorNumber}F
          </span>
          {floor !== null && (
            <MiniMap floor={floor} playerPos={player.pos} enemies={enemies} viewRadius={VIEW_RADIUS} />
          )}
        </div>
      </div>

      {/* ── スマホ専用: 左側半透明装備パネル ── */}
      {/* pointer: coarse のみ表示 (CSS media query で制御) */}
      <div
        className="mobile-equip hidden absolute left-1 top-14 flex-col gap-1 z-10"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)', border: '1px solid rgba(80,120,180,0.4)', borderRadius: 6, padding: '4px 6px', maxWidth: 90 }}
      >
        {equippedWeapon ? (
          <div>
            <div style={{ color: '#ffdd88', fontSize: 9, fontFamily: 'monospace' }}>⚔ {equippedWeapon.name.slice(0, 8)}</div>
            {equippedWeapon.durability !== null && (
              <div style={{ color: '#aaaacc', fontSize: 9, fontFamily: 'monospace' }}>{equippedWeapon.durability}/{equippedWeapon.maxDurability}</div>
            )}
          </div>
        ) : (
          <div style={{ color: '#666688', fontSize: 9, fontFamily: 'monospace' }}>武器なし</div>
        )}
        {items.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(100,100,150,0.4)', paddingTop: 2, marginTop: 2 }}>
            {items.map((it, i) => (
              <div key={i} style={{ color: '#99ddaa', fontSize: 9, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 78 }}>
                {(it.unidentified ? '???パーツ' : getItemName(it.itemId)).slice(0, 9)}{it.quantity > 1 ? `×${it.quantity}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* バトルログは GameCanvas の canvas 直下に移動済み */}

      {/* pointer: coarse → mobile-equip 表示 */}
      <style>{`
        @media (pointer: coarse) { .mobile-equip { display: flex !important; } }
        @media (pointer: fine)   { .mobile-equip { display: none  !important; } }
      `}</style>
    </div>
  );
}
