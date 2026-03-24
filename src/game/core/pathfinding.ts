/**
 * @fileoverview BFS / A* 経路探索
 *
 * 壁を避けた最短経路を返す純粋関数。
 * ターンシステム・敵AIから参照する。
 */

import type { Floor, Position } from './types';
import { getTileAt, isWalkable } from './floorUtils';

// ---------------------------------------------------------------------------
// BFS 経路探索
// ---------------------------------------------------------------------------

/**
 * BFS で from から to への最短経路を求める。
 * 壁タイル（isWalkable が false）は通過不可。
 *
 * @param from - 出発座標
 * @param to - 目標座標
 * @param floor - 対象フロア
 * @param isPassable - オプション追加判定（phase_ghost など壁貫通用）
 * @returns from の次のステップから to までの座標配列（from 自身は含まない）。
 *          経路がない場合は空配列。
 */
export function findPath(
  from: Position,
  to: Position,
  floor: Floor,
  isPassable?: (pos: Position) => boolean,
): Position[] {
  // 同一座標なら空経路
  if (from.x === to.x && from.y === to.y) return [];

  const key = (p: Position): string => `${p.x},${p.y}`;

  const queue: Position[] = [from];
  const cameFrom = new Map<string, Position | null>();
  cameFrom.set(key(from), null);

  const passable = (pos: Position): boolean => {
    const tile = getTileAt(floor, pos);
    if (!isWalkable(tile)) {
      // カスタム判定（壁貫通など）があれば委譲
      return isPassable ? isPassable(pos) : false;
    }
    return true;
  };

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.x === to.x && current.y === to.y) {
      // 経路を再構築
      const path: Position[] = [];
      let node: Position | null | undefined = current;
      while (node !== null && node !== undefined) {
        path.unshift(node);
        node = cameFrom.get(key(node));
      }
      // 先頭は from 自身なので除去して返す
      return path.slice(1);
    }

    const neighbors: Position[] = [
      { x: current.x,     y: current.y - 1 },
      { x: current.x,     y: current.y + 1 },
      { x: current.x - 1, y: current.y     },
      { x: current.x + 1, y: current.y     },
    ];

    for (const next of neighbors) {
      if (cameFrom.has(key(next))) continue;
      // ゴールタイルは isWalkable でなくても到達を許可（敵の位置等）
      const isGoal = next.x === to.x && next.y === to.y;
      if (!isGoal && !passable(next)) continue;
      cameFrom.set(key(next), current);
      queue.push(next);
    }
  }

  // 経路なし
  return [];
}

/**
 * from から to に向かって最初の1ステップ分の座標を返す。
 * BFS 経路がない場合は from をそのまま返す。
 *
 * @param from - 出発座標
 * @param to - 目標座標
 * @param floor - 対象フロア
 * @param isPassable - オプション追加判定
 * @returns 次のステップ座標
 */
export function nextStep(
  from: Position,
  to: Position,
  floor: Floor,
  isPassable?: (pos: Position) => boolean,
): Position {
  const path = findPath(from, to, floor, isPassable);
  return path.length > 0 ? path[0] : from;
}
