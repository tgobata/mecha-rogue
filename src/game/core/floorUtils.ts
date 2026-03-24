/**
 * @fileoverview フロアユーティリティ関数群
 * Floor / Cell の参照・判定に使う純粋関数。副作用なし。
 */

import {
  FLOOR_SIZES,
  WALKABLE_TILES,
  DESTRUCTIBLE_TILES,
} from './constants';
import type { Floor, Position, TileType } from './types';

// ---------------------------------------------------------------------------
// マップサイズ
// ---------------------------------------------------------------------------

/**
 * 階層番号からマップサイズを返す。
 * GDD の FLOOR_SIZES テーブルを参照する。
 *
 * @param floorNumber - 1始まりの階層番号
 * @returns { width, height } タイル数単位のマップサイズ
 */
export function getMapSize(floorNumber: number): { width: number; height: number } {
  for (const entry of FLOOR_SIZES) {
    if (floorNumber >= entry.minFloor && floorNumber <= entry.maxFloor) {
      return { width: entry.width, height: entry.height };
    }
  }
  // フォールバック: 最大サイズ
  const last = FLOOR_SIZES[FLOOR_SIZES.length - 1];
  return { width: last.width, height: last.height };
}

// ---------------------------------------------------------------------------
// タイルアクセス
// ---------------------------------------------------------------------------

/**
 * フロアの指定座標のタイル種別を返す。
 * 座標が範囲外の場合は TILE_WALL ('') を返す（壁として扱う）。
 *
 * @param floor - 参照対象のフロア
 * @param pos - 取得したい座標
 * @returns タイル種別
 */
export function getTileAt(floor: Floor, pos: Position): TileType {
  if (pos.x < 0 || pos.x >= floor.width || pos.y < 0 || pos.y >= floor.height) {
    return '#';
  }
  return floor.cells[pos.y][pos.x].tile;
}

/**
 * フロアの指定座標のタイル種別をセットする。
 * 座標が範囲外の場合は何もしない。
 *
 * @param floor - 更新対象のフロア
 * @param pos - 更新したい座標
 * @param tile - セットするタイル種別
 */
export function setTileAt(floor: Floor, pos: Position, tile: TileType): void {
  if (pos.x < 0 || pos.x >= floor.width || pos.y < 0 || pos.y >= floor.height) {
    return;
  }
  floor.cells[pos.y][pos.x].tile = tile;
}

// ---------------------------------------------------------------------------
// タイル判定
// ---------------------------------------------------------------------------

/**
 * タイルがプレイヤー・敵が移動可能か判定する。
 * WALKABLE_TILES セット（constants.ts）を参照する。
 *
 * @param tile - 判定対象のタイル種別
 * @returns 移動可能なら true
 */
export function isWalkable(tile: TileType): boolean {
  // WALKABLE_TILES は移動可能タイルのみを含む Set だが、
  // tile は TILE_WALL 等を含む全 TileType なので型アサーションで対応する。
  return (WALKABLE_TILES as Set<string>).has(tile);
}

/**
 * タイルが破壊可能か判定する（ひび割れ壁など）。
 * DESTRUCTIBLE_TILES セット（constants.ts）を参照する。
 *
 * @param tile - 判定対象のタイル種別
 * @returns 破壊可能なら true
 */
export function isDestructible(tile: TileType): boolean {
  // DESTRUCTIBLE_TILES は破壊可能タイルのみを含む Set なので型アサーションで対応する。
  return (DESTRUCTIBLE_TILES as Set<string>).has(tile);
}

/**
 * 座標がフロアの範囲内か判定する。
 *
 * @param floor - 参照対象のフロア
 * @param pos - 判定したい座標
 * @returns 範囲内なら true
 */
export function isInBounds(floor: Floor, pos: Position): boolean {
  return pos.x >= 0 && pos.x < floor.width && pos.y >= 0 && pos.y < floor.height;
}

/**
 * 2つの座標が等しいか判定する。
 *
 * @param a - 座標A
 * @param b - 座標B
 * @returns 等しければ true
 */
export function posEqual(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * マンハッタン距離を返す。
 *
 * @param a - 座標A
 * @param b - 座標B
 * @returns マンハッタン距離
 */
export function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * 上下左右の隣接座標を返す。
 *
 * @param pos - 中心座標
 * @returns 4方向の座標配列
 */
export function getNeighbors4(pos: Position): Position[] {
  return [
    { x: pos.x,     y: pos.y - 1 },
    { x: pos.x,     y: pos.y + 1 },
    { x: pos.x - 1, y: pos.y     },
    { x: pos.x + 1, y: pos.y     },
  ];
}

/**
 * 指定の座標が含まれる部屋を返す。どの部屋にも含まれない場合は null を返す。
 *
 * @param floor - フロアオブジェクト
 * @param pos - 判定対象の座標
 * @returns 含まれる Room オブジェクト、または null
 */
export function getRoomAt(floor: Floor, pos: Position): import('./types').Room | null {
  for (const room of floor.rooms) {
    const b = room.bounds;
    // bounds は壁を含む矩形。内部（床）は 1 マス内側。
    if (
      pos.x > b.x && pos.x < b.x + b.width - 1 &&
      pos.y > b.y && pos.y < b.y + b.height - 1
    ) {
      return room;
    }
  }
  return null;
}

/**
 * 2つの座標から向きを返す（a から b への方角）。
 */
export function getDirection(a: Position, b: Position): 'up' | 'down' | 'left' | 'right' {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'down' : 'up';
  }
}
