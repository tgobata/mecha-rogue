/**
 * @fileoverview Wizardry 風疑似 3D ダンジョン描画エンジン
 *
 * レイキャストではなく「ステップ別矩形描画」方式を採用。
 * プレイヤー前方 5 マス分を距離に応じた矩形サイズで奥→手前の順に描画する。
 *
 * 描画対象:
 *   - 前方直線上のエンティティ
 *   - 斜め前（正面 d マス先の左右隣）のエンティティ
 *   - 曲がり角の向こう側（左右隣からさらに前方 1 マス）のエンティティ
 *   - 真横（プレイヤー左右隣）のエンティティ
 */

import type { Floor, Position } from '../core/types';
import type { Direction, Enemy } from '../core/game-state';
import type { SpriteCache } from './renderer';
import {
  TILE_WALL, TILE_CRACKED_WALL,
  TILE_ITEM, TILE_WEAPON, TILE_GOLD,
  TILE_SHOP, TILE_REST, TILE_REPAIR,
} from '../core/constants';
import itemsRaw from '../assets/data/items.json';
import toolsRaw from '../assets/data/tools-equipment.json';

/** アイテムID → カテゴリ のルックアップ */
const _itemCategoryMap = new Map<string, string>(
  ([...(itemsRaw as any[]), ...(toolsRaw as any[])])
    .map((d: { id: string; category?: string }) => [d.id, d.category ?? 'unidentified'])
);

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 前方に描画する最大ステップ数（奥行き） */
const MAX_DEPTH = 5;

/**
 * 各ステップの描画パラメータ。
 * centerY: 画面高さに対する壁中心Y位置の比率
 * wallH:   画面高さに対する壁高さの比率
 * frontLeft:  正面壁の左端X（画面幅比率）
 * frontRight: 正面壁の右端X（画面幅比率）
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

/**
 * 指定座標のセルに置かれたアイテム系タイルのスプライトキーを返す。
 * isExplored でなければ null（未探索セルは非表示）。
 */
function getItemKeyAtCell(map: Floor, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const cell = map.cells[y][x];
  if (!cell.isExplored) return null;
  if (cell.tile === TILE_ITEM) {
    const cat = cell.itemId ? (_itemCategoryMap.get(cell.itemId) ?? 'unidentified') : 'unidentified';
    return `item_${cat}`;
  }
  if (cell.tile === TILE_WEAPON)  return 'item_weapon';
  if (cell.tile === TILE_GOLD)    return 'item_special';
  if (cell.tile === TILE_SHOP)    return 'item_special';
  if (cell.tile === TILE_REST)    return 'item_special';
  if (cell.tile === TILE_REPAIR)  return 'item_special';
  return null;
}

// ---------------------------------------------------------------------------
// メイン描画関数
// ---------------------------------------------------------------------------

/** テクスチャキャッシュ型 */
export interface DungeonTextureCache {
  wall: HTMLImageElement | null;
  floor: HTMLImageElement | null;
  ceiling: HTMLImageElement | null;
}

/**
 * ダンジョンテクスチャを非同期で読み込む。
 * 失敗した画像は null を返し、フォールバック描画が使われる。
 */
export async function loadDungeonTextures(): Promise<DungeonTextureCache> {
  const BASE = '/textures/dungeon/';

  function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  const [wall, floor, ceiling] = await Promise.all([
    loadImage(BASE + 'wall_metal.png'),
    loadImage(BASE + 'floor_metal.png'),
    loadImage(BASE + 'ceiling_metal.png'),
  ]);

  return { wall, floor, ceiling };
}

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
  /** テクスチャキャッシュ（省略時は単色フォールバック） */
  textures?: DungeonTextureCache;
  /** 現在フロアの敵リスト（省略時は敵非表示） */
  enemies?: Enemy[];
  /** スプライトキャッシュ（省略時はフォールバック図形） */
  sprites?: SpriteCache;
}

/**
 * 各深度ステップで収集するセル情報。
 * front系  : 前方直線上のエンティティ
 * left/right系 : 斜め前（前方 d マス先の左右隣）
 * leftCorner/rightCorner系 : 曲がり角の向こう（左右隣からさらに前方 1 マス）
 */
interface StepInfo {
  hasFrontWall: boolean;
  hasLeftWall: boolean;
  hasRightWall: boolean;
  frontEnemy: Enemy | null;
  frontItemKey: string | null;
  leftEnemy: Enemy | null;
  leftItemKey: string | null;
  rightEnemy: Enemy | null;
  rightItemKey: string | null;
  leftCornerEnemy: Enemy | null;
  leftCornerItemKey: string | null;
  rightCornerEnemy: Enemy | null;
  rightCornerItemKey: string | null;
}

/**
 * Wizardry 風疑似 3D ダンジョンビューを描画する。
 *
 * 描画順:
 * 1. 天井・床の背景グラデーション
 * 2. 奥（step=5）→手前（step=1）の順に壁を描画
 *    各 step で正面・左壁・右壁を判定して矩形を塗る
 * 3. エンティティ描画（前方直線・斜め前・曲がり角・真横）
 */
export function renderDungeon3D(opts: Dungeon3DOptions): void {
  const {
    ctx, x: ox, y: oy, width: W, height: H,
    map, playerPos, facing, textures, enemies = [], sprites,
  } = opts;

  ctx.save();
  ctx.translate(ox, oy);

  // --- 背景（天井） ---
  if (textures?.ceiling) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(textures.ceiling, 0, 0, W, H * 0.5);
  } else {
    const ceilGrad = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    ceilGrad.addColorStop(0, COLOR_CEILING);
    ceilGrad.addColorStop(1, '#0d0d1f');
    ctx.fillStyle = ceilGrad;
    ctx.fillRect(0, 0, W, H * 0.5);
  }

  // --- 背景（床） ---
  if (textures?.floor) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(textures.floor, 0, H * 0.5, W, H * 0.5);
  } else {
    const floorGrad = ctx.createLinearGradient(0, H * 0.5, 0, H);
    floorGrad.addColorStop(0, '#0d0d1f');
    floorGrad.addColorStop(1, COLOR_FLOOR_TILE);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);
  }

  // --- 前方レーン情報を収集（奥行き別） ---
  const fwd   = dirToDelta(facing);
  const left  = dirToDelta(turnLeft(facing));
  const right = dirToDelta(turnRight(facing));

  const steps: StepInfo[] = [];
  for (let d = 1; d <= MAX_DEPTH; d++) {
    // 前方 d マス先
    const fx = playerPos.x + fwd.dx * d;
    const fy = playerPos.y + fwd.dy * d;

    // 斜め前 左隣・右隣
    const dlx = fx + left.dx;
    const dly = fy + left.dy;
    const drx = fx + right.dx;
    const dry = fy + right.dy;

    // 曲がり角の向こう（斜め前からさらに前方 1 マス）
    const clx = dlx + fwd.dx;
    const cly = dly + fwd.dy;
    const crx = drx + fwd.dx;
    const cry = dry + fwd.dy;

    const hasFrontWall  = isWall(map, fx,  fy);
    const hasLeftWall   = isWall(map, dlx, dly);
    const hasRightWall  = isWall(map, drx, dry);

    // 前方エンティティ
    const frontEnemy    = enemies.find((e) => e.pos.x === fx  && e.pos.y === fy)  ?? null;
    const frontItemKey  = getItemKeyAtCell(map, fx,  fy);

    // 斜め前エンティティ（壁があれば隠れるので null 扱い）
    const leftEnemy     = hasLeftWall  ? null : (enemies.find((e) => e.pos.x === dlx && e.pos.y === dly) ?? null);
    const leftItemKey   = hasLeftWall  ? null : getItemKeyAtCell(map, dlx, dly);
    const rightEnemy    = hasRightWall ? null : (enemies.find((e) => e.pos.x === drx && e.pos.y === dry) ?? null);
    const rightItemKey  = hasRightWall ? null : getItemKeyAtCell(map, drx, dry);

    // 曲がり角の向こうエンティティ
    const leftCornerEnemy    = hasLeftWall  ? null : (enemies.find((e) => e.pos.x === clx && e.pos.y === cly) ?? null);
    const leftCornerItemKey  = hasLeftWall  ? null : getItemKeyAtCell(map, clx, cly);
    const rightCornerEnemy   = hasRightWall ? null : (enemies.find((e) => e.pos.x === crx && e.pos.y === cry) ?? null);
    const rightCornerItemKey = hasRightWall ? null : getItemKeyAtCell(map, crx, cry);

    steps.push({
      hasFrontWall,
      hasLeftWall,
      hasRightWall,
      frontEnemy,
      frontItemKey,
      leftEnemy,
      leftItemKey,
      rightEnemy,
      rightItemKey,
      leftCornerEnemy,
      leftCornerItemKey,
      rightCornerEnemy,
      rightCornerItemKey,
    });
  }

  // --- 奥から手前の順に描画 ---
  // DEPTH_TABLE[0] = step5（最奥）、DEPTH_TABLE[4] = step1（最前）
  for (let i = 0; i < MAX_DEPTH; i++) {
    const depth    = MAX_DEPTH - i;        // 5, 4, 3, 2, 1
    const tableIdx = MAX_DEPTH - depth;    // 0, 1, 2, 3, 4
    const slice    = DEPTH_TABLE[tableIdx];
    const stepInfo = steps[depth - 1];     // steps[4], steps[3], ..., steps[0]

    const farness    = depth / MAX_DEPTH;  // 1.0（最奥）→ 0.2（最前）
    const wallColor  = lerpColor(COLOR_WALL_FRONT, COLOR_WALL_FAR, farness);
    const sideColor  = lerpColor(COLOR_WALL_SIDE,  COLOR_WALL_FAR, farness);

    const wallTop    = H * (slice.centerY - slice.wallH / 2);
    const wallBottom = H * (slice.centerY + slice.wallH / 2);
    const wallLeft   = W * slice.frontLeft;
    const wallRight  = W * slice.frontRight;

    // ---- 左側壁（台形）----
    if (stepInfo.hasLeftWall) {
      const innerSlice = tableIdx < MAX_DEPTH - 1 ? DEPTH_TABLE[tableIdx + 1] : null;
      const innerLeft  = innerSlice ? W * innerSlice.frontLeft : 0;
      const innerTop   = innerSlice ? H * (innerSlice.centerY - innerSlice.wallH / 2) : wallTop;
      const innerBot   = innerSlice ? H * (innerSlice.centerY + innerSlice.wallH / 2) : wallBottom;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(wallLeft, wallTop);
      ctx.lineTo(innerLeft, innerTop);
      ctx.lineTo(innerLeft, innerBot);
      ctx.lineTo(wallLeft, wallBottom);
      ctx.closePath();

      if (textures?.wall) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clip();
        ctx.drawImage(textures.wall, 0, 0, W, H);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = sideColor;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1.0;
      } else {
        ctx.fillStyle = sideColor;
        ctx.fill();
      }

      ctx.restore();
      ctx.strokeStyle = COLOR_WALL_OUTLINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wallLeft, wallTop);
      ctx.lineTo(innerLeft, innerTop);
      ctx.lineTo(innerLeft, innerBot);
      ctx.lineTo(wallLeft, wallBottom);
      ctx.closePath();
      ctx.stroke();
    }

    // ---- 右側壁（台形）----
    if (stepInfo.hasRightWall) {
      const innerSlice = tableIdx < MAX_DEPTH - 1 ? DEPTH_TABLE[tableIdx + 1] : null;
      const innerRight = innerSlice ? W * innerSlice.frontRight : W;
      const innerTop   = innerSlice ? H * (innerSlice.centerY - innerSlice.wallH / 2) : wallTop;
      const innerBot   = innerSlice ? H * (innerSlice.centerY + innerSlice.wallH / 2) : wallBottom;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(wallRight, wallTop);
      ctx.lineTo(innerRight, innerTop);
      ctx.lineTo(innerRight, innerBot);
      ctx.lineTo(wallRight, wallBottom);
      ctx.closePath();

      if (textures?.wall) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clip();
        ctx.drawImage(textures.wall, 0, 0, W, H);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = sideColor;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1.0;
      } else {
        ctx.fillStyle = sideColor;
        ctx.fill();
      }

      ctx.restore();
      ctx.strokeStyle = COLOR_WALL_OUTLINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wallRight, wallTop);
      ctx.lineTo(innerRight, innerTop);
      ctx.lineTo(innerRight, innerBot);
      ctx.lineTo(wallRight, wallBottom);
      ctx.closePath();
      ctx.stroke();
    }

    // ---- 正面壁 ----
    if (stepInfo.hasFrontWall) {
      if (textures?.wall) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.beginPath();
        ctx.rect(wallLeft, wallTop, wallRight - wallLeft, wallBottom - wallTop);
        ctx.clip();
        ctx.drawImage(textures.wall, wallLeft, wallTop, wallRight - wallLeft, wallBottom - wallTop);
        ctx.restore();
      } else {
        ctx.fillStyle = wallColor;
        ctx.fillRect(wallLeft, wallTop, wallRight - wallLeft, wallBottom - wallTop);
      }
      ctx.strokeStyle = COLOR_WALL_OUTLINE;
      ctx.lineWidth = 1;
      ctx.strokeRect(wallLeft, wallTop, wallRight - wallLeft, wallBottom - wallTop);
    }

    // ---- エンティティ描画（スプライトはドット絵なのでシャープ）----
    ctx.imageSmoothingEnabled = false;

    // 前方直線エンティティ
    if (!stepInfo.hasFrontWall) {
      if (stepInfo.frontEnemy) {
        drawEntitySprite(ctx, sprites, resolveEnemySpriteKey(stepInfo.frontEnemy, facing), W, H, depth);
      } else if (stepInfo.frontItemKey) {
        drawEntitySprite(ctx, sprites, stepInfo.frontItemKey, W, H, depth);
      }
    }

    // 斜め前・曲がり角エンティティ（壁があれば stepInfo 収集時に null 済み）
    const baseRatio = SPRITE_H_RATIO[depth - 1] ?? 0.12;

    // ---- 斜め前 左 ----
    const leftKey = stepInfo.leftEnemy
      ? resolveEnemySpriteKey(stepInfo.leftEnemy, facing)
      : stepInfo.leftItemKey;
    if (leftKey) {
      const clipRight = W * slice.frontLeft;
      const sh = H * baseRatio * 0.65;
      const sw = sh;
      const cx = clipRight * 0.45;
      const sy = H * 0.5 - sh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, clipRight, H);
      ctx.clip();
      drawEntitySpriteAt(ctx, sprites, leftKey, cx - sw / 2, sy, sw, sh);
      ctx.restore();
    }

    // ---- 斜め前 右 ----
    const rightKey = stepInfo.rightEnemy
      ? resolveEnemySpriteKey(stepInfo.rightEnemy, facing)
      : stepInfo.rightItemKey;
    if (rightKey) {
      const clipLeft = W * slice.frontRight;
      const sh = H * baseRatio * 0.65;
      const sw = sh;
      const cx = clipLeft + (W - clipLeft) * 0.55;
      const sy = H * 0.5 - sh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(clipLeft, 0, W - clipLeft, H);
      ctx.clip();
      drawEntitySpriteAt(ctx, sprites, rightKey, cx - sw / 2, sy, sw, sh);
      ctx.restore();
    }

    // ---- 曲がり角の向こう 左 ----
    const leftCornerKey = stepInfo.leftCornerEnemy
      ? resolveEnemySpriteKey(stepInfo.leftCornerEnemy, facing)
      : stepInfo.leftCornerItemKey;
    if (leftCornerKey) {
      const clipRight = W * slice.frontLeft * 0.5;
      const sh = H * baseRatio * 0.40;
      const sw = sh;
      const cx = clipRight * 0.5;
      const sy = H * 0.5 - sh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, clipRight, H);
      ctx.clip();
      drawEntitySpriteAt(ctx, sprites, leftCornerKey, cx - sw / 2, sy, sw, sh);
      ctx.restore();
    }

    // ---- 曲がり角の向こう 右 ----
    const rightCornerKey = stepInfo.rightCornerEnemy
      ? resolveEnemySpriteKey(stepInfo.rightCornerEnemy, facing)
      : stepInfo.rightCornerItemKey;
    if (rightCornerKey) {
      const clipLeft = W * slice.frontRight + (W - W * slice.frontRight) * 0.5;
      const sh = H * baseRatio * 0.40;
      const sw = sh;
      const cx = clipLeft + (W - clipLeft) * 0.5;
      const sy = H * 0.5 - sh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(clipLeft, 0, W - clipLeft, H);
      ctx.clip();
      drawEntitySpriteAt(ctx, sprites, rightCornerKey, cx - sw / 2, sy, sw, sh);
      ctx.restore();
    }
  }

  // ---- 真横（プレイヤーの左右隣）----
  ctx.imageSmoothingEnabled = false;

  // 真横 左
  const sideLeftX = playerPos.x + left.dx;
  const sideLeftY = playerPos.y + left.dy;
  if (!isWall(map, sideLeftX, sideLeftY)) {
    const sideLeftEnemy   = enemies.find((e) => e.pos.x === sideLeftX && e.pos.y === sideLeftY) ?? null;
    const sideLeftItemKey = getItemKeyAtCell(map, sideLeftX, sideLeftY);
    const sideLeftKey = sideLeftEnemy
      ? resolveEnemySpriteKey(sideLeftEnemy, facing)
      : sideLeftItemKey;
    if (sideLeftKey) {
      const sh = H * 0.85;
      const sw = sh;
      const cx = W * 0.035;
      const sy = H * 0.5 - sh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W * 0.07, H);
      ctx.clip();
      drawEntitySpriteAt(ctx, sprites, sideLeftKey, cx - sw / 2, sy, sw, sh);
      ctx.restore();
    }
  }

  // 真横 右
  const sideRightX = playerPos.x + right.dx;
  const sideRightY = playerPos.y + right.dy;
  if (!isWall(map, sideRightX, sideRightY)) {
    const sideRightEnemy   = enemies.find((e) => e.pos.x === sideRightX && e.pos.y === sideRightY) ?? null;
    const sideRightItemKey = getItemKeyAtCell(map, sideRightX, sideRightY);
    const sideRightKey = sideRightEnemy
      ? resolveEnemySpriteKey(sideRightEnemy, facing)
      : sideRightItemKey;
    if (sideRightKey) {
      const sh = H * 0.85;
      const sw = sh;
      const cx = W * 0.965;
      const sy = H * 0.5 - sh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(W * 0.93, 0, W * 0.07, H);
      ctx.clip();
      drawEntitySpriteAt(ctx, sprites, sideRightKey, cx - sw / 2, sy, sw, sh);
      ctx.restore();
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// エンティティ描画ヘルパー
// ---------------------------------------------------------------------------

/** 深度 1〜5 に対するスプライト高さ比率（手前ほど大きい） */
const SPRITE_H_RATIO = [0.62, 0.46, 0.32, 0.20, 0.12] as const;

/**
 * 明示的な座標・サイズでエンティティスプライトを描画する。
 * スプライトが見つからない場合は簡易フォールバック図形を描く。
 * 呼び出し前に imageSmoothingEnabled = false を設定しておくこと。
 */
function drawEntitySpriteAt(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteCache | undefined,
  key: string,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): void {
  ctx.imageSmoothingEnabled = false;
  const img = sprites?.get(key);
  if (img) {
    ctx.drawImage(img, sx, sy, sw, sh);
  } else {
    // フォールバック: 半透明の菱形
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = key.startsWith('item') ? '#ffcc44' : '#ff4444';
    ctx.beginPath();
    ctx.moveTo(sx + sw * 0.5, sy);
    ctx.lineTo(sx + sw,       sy + sh * 0.5);
    ctx.lineTo(sx + sw * 0.5, sy + sh);
    ctx.lineTo(sx,            sy + sh * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * エンティティスプライトを距離に応じたサイズで中央に描画する薄いラッパー。
 * スプライトが見つからない場合は簡易フォールバック図形を描く。
 */
function drawEntitySprite(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteCache | undefined,
  key: string,
  W: number,
  H: number,
  depth: number,
): void {
  const ratio = SPRITE_H_RATIO[depth - 1] ?? 0.12;
  const sh = H * ratio;
  const sw = sh;
  const sx = (W - sw) / 2;
  // 足元を水平線（H*0.5）に合わせる
  const sy = H * 0.5 - sh;
  drawEntitySpriteAt(ctx, sprites, key, sx, sy, sw, sh);
}

/**
 * 敵がプレイヤーに向いているスプライトキーを解決する。
 * 方向別スプライト（_dir_*）→ 汎用（_0）の順で試みる。
 */
function resolveEnemySpriteKey(enemy: Enemy, playerFacing: Direction): string {
  const opposite: Record<Direction, Direction> = {
    up: 'down', down: 'up', left: 'right', right: 'left',
  };
  const dir = opposite[playerFacing];
  return `${enemy.enemyType}_dir_${dir}_idle_0`;
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
  const r  = Math.round(ar + (br - ar) * t);
  const g  = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${b2})`;
}
