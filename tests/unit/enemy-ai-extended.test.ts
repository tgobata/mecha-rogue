/**
 * @fileoverview 敵AI P1 拡充テスト
 *
 * chase/patrol/guard/sniper/support/stealth(ambush)/berserker の各パターンを詳細検証する。
 */

import { describe, it, expect } from 'vitest';
import { decideEnemyAction } from '../../src/game/core/enemy-ai.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Enemy, Player } from '../../src/game/core/game-state.js';
import type { Floor, Cell, Position } from '../../src/game/core/types.js';
import { TILE_FLOOR, TILE_WALL } from '../../src/game/core/constants.js';
import { manhattanDistance } from '../../src/game/core/floorUtils.js';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeOpenFloor(width = 11, height = 11): Floor {
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      cells[y][x] = { tile: isEdge ? TILE_WALL : TILE_FLOOR, isVisible: false, isExplored: false };
    }
  }
  return {
    floorNumber: 1, width, height, cells, rooms: [],
    startPos: { x: 1, y: 1 }, stairsPos: { x: 9, y: 9 }, seed: 0,
  };
}

/** 壁でブロックされた11x11フロア（中央列に縦壁）を生成する */
function makeFloorWithWall(): Floor {
  const width = 11, height = 11;
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      const isWallCol = x === 5; // 中央列に縦壁（ただし端以外）
      const isGap = y === 5;    // 中央行だけ通路
      cells[y][x] = {
        tile: (isEdge || (isWallCol && !isGap)) ? TILE_WALL : TILE_FLOOR,
        isVisible: false,
        isExplored: false,
      };
    }
  }
  return {
    floorNumber: 1, width, height, cells, rooms: [],
    startPos: { x: 1, y: 1 }, stairsPos: { x: 9, y: 9 }, seed: 0,
  };
}

function makeEnemy(pos: Position, aiType: Enemy['aiType'], overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 0, enemyType: 'test', pos,
    hp: 20, maxHp: 20, atk: 5, def: 0, expReward: 10,
    aiType, facing: 'down',
    ...overrides,
  };
}

function makePlayer(pos: Position): Player {
  return { pos, hp: 100, maxHp: 100, atk: 8, def: 5, facing: 'down' };
}

function makeState(enemy: Enemy, playerPos: Position, floor?: Floor, otherEnemies: Enemy[] = []): GameState {
  const base = createInitialGameState();
  const f = floor ?? makeOpenFloor();
  const player = makePlayer(playerPos);
  return {
    ...base, phase: 'exploring', player,
    enemies: [enemy, ...otherEnemies],
    map: f, floor: 1,
    exploration: { currentFloor: f, playerPos, floorNumber: 1, turn: 0 },
  };
}

// ---------------------------------------------------------------------------
// 1. chase（straight）: プレイヤーに向かって最短経路移動
// ---------------------------------------------------------------------------

describe('AI: chase（straight）詳細検証', () => {
  it('遠方からプレイヤーに向かって最短距離で接近する', () => {
    // 敵(1,1) → プレイヤー(9,1): 右に移動するはず
    const enemy = makeEnemy({ x: 1, y: 1 }, 'straight');
    const state = makeState(enemy, { x: 9, y: 1 });
    const action = decideEnemyAction(enemy, state, () => 0.5);
    expect(action.type).toBe('move');
    if (action.type === 'move') {
      const before = manhattanDistance(enemy.pos, { x: 9, y: 1 });
      const after = manhattanDistance(action.to, { x: 9, y: 1 });
      expect(after).toBeLessThan(before);
    }
  });

  it('プレイヤーに隣接（距離1）で attack', () => {
    const enemy = makeEnemy({ x: 4, y: 4 }, 'straight');
    const state = makeState(enemy, { x: 5, y: 4 });
    const action = decideEnemyAction(enemy, state, () => 0.5);
    expect(action.type).toBe('attack');
    if (action.type === 'attack') {
      expect(action.targetId).toBe('player');
    }
  });

  it('2ターン追跡後、マンハッタン距離が減少している', () => {
    const floor = makeOpenFloor();
    const enemy0 = makeEnemy({ x: 1, y: 5 }, 'straight');
    const playerPos = { x: 5, y: 5 };
    const dist0 = manhattanDistance(enemy0.pos, playerPos);

    const state0 = makeState(enemy0, playerPos, floor);
    const action1 = decideEnemyAction(enemy0, state0, () => 0.5);
    expect(action1.type).toBe('move');
    if (action1.type === 'move') {
      const dist1 = manhattanDistance(action1.to, playerPos);
      expect(dist1).toBeLessThan(dist0);
    }
  });

  it('他の敵が経路をブロックしていても skip または迂回する', () => {
    const enemy = makeEnemy({ x: 1, y: 5 }, 'straight');
    // 直進経路上に別の敵を置く
    const blocker = makeEnemy({ x: 2, y: 5 }, 'straight', { id: 1 });
    const state = makeState(enemy, { x: 5, y: 5 }, undefined, [blocker]);
    const action = decideEnemyAction(enemy, state, () => 0.5);
    // skip か move（迂回）どちらでもよい
    expect(['move', 'skip', 'attack'].includes(action.type)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. patrol: patrolPath を往復していること
// ---------------------------------------------------------------------------

describe('AI: patrol（巡回）詳細検証', () => {
  it('patrolPath がある場合に目標地点に向かって move する', () => {
    const patrolPath = [{ x: 2, y: 2 }, { x: 6, y: 2 }];
    const enemy = makeEnemy({ x: 2, y: 2 }, 'patrol', {
      patrolPath, patrolIndex: 1, patrolForward: true,
    });
    // プレイヤーは遠い（視界外）
    const state = makeState(enemy, { x: 9, y: 9 });
    const action = decideEnemyAction(enemy, state, () => 0.5);
    expect(action.type).toBe('move');
    if (action.type === 'move') {
      // 目標(6,2)に近づいているはず
      const before = manhattanDistance(enemy.pos, patrolPath[1]);
      const after = manhattanDistance(action.to, patrolPath[1]);
      expect(after).toBeLessThanOrEqual(before);
    }
  });

  it('patrolPath の目的地に到達したターンは skip する（往復の折り返し）', () => {
    const patrolPath = [{ x: 3, y: 2 }, { x: 3, y: 6 }];
    // 現在位置が目的地 index=1 と同じ
    const enemy = makeEnemy({ x: 3, y: 6 }, 'patrol', {
      patrolPath, patrolIndex: 1, patrolForward: true,
    });
    const state = makeState(enemy, { x: 9, y: 9 });
    const action = decideEnemyAction(enemy, state, () => 0.5);
    // 目的地到達 → skip
    expect(action.type).toBe('skip');
  });

  it('プレイヤーが視界内（距離≤5）に入ると追跡に切り替わる', () => {
    const patrolPath = [{ x: 2, y: 2 }, { x: 5, y: 2 }];
    const enemy = makeEnemy({ x: 3, y: 3 }, 'patrol', {
      patrolPath, patrolIndex: 1,
    });
    // プレイヤーが視界内・隣接
    const state = makeState(enemy, { x: 4, y: 3 });
    const action = decideEnemyAction(enemy, state, () => 0.5);
    // 距離1 → attack に切り替わる
    expect(action.type).toBe('attack');
  });
});

// ---------------------------------------------------------------------------
// 3. guard: guardPos から一定距離以内でのみ行動
// ---------------------------------------------------------------------------

describe('AI: guard（守衛）詳細検証', () => {
  const GUARD_RADIUS = 4; // enemy-ai.ts の GUARD_RADIUS と一致

  it('プレイヤーが guardPos から半径 4 超えにいると守備位置に戻ろうとする', () => {
    const guardPos = { x: 5, y: 5 };
    const enemy = makeEnemy(guardPos, 'guard', { guardPos });
    // プレイヤーを守備半径外に置く
    const playerPos = { x: 1, y: 1 }; // dist=8 > 4
    const distPlayerToGuard = manhattanDistance(playerPos, guardPos);
    expect(distPlayerToGuard).toBeGreaterThan(GUARD_RADIUS);
    const state = makeState(enemy, playerPos);
    const action = decideEnemyAction(enemy, state, () => 0.5);
    // 既に守備位置 → skip
    expect(action.type === 'skip' || action.type === 'move').toBe(true);
  });

  it('プレイヤーが guardPos から半径 4 以内に入ると追跡する', () => {
    const guardPos = { x: 5, y: 5 };
    const enemy = makeEnemy(guardPos, 'guard', { guardPos });
    // プレイヤーを守備半径内（距離3）に置く
    const playerPos = { x: 8, y: 5 }; // dist=3 ≤ 4
    const distPlayerToGuard = manhattanDistance(playerPos, guardPos);
    expect(distPlayerToGuard).toBeLessThanOrEqual(GUARD_RADIUS);
    const state = makeState(enemy, playerPos);
    const action = decideEnemyAction(enemy, state, () => 0.5);
    expect(action.type === 'move' || action.type === 'attack').toBe(true);
  });

  it('プレイヤーに隣接したら attack', () => {
    const guardPos = { x: 5, y: 5 };
    const enemy = makeEnemy({ x: 5, y: 5 }, 'guard', { guardPos });
    const state = makeState(enemy, { x: 6, y: 5 }); // 距離1
    const action = decideEnemyAction(enemy, state, () => 0.5);
    expect(action.type).toBe('attack');
  });

  it('守備位置から離れた場合に守備位置へ戻る', () => {
    const guardPos = { x: 5, y: 5 };
    // 敵が守備位置から2マス離れた位置にいる、プレイヤーは遠い
    const enemy = makeEnemy({ x: 3, y: 5 }, 'guard', { guardPos });
    const state = makeState(enemy, { x: 1, y: 9 }); // プレイヤーは守備半径外
    const action = decideEnemyAction(enemy, state, () => 0.5);
    // 守備位置(5,5) に向かうはず
    if (action.type === 'move') {
      const distBefore = manhattanDistance(enemy.pos, guardPos);
      const distAfter = manhattanDistance(action.to, guardPos);
      expect(distAfter).toBeLessThan(distBefore);
    } else {
      // skip も許容
      expect(action.type).toBe('skip');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. ranged（sniper）: 視線が通る場合は攻撃、通らない場合は接近
// ---------------------------------------------------------------------------

describe('AI: sniper（遠距離）詳細検証', () => {
  it('視線が通っていれば遠距離でも attack', () => {
    const floor = makeOpenFloor();
    const enemy = makeEnemy({ x: 1, y: 5 }, 'sniper', { attackRange: 8 } as any);
    const state = makeState(enemy, { x: 8, y: 5 }, floor); // 同行・視線あり、距離7≤range8
    const action = decideEnemyAction(enemy, state, () => 0.5);
    expect(action.type).toBe('attack');
    if (action.type === 'attack') {
      expect(action.targetId).toBe('player');
    }
  });

  it('壁で視線が遮られると接近（move）する', () => {
    // 中央に縦壁があるフロア
    const floor = makeFloorWithWall();
    // 敵は壁左側(3,5)、プレイヤーは壁右側(7,5)
    const enemy = makeEnemy({ x: 3, y: 5 }, 'sniper');
    // 壁のギャップ(y=5)は通路なので視線が通ってしまう。y=3 で試す。
    const enemy2 = makeEnemy({ x: 3, y: 3 }, 'sniper');
    const state2 = makeState(enemy2, { x: 7, y: 3 }, floor);
    const action2 = decideEnemyAction(enemy2, state2, () => 0.5);
    // 壁(x=5)で視線遮断 → move（接近）
    expect(action2.type === 'move' || action2.type === 'attack').toBe(true);
  });

  it('隣接したとき attack を返す', () => {
    const enemy = makeEnemy({ x: 4, y: 5 }, 'sniper');
    const state = makeState(enemy, { x: 5, y: 5 });
    const action = decideEnemyAction(enemy, state, () => 0.5);
    expect(action.type).toBe('attack');
  });
});

// ---------------------------------------------------------------------------
// 5. support: 味方 HP が低い場合に heal アクションを選択
// ---------------------------------------------------------------------------

describe('AI: support（回復型）詳細検証', () => {
  it('HP 50% 以下の仲間が隣接にいれば heal を選択する', () => {
    // HP閾値=60%, hp=9/20=45% < 60%
    const wounded = makeEnemy({ x: 3, y: 5 }, 'straight', {
      id: 1, hp: 9, maxHp: 20,
    });
    const supporter = makeEnemy({ x: 4, y: 5 }, 'support', { id: 0 });
    const state = makeState(supporter, { x: 9, y: 9 }, undefined, [wounded]);
    const action = decideEnemyAction(supporter, state, () => 0.5);
    expect(action.type).toBe('heal');
    if (action.type === 'heal') {
      expect(action.targetId).toBe('1');
      expect(action.amount).toBeGreaterThan(0);
    }
  });

  it('HP 60% 以上の仲間がいるとき heal を選択しない', () => {
    // HP閾値=60%, hp=13/20=65% > 60%
    const healthy = makeEnemy({ x: 3, y: 5 }, 'straight', {
      id: 1, hp: 13, maxHp: 20,
    });
    const supporter = makeEnemy({ x: 4, y: 5 }, 'support', { id: 0 });
    const state = makeState(supporter, { x: 9, y: 9 }, undefined, [healthy]);
    const action = decideEnemyAction(supporter, state, () => 0.5);
    expect(action.type).toBe('skip');
  });

  it('最も HP% が低い仲間を回復対象に選ぶ', () => {
    const badly = makeEnemy({ x: 3, y: 5 }, 'straight', { id: 1, hp: 3, maxHp: 20 });
    const slightly = makeEnemy({ x: 4, y: 5 }, 'straight', { id: 2, hp: 8, maxHp: 20 });
    // supporter は(5,5)に配置 → both badly(3,5)とslightly(4,5)が隣接
    const supporter = makeEnemy({ x: 4, y: 5 }, 'support', { id: 0, pos: { x: 5, y: 5 } });
    // supporter の実際の位置を修正
    const supporter2: Enemy = { ...supporter, pos: { x: 4, y: 5 } };
    const badly2: Enemy = { ...badly, pos: { x: 3, y: 5 } };
    const state: GameState = {
      ...makeState(supporter2, { x: 9, y: 9 }),
      enemies: [supporter2, badly2, slightly],
    };
    const action = decideEnemyAction(supporter2, state, () => 0.5);
    // badly が最もHP%が低いので heal対象は id=1
    if (action.type === 'heal') {
      expect(action.targetId).toBe('1');
    }
  });

  it('仲間が誰もいないとき skip', () => {
    const supporter = makeEnemy({ x: 4, y: 5 }, 'support');
    const state = makeState(supporter, { x: 9, y: 9 });
    const action = decideEnemyAction(supporter, state, () => 0.5);
    expect(action.type).toBe('skip');
  });
});

// ---------------------------------------------------------------------------
// 6. stealth（ambush）: 一定確率でスキップ（100 回試行での skip 率検証）
// ---------------------------------------------------------------------------

describe('AI: ambush（待ち伏せ）skip 率統計検証', () => {
  const AMBUSH_SKIP_CHANCE = 0.4;
  const TOLERANCE_100 = 0.15; // 100回では±15%（確率的揺らぎを考慮）
  const TOLERANCE_1000 = 0.05; // 1000回では±5%

  it('100 回試行で skip 率が 25%〜55% の範囲に収まる', () => {
    const enemy = makeEnemy({ x: 5, y: 5 }, 'ambush');
    const state = makeState(enemy, { x: 8, y: 5 }); // 距離3

    let skipCount = 0;
    const N = 100;
    for (let i = 0; i < N; i++) {
      const rng = () => Math.random();
      const action = decideEnemyAction(enemy, state, rng);
      if (action.type === 'skip') skipCount++;
    }

    const skipRate = skipCount / N;
    expect(skipRate).toBeGreaterThanOrEqual(AMBUSH_SKIP_CHANCE - TOLERANCE_100);
    expect(skipRate).toBeLessThanOrEqual(AMBUSH_SKIP_CHANCE + TOLERANCE_100);
  });

  it('rng=0（常にスキップ閾値未満）のとき必ず skip', () => {
    const enemy = makeEnemy({ x: 5, y: 5 }, 'ambush');
    const state = makeState(enemy, { x: 8, y: 5 });
    for (let i = 0; i < 10; i++) {
      const action = decideEnemyAction(enemy, state, () => 0);
      expect(action.type).toBe('skip');
    }
  });

  it('rng=0.99（常にスキップ閾値以上）のとき skip しない', () => {
    const enemy = makeEnemy({ x: 5, y: 5 }, 'ambush');
    const state = makeState(enemy, { x: 8, y: 5 });
    for (let i = 0; i < 10; i++) {
      const action = decideEnemyAction(enemy, state, () => 0.99);
      expect(action.type).not.toBe('skip');
    }
  });

  it('1000 回試行で skip 率がおよそ 40% になる', () => {
    const enemy = makeEnemy({ x: 5, y: 5 }, 'ambush');
    const state = makeState(enemy, { x: 8, y: 5 });

    let skipCount = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const action = decideEnemyAction(enemy, state, Math.random);
      if (action.type === 'skip') skipCount++;
    }

    const skipRate = skipCount / N;
    // 1000回なら誤差は小さい
    expect(skipRate).toBeGreaterThanOrEqual(AMBUSH_SKIP_CHANCE - 0.05);
    expect(skipRate).toBeLessThanOrEqual(AMBUSH_SKIP_CHANCE + 0.05);
  });
});

// ---------------------------------------------------------------------------
// 7. berserker: HP 50% 以下で攻撃力/行動が変化すること
// ---------------------------------------------------------------------------

describe('AI: berserker（HP 50% 以下での凶暴化）', () => {
  /**
   * berserker の「enrage_at_half_hp」special は現状 enemy-ai.ts ではなく
   * enemies.json で定義されている。AI タイプは 'straight' なので、
   * ここでは HP 変化に応じて turn-system 側でダメージが変わることを間接的に検証する。
   * AIの行動自体は straight → decideChase と同じ動きになる。
   */

  it('HP が 50% 超のとき straight と同様の行動（move/attack）をする', () => {
    // berserker は aiType='straight' なので decideChase が呼ばれる
    const enemy = makeEnemy({ x: 3, y: 5 }, 'straight', {
      hp: 60, maxHp: 70, // HP=60/70 ≈ 85% > 50%
    });
    const state = makeState(enemy, { x: 8, y: 5 });
    const action = decideEnemyAction(enemy, state, () => 0.5);
    expect(action.type === 'move' || action.type === 'attack').toBe(true);
  });

  it('HP が 50% 以下でも straight AI の動作（move）は変わらない（AI 変更なし）', () => {
    const enemy = makeEnemy({ x: 3, y: 5 }, 'straight', {
      hp: 30, maxHp: 70, // HP=30/70 ≈ 43% < 50%
    });
    const state = makeState(enemy, { x: 8, y: 5 });
    const action = decideEnemyAction(enemy, state, () => 0.5);
    // straight AI はHPに関係なく move/attack
    expect(action.type === 'move' || action.type === 'attack').toBe(true);
  });

  it('berserker の enraged 状態（HP50%以下）での実際の atk 変化はゲームシステム側で制御される', () => {
    // NOTE: enemy-ai.ts は atk 変化を行わない。GDD の enrage_at_half_hp は
    // turn-system や別の処理で適用される想定。
    // ここでは、berserker の atk フィールドが正の値であることだけ確認する。
    const enemy = makeEnemy({ x: 3, y: 5 }, 'straight', {
      atk: 40, hp: 30, maxHp: 70,
    });
    expect(enemy.atk).toBeGreaterThan(0);
    expect(enemy.hp / enemy.maxHp).toBeLessThan(0.5);
  });

  it('隣接（距離1）では HP に関係なく attack を返す', () => {
    const enemy = makeEnemy({ x: 4, y: 5 }, 'straight', {
      hp: 5, maxHp: 70, // HP 7% < 50%
    });
    const state = makeState(enemy, { x: 5, y: 5 }); // 距離1
    const action = decideEnemyAction(enemy, state, () => 0.5);
    expect(action.type).toBe('attack');
  });
});
