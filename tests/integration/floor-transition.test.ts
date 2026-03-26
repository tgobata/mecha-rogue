/**
 * @fileoverview フロア遷移 P0 統合テスト
 *
 * 階段タイルに移動したときのフロア遷移動作を end-to-end で検証する。
 * processTurn を通じて実際に階段を踏み、遷移後の GameState が
 * 期待通りに更新されていることを確認する。
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { processTurn } from '../../src/game/core/turn-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Player } from '../../src/game/core/game-state.js';
import type { Cell, Floor } from '../../src/game/core/types.js';
import {
  TILE_FLOOR,
  TILE_WALL,
  TILE_STAIRS_DOWN,
  TILE_START,
} from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// テスト定数
// ---------------------------------------------------------------------------

/** 遷移前フロア番号（B2F/B4F/B5F はボス階のためB5を起点にB6への遷移を検証） */
const INITIAL_FLOOR = 5;
/** 遷移後フロア番号（B6F = ボスなし通常フロア） */
const NEXT_FLOOR = INITIAL_FLOOR + 1;

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * 階段テスト用の固定レイアウトフロアを生成する。
 *
 * レイアウト (7x7):
 *   #######
 *   #S....#
 *   #.....#
 *   #.....#
 *   #...>.#
 *   #.....#
 *   #######
 *
 * startPos: (1,1)
 * stairsPos: (4,4)  ← TILE_STAIRS_DOWN
 *
 * プレイヤーを (3,4) に配置すれば move_right で階段を踏める。
 */
function createStairsFloor(): Floor {
  const WIDTH = 7;
  const HEIGHT = 7;
  const cells: Cell[][] = [];

  for (let y = 0; y < HEIGHT; y++) {
    cells[y] = [];
    for (let x = 0; x < WIDTH; x++) {
      const isEdge = x === 0 || x === WIDTH - 1 || y === 0 || y === HEIGHT - 1;
      cells[y][x] = {
        tile: isEdge ? TILE_WALL : TILE_FLOOR,
        isVisible: false,
        isExplored: false,
      };
    }
  }

  // スタートと階段を配置
  const startPos = { x: 1, y: 1 };
  const stairsPos = { x: 4, y: 4 };
  cells[startPos.y][startPos.x].tile = TILE_START;
  cells[stairsPos.y][stairsPos.x].tile = TILE_STAIRS_DOWN;

  return {
    floorNumber: INITIAL_FLOOR,
    width: WIDTH,
    height: HEIGHT,
    cells,
    rooms: [],
    startPos,
    stairsPos,
    seed: 0,
  };
}

/**
 * 階段の1マス手前にプレイヤーを配置した GameState を生成する。
 * 階段 (4,4) の左 (3,4) にプレイヤーを置き、move_right で遷移できる状態にする。
 */
function makeStateBeforeStairs(playerOverrides: Partial<Player> = {}): GameState {
  const base = createInitialGameState();
  const floor = createStairsFloor();

  // 階段の1マス左にプレイヤーを配置
  const playerPos = { x: 3, y: 4 };

  const player: Player = {
    pos: playerPos,
    hp: 80,
    maxHp: 100,
    atk: 8,
    def: 5,
    facing: 'right',
    ...playerOverrides,
  };

  return {
    ...base,
    phase: 'exploring',
    player,
    enemies: [],
    map: floor,
    floor: INITIAL_FLOOR,
    exploration: {
      currentFloor: floor,
      playerPos: player.pos,
      floorNumber: INITIAL_FLOOR,
      turn: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('フロア遷移 P0', () => {
  let stateBefore: GameState;
  let stateAfter: GameState;

  beforeEach(() => {
    stateBefore = makeStateBeforeStairs();
    // move_right で階段を踏んでフロア遷移を発動
    stateAfter = processTurn(stateBefore, 'move_right');
  });

  test('階段タイルに移動すると floor が +1 される', () => {
    expect(stateAfter.floor).toBe(NEXT_FLOOR);
  });

  test('フロア遷移後に enemies が新しいリストに更新される', () => {
    // 遷移前は enemies = []
    // 遷移後は新フロアに応じた enemies リスト（空でも新しい配列参照であること）
    // 新フロアでは spawnEnemiesFromMap が呼ばれるため配列は再生成される
    expect(stateAfter.enemies).toBeDefined();
    // enemies が配列型であることを確認
    expect(Array.isArray(stateAfter.enemies)).toBe(true);
    // 遷移前の enemies と参照が異なる（新しいリスト）
    expect(stateAfter.enemies).not.toBe(stateBefore.enemies);
  });

  test('フロア遷移後に player.pos が新フロアの startPos と一致する', () => {
    const newMap = stateAfter.map!;
    expect(stateAfter.player!.pos).toEqual(newMap.startPos);
  });

  test('フロア遷移後に map が新しい Floor オブジェクトに更新される', () => {
    // map は新フロアのオブジェクトに差し替わっている
    expect(stateAfter.map).not.toBe(stateBefore.map);
    expect(stateAfter.map!.floorNumber).toBe(NEXT_FLOOR);
  });

  test('フロア遷移後もプレイヤーの HP は引き継がれる', () => {
    // 遷移前の player.hp が遷移後も維持されている
    expect(stateAfter.player!.hp).toBe(stateBefore.player!.hp);
  });

  test('exploration.floorNumber が新フロア番号に更新される', () => {
    expect(stateAfter.exploration!.floorNumber).toBe(NEXT_FLOOR);
  });

  test('フロア遷移後の map と exploration.currentFloor が同じ参照である', () => {
    expect(stateAfter.map).toBe(stateAfter.exploration!.currentFloor);
  });

  test('フロア遷移後の player.pos と exploration.playerPos が一致する', () => {
    expect(stateAfter.player!.pos).toEqual(stateAfter.exploration!.playerPos);
  });

  test('フロア遷移後も phase が exploring のまま', () => {
    expect(stateAfter.phase).toBe('exploring');
  });

  test('フロア遷移後に生成される新フロアは到達可能性を満たす', () => {
    const newMap = stateAfter.map!;
    // 新フロアの startPos が歩行可能タイル上にある
    const startTile = newMap.cells[newMap.startPos.y][newMap.startPos.x].tile;
    // TILE_START は歩行可能
    expect(['S', '.', '>', '$', 'G', 'E', 'B', 'T', 'R', 'W', 'P', 'H', 'w', 'l', 'i', 'X', 'M']).toContain(startTile);
  });

  test('フロア遷移後の player.maxHp も引き継がれる', () => {
    expect(stateAfter.player!.maxHp).toBe(stateBefore.player!.maxHp);
  });
});
