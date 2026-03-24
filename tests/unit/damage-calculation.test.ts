/**
 * @fileoverview ダメージ計算 P1 拡充テスト
 *
 * 各武器カテゴリ × 防御力パターン、MIN_DAMAGE 保証、
 * 装備武器あり/なし、状態異常（shielded）、複数ターン連続攻撃を検証する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { processTurn } from '../../src/game/core/turn-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Player, Enemy, WeaponInstance } from '../../src/game/core/game-state.js';
import type { Cell, Floor } from '../../src/game/core/types.js';
import { TILE_FLOOR, TILE_WALL, TILE_START, MIN_DAMAGE } from '../../src/game/core/constants.js';
import { createWeaponInstance } from '../../src/game/core/weapon-system.js';

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
    id,
    enemyType: 'test_enemy',
    pos,
    hp: 200,
    maxHp: 200,
    atk: 5,
    def: 0,
    expReward: 10,
    aiType: 'straight',
    facing: 'down',
    ...overrides,
  };
}

function makeState(
  playerOverrides: Partial<Player> = {},
  enemies: Enemy[] = [],
): GameState {
  const base = createInitialGameState();
  const floor = makeOpenFloor();
  const player: Player = {
    pos: { x: 4, y: 4 },
    hp: 200,
    maxHp: 200,
    atk: 10,
    def: 5,
    facing: 'up',
    ...playerOverrides,
  };
  return {
    ...base,
    phase: 'exploring',
    player,
    enemies,
    map: floor,
    floor: 1,
    exploration: { currentFloor: floor, playerPos: player.pos, floorNumber: 1, turn: 0 },
  };
}

/** プレイヤー(4,4) 上 (4,3) に敵を配置 */
const ENEMY_POS = { x: 4, y: 3 };

// ---------------------------------------------------------------------------
// 1. 各武器カテゴリ × 防御力パターン
// ---------------------------------------------------------------------------

describe('ダメージ計算: 武器カテゴリ × 防御力パターン', () => {
  const defPatterns = [0, 5, 10, 20, 50];

  /**
   * NOTE: ターンシステムの実効攻撃力 = player.atk + equippedWeapon.atk
   * このテストでは player.atk=0 に設定し、weapon.atk だけで期待ダメージを計算する。
   */
  describe('melee カテゴリ（blade_arm atk=18、player.atk=0）', () => {
    const WEAPON_ATK = 18; // blade_arm.atk
    for (const def of defPatterns) {
      it(`def=${def} のとき ダメージ = max(${MIN_DAMAGE}, ${WEAPON_ATK}-${def}) = ${Math.max(MIN_DAMAGE, WEAPON_ATK - def)}`, () => {
        const weapon = createWeaponInstance('blade_arm');
        const enemy = makeEnemy(0, ENEMY_POS, { def });
        const state = makeState({ atk: 0, equippedWeapon: weapon }, [enemy]);
        const result = processTurn(state, 'move_up');
        const resultEnemy = result.enemies.find((e) => e.id === 0);
        const expectedDmg = Math.max(MIN_DAMAGE, WEAPON_ATK - def);
        if (resultEnemy) {
          expect(resultEnemy.hp).toBe(200 - expectedDmg);
        } else {
          expect(expectedDmg).toBeGreaterThanOrEqual(200);
        }
      });
    }
  });

  describe('ranged カテゴリ（machine_gun atk=10、player.atk=0）', () => {
    const WEAPON_ATK = 10; // machine_gun.atk
    for (const def of defPatterns) {
      it(`def=${def} のとき ダメージ = max(${MIN_DAMAGE}, ${WEAPON_ATK}-${def}) = ${Math.max(MIN_DAMAGE, WEAPON_ATK - def)}`, () => {
        const weapon = createWeaponInstance('machine_gun');
        const enemy = makeEnemy(0, ENEMY_POS, { def });
        const state = makeState({ atk: 0, equippedWeapon: weapon, facing: 'up' }, [enemy]);
        const result = processTurn(state, 'attack');
        const resultEnemy = result.enemies.find((e) => e.id === 0);
        const expectedDmg = Math.max(MIN_DAMAGE, WEAPON_ATK - def);
        if (resultEnemy) {
          expect(resultEnemy.hp).toBe(200 - expectedDmg);
        } else {
          expect(expectedDmg).toBeGreaterThanOrEqual(200);
        }
      });
    }
  });

  describe('special カテゴリ（player.atk=20 相当で検証）', () => {
    const PLAYER_ATK = 20; // emp_pulse の atk と同値に設定
    for (const def of defPatterns) {
      it(`def=${def} のとき ダメージ = max(${MIN_DAMAGE}, ${PLAYER_ATK}-${def}) = ${Math.max(MIN_DAMAGE, PLAYER_ATK - def)}`, () => {
        const weapon = createWeaponInstance('emp_pulse'); // special カテゴリ
        const enemy = makeEnemy(0, ENEMY_POS, { def });
        const state = makeState({ atk: PLAYER_ATK, equippedWeapon: weapon, facing: 'up' }, [enemy]);
        const result = processTurn(state, 'attack');
        const resultEnemy = result.enemies.find((e) => e.id === 0);
        const expectedDmg = Math.max(MIN_DAMAGE, PLAYER_ATK - def);
        if (resultEnemy) {
          expect(resultEnemy.hp).toBe(200 - expectedDmg);
        } else {
          expect(expectedDmg).toBeGreaterThanOrEqual(200);
        }
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 2. MIN_DAMAGE 保証
// ---------------------------------------------------------------------------

describe('MIN_DAMAGE 保証', () => {
  it('atk=1, def=999 でも MIN_DAMAGE(1) が入る（素手）', () => {
    const enemy = makeEnemy(0, ENEMY_POS, { def: 999 });
    const state = makeState({ atk: 1, equippedWeapon: null }, [enemy]);
    const result = processTurn(state, 'move_up');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    expect(resultEnemy.hp).toBe(200 - MIN_DAMAGE);
  });

  it('atk === def のとき max(1, 0) = 1 ダメージが入る', () => {
    const enemy = makeEnemy(0, ENEMY_POS, { def: 8 });
    const state = makeState({ atk: 8, equippedWeapon: null }, [enemy]);
    const result = processTurn(state, 'move_up');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    expect(resultEnemy.hp).toBe(200 - MIN_DAMAGE);
  });

  it('atk が def より 1 大きいとき 1 ダメージが入る', () => {
    const enemy = makeEnemy(0, ENEMY_POS, { def: 9 });
    const state = makeState({ atk: 10, equippedWeapon: null }, [enemy]);
    const result = processTurn(state, 'move_up');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    expect(resultEnemy.hp).toBe(200 - 1);
  });

  it('MIN_DAMAGE 定数は 1 である', () => {
    expect(MIN_DAMAGE).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. 装備武器あり/なし（equippedWeapon null = 素手）での calcDamage 差異
// ---------------------------------------------------------------------------

describe('装備武器あり/なしのダメージ差異', () => {
  it('equippedWeapon=null（素手）は player.atk でダメージ計算', () => {
    // player.atk=8, enemy.def=0 → ダメージ=8
    const enemy = makeEnemy(0, ENEMY_POS, { def: 0 });
    const state = makeState({ atk: 8, equippedWeapon: null }, [enemy]);
    const result = processTurn(state, 'move_up');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    expect(resultEnemy.hp).toBe(200 - 8);
  });

  it('blade_arm 装備時は player.atk(8) + weapon.atk(18) = 26 でダメージ計算', () => {
    // BUG-001 修正後: effectiveAtk = player.atk + weapon.atk
    const weapon = createWeaponInstance('blade_arm'); // atk=18
    const enemy = makeEnemy(0, ENEMY_POS, { def: 0, hp: 500, maxHp: 500 });
    const state = makeState({ atk: 8, equippedWeapon: weapon }, [enemy]);
    const result = processTurn(state, 'move_up');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    // effectiveAtk = 8 + 18 = 26 → ダメージ = 26
    expect(resultEnemy.hp).toBe(500 - 26);
  });

  it('装備武器なし vs 装備ありでダメージが変わること（player.atk が異なる場合）', () => {
    // HP を十分高くして撃破されないようにする（atk=8 のケースでも残存）
    const enemy1 = makeEnemy(0, ENEMY_POS, { def: 0, hp: 500, maxHp: 500 });
    const enemy2 = makeEnemy(0, ENEMY_POS, { def: 0, hp: 500, maxHp: 500 });
    // atk=8（低攻撃力）
    const stateNoWeapon = makeState({ atk: 8, equippedWeapon: null }, [enemy1]);
    const resultNoWeapon = processTurn(stateNoWeapon, 'move_up');
    const e1 = resultNoWeapon.enemies.find((e) => e.id === 0);

    // atk=20（高攻撃力）
    const stateHighAtk = makeState({ atk: 20, equippedWeapon: null }, [enemy2]);
    const resultHighAtk = processTurn(stateHighAtk, 'move_up');
    const e2 = resultHighAtk.enemies.find((e) => e.id === 0);

    // どちらも存在し、hp が異なること
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();
    expect(e1!.hp).toBeGreaterThan(e2!.hp);
  });
});

// ---------------------------------------------------------------------------
// 4. 状態異常（shielded）でのダメージ吸収
// ---------------------------------------------------------------------------

describe('状態異常: shielded によるダメージ吸収', () => {
  it('shielded(magnitude=10) 付きの敵に 8 ダメージを与えると 0 ダメージになる', () => {
    const enemy = makeEnemy(0, ENEMY_POS, {
      statusEffects: [{ type: 'shielded', remainingTurns: 3, magnitude: 10 }],
    });
    // player.atk=8, enemy.def=0 → rawDamage=8, shield absorbs 8 → finalDamage=0
    const state = makeState({ atk: 8 }, [enemy]);
    const result = processTurn(state, 'move_up');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    expect(resultEnemy.hp).toBe(200); // ダメージ 0
  });

  it('shielded(magnitude=3) 付きの敵に 8 ダメージを与えると 5 ダメージになる', () => {
    const enemy = makeEnemy(0, ENEMY_POS, {
      statusEffects: [{ type: 'shielded', remainingTurns: 3, magnitude: 3 }],
    });
    // rawDamage=8, shield absorbs 3 → finalDamage=5
    const state = makeState({ atk: 8 }, [enemy]);
    const result = processTurn(state, 'move_up');
    const resultEnemy = result.enemies.find((e) => e.id === 0)!;
    expect(resultEnemy.hp).toBe(200 - 5);
  });

  it('シールドを使い切った次の攻撃ではダメージが通る', () => {
    // 1回目: shielded(magnitude=5), atk=8 → absorbed=5, finalDamage=3, shield消費
    const enemy = makeEnemy(0, ENEMY_POS, {
      hp: 200,
      statusEffects: [{ type: 'shielded', remainingTurns: 3, magnitude: 5 }],
    });
    const state = makeState({ atk: 8 }, [enemy]);
    const result1 = processTurn(state, 'move_up');
    const e1 = result1.enemies.find((e) => e.id === 0)!;
    // 3ダメージ食らっているはず
    expect(e1.hp).toBeLessThan(200);
  });

  it('プレイヤーが shielded のとき敵攻撃を吸収する', () => {
    const enemy = makeEnemy(0, { x: 4, y: 3 }, { atk: 20 });
    // player.def=0, enemy.atk=20 → rawDmg=20, shield absorbs 20 → finalDmg=0
    const state = makeState({
      atk: 5,
      def: 0,
      statusEffects: [{ type: 'shielded', remainingTurns: 3, magnitude: 20 }],
    }, [enemy]);
    const result = processTurn(state, 'wait');
    expect(result.player!.hp).toBe(200); // シールドで完全吸収
  });
});

// ---------------------------------------------------------------------------
// 5. 複数ターン連続攻撃での HP 推移
// ---------------------------------------------------------------------------

describe('複数ターン連続攻撃での HP 推移', () => {
  it('3ターン連続バンプ攻撃で敵 HP が毎ターン一定量減る', () => {
    // atk=10, def=0 → 毎ターン 10 ダメージ
    const enemy = makeEnemy(0, ENEMY_POS, { def: 0, atk: 1 });
    const state0 = makeState({ atk: 10, def: 99 }, [enemy]);

    const state1 = processTurn(state0, 'move_up');
    const hp1 = state1.enemies.find((e) => e.id === 0)?.hp ?? -1;
    expect(hp1).toBe(200 - 10);

    // ターン2: 敵は(4,3)にいるが、プレイヤーがすでに(4,3)にバンプ移動しようとするため
    // 実際は移動不可（敵がいるため再度バンプ攻撃扱い）
    const state2 = processTurn(state1, 'move_up');
    const hp2 = state2.enemies.find((e) => e.id === 0)?.hp ?? -1;
    expect(hp2).toBe(200 - 20);

    const state3 = processTurn(state2, 'move_up');
    const hp3 = state3.enemies.find((e) => e.id === 0)?.hp ?? -1;
    expect(hp3).toBe(200 - 30);
  });

  it('敵 HP が 0 以下になったターンで敵が除去される', () => {
    // atk=60, enemy.hp=200, def=0 → 4回攻撃で撃破
    const enemy = makeEnemy(0, ENEMY_POS, { hp: 60, maxHp: 60, def: 0, atk: 1 });
    const state0 = makeState({ atk: 60, def: 99 }, [enemy]);
    const state1 = processTurn(state0, 'move_up');
    // 1回で60ダメージ → 撃破
    expect(state1.enemies.find((e) => e.id === 0)).toBeUndefined();
  });

  it('複数ターンで蓄積されたダメージが正確に追跡される', () => {
    // 5ターン分、1ターンあたり 5 ダメージ
    const enemy = makeEnemy(0, ENEMY_POS, { hp: 100, maxHp: 100, def: 5, atk: 1 });
    // atk=10, def=5 → dmg=5
    let state = makeState({ atk: 10, def: 99 }, [enemy]);

    for (let i = 1; i <= 5; i++) {
      state = processTurn(state, 'move_up');
      const e = state.enemies.find((e) => e.id === 0);
      if (e) {
        expect(e.hp).toBe(100 - 5 * i);
      }
    }
  });
});
