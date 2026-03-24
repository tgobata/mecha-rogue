/**
 * @fileoverview turn-system の単体テスト
 *
 * processTurn の各フェーズ（プレイヤー行動・敵行動・ターン後処理）を検証する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { processTurn } from '../../src/game/core/turn-system.js';
import type { PlayerAction } from '../../src/game/core/turn-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Player, Enemy } from '../../src/game/core/game-state.js';
import type { Floor, Cell } from '../../src/game/core/types.js';
import {
  TILE_FLOOR,
  TILE_WALL,
  TILE_STAIRS_DOWN,
  TILE_START,
} from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// テスト用フロア生成ユーティリティ
// ---------------------------------------------------------------------------

/**
 * シンプルな5x5のテスト用フロアを生成する。
 * 外周は壁、内部は通路にする。
 *
 *   #####
 *   #...#
 *   #.S.#
 *   #...#
 *   #####
 *
 * startPos: (2,2)  stairsPos: (3,3)
 */
function createTestFloor(overrides: Partial<Record<string, string>> = {}): Floor {
  const width = 5;
  const height = 5;
  const cells: Cell[][] = [];

  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const tileOverride = overrides[key];
      let tile: Cell['tile'] = TILE_WALL;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        tile = TILE_FLOOR;
      }
      if (tileOverride !== undefined) {
        tile = tileOverride as Cell['tile'];
      }
      cells[y][x] = { tile, isVisible: false, isExplored: false };
    }
  }

  return {
    floorNumber: 1,
    width,
    height,
    cells,
    rooms: [],
    startPos: { x: 2, y: 2 },
    stairsPos: { x: 3, y: 3 },
    seed: 0,
  };
}

/**
 * 探索中の GameState を生成するヘルパー。
 * player と map を明示的に渡す。
 */
function createExploringState(
  playerOverride: Partial<Player> = {},
  enemyList: Enemy[] = [],
  floorOverrides: Partial<Record<string, string>> = {},
): GameState {
  const base = createInitialGameState();
  const testFloor = createTestFloor(floorOverrides);
  const player: Player = {
    pos: { x: 2, y: 2 },
    hp: 100,
    maxHp: 100,
    atk: 8,
    def: 5,
    facing: 'down',
    ...playerOverride,
  };

  return {
    ...base,
    phase: 'exploring',
    player,
    enemies: enemyList,
    map: testFloor,
    floor: 1,
    exploration: {
      currentFloor: testFloor,
      playerPos: player.pos,
      floorNumber: 1,
      turn: 0,
    },
  };
}

/**
 * テスト用の敵エンティティを生成するヘルパー。
 */
function createEnemy(
  id: number,
  pos: { x: number; y: number },
  overrides: Partial<Enemy> = {},
): Enemy {
  return {
    id,
    enemyType: 'test_enemy',
    pos,
    hp: 20,
    maxHp: 20,
    atk: 5,
    def: 0,
    expReward: 10,
    aiType: 'straight',
    facing: 'down',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// processTurn: 非探索フェーズでは state をそのまま返す
// ---------------------------------------------------------------------------

describe('processTurn: 非探索フェーズ', () => {
  it('phase が title のときは state をそのまま返す', () => {
    const state = createInitialGameState();
    const result = processTurn(state, 'wait');
    expect(result).toBe(state);
  });

  it('player が null のときは state をそのまま返す', () => {
    const state: GameState = {
      ...createInitialGameState(),
      phase: 'exploring',
      player: null,
    };
    const result = processTurn(state, 'wait');
    expect(result).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// processTurn: wait アクション
// ---------------------------------------------------------------------------

describe('processTurn: wait', () => {
  it('wait でターン数が 1 増加する', () => {
    const state = createExploringState();
    const result = processTurn(state, 'wait');
    expect(result.exploration!.turn).toBe(1);
  });

  it('wait でプレイヤー座標は変わらない', () => {
    const state = createExploringState();
    const result = processTurn(state, 'wait');
    expect(result.player!.pos).toEqual({ x: 2, y: 2 });
  });

  it('wait で新しい state オブジェクトが返る（元の state と === でない）', () => {
    const state = createExploringState();
    const result = processTurn(state, 'wait');
    expect(result).not.toBe(state);
  });
});

// ---------------------------------------------------------------------------
// processTurn: 移動アクション
// ---------------------------------------------------------------------------

describe('processTurn: 移動', () => {
  it('move_up でプレイヤーが上に移動する', () => {
    const state = createExploringState({ pos: { x: 2, y: 2 } });
    const result = processTurn(state, 'move_up');
    expect(result.player!.pos).toEqual({ x: 2, y: 1 });
  });

  it('move_down でプレイヤーが下に移動する', () => {
    const state = createExploringState({ pos: { x: 2, y: 2 } });
    const result = processTurn(state, 'move_down');
    expect(result.player!.pos).toEqual({ x: 2, y: 3 });
  });

  it('move_left でプレイヤーが左に移動する', () => {
    const state = createExploringState({ pos: { x: 2, y: 2 } });
    const result = processTurn(state, 'move_left');
    expect(result.player!.pos).toEqual({ x: 1, y: 2 });
  });

  it('move_right でプレイヤーが右に移動する', () => {
    const state = createExploringState({ pos: { x: 2, y: 2 } });
    const result = processTurn(state, 'move_right');
    expect(result.player!.pos).toEqual({ x: 3, y: 2 });
  });

  it('壁に向かって移動しても座標は変わらない', () => {
    // (1,1) の上は壁 (1,0)
    const state = createExploringState({ pos: { x: 1, y: 1 } });
    const result = processTurn(state, 'move_up');
    expect(result.player!.pos).toEqual({ x: 1, y: 1 });
  });

  it('移動アクションで facing が更新される', () => {
    const state = createExploringState({ pos: { x: 2, y: 2 }, facing: 'down' });
    const result = processTurn(state, 'move_up');
    expect(result.player!.facing).toBe('up');
  });

  it('移動後に exploration.playerPos が同期される', () => {
    const state = createExploringState({ pos: { x: 2, y: 2 } });
    const result = processTurn(state, 'move_right');
    expect(result.exploration!.playerPos).toEqual({ x: 3, y: 2 });
  });
});

// ---------------------------------------------------------------------------
// processTurn: バンプ攻撃
// ---------------------------------------------------------------------------

describe('processTurn: バンプ攻撃', () => {
  it('敵がいるマスへの移動で攻撃が発生し敵HPが減る', () => {
    const enemy = createEnemy(0, { x: 2, y: 1 }); // プレイヤーの上
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, atk: 10, facing: 'down' },
      [enemy],
    );
    const result = processTurn(state, 'move_up');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    // ダメージ = max(1, atk 10 - def 0) = 10
    expect(resultEnemy.hp).toBe(enemy.hp - 10);
  });

  it('バンプ攻撃でプレイヤーは移動しない', () => {
    const enemy = createEnemy(0, { x: 2, y: 1 });
    const state = createExploringState({ pos: { x: 2, y: 2 } }, [enemy]);
    const result = processTurn(state, 'move_up');
    expect(result.player!.pos).toEqual({ x: 2, y: 2 });
  });

  it('バンプ攻撃でも facing は更新される', () => {
    const enemy = createEnemy(0, { x: 2, y: 1 });
    const state = createExploringState({ pos: { x: 2, y: 2 }, facing: 'down' }, [enemy]);
    const result = processTurn(state, 'move_up');
    expect(result.player!.facing).toBe('up');
  });

  it('MIN_DAMAGE: atk < def でも最低 1 ダメージになる', () => {
    const enemy = createEnemy(0, { x: 2, y: 1 }, { def: 100 }); // 防御力が高い
    const state = createExploringState({ pos: { x: 2, y: 2 }, atk: 5 }, [enemy]);
    const result = processTurn(state, 'move_up');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    expect(resultEnemy.hp).toBe(enemy.hp - 1); // MIN_DAMAGE = 1
  });
});

// ---------------------------------------------------------------------------
// processTurn: attack アクション
// ---------------------------------------------------------------------------

describe('processTurn: attack', () => {
  it('facing 方向に敵がいれば攻撃が命中する', () => {
    const enemy = createEnemy(0, { x: 2, y: 1 }); // 上にいる
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, facing: 'up', atk: 8 },
      [enemy],
    );
    const result = processTurn(state, 'attack');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    expect(resultEnemy.hp).toBe(enemy.hp - 8); // max(1, 8-0) = 8
  });

  it('facing 方向に敵がいなければ何も起きない', () => {
    const enemy = createEnemy(0, { x: 2, y: 3 }); // 下にいる
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, facing: 'up' }, // 上を向いている
      [enemy],
    );
    const result = processTurn(state, 'attack');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    expect(resultEnemy.hp).toBe(enemy.hp); // ダメージなし
  });

  it('attack アクションでプレイヤー座標は変わらない', () => {
    const state = createExploringState({ pos: { x: 2, y: 2 }, facing: 'up' });
    const result = processTurn(state, 'attack');
    expect(result.player!.pos).toEqual({ x: 2, y: 2 });
  });
});

// ---------------------------------------------------------------------------
// processTurn: 敵の撃破と EXP 獲得
// ---------------------------------------------------------------------------

describe('processTurn: 敵撃破と EXP', () => {
  it('HP が 0 以下になった敵はリストから除去される', () => {
    const enemy = createEnemy(0, { x: 2, y: 1 }, { hp: 1, maxHp: 1 });
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, atk: 10 },
      [enemy],
    );
    const result = processTurn(state, 'move_up');
    expect(result.enemies).toHaveLength(0);
  });

  it('敵を倒すと EXP が加算される', () => {
    const enemy = createEnemy(0, { x: 2, y: 1 }, { hp: 1, maxHp: 1, expReward: 15 });
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, atk: 10 },
      [enemy],
    );
    const result = processTurn(state, 'move_up');
    expect(result.pilot.exp).toBe(state.pilot.exp + 15);
  });

  it('HP が残っている敵は除去されない', () => {
    const enemy = createEnemy(0, { x: 2, y: 1 }, { hp: 100, maxHp: 100 });
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, atk: 8 },
      [enemy],
    );
    const result = processTurn(state, 'move_up');
    expect(result.enemies).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// processTurn: ゲームオーバー
// ---------------------------------------------------------------------------

describe('processTurn: ゲームオーバー（スタート帰還）', () => {
  it('プレイヤーHP が 0 になると phase が gameover になる', () => {
    // プレイヤーのすぐ隣に高攻撃力の敵を置く
    const enemy = createEnemy(0, { x: 3, y: 2 }, { atk: 9999 });
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, hp: 1, def: 0 },
      [enemy],
    );
    // wait でプレイヤーターンは何もしない → 敵が攻撃 → HP 0 → gameover
    const result = processTurn(state, 'wait');
    // スタート帰還はUIで処理するため、そのままgameoverを返す
    expect(result.phase).toBe('gameover');
  });

  it('HP0になった際、HP回復は直接は行われない（UI管理）', () => {
    const enemy = createEnemy(0, { x: 3, y: 2 }, { atk: 9999 });
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, hp: 1, def: 0 },
      [enemy],
    );
    const result = processTurn(state, 'wait');
    expect(result.player!.hp).toBeLessThanOrEqual(0);
  });

  it('HP が 1 残れば スタート帰還 にならない（floor は変わらない）', () => {
    // 攻撃力 5 の敵、プレイヤー防御 5、HP 100 → ダメージ 0 だが MIN_DAMAGE=1 なのでHP99
    const enemy = createEnemy(0, { x: 3, y: 2 }, { atk: 5 });
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, hp: 100, def: 5 },
      [enemy],
    );
    const result = processTurn(state, 'wait');
    expect(result.phase).toBe('exploring');
    expect(result.player!.hp).toBe(99); // MIN_DAMAGE=1
    expect(result.floor).toBe(1); // フロア変化なし
  });
});

// ---------------------------------------------------------------------------
// processTurn: 敵AI 視界チェック
// ---------------------------------------------------------------------------

describe('processTurn: 敵AI 視界', () => {
  it('マンハッタン距離 > 5 の敵は行動しない（移動しない）', () => {
    // プレイヤーは (2,2)、敵は (2,2)+(6,0) = 座標 (8,2) だが 5x5 マップなので大きなフロアが必要
    // 別途 8x8 のカスタムフロアを使う
    const bigFloor: Floor = createLargeTestFloor();
    const base = createInitialGameState();
    const player: Player = {
      pos: { x: 1, y: 1 },
      hp: 100,
      maxHp: 100,
      atk: 8,
      def: 5,
      facing: 'down',
    };
    // 距離 6 の位置に敵を置く（マンハッタン距離 = 6+0 = 6）
    const farEnemy = createEnemy(0, { x: 7, y: 1 });
    const state: GameState = {
      ...base,
      phase: 'exploring',
      player,
      enemies: [farEnemy],
      map: bigFloor,
      floor: 1,
      exploration: {
        currentFloor: bigFloor,
        playerPos: player.pos,
        floorNumber: 1,
        turn: 0,
      },
    };
    const result = processTurn(state, 'wait');
    // 距離 6 > ENEMY_SIGHT_RANGE(5) なので敵は動かない
    expect(result.enemies[0].pos).toEqual(farEnemy.pos);
  });

  it('マンハッタン距離 5 の敵はプレイヤーに向かって移動する', () => {
    const bigFloor: Floor = createLargeTestFloor();
    const base = createInitialGameState();
    const player: Player = {
      pos: { x: 1, y: 1 },
      hp: 100,
      maxHp: 100,
      atk: 8,
      def: 5,
      facing: 'down',
    };
    // マンハッタン距離 5 = (1+4)
    const enemy = createEnemy(0, { x: 6, y: 1 });
    const state: GameState = {
      ...base,
      phase: 'exploring',
      player,
      enemies: [enemy],
      map: bigFloor,
      floor: 1,
      exploration: {
        currentFloor: bigFloor,
        playerPos: player.pos,
        floorNumber: 1,
        turn: 0,
      },
    };
    const result = processTurn(state, 'wait');
    const movedEnemy = result.enemies[0];
    // プレイヤーに近づいている（距離が縮まっている）ことを確認
    const distBefore = Math.abs(enemy.pos.x - player.pos.x) + Math.abs(enemy.pos.y - player.pos.y);
    const distAfter = Math.abs(movedEnemy.pos.x - player.pos.x) + Math.abs(movedEnemy.pos.y - player.pos.y);
    expect(distAfter).toBeLessThan(distBefore);
  });
});

// ---------------------------------------------------------------------------
// processTurn: 純粋関数（不変性）
// ---------------------------------------------------------------------------

describe('processTurn: 純粋関数', () => {
  it('元の state は変更されない', () => {
    const state = createExploringState({ pos: { x: 2, y: 2 } });
    const originalPos = { ...state.player!.pos };
    const originalTurn = state.exploration!.turn;
    processTurn(state, 'move_right');
    // 元の state が変更されていないことを確認
    expect(state.player!.pos).toEqual(originalPos);
    expect(state.exploration!.turn).toBe(originalTurn);
  });
});

// ---------------------------------------------------------------------------
// processTurn: machine.hp との同期
// ---------------------------------------------------------------------------

describe('processTurn: machine.hp 同期', () => {
  it('敵の攻撃でプレイヤーHPが減ると machine.hp も同期される', () => {
    const enemy = createEnemy(0, { x: 3, y: 2 }, { atk: 10 });
    const state = createExploringState(
      { pos: { x: 2, y: 2 }, hp: 100, def: 0 },
      [enemy],
    );
    const result = processTurn(state, 'wait');
    // min_damage=1, atk=10, def=0 → damage=10
    expect(result.machine.hp).toBe(90);
    expect(result.player!.hp).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// ヘルパー: 大きなテストフロア（9x9）
// ---------------------------------------------------------------------------

/**
 * 9x9 の通路のみのテストフロアを生成する。
 * 視界距離テスト用に広い空間が必要なため。
 */
function createLargeTestFloor(): Floor {
  const width = 9;
  const height = 9;
  const cells: Cell[][] = [];

  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      let tile: Cell['tile'] = TILE_WALL;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        tile = TILE_FLOOR;
      }
      cells[y][x] = { tile, isVisible: false, isExplored: false };
    }
  }

  return {
    floorNumber: 1,
    width,
    height,
    cells,
    rooms: [],
    startPos: { x: 1, y: 1 },
    stairsPos: { x: width - 2, y: height - 2 },
    seed: 0,
  };
}
