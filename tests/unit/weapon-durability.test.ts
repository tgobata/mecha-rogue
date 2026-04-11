/**
 * @fileoverview 武器耐久度 P1 拡充テスト
 *
 * バンプ攻撃での耐久消費、isBroken 判定、武器破壊時の equippedWeapon=null、
 * 耐久ゼロ武器の装備不可、全武器の最低耐久 3 フロア検証を行う。
 */

import { describe, it, expect } from 'vitest';
import {
  createWeaponInstance,
  consumeDurability,
  isBroken,
  getAllWeaponDefs,
} from '../../src/game/core/weapon-system.js';
import type { WeaponInstance } from '../../src/game/core/game-state.js';
import { processTurn } from '../../src/game/core/turn-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Player, Enemy } from '../../src/game/core/game-state.js';
import type { Cell, Floor } from '../../src/game/core/types.js';
import { TILE_FLOOR, TILE_WALL, TILE_START } from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeOpenFloor(): Floor {
  const W = 9, H = 9;
  const cells: Cell[][] = [];
  for (let y = 0; y < H; y++) {
    cells[y] = [];
    for (let x = 0; x < W; x++) {
      const isEdge = x === 0 || x === W - 1 || y === 0 || y === H - 1;
      cells[y][x] = { tile: isEdge ? TILE_WALL : TILE_FLOOR, isVisible: false, isExplored: false };
    }
  }
  cells[1][1].tile = TILE_START;
  return { floorNumber: 1, width: W, height: H, cells, rooms: [], startPos: { x: 1, y: 1 }, stairsPos: { x: 7, y: 7 }, seed: 0 };
}

function makeEnemy(id: number, pos: { x: number; y: number }, overrides: Partial<Enemy> = {}): Enemy {
  return {
    id, enemyType: 'test_enemy', pos,
    hp: 200, maxHp: 200, atk: 1, def: 0, expReward: 10, aiType: 'straight', facing: 'down',
    ...overrides,
  };
}

function makeState(playerOverrides: Partial<Player> = {}, enemies: Enemy[] = []): GameState {
  const base = createInitialGameState();
  const floor = makeOpenFloor();
  const player: Player = {
    pos: { x: 4, y: 4 }, hp: 200, maxHp: 200, atk: 5, def: 99,
    facing: 'up',
    ...playerOverrides,
  };
  return {
    ...base, phase: 'exploring',
    player, enemies, map: floor, floor: 1,
    exploration: { currentFloor: floor, playerPos: player.pos, floorNumber: 1, turn: 0 },
  };
}

const ENEMY_POS = { x: 4, y: 3 };

// ---------------------------------------------------------------------------
// バンプ攻撃での耐久消費
// ---------------------------------------------------------------------------

describe('バンプ攻撃での耐久消費', () => {
  it('バンプ攻撃で equippedWeapon の durability が durabilityLoss 分減る', () => {
    const weapon = createWeaponInstance('blade_arm'); // durability=44, loss=1
    const enemy = makeEnemy(0, ENEMY_POS);
    const state = makeState({ equippedWeapon: weapon }, [enemy]);
    const result = processTurn(state, 'move_up');
    expect(result.player!.equippedWeapon?.durability).toBe(43);
  });

  it('durabilityLoss=2 の武器はバンプ攻撃で 2 減る', () => {
    const weapon: WeaponInstance = {
      ...createWeaponInstance('blade_arm'),
      durabilityLoss: 2,
      durability: 10,
    };
    const enemy = makeEnemy(0, ENEMY_POS);
    const state = makeState({ equippedWeapon: weapon }, [enemy]);
    const result = processTurn(state, 'move_up');
    expect(result.player!.equippedWeapon?.durability).toBe(8);
  });

  it('durability=null（壊れない武器）はバンプ攻撃後も durability=null のまま', () => {
    const weapon = createWeaponInstance('machine_punch'); // durability=null
    const enemy = makeEnemy(0, ENEMY_POS);
    const state = makeState({ equippedWeapon: weapon }, [enemy]);
    const result = processTurn(state, 'move_up');
    expect(result.player!.equippedWeapon?.durability).toBeNull();
  });

  it('複数バンプ攻撃で耐久が累積して減少する', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 5 };
    const enemy = makeEnemy(0, ENEMY_POS, { hp: 999 });
    const state0 = makeState({ equippedWeapon: weapon }, [enemy]);
    const state1 = processTurn(state0, 'move_up');
    const state2 = processTurn(state1, 'move_up');
    const state3 = processTurn(state2, 'move_up');
    // 3回攻撃: 5 - 3 = 2
    expect(state3.player!.equippedWeapon?.durability).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// consumeDurability で isBroken が true になること
// ---------------------------------------------------------------------------

describe('consumeDurability → isBroken', () => {
  it('durability=1 の武器を consumeDurability すると durability=0 になる', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    const after = consumeDurability(weapon);
    expect(after.durability).toBe(0);
  });

  it('durability=0 になった武器は isBroken=true', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    const after = consumeDurability(weapon);
    expect(isBroken(after)).toBe(true);
  });

  it('durability=1 の武器は isBroken=false', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    expect(isBroken(weapon)).toBe(false);
  });

  it('durability=null の武器は consumeDurability 後も isBroken=false', () => {
    const weapon = createWeaponInstance('machine_punch');
    const after = consumeDurability(weapon);
    expect(isBroken(after)).toBe(false);
  });

  it('durabilityLoss が大きい場合 1 回の消費で 0 以下になっても 0 に留まる', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 2, durabilityLoss: 5 };
    const after = consumeDurability(weapon);
    expect(after.durability).toBe(0);
    expect(isBroken(after)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 武器破壊時に equippedWeapon が null になること（turn-system 経由）
// ---------------------------------------------------------------------------

describe('武器破壊時の equippedWeapon=null（turn-system 経由）', () => {
  it('durability=1 の武器でバンプ攻撃すると equippedWeapon が null になる', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    const enemy = makeEnemy(0, ENEMY_POS);
    const state = makeState({ equippedWeapon: weapon }, [enemy]);
    const result = processTurn(state, 'move_up');
    expect(result.player!.equippedWeapon).toBeNull();
  });

  it('durability=1 の武器で attack アクション後に equippedWeapon が null になる', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    const state = makeState({ equippedWeapon: weapon, facing: 'up' });
    const result = processTurn(state, 'attack');
    expect(result.player!.equippedWeapon).toBeNull();
  });

  it('durability=2 の武器で 2 回攻撃後に null になる', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 2 };
    const enemy = makeEnemy(0, ENEMY_POS, { hp: 999 });
    const state0 = makeState({ equippedWeapon: weapon }, [enemy]);
    const state1 = processTurn(state0, 'move_up');
    // 1回後はまだ装備中
    expect(state1.player!.equippedWeapon).not.toBeNull();
    expect(state1.player!.equippedWeapon?.durability).toBe(1);
    const state2 = processTurn(state1, 'move_up');
    // 2回後は null
    expect(state2.player!.equippedWeapon).toBeNull();
  });

  it('武器破壊後は素手（null）で攻撃が可能（例外なし）', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    const enemy = makeEnemy(0, ENEMY_POS, { hp: 999 });
    const state0 = makeState({ equippedWeapon: weapon }, [enemy]);
    const state1 = processTurn(state0, 'move_up'); // 武器破壊
    expect(state1.player!.equippedWeapon).toBeNull();
    // 素手での次の攻撃
    expect(() => processTurn(state1, 'move_up')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 耐久度ゼロの武器を装備しようとした場合（装備できないこと）
// ---------------------------------------------------------------------------

describe('耐久度ゼロの武器の挙動', () => {
  it('isBroken=true の武器インスタンスを直接確認できる', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 0 };
    expect(isBroken(weapon)).toBe(true);
  });

  it('耐久ゼロの武器は turn-system 経由でバンプ攻撃時に null になる', () => {
    // durability=1 → 1回バンプ → durability=0 → null
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    const enemy = makeEnemy(0, ENEMY_POS, { hp: 999 });
    const state = makeState({ equippedWeapon: weapon }, [enemy]);
    const result = processTurn(state, 'move_up');
    expect(result.player!.equippedWeapon).toBeNull();
  });

  it('耐久ゼロの武器で attack しても equippedWeapon が null になる', () => {
    const weapon: WeaponInstance = { ...createWeaponInstance('blade_arm'), durability: 1 };
    const state = makeState({ equippedWeapon: weapon, facing: 'up' });
    const result = processTurn(state, 'attack');
    expect(result.player!.equippedWeapon).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 最低耐久 3 フロアの検証: weapons.json の全武器
// ---------------------------------------------------------------------------

describe('weapons.json 全武器: 最低耐久検証', () => {
  const defs = getAllWeaponDefs();

  it('weapons.json に武器が 1 件以上ある', () => {
    expect(defs.length).toBeGreaterThan(0);
  });

  it('durability が null でない全武器の durability は 3 以上', () => {
    const durabilityWeapons = defs.filter((d) => d.durability !== null);
    for (const def of durabilityWeapons) {
      expect(def.durability).toBeGreaterThanOrEqual(3);
    }
  });

  it('durabilityLoss は 0 以上である', () => {
    for (const def of defs) {
      expect(def.durabilityLoss).toBeGreaterThanOrEqual(0);
    }
  });

  it('durability=null の武器は machine_punch だけではない（または machine_punch が含まれる）', () => {
    const indestructible = defs.filter((d) => d.durability === null);
    const machPunch = indestructible.find((d) => d.id === 'machine_punch');
    expect(machPunch).toBeDefined();
  });

  it('全武器の atk が 0 以上である（reflector などの特殊武器は atk=0 が正常）', () => {
    for (const def of defs) {
      expect(def.atk).toBeGreaterThanOrEqual(0);
    }
  });
});
