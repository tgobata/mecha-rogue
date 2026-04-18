/**
 * @fileoverview Wizardry 風疑似 3D ダンジョン描画エンジン（Session 1: 単色版）
 *
 * レイキャストではなく「ステップ別矩形描画」方式を採用。
 * プレイヤー前方 5 マス分を距離に応じた矩形サイズで奥→手前の順に描画する。
 * テクスチャなし・単色で動作確認するための最小実装。
 */

import type { Floor, Position } from '../core/types';
import type { Direction } from '../core/game-state';
import { TILE_WALL, TILE_CRACKED_WALL } from '../core/constants';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 前方に描画する最大ステップ数（奥行き） */
const MAX_DEPTH = 5;

/**
 * 各ステップの描画パラメータ。
 * centerY: 画面高さに対する壁中心Y位置の比率
 * wallH:   画面高さに対する壁高さの比率
 * sideW:   画面幅に対する側壁（左右壁）の奥行き幅の比率
 */
interface DepthSlice {
  centerY: number;
  wallH: number;
  /** 正面壁の左端X（画面幅比率） */
  frontLeft: number;
  /** 正面壁の右端X（画面幅比率） */
  frontRight: number;
}

/**
 * 奥→手前の各ステップの描画サイズ比率テーブル。
 * インデックス 0 が最も遠い（5マス先）、4 が最も近い（1マス先）。
 */
const DEPTH_TABLE: DepthSlice[] = [
  // step 5（最奥）
  { centerY: 0.5, wallH: 0.10, frontLeft: 0.42, frontRight: 0.58 },
  // step 4
  { centerY: 0.5, wallH: 0.17, frontLeft: 0.37, frontRight: 0.63 },
  // step 3
  { centerY: 0.5, wallH: 0.28, frontLeft: 0.30, frontRight: 0.70 },
  // step 2
  { centerY: 0.5, wallH: 0.45, frontLeft: 0.20, frontRight: 0.80 },
  // step 1（最前列）
  { centerY: 0.5, wallH: 0.72, frontLeft: 0.05, frontRight: 0.95 },
];

// ---------------------------------------------------------------------------
// 色パレット（単色版）
// ---------------------------------------------------------------------------

const COLOR_CEILING = '#1a1a2e';
const COLOR_FLOOR_TILE = '#16213e';
const COLOR_WALL_FRONT = '#4a4a6a';
const COLOR_WALL_SIDE = '#2e2e4a';
const COLOR_WALL_FAR = '#222233';
const COLOR_WALL_OUTLINE = '#111122';

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** Direction を (dx, dy) に変換する */
function dirToDelta(facing: Direction): { dx: number; dy: number } {
  switch (facing) {
    case 'up':    return { dx:  0, dy: -1 };
    case 'down':  return { dx:  0, dy:  1 };
    case 'left':  return { dx: -1, dy:  0 };
    case 'right': return { dx:  1, dy:  0 };
  }
}

/** facing を 90° 左に回転した方向を返す */
function turnLeft(facing: Direction): Direction {
  const map: Record<Direction, Direction> = {
    up: 'left', left: 'down', down: 'right', right: 'up',
  };
  return map[facing];
}

/** facing を 90° 右に回転した方向を返す */
function turnRight(facing: Direction): Direction {
  const map: Record<Direction, Direction> = {
    up: 'right', right: 'down', down: 'left', left: 'up',
  };
  return map[facing];
}

/** 座標がマップ範囲内かつ壁かどうか */
function isWall(map: Floor, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  const t = map.cells[y][x].tile;
  return t === TILE_WALL || t === TILE_CRACKED_WALL;
}

// ---------------------------------------------------------------------------
// メイン描画関数
// ---------------------------------------------------------------------------

export interface Dungeon3DOptions {
  /** Canvas の描画コンテキスト */
  ctx: CanvasRenderingContext2D;
  /** 描画領域の左上 X（px） */
  x: number;
  /** 描画領域の左上 Y（px） */
  y: number;
  /** 描画領域の幅（px） */
  width: number;
  /** 描画領域の高さ（px） */
  height: number;
  /** 現在のフロアマップ */
  map: Floor;
  /** プレイヤー座標 */
  playerPos: Position;
  /** プレイヤーの向き */
  facing: Direction;
}

/**
 * Wizardry 風疑似 3D ダンジョンビューを描画する。
 *
 * 描画順:
 * 1. 天井・床の背景グラデーション
 * 2. 奥（step=5）→手前（step=1）の順に壁を描画
 *    各 step で正面・左壁・右壁を判定して矩形を塗る
 */
export function renderDungeon3D(opts: Dungeon3DOptions): void {
  const { ctx, x: ox, y: oy, width: W, height: H, map, playerPos, facing } = opts;

  ctx.save();
  ctx.translate(ox, oy);

  // --- 背景（天井・床） ---
  const ceilGrad = ctx.createLinearGradient(0, 0, 0, H * 0.5);
  ceilGrad.addColorStop(0, COLOR_CEILING);
  ceilGrad.addColorStop(1, '#0d0d1f');
  ctx.fillStyle = ceilGrad;
  ctx.fillRect(0, 0, W, H * 0.5);

  const floorGrad = ctx.createLinearGradient(0, H * 0.5, 0, H);
  floorGrad.addColorStop(0, '#0d0d1f');
  floorGrad.addColorStop(1, COLOR_FLOOR_TILE);
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);

  // --- 前方レーン情報を収集（奥行き別） ---
  const fwd = dirToDelta(facing);
  const left = dirToDelta(turnLeft(facing));
  const right = dirToDelta(turnRight(facing));

  // step 1〜5 の情報（前方マスの壁状態）
  interface StepInfo {
    hasFrontWall: boolean;
    hasLeftWall: boolean;
    hasRightWall: boolean;
  }
  const steps: StepInfo[] = [];
  for (let d = 1; d <= MAX_DEPTH; d++) {
    const fx = playerPos.x + fwd.dx * d;
    const fy = playerPos.y + fwd.dy * d;
    const lx = fx + left.dx;
    const ly = fy + left.dy;
    const rx = fx + right.dx;
    const ry = fy + right.dy;
    steps.push({
      hasFrontWall: isWall(map, fx, fy),
      hasLeftWall:  isWall(map, lx, ly),
      hasRightWall: isWall(map, rx, ry),
    });
  }

  // --- 奥から手前の順に描画 ---
  // DEPTH_TABLE[0] = step5（最奥）、DEPTH_TABLE[4] = step1（最前）
  for (let i = 0; i < MAX_DEPTH; i++) {
    const depth = MAX_DEPTH - i;          // 5, 4, 3, 2, 1
    const tableIdx = MAX_DEPTH - depth;   // 0, 1, 2, 3, 4
    const slice = DEPTH_TABLE[tableIdx];
    const stepInfo = steps[depth - 1];    // steps[4], steps[3], ..., steps[0]

    const farness = depth / MAX_DEPTH;    // 1.0（最奥）→ 0.2（最前）
    const wallColor = lerpColor(COLOR_WALL_FRONT, COLOR_WALL_FAR, farness);
    const sideColor = lerpColor(COLOR_WALL_SIDE, COLOR_WALL_FAR, farness);

    const wallTop    = H * (slice.centerY - slice.wallH / 2);
    const wallBottom = H * (slice.centerY + slice.wallH / 2);
    const wallLeft   = W * slice.frontLeft;
    const wallRight  = W * slice.frontRight;

    // 左側壁（このステップの左壁と1つ手前の左壁を結ぶ台形）
    if (stepInfo.hasLeftWall) {
      const innerSlice = tableIdx < MAX_DEPTH - 1 ? DEPTH_TABLE[tableIdx + 1] : null;
      const innerLeft  = innerSlice ? W * innerSlice.frontLeft : 0;
      const innerTop   = innerSlice ? H * (innerSlice.centerY - innerSlice.wallH / 2) : wallTop;
      const innerBot   = innerSlice ? H * (innerSlice.centerY + innerSlice.wallH / 2) : wallBottom;

      ctx.fillStyle = sideColor;
      ctx.beginPath();
      ctx.moveTo(wallLeft, wallTop);
      ctx.lineTo(innerLeft, innerTop);
      ctx.lineTo(innerLeft, innerBot);
      ctx.lineTo(wallLeft, wallBottom);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COLOR_WALL_OUTLINE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 右側壁
    if (stepInfo.hasRightWall) {
      const innerSlice = tableIdx < MAX_DEPTH - 1 ? DEPTH_TABLE[tableIdx + 1] : null;
      const innerRight = innerSlice ? W * innerSlice.frontRight : W;
      const innerTop   = innerSlice ? H * (innerSlice.centerY - innerSlice.wallH / 2) : wallTop;
      const innerBot   = innerSlice ? H * (innerSlice.centerY + innerSlice.wallH / 2) : wallBottom;

      ctx.fillStyle = sideColor;
      ctx.beginPath();
      ctx.moveTo(wallRight, wallTop);
      ctx.lineTo(innerRight, innerTop);
      ctx.lineTo(innerRight, innerBot);
      ctx.lineTo(wallRight, wallBottom);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COLOR_WALL_OUTLINE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 正面壁
    if (stepInfo.hasFrontWall) {
      ctx.fillStyle = wallColor;
      ctx.fillRect(wallLeft, wallTop, wallRight - wallLeft, wallBottom - wallTop);
      ctx.strokeStyle = COLOR_WALL_OUTLINE;
      ctx.lineWidth = 1;
      ctx.strokeRect(wallLeft, wallTop, wallRight - wallLeft, wallBottom - wallTop);
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 補助関数
// ---------------------------------------------------------------------------

/**
 * 2 色を線形補間する。
 * @param a - 近い色（手前）
 * @param b - 遠い色（奥）
 * @param t - 0.0（a）〜1.0（b）
 */
function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff] as const;
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${b2})`;
}
