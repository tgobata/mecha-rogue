/**
 * @fileoverview プレイヤー移動 P0 テスト
 *
 * generateFloor(1, 42) で生成した実フロアを使い、
 * 移動・待機・攻撃アクションの基本動作を検証する。
 * 合成フロアを使う turn-system.test.ts との重複を避けるため、
 * 実フロア上での動作とエッジケースに焦点を当てる。
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { processTurn } from '../../src/game/core/turn-system.js';
import type { PlayerAction } from '../../src/game/core/turn-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Player, Enemy } from '../../src/game/core/game-state.js';
import { generateFloor } from '../../src/game/core/maze-generator.js';
import { getTileAt, isWalkable } from '../../src/game/core/floorUtils.js';
import type { Floor } from '../../src/game/core/types.js';
import { TILE_WALL } from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// テスト定数
// ---------------------------------------------------------------------------

/** 実フロア生成に使うシード（再現性確保） */
const REAL_FLOOR_SEED = 42;
/** テストで使うフロア番号 */
const TEST_FLOOR_NUMBER = 1;

// ---------------------------------------------------------------------------
// セットアップヘルパー
// ---------------------------------------------------------------------------

/**
 * exploring フェーズの最小 GameState を返す。
 * フロアは generateFloor(1, 42)、プレイヤーを floor.startPos に配置する。
 *
 * @param floorSeed - フロア生成シード（デフォルト: REAL_FLOOR_SEED）
 * @returns 探索中の GameState
 */
function makeExploringState(floorSeed: number = REAL_FLOOR_SEED): GameState {
  const base = createInitialGameState();
  const floor = generateFloor(TEST_FLOOR_NUMBER, floorSeed);

  const player: Player = {
    pos: { x: floor.startPos.x, y: floor.startPos.y },
    hp: base.machine.maxHp,
    maxHp: base.machine.maxHp,
    atk: 8,
    def: 5,
    facing: 'down',
  };

  return {
    ...base,
    phase: 'exploring',
    player,
    enemies: [],
    map: floor,
    floor: TEST_FLOOR_NUMBER,
    exploration: {
      currentFloor: floor,
      playerPos: player.pos,
      floorNumber: TEST_FLOOR_NUMBER,
      turn: 0,
    },
  };
}

/**
 * プレイヤーをスタートから特定の方向に移動できるまで進め、
 * 壁に隣接した座標を見つけてその方向の壁を確認するためのヘルパー。
 * startPos の上下左右で最初に壁があるセルを返す。
 *
 * @param floor - 対象フロア
 * @returns { pos, action } 壁に隣接した位置とその壁方向アクション
 */
function findWallAdjacentAction(floor: Floor): { action: PlayerAction } | null {
  const start = floor.startPos;
  const checks: Array<{ dx: number; dy: number; action: PlayerAction }> = [
    { dx: 0,  dy: -1, action: 'move_up'    },
    { dx: 0,  dy:  1, action: 'move_down'  },
    { dx: -1, dy:  0, action: 'move_left'  },
    { dx:  1, dy:  0, action: 'move_right' },
  ];

  for (const { dx, dy, action } of checks) {
    const neighbor = { x: start.x + dx, y: start.y + dy };
    const tile = getTileAt(floor, neighbor);
    if (!isWalkable(tile)) {
      return { action };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('プレイヤー移動 P0（実フロア）', () => {
  let state: GameState;
  let floor: Floor;

  beforeEach(() => {
    state = makeExploringState(REAL_FLOOR_SEED);
    floor = state.map!;
  });

  test('move_up で y が -1 される（壁でない場合）', () => {
    const startPos = state.player!.pos;
    // startPos の上が壁でない場合のみ移動を確認する
    const upTile = getTileAt(floor, { x: startPos.x, y: startPos.y - 1 });
    if (isWalkable(upTile)) {
      const result = processTurn(state, 'move_up');
      expect(result.player!.pos.y).toBe(startPos.y - 1);
      expect(result.player!.pos.x).toBe(startPos.x);
    } else {
      // 上が壁の場合は座標が変わらないことを確認
      const result = processTurn(state, 'move_up');
      expect(result.player!.pos).toEqual(startPos);
    }
  });

  test('move_down で y が +1 される（壁でない場合）', () => {
    const startPos = state.player!.pos;
    const downTile = getTileAt(floor, { x: startPos.x, y: startPos.y + 1 });
    if (isWalkable(downTile)) {
      const result = processTurn(state, 'move_down');
      expect(result.player!.pos.y).toBe(startPos.y + 1);
      expect(result.player!.pos.x).toBe(startPos.x);
    } else {
      const result = processTurn(state, 'move_down');
      expect(result.player!.pos).toEqual(startPos);
    }
  });

  test('move_left で x が -1 される（壁でない場合）', () => {
    const startPos = state.player!.pos;
    const leftTile = getTileAt(floor, { x: startPos.x - 1, y: startPos.y });
    if (isWalkable(leftTile)) {
      const result = processTurn(state, 'move_left');
      expect(result.player!.pos.x).toBe(startPos.x - 1);
      expect(result.player!.pos.y).toBe(startPos.y);
    } else {
      const result = processTurn(state, 'move_left');
      expect(result.player!.pos).toEqual(startPos);
    }
  });

  test('move_right で x が +1 される（壁でない場合）', () => {
    const startPos = state.player!.pos;
    const rightTile = getTileAt(floor, { x: startPos.x + 1, y: startPos.y });
    if (isWalkable(rightTile)) {
      const result = processTurn(state, 'move_right');
      expect(result.player!.pos.x).toBe(startPos.x + 1);
      expect(result.player!.pos.y).toBe(startPos.y);
    } else {
      const result = processTurn(state, 'move_right');
      expect(result.player!.pos).toEqual(startPos);
    }
  });

  test('壁に向かって移動しても座標が変わらない', () => {
    // startPos 周囲の壁を探してその方向へ移動を試みる
    const wallAction = findWallAdjacentAction(floor);
    if (wallAction === null) {
      // startPos の全方向が通路の場合はスキップ（シード依存）
      // 別のシードで別の floor を試みる
      const altState = makeExploringState(999);
      const altFloor = altState.map!;
      const altWallAction = findWallAdjacentAction(altFloor);
      if (altWallAction !== null) {
        const altStartPos = altState.player!.pos;
        const result = processTurn(altState, altWallAction.action);
        expect(result.player!.pos).toEqual(altStartPos);
      }
      return;
    }
    const startPos = state.player!.pos;
    const result = processTurn(state, wallAction.action);
    expect(result.player!.pos).toEqual(startPos);
  });

  test('移動後に exploration.playerPos が player.pos と同期している', () => {
    // 移動可能な方向を探して移動
    const startPos = state.player!.pos;
    const directions: Array<{ tile: { x: number; y: number }; action: PlayerAction }> = [
      { tile: { x: startPos.x,     y: startPos.y - 1 }, action: 'move_up'    },
      { tile: { x: startPos.x,     y: startPos.y + 1 }, action: 'move_down'  },
      { tile: { x: startPos.x - 1, y: startPos.y     }, action: 'move_left'  },
      { tile: { x: startPos.x + 1, y: startPos.y     }, action: 'move_right' },
    ];

    for (const { tile, action } of directions) {
      if (isWalkable(getTileAt(floor, tile))) {
        const result = processTurn(state, action);
        expect(result.exploration!.playerPos).toEqual(result.player!.pos);
        return;
      }
    }

    // 全方向が壁（理論上起きないが念のため）: wait で同期を確認
    const result = processTurn(state, 'wait');
    expect(result.exploration!.playerPos).toEqual(result.player!.pos);
  });

  test('wait アクションで座標が変わらない', () => {
    const startPos = state.player!.pos;
    const result = processTurn(state, 'wait');
    expect(result.player!.pos).toEqual(startPos);
  });

  test('wait アクションで turn が +1 される', () => {
    const turnBefore = state.exploration!.turn;
    const result = processTurn(state, 'wait');
    expect(result.exploration!.turn).toBe(turnBefore + 1);
  });

  test('attack アクションで敵がいない場合は敵リストが変化しない（turn+1はOK）', () => {
    // 敵なし状態
    const result = processTurn(state, 'attack');
    expect(result.enemies).toHaveLength(0);
    // 座標も変わらない
    expect(result.player!.pos).toEqual(state.player!.pos);
    // ターンは進む
    expect(result.exploration!.turn).toBe(state.exploration!.turn + 1);
  });

  test('各シードのフロアで startPos が常に移動可能タイル上にある', () => {
    // 複数シードで makeExploringState が正しく生成できることを確認
    const SEEDS = [0, 1, 42, 100, 999];
    for (const seed of SEEDS) {
      const s = makeExploringState(seed);
      const tile = getTileAt(s.map!, s.player!.pos);
      expect(isWalkable(tile), `シード ${seed}: startPos が移動不可タイル`).toBe(true);
    }
  });
});
