'use client';

/**
 * @fileoverview HUD（ヘッドアップディスプレイ）コンポーネント
 *
 * canvas オーバーレイに表示する要素のみを担当:
 * - 左上: HPバー
 * - 上部中央: ボスHPバー
 * - 右上: 階数 + ミニマップ（クリック/タップで大マップ表示）
 * - 下部: バトルログ
 * - スマホ左側半透明パネル: 装備武器 + アイテム
 *
 * キーボード操作ガイド・PC装備パネルは GameCanvas の視界枠下エリアに表示。
 */

import { useRef, useEffect } from 'react';
import type { Player, Enemy, Inventory } from '../core/game-state';
import type { Floor, Position } from '../core/types';
import { VIEW_RADIUS, TILE_WALL, TILE_STAIRS_DOWN, TILE_ITEM, TILE_GOLD, TILE_SHOP, TILE_WEAPON, TILE_STORAGE } from '../core/constants';
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
  /** ボスを視界内で確認済みかどうか（true になったら HP バーを表示し続ける） */
  bossHPVisible?: boolean;
  /** 現在フロアが休憩所かどうか */
  isRestFloor?: boolean;
  /** ミュート状態 */
  isMuted?: boolean;
  /** サウンドON/OFFトグル */
  onToggleMute?: () => void;
  /** 発見済みボスの座標リスト */
  seenBossPositions?: Position[];
  /** 大マップ表示切替コールバック（ミニマップクリック時） */
  onToggleBigMap?: () => void;
}

function getHpBarColor(hp: number, maxHp: number): string {
  const ratio = hp / maxHp;
  if (ratio > 0.5) return '#44ff44';
  if (ratio > 0.25) return '#ffcc00';
  return '#ff4444';
}


export default function HUD({ player, floorNumber, floor, enemies, inventory, level, gold, bossHPVisible, isRestFloor, isMuted, onToggleMute, seenBossPositions, onToggleBigMap }: HUDProps) {
  const hpBarColor = getHpBarColor(player.hp, player.maxHp);
  const hpPercent  = `${Math.max(0, Math.floor((player.hp / player.maxHp) * 100))}%`;
  const boss = bossHPVisible ? enemies.find(
    (e) => e.aiType === 'boss' || e.enemyType === 'last_boss_shadow' ||
           e.enemyType === 'death_machine' || bosses.some(b => b.id === e.enemyType)
  ) : undefined;

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

      {/* ── 右上: 階数 + ミニマップ + サウンドボタン ── */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-2 z-10" style={{ pointerEvents: 'auto' }}>
        <div
          className="flex flex-col items-center gap-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', border: '1px solid #554400', borderRadius: 4, padding: '4px 6px' }}
        >
          <div className="flex items-center gap-2 w-full justify-between">
            <span className="text-sm font-bold text-yellow-300" style={{ fontFamily: 'monospace' }}>
              {isRestFloor ? '休憩所' : `B${floorNumber}F`}
            </span>
            {onToggleMute && (
              <button
                onClick={onToggleMute}
                title={isMuted ? 'サウンドON' : 'サウンドOFF'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: '0 2px',
                  opacity: isMuted ? 0.5 : 1,
                  pointerEvents: 'auto',
                  color: isMuted ? '#888' : '#ffdd88',
                }}
              >
                <img
                  src={isMuted ? '/sprites/ui/sound_off.png' : '/sprites/ui/sound_on.png'}
                  alt={isMuted ? 'OFF' : 'ON'}
                  style={{ width: 16, height: 16, imageRendering: 'pixelated', display: 'block' }}
                />
              </button>
            )}
          </div>
          {floor !== null && (
            <MiniMap
              floor={floor}
              playerPos={player.pos}
              enemies={enemies}
              viewRadius={VIEW_RADIUS}
              seenBossPositions={seenBossPositions}
              onClick={onToggleBigMap}
            />
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

// ---------------------------------------------------------------------------
// BigMapOverlay コンポーネント
// ---------------------------------------------------------------------------

interface BigMapOverlayProps {
  floor: Floor;
  playerPos: Position;
  enemies: Enemy[];
  viewRadius: number;
  seenBossPositions: Position[];
  floorNumber: number;
  isRestFloor: boolean;
  onClose: () => void;
}

export function BigMapOverlay({ floor, playerPos, enemies, viewRadius, seenBossPositions, floorNumber, isRestFloor, onClose }: BigMapOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    // ビューポートの短辺の 80% を上限にキャンバスサイズを決定
    const maxSize = typeof window !== 'undefined'
      ? Math.floor(Math.min(window.innerWidth * 0.90, window.innerHeight * 0.72))
      : 400;
    const mapSize = Math.min(maxSize, 640);

    const tilePx = mapSize / Math.max(floor.width, floor.height);
    const logicalW = Math.ceil(floor.width * tilePx);
    const logicalH = Math.ceil(floor.height * tilePx);

    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景（全体を暗いグレーで塗る = 「未到達だが存在する」感）
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, logicalW, logicalH);

    // 全タイル描画（isExplored/isVisible に関係なく全セル描画）
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const cell = floor.cells[y]?.[x];
        if (!cell) continue;

        const px = x * tilePx;
        const py = y * tilePx;

        // 未探索: 薄いシルエット表示
        if (!cell.isExplored && !cell.isVisible) {
          if (cell.tile === TILE_WALL) {
            ctx.fillStyle = '#1e1e2a';
          } else {
            ctx.fillStyle = '#1a1a26';
          }
          ctx.fillRect(px, py, tilePx, tilePx);
          continue;
        }

        // 探索済み or 視界内
        const isDim = !cell.isVisible;
        if (cell.tile === TILE_WALL) {
          ctx.fillStyle = isDim ? '#333344' : '#555566';
        } else if (cell.tile === TILE_STAIRS_DOWN) {
          ctx.fillStyle = isDim ? '#998800' : '#ffdd00';
        } else if (cell.tile === TILE_SHOP || cell.tile === TILE_STORAGE) {
          ctx.fillStyle = isDim ? '#0044aa' : '#4488cc';
        } else if (cell.tile === TILE_ITEM) {
          ctx.fillStyle = isDim ? '#008800' : '#44ff44';
        } else if (cell.tile === TILE_WEAPON) {
          ctx.fillStyle = isDim ? '#0044aa' : '#4488ff';
        } else if (cell.tile === TILE_GOLD) {
          ctx.fillStyle = isDim ? '#999900' : '#ffff00';
        } else {
          ctx.fillStyle = isDim ? '#555566' : '#aaaaaa';
        }
        ctx.fillRect(px, py, tilePx, tilePx);
      }
    }

    // 視野範囲の薄い白枠
    const viewLeft   = playerPos.x * tilePx - viewRadius * tilePx;
    const viewTop    = playerPos.y * tilePx - viewRadius * tilePx;
    const viewWidth  = (viewRadius * 2 + 1) * tilePx;
    const viewHeight = (viewRadius * 2 + 1) * tilePx;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewLeft, viewTop, viewWidth, viewHeight);

    // 視界内の敵
    const dotR = Math.max(tilePx * 0.8, 2);
    ctx.fillStyle = '#ff4444';
    for (const enemy of enemies) {
      if (enemy.isBoss) continue;
      ctx.fillRect(
        enemy.pos.x * tilePx - dotR * 0.5,
        enemy.pos.y * tilePx - dotR * 0.5,
        dotR, dotR,
      );
    }

    // 発見済みボスを大マーカーで描画
    for (const bp of seenBossPositions) {
      const bs = Math.max(tilePx * 2, 4);
      const bx = bp.x * tilePx - bs * 0.5;
      const by = bp.y * tilePx - bs * 0.5;
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(bx, by, bs, bs);
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bs, bs);
    }

    // プレイヤーを青点で描画
    const ps = Math.max(tilePx * 1.8, 4);
    const ppx = playerPos.x * tilePx - ps * 0.5;
    const ppy = playerPos.y * tilePx - ps * 0.5;
    ctx.fillStyle = '#44aaff';
    ctx.fillRect(ppx, ppy, ps, ps);
    ctx.strokeStyle = 'rgba(100,200,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ppx - 1, ppy - 1, ps + 2, ps + 2);
  }, [floor, playerPos, enemies, viewRadius, seenBossPositions]);

  return (
    /* position: fixed で viewport 全体を覆う（pcInfoBar 等の canvas 外領域も含む） */
    /* 背景領域クリックで閉じる */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.86)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
      onClick={onClose}
    >
      {/* 内パネル */}
      <div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        {/* ── ヘッダー行 ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, width: '100%', justifyContent: 'space-between' }}>
          <span style={{ color: '#ffdd88', fontFamily: 'monospace', fontSize: 15, fontWeight: 'bold', letterSpacing: 2 }}>
            {isRestFloor ? '休憩所' : `B${floorNumber}F`} マップ
          </span>
          {/* 閉じるボタン */}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(80,30,30,0.95)',
              border: '2px solid #cc4444',
              borderRadius: 8,
              color: '#ffaaaa',
              fontFamily: 'monospace',
              fontSize: 18,
              fontWeight: 'bold',
              lineHeight: 1,
              padding: '8px 20px',
              cursor: 'pointer',
              letterSpacing: 1,
              flexShrink: 0,
            }}
            aria-label="マップを閉じる"
          >
            ✕ 閉じる
          </button>
        </div>

        {/* キャンバス */}
        <canvas
          ref={canvasRef}
          style={{
            border: '2px solid rgba(85,85,120,0.9)',
            borderRadius: 4,
            imageRendering: 'pixelated',
            maxWidth: '90vw',
            maxHeight: '72vh',
            display: 'block',
          }}
          aria-label="大マップ"
        />

        {/* 凡例 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontFamily: 'monospace', fontSize: 10, color: '#aaaacc', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span><span style={{ color: '#44aaff' }}>■</span> 自機</span>
          <span><span style={{ color: '#ff4444' }}>■</span> 敵</span>
          <span><span style={{ color: '#ffdd00' }}>■</span> 階段</span>
          <span><span style={{ color: '#44ff44' }}>■</span> アイテム</span>
          <span><span style={{ color: '#4488cc' }}>■</span> ショップ/倉庫</span>
        </div>

        {/* 操作ヒント */}
        <div style={{ color: '#555566', fontFamily: 'monospace', fontSize: 10, marginTop: 6 }}>
          枠外クリック/タップで閉じる　PC: M / Esc
        </div>
      </div>
    </div>
  );
}
