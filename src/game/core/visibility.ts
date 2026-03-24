/**
 * @fileoverview 視界更新システム
 *
 * プレイヤーの現在座標と視界半径から
 * Floor の各セルの isVisible / isExplored フラグを更新する。
 *
 * - isVisible  : 現在プレイヤーの視野内（毎ターン再計算）
 * - isExplored : 一度でも視野に入ったことがある（永続）
 *
 * 純粋関数。元の Floor を変更せず、新しい Floor オブジェクトを返す。
 */

import type { Floor } from './types';
import type { Position } from './types';
import { TILE_WALL } from './constants';

/**
 * プレイヤーの視野を更新した Floor を返す。
 *
 * 視界計算:
 * - 半径 radius タイル以内（ユークリッド距離）を isVisible にする。
 * - 壁は視線を遮る（壁タイル自体は見えるが、その先は見えない）。
 * - isExplored は一度 true になったら false に戻らない。
 *
 * @param floor - 現在のフロア
 * @param pos - プレイヤーの現在座標
 * @param radius - 視界半径（タイル数）
 * @returns 視界フラグを更新した新しい Floor
 */
export function updateVisibility(
  floor: Floor,
  pos: Position,
  radius: number,
): Floor {
  // cells の深コピー（isVisible / isExplored のみ変更）
  const newCells = floor.cells.map((row) =>
    row.map((cell) => ({ ...cell, isVisible: false })),
  );

  const r2 = radius * radius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // ユークリッド距離チェック（円形視界）
      if (dx * dx + dy * dy > r2) continue;

      const tx = pos.x + dx;
      const ty = pos.y + dy;

      // マップ範囲外はスキップ
      if (tx < 0 || tx >= floor.width || ty < 0 || ty >= floor.height) continue;

      // 視線チェック: 双方向で確認し、どちらか一方でも通れば視認可能とする（対称LOS）
      const target = { x: tx, y: ty };
      if (!hasLineOfSight(floor.cells, pos, target) &&
          !hasLineOfSight(floor.cells, target, pos)) continue;

      newCells[ty][tx].isVisible = true;
      newCells[ty][tx].isExplored = true;
    }
  }

  return { ...floor, cells: newCells };
}

/**
 * ブレゼンハムの直線アルゴリズムで視線を計算する。
 * from から to の途中に TILE_WALL があれば false を返す。
 * to 自体が壁であれば true（壁は見える）。
 *
 * @param cells - フロアのセル配列
 * @param from - 視点（プレイヤー）
 * @param to - 確認対象のセル
 * @returns 視線が通れば true
 */
function hasLineOfSight(
  cells: Floor['cells'],
  from: Position,
  to: Position,
): boolean {
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    // 目標に到達（目標セル自体は壁でも「見える」）
    if (x0 === x1 && y0 === y1) return true;

    // 途中経路が壁なら視線を遮断（起点は除く）
    if (
      !(x0 === from.x && y0 === from.y) &&
      cells[y0]?.[x0]?.tile === TILE_WALL
    ) {
      return false;
    }

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}
