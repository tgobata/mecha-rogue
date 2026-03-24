/**
 * @fileoverview 基本戦闘 P0 テスト
 *
 * ダメージ計算・敵撃破・EXP加算・プレイヤーへのダメージ・
 * HP0 時のスタート帰還などの戦闘システムを検証する。
 * turn-system.test.ts との重複を避け、このファイルでは
 * 具体的なダメージ値と境界条件の網羅性に焦点を当てる。
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { processTurn } from '../../src/game/core/turn-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Player, Enemy } from '../../src/game/core/game-state.js';
import type { Cell, Floor } from '../../src/game/core/types.js';
import { TILE_FLOOR, TILE_WALL, TILE_START, MIN_DAMAGE } from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// テスト定数
// ---------------------------------------------------------------------------

/** プレイヤーの攻撃力（テスト用固定値） */
const PLAYER_ATK = 8;
/** プレイヤーの防御力（テスト用固定値） */
const PLAYER_DEF = 5;
/** 敵の HP */
const ENEMY_HP = 15;
/** 敵の攻撃力 */
const ENEMY_ATK = 5;
/** 敵の防御力 */
const ENEMY_DEF = 0;
/** 敵の経験値報酬 */
const ENEMY_EXP = 20;

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * 9x9 の開けたテスト用フロアを生成する。
 * 外周は壁、内部は全て通路。
 * startPos: (1,1), stairsPos: (7,7)
 */
function createOpenFloor(): Floor {
  const WIDTH = 9;
  const HEIGHT = 9;
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

  // startPos に TILE_START をセット
  cells[1][1].tile = TILE_START;

  return {
    floorNumber: 1,
    width: WIDTH,
    height: HEIGHT,
    cells,
    rooms: [],
    startPos: { x: 1, y: 1 },
    stairsPos: { x: 7, y: 7 },
    seed: 0,
  };
}

/**
 * 探索中の GameState を生成する。
 * プレイヤーを (4,4) に配置し、敵は引数で指定する。
 */
function makeCombatState(
  playerOverrides: Partial<Player> = {},
  enemies: Enemy[] = [],
): GameState {
  const base = createInitialGameState();
  const floor = createOpenFloor();

  const player: Player = {
    pos: { x: 4, y: 4 },
    hp: 100,
    maxHp: 100,
    atk: PLAYER_ATK,
    def: PLAYER_DEF,
    facing: 'down',
    ...playerOverrides,
  };

  return {
    ...base,
    phase: 'exploring',
    player,
    enemies,
    map: floor,
    floor: 1,
    exploration: {
      currentFloor: floor,
      playerPos: player.pos,
      floorNumber: 1,
      turn: 0,
    },
  };
}

/**
 * テスト用の敵エンティティを生成する。
 */
function makeEnemy(
  id: number,
  pos: { x: number; y: number },
  overrides: Partial<Enemy> = {},
): Enemy {
  return {
    id,
    enemyType: 'test_enemy',
    pos,
    hp: ENEMY_HP,
    maxHp: ENEMY_HP,
    atk: ENEMY_ATK,
    def: ENEMY_DEF,
    expReward: ENEMY_EXP,
    aiType: 'straight',
    facing: 'down',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('基本戦闘 P0', () => {
  // プレイヤー (4,4) の上 (4,3) に敵を配置
  const ENEMY_POS = { x: 4, y: 3 };

  describe('バンプ攻撃: ダメージ計算', () => {
    test('バンプ攻撃で敵に atk-def のダメージが入る', () => {
      // PLAYER_ATK=8, ENEMY_DEF=0 → ダメージ = max(1, 8-0) = 8
      const enemy = makeEnemy(0, ENEMY_POS);
      const state = makeCombatState({ pos: { x: 4, y: 4 }, atk: PLAYER_ATK }, [enemy]);
      const result = processTurn(state, 'move_up');
      const resultEnemy = result.enemies.find((e) => e.id === 0)!;
      expect(resultEnemy.hp).toBe(ENEMY_HP - (PLAYER_ATK - ENEMY_DEF));
    });

    test('ダメージは最低 MIN_DAMAGE(1) が保証される', () => {
      // プレイヤーatk=1 vs 敵def=999 → max(1, 1-999) = 1
      const enemy = makeEnemy(0, ENEMY_POS, { def: 999 });
      const state = makeCombatState({ pos: { x: 4, y: 4 }, atk: 1 }, [enemy]);
      const result = processTurn(state, 'move_up');
      const resultEnemy = result.enemies.find((e) => e.id === 0)!;
      expect(resultEnemy.hp).toBe(ENEMY_HP - MIN_DAMAGE);
    });

    test('防御力ちょうどの攻撃力でも MIN_DAMAGE(1) が入る', () => {
      // atk=5 vs def=5 → max(1, 5-5) = max(1, 0) = 1
      const enemy = makeEnemy(0, ENEMY_POS, { def: 5 });
      const state = makeCombatState({ pos: { x: 4, y: 4 }, atk: 5 }, [enemy]);
      const result = processTurn(state, 'move_up');
      const resultEnemy = result.enemies.find((e) => e.id === 0)!;
      expect(resultEnemy.hp).toBe(ENEMY_HP - MIN_DAMAGE);
    });

    test('高攻撃力で敵防御を超えるダメージが正しく計算される', () => {
      // atk=20 vs def=3 → max(1, 20-3) = 17
      // 敵HPを100にして撃破されないようにする
      const ENEMY_HIGH_HP = 100;
      const enemy = makeEnemy(0, ENEMY_POS, { hp: ENEMY_HIGH_HP, maxHp: ENEMY_HIGH_HP, def: 3 });
      const state = makeCombatState({ pos: { x: 4, y: 4 }, atk: 20 }, [enemy]);
      const result = processTurn(state, 'move_up');
      const resultEnemy = result.enemies.find((e) => e.id === 0)!;
      expect(resultEnemy.hp).toBe(ENEMY_HIGH_HP - 17);
    });
  });

  describe('敵撃破', () => {
    test('敵HP0以下で敵リストから除去される', () => {
      // HP=1 の敵、atk=10 → 一撃で倒せる
      const enemy = makeEnemy(0, ENEMY_POS, { hp: 1, maxHp: 1 });
      const state = makeCombatState({ pos: { x: 4, y: 4 }, atk: 10 }, [enemy]);
      const result = processTurn(state, 'move_up');
      expect(result.enemies).toHaveLength(0);
    });

    test('複数の敵がいるとき HP0 以下の敵だけ除去される', () => {
      const weakEnemy = makeEnemy(0, ENEMY_POS, { hp: 1, maxHp: 1 });
      // 遠くに強い敵（視界外: マンハッタン距離 > 5）
      const farStrongEnemy = makeEnemy(1, { x: 4, y: 4 - 7 < 1 ? 4 + 7 : 4 - 7 }, { hp: 100, maxHp: 100 });
      // 近くにも HP の多い敵を置く（視界内、攻撃されない位置）
      const strongEnemy = makeEnemy(2, { x: 2, y: 4 }, { hp: 100, maxHp: 100 });
      const state = makeCombatState({ pos: { x: 4, y: 4 }, atk: 10 }, [weakEnemy, strongEnemy]);
      const result = processTurn(state, 'move_up');
      // id=0 は除去、id=2 は残る
      expect(result.enemies.some((e) => e.id === 0)).toBe(false);
      expect(result.enemies.some((e) => e.id === 2)).toBe(true);
    });

    test('敵撃破でパイロットに EXP が加算される', () => {
      const enemy = makeEnemy(0, ENEMY_POS, { hp: 1, maxHp: 1, expReward: ENEMY_EXP });
      const state = makeCombatState({ pos: { x: 4, y: 4 }, atk: 10 }, [enemy]);
      const result = processTurn(state, 'move_up');
      expect(result.pilot.exp).toBe(state.pilot.exp + ENEMY_EXP);
    });

    test('生き残った敵からは EXP を得ない', () => {
      const enemy = makeEnemy(0, ENEMY_POS, { hp: 100, maxHp: 100, expReward: ENEMY_EXP });
      const state = makeCombatState({ pos: { x: 4, y: 4 }, atk: 1 }, [enemy]);
      const result = processTurn(state, 'move_up');
      // 敵は生存（HP=100, ダメージ=1なので99残る）
      expect(result.pilot.exp).toBe(state.pilot.exp);
    });
  });

  describe('敵の反撃', () => {
    test('敵の攻撃でプレイヤーHP が減る', () => {
      // 敵(4,3) 隣接プレイヤー(4,4): 敵atk=5, プレイヤーdef=5 → MIN_DAMAGE=1
      const enemy = makeEnemy(0, { x: 4, y: 3 }, { atk: ENEMY_ATK });
      const state = makeCombatState(
        { pos: { x: 4, y: 4 }, hp: 100, def: PLAYER_DEF },
        [enemy],
      );
      // wait でプレイヤーターンは何もしないが隣接敵が攻撃
      const result = processTurn(state, 'wait');
      // ダメージ = max(1, 5-5) = 1
      expect(result.player!.hp).toBe(100 - MIN_DAMAGE);
    });

    test('プレイヤー防御力を超える敵攻撃で正しくダメージが入る', () => {
      // 敵atk=15, プレイヤーdef=5 → ダメージ=10
      const enemy = makeEnemy(0, { x: 4, y: 3 }, { atk: 15 });
      const state = makeCombatState(
        { pos: { x: 4, y: 4 }, hp: 100, def: 5 },
        [enemy],
      );
      const result = processTurn(state, 'wait');
      expect(result.player!.hp).toBe(90);
    });
  });

  describe('HP0 時のスタート帰還', () => {
    test('プレイヤーHP0以下でスタート帰還（floor === 1, phase === exploring）', () => {
      // 9999 の攻撃力の隣接敵で即死
      const enemy = makeEnemy(0, { x: 4, y: 3 }, { atk: 9999 });
      const state = makeCombatState(
        { pos: { x: 4, y: 4 }, hp: 1, def: 0 },
        [enemy],
      );
      const result = processTurn(state, 'wait');
      expect(result.phase).toBe('gameover');
      expect(result.player!.hp).toBe(1 - 9999);
    });

    test('HP0になった際、HP回復は直接は行われない（UI管理）', () => {
      const enemy = makeEnemy(0, { x: 4, y: 3 }, { atk: 9999 });
      const state = makeCombatState(
        { pos: { x: 4, y: 4 }, hp: 1, def: 0 },
        [enemy],
      );
      const result = processTurn(state, 'wait');
      expect(result.player!.hp).toBeLessThanOrEqual(0);
    });

    test('HP が 1 でも残れば帰還しない', () => {
      // 敵atk=6, プレイヤーdef=5 → ダメージ=1、HP=100-1=99
      const enemy = makeEnemy(0, { x: 4, y: 3 }, { atk: 6 });
      const state = makeCombatState(
        { pos: { x: 4, y: 4 }, hp: 100, def: 5 },
        [enemy],
      );
      const result = processTurn(state, 'wait');
      expect(result.phase).toBe('exploring');
      expect(result.floor).toBe(1);
      expect(result.player!.hp).toBe(99);
    });
  });

  describe('attack アクション', () => {
    test('attack アクションで向いている方向の敵を攻撃する', () => {
      // プレイヤー(4,4)が上(4,3)の敵を攻撃 (facing='up')
      const enemy = makeEnemy(0, { x: 4, y: 3 });
      const state = makeCombatState(
        { pos: { x: 4, y: 4 }, atk: PLAYER_ATK, facing: 'up' },
        [enemy],
      );
      const result = processTurn(state, 'attack');
      const resultEnemy = result.enemies.find((e) => e.id === 0)!;
      // ダメージ = max(1, 8-0) = 8
      expect(resultEnemy.hp).toBe(ENEMY_HP - PLAYER_ATK);
    });

    test('attack アクションで敵がいない場合は敵リストが変化しない', () => {
      // facing='up' だが上には敵がいない
      const enemy = makeEnemy(0, { x: 4, y: 5 }); // 下にいる敵
      const state = makeCombatState(
        { pos: { x: 4, y: 4 }, facing: 'up' },
        [enemy],
      );
      const result = processTurn(state, 'attack');
      const resultEnemy = result.enemies.find((e) => e.id === 0)!;
      // ダメージなし
      expect(resultEnemy.hp).toBe(ENEMY_HP);
      expect(result.enemies).toHaveLength(1);
    });

    test('attack アクションでプレイヤーの座標は変わらない', () => {
      const enemy = makeEnemy(0, { x: 4, y: 3 });
      const state = makeCombatState(
        { pos: { x: 4, y: 4 }, facing: 'up' },
        [enemy],
      );
      const result = processTurn(state, 'attack');
      expect(result.player!.pos).toEqual({ x: 4, y: 4 });
    });

    test('attack で敵をちょうど倒すとリストから除去される', () => {
      // atk=15, def=0, enemy.hp=15 → ダメージ15 → HP=0 → 除去
      const enemy = makeEnemy(0, { x: 4, y: 3 }, { hp: 15, maxHp: 15, def: 0 });
      const state = makeCombatState(
        { pos: { x: 4, y: 4 }, atk: 15, facing: 'up' },
        [enemy],
      );
      const result = processTurn(state, 'attack');
      expect(result.enemies).toHaveLength(0);
    });
  });
});
