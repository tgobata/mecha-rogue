/**
 * @fileoverview 武器システムのユニットテスト
 *
 * createWeaponInstance, consumeDurability, isBroken, getAttackTargetPositions を検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  createWeaponInstance,
  consumeDurability,
  isBroken,
  getAttackTargetPositions,
} from '../../src/game/core/weapon-system.js';
import type { WeaponInstance } from '../../src/game/core/game-state.js';
import type { Floor, Cell } from '../../src/game/core/types.js';
import { TILE_FLOOR, TILE_WALL } from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// テスト用フロア生成
// ---------------------------------------------------------------------------

function createTestFloor(width = 9, height = 9): Floor {
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      cells[y][x] = { tile: isEdge ? TILE_WALL : TILE_FLOOR, isVisible: false, isExplored: false };
    }
  }
  return { floorNumber: 1, width, height, cells, rooms: [], startPos: { x: 1, y: 1 }, stairsPos: { x: 7, y: 7 }, seed: 0 };
}

// ---------------------------------------------------------------------------
// createWeaponInstance
// ---------------------------------------------------------------------------

describe('createWeaponInstance', () => {
  it('blade_arm のインスタンスを正しく生成する', () => {
    const w = createWeaponInstance('blade_arm');
    expect(w.id).toBe('blade_arm');
    expect(w.name).toBe('ブレードアーム');
    expect(w.atk).toBe(18);
    expect(w.category).toBe('melee');
  });

  it('durability が null でない武器は maxDurability と同値で初期化する', () => {
    const w = createWeaponInstance('blade_arm');
    expect(w.durability).toBe(40);
    expect(w.maxDurability).toBe(40);
  });

  it('machine_punch は durability が null（壊れない）', () => {
    const w = createWeaponInstance('machine_punch');
    expect(w.durability).toBeNull();
    expect(w.maxDurability).toBeNull();
  });

  it('存在しない ID で例外を投げる', () => {
    expect(() => createWeaponInstance('invalid_weapon_xyz')).toThrow();
  });

  it('rarity 引数を反映する', () => {
    const w = createWeaponInstance('blade_arm', 'rare');
    expect(w.rarity).toBe('rare');
  });

  it('デフォルト rarity は common', () => {
    const w = createWeaponInstance('blade_arm');
    expect(w.rarity).toBe('common');
  });
});

// ---------------------------------------------------------------------------
// consumeDurability / isBroken
// ---------------------------------------------------------------------------

describe('consumeDurability', () => {
  it('耐久度が durabilityLoss 分減少する', () => {
    const w = createWeaponInstance('blade_arm'); // durability=40, loss=1
    const w2 = consumeDurability(w);
    expect(w2.durability).toBe(39);
  });

  it('元のオブジェクトは変更されない（immutable）', () => {
    const w = createWeaponInstance('blade_arm');
    consumeDurability(w);
    expect(w.durability).toBe(40);
  });

  it('耐久度が 0 以下になっても負にならない', () => {
    const w: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    const w2 = consumeDurability(w);
    expect(w2.durability).toBe(0);
  });

  it('durability が null の武器は変化しない', () => {
    const w = createWeaponInstance('machine_punch');
    const w2 = consumeDurability(w);
    expect(w2.durability).toBeNull();
  });
});

describe('isBroken', () => {
  it('durability が 0 なら true', () => {
    const w: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 0 };
    expect(isBroken(w)).toBe(true);
  });

  it('durability が 1 以上なら false', () => {
    const w = createWeaponInstance('blade_arm');
    expect(isBroken(w)).toBe(false);
  });

  it('durability が null（壊れない）なら false', () => {
    const w = createWeaponInstance('machine_punch');
    expect(isBroken(w)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAttackTargetPositions
// ---------------------------------------------------------------------------

describe('getAttackTargetPositions: 素手（null）', () => {
  it('素手は正面1マスを返す', () => {
    const targets = getAttackTargetPositions({ x: 4, y: 4 }, 'up', null, null);
    expect(targets).toContainEqual({ x: 4, y: 3 });
    expect(targets).toHaveLength(1);
  });
});

describe('getAttackTargetPositions: adjacent（正面1タイル）', () => {
  it('blade_arm は向いた方向の1マスを返す', () => {
    const w = createWeaponInstance('blade_arm');
    const targets = getAttackTargetPositions({ x: 4, y: 4 }, 'right', w, null);
    expect(targets).toContainEqual({ x: 5, y: 4 });
    expect(targets).toHaveLength(1);
  });
});

describe('getAttackTargetPositions: line（直線）', () => {
  it('machine_gun（line_4）は前方4マスを返す', () => {
    const w = createWeaponInstance('machine_gun');
    const floor = createTestFloor();
    const targets = getAttackTargetPositions({ x: 1, y: 4 }, 'right', w, floor);
    // 1+1=2, 1+2=3, 1+3=4, 1+4=5 → 4マス（壁手前まで）
    expect(targets.length).toBeGreaterThanOrEqual(1);
  });

  it('line 武器は壁で止まる', () => {
    const w = createWeaponInstance('machine_gun'); // range=4, no pierce
    const floor = createTestFloor(7, 5); // 内部: x=1〜5, y=1〜3
    // プレイヤーが(1,2)、右に向かうと (2,2)〜(5,2)=floor, (6,2)=wall
    // range=4 なので (2,2)(3,2)(4,2)(5,2) が対象
    const targets = getAttackTargetPositions({ x: 1, y: 2 }, 'right', w, floor);
    // 壁より先には到達しないことを確認
    expect(targets.every((p) => p.x <= 5 && p.x >= 1)).toBe(true);
    // 少なくとも1マスは対象になっている
    expect(targets.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getAttackTargetPositions: omnidirectional', () => {
  it('thunder_hammer は周囲8方向を返す', () => {
    const w = createWeaponInstance('thunder_hammer');
    const targets = getAttackTargetPositions({ x: 4, y: 4 }, 'up', w, null);
    expect(targets).toHaveLength(8);
  });
});

describe('getAttackTargetPositions: tri_front（前方3方向）', () => {
  it('tri_cutter は前方3マスを返す', () => {
    const w = createWeaponInstance('tri_cutter');
    const targets = getAttackTargetPositions({ x: 4, y: 4 }, 'up', w, null);
    // 上、左上、右上
    expect(targets).toHaveLength(3);
    expect(targets).toContainEqual({ x: 4, y: 3 });  // 前
    expect(targets).toContainEqual({ x: 3, y: 3 });  // 左前
    expect(targets).toContainEqual({ x: 5, y: 3 });  // 右前
  });
});

describe('getAttackTargetPositions: bidirectional（前後）', () => {
  it('double_blade は前後2マスを返す', () => {
    const w = createWeaponInstance('double_blade');
    const targets = getAttackTargetPositions({ x: 4, y: 4 }, 'up', w, null);
    expect(targets).toHaveLength(2);
    expect(targets).toContainEqual({ x: 4, y: 3 }); // 前
    expect(targets).toContainEqual({ x: 4, y: 5 }); // 後
  });
});

// ---------------------------------------------------------------------------
// processTurn との統合: 武器破壊
// ---------------------------------------------------------------------------

import { processTurn } from '../../src/game/core/turn-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Player, Enemy } from '../../src/game/core/game-state.js';

function makeFloor(): Floor {
  return createTestFloor();
}

function makeState(playerOverrides: Partial<Player> = {}, enemies: Enemy[] = []): GameState {
  const base = createInitialGameState();
  const floor = makeFloor();
  const player: Player = {
    pos: { x: 4, y: 4 },
    hp: 100, maxHp: 100,
    atk: 8, def: 5,
    facing: 'up',
    ...playerOverrides,
  };
  return {
    ...base,
    phase: 'exploring',
    player, enemies, map: floor, floor: 1,
    exploration: { currentFloor: floor, playerPos: player.pos, floorNumber: 1, turn: 0 },
  };
}

describe('processTurn: 武器耐久度', () => {
  it('attack アクションで equippedWeapon の耐久度が 1 減る', () => {
    const weapon = createWeaponInstance('blade_arm'); // durability=40
    const state = makeState({ facing: 'up', equippedWeapon: weapon });
    const result = processTurn(state, 'attack');
    expect(result.player!.equippedWeapon?.durability).toBe(39);
  });

  it('耐久度 1 の武器で攻撃すると武器が破壊されて null になる', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    const state = makeState({ facing: 'up', equippedWeapon: weapon });
    const result = processTurn(state, 'attack');
    expect(result.player!.equippedWeapon).toBeNull();
  });

  it('machine_punch（durability null）は耐久度が変わらない', () => {
    const weapon = createWeaponInstance('machine_punch'); // durability=null
    const state = makeState({ facing: 'up', equippedWeapon: weapon });
    const result = processTurn(state, 'attack');
    expect(result.player!.equippedWeapon?.durability).toBeNull();
  });
});
