/**
 * @fileoverview 迷路到達可能性 P0 テスト
 *
 * 1000回生成して全て到達可能であることを検証する。
 * 既存の mazeGenerator.test.ts では数回しか試行していないため、
 * このファイルで大量試行による堅牢性チェックを行う。
 */

import { describe, test, expect } from 'vitest';
import { generateFloor, validateFloor } from '../../src/game/core/maze-generator.js';
import { getTileAt, isWalkable } from '../../src/game/core/floorUtils.js';
import { TILE_STAIRS_DOWN } from '../../src/game/core/constants.js';
import type { Floor, Position } from '../../src/game/core/types.js';

// ---------------------------------------------------------------------------
// ヘルパー: BFS でスタートから階段への到達確認
// ---------------------------------------------------------------------------

/**
 * BFS でスタート座標から階段座標が到達可能かを検証する。
 * validateFloor は全通路の連結性を確認するが、こちらは
 * スタートと階段の2点間の到達確認に特化した可読性重視の実装。
 *
 * @param floor - 検証対象のフロア
 * @returns スタートから階段に到達できれば true
 */
function stairsReachableFromStart(floor: Floor): boolean {
  const start = floor.startPos;
  const stairs = floor.stairsPos;

  const visited = new Set<string>();
  const queue: Position[] = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // 階段に到達したら成功
    if (current.x === stairs.x && current.y === stairs.y) {
      return true;
    }

    // 上下左右の隣接マスを探索
    const neighbors: Position[] = [
      { x: current.x,     y: current.y - 1 },
      { x: current.x,     y: current.y + 1 },
      { x: current.x - 1, y: current.y     },
      { x: current.x + 1, y: current.y     },
    ];

    for (const neighbor of neighbors) {
      const key = `${neighbor.x},${neighbor.y}`;
      if (!visited.has(key) && isWalkable(getTileAt(floor, neighbor))) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

// 1000回試行のタイムアウトを延長する（デフォルト5秒では不足の可能性）
const LARGE_ITERATION_TIMEOUT = 60_000;

describe('迷路到達可能性 P0', () => {
  test('1000回生成して全て到達可能', { timeout: LARGE_ITERATION_TIMEOUT }, () => {
    for (let i = 0; i < 1000; i++) {
      const floor = generateFloor(1, i);
      expect(validateFloor(floor), `シード ${i} のフロアが到達可能性検証に失敗`).toBe(true);
    }
  });

  test('全階層サイズで到達可能（各10回）', () => {
    // 代表フロア: 1, 6, 11, 21, 31 階（各サイズ帯の先頭）
    const REP_FLOORS = [1, 6, 11, 21, 31] as const;
    for (const floorNum of REP_FLOORS) {
      for (let seed = 0; seed < 10; seed++) {
        const floor = generateFloor(floorNum, seed);
        expect(
          validateFloor(floor),
          `${floorNum}階 シード${seed} が到達可能性検証に失敗`,
        ).toBe(true);
      }
    }
  });

  test('スタートから階段が必ず到達可能', () => {
    for (let i = 0; i < 100; i++) {
      const floor = generateFloor(1, i);
      expect(
        stairsReachableFromStart(floor),
        `シード ${i}: スタートから階段に到達不可`,
      ).toBe(true);
    }
  });

  test('stairsPos のタイルが TILE_STAIRS_DOWN になっている（1000回）', { timeout: LARGE_ITERATION_TIMEOUT }, () => {
    for (let i = 0; i < 1000; i++) {
      const floor = generateFloor(1, i);
      const tile = getTileAt(floor, floor.stairsPos);
      expect(tile, `シード ${i}: stairsPos のタイルが階段でない`).toBe(TILE_STAIRS_DOWN);
    }
  });

  test('startPos が常に移動可能タイル上にある（1000回）', { timeout: LARGE_ITERATION_TIMEOUT }, () => {
    for (let i = 0; i < 1000; i++) {
      const floor = generateFloor(1, i);
      const tile = getTileAt(floor, floor.startPos);
      expect(isWalkable(tile), `シード ${i}: startPos が移動不可タイル`).toBe(true);
    }
  });
});
