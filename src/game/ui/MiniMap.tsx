'use client';

/**
 * @fileoverview ミニマップコンポーネント
 *
 * Canvas 2D で 80×80px のミニマップを描画する。
 * devicePixelRatio に対応してぼやけを防止する。
 *
 * 描画仕様:
 * - 1タイル = 2×2px（80px / 40タイル上限）
 * - 壁          : #444455
 * - 床/通路      : #999999
 * - 探索済み未表示: #555566
 * - 未探索       : 描画しない（黒）
 * - 階段         : #ffdd00
 * - プレイヤー    : #44aaff、3×3px の点
 * - 敵（視界内）  : #ff4444、2×2px の点
 * - 視野範囲      : rgba(255,255,255,0.15) の薄い白枠
 */

import { useRef, useEffect } from 'react';
import type { Floor, Position } from '../core/types';
import { TILE_WALL, TILE_STAIRS_DOWN, TILE_ITEM, TILE_GOLD, TILE_SHOP, TILE_WEAPON } from '../core/constants';
import type { Enemy } from '../core/game-state';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** ミニマップの論理サイズ (px) */
const MINIMAP_SIZE = 80;
/** 1タイルあたりのピクセル数 */
const TILE_PX = 2;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface MiniMapProps {
  /** フロアデータ（cells, width, height） */
  floor: Floor;
  /** プレイヤーの現在座標 */
  playerPos: Position;
  /** 敵リスト（視界内のみ表示） */
  enemies: Enemy[];
  /** 視界半径（VIEW_RADIUS） */
  viewRadius: number;
}

// ---------------------------------------------------------------------------
// MiniMap コンポーネント
// ---------------------------------------------------------------------------

/**
 * 80×80px の Canvas ミニマップ。
 * HUD の右上エリアに組み込んで使用する。
 */
export default function MiniMap({
  floor,
  playerPos,
  enemies,
  viewRadius,
}: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const physicalSize = MINIMAP_SIZE * dpr;

    // Canvas の物理ピクセルサイズを設定
    canvas.width = physicalSize;
    canvas.height = physicalSize;
    canvas.style.width = `${MINIMAP_SIZE}px`;
    canvas.style.height = `${MINIMAP_SIZE}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // DPR スケール適用
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景をクリア（黒 = 未探索）
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // タイル描画
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const cell = floor.cells[y]?.[x];
        if (!cell) continue;

        const px = x * TILE_PX;
        const py = y * TILE_PX;

        if (cell.isVisible || cell.isExplored) {
          const isDim = !cell.isVisible;
          
          if (cell.tile === TILE_WALL) {
            ctx.fillStyle = isDim ? '#333344' : '#444455';
          } else if (cell.tile === TILE_STAIRS_DOWN) {
            ctx.fillStyle = isDim ? '#998800' : '#ffdd00';
          } else if (cell.tile === TILE_SHOP) {
            ctx.fillStyle = isDim ? '#aa00aa' : '#ff00ff'; // Magenta
          } else if (cell.tile === TILE_ITEM) {
            ctx.fillStyle = isDim ? '#008800' : '#44ff44'; // Green
          } else if (cell.tile === TILE_WEAPON) {
            ctx.fillStyle = isDim ? '#0044aa' : '#4488ff'; // Blue
          } else if (cell.tile === TILE_GOLD) {
            ctx.fillStyle = isDim ? '#999900' : '#ffff00'; // Yellow
          } else {
            ctx.fillStyle = isDim ? '#555566' : '#999999';
          }
          ctx.fillRect(px, py, TILE_PX, TILE_PX);
        }
        // 未探索は描画しない（黒のまま）
      }
    }

    // 視野範囲の薄い白枠
    const viewLeft   = playerPos.x * TILE_PX - viewRadius * TILE_PX;
    const viewTop    = playerPos.y * TILE_PX - viewRadius * TILE_PX;
    const viewWidth  = (viewRadius * 2 + 1) * TILE_PX;
    const viewHeight = (viewRadius * 2 + 1) * TILE_PX;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewLeft, viewTop, viewWidth, viewHeight);

    // 視界内の敵を赤点で描画（2×2px）
    ctx.fillStyle = '#ff4444';
    for (const enemy of enemies) {
      const ex = enemy.pos.x * TILE_PX;
      const ey = enemy.pos.y * TILE_PX;
      ctx.fillRect(ex, ey, TILE_PX, TILE_PX);
    }

    // プレイヤーを青点で描画（3×3px、中央寄せ）
    const ppx = playerPos.x * TILE_PX - 0.5;
    const ppy = playerPos.y * TILE_PX - 0.5;
    ctx.fillStyle = '#44aaff';
    ctx.fillRect(ppx, ppy, 3, 3);
  }, [floor, playerPos, enemies, viewRadius]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        border: '1px solid rgba(85,85,102,0.8)',
        borderRadius: 2,
        imageRendering: 'pixelated',
      }}
      aria-label="ミニマップ"
    />
  );
}
