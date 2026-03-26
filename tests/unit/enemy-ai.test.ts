/**
 * @fileoverview 敵AIのユニットテスト
 *
 * 7パターン全ての AI（chase/patrol/guard/sniper/support/ambush/flee）と
 * BFS経路探索（pathfinding.ts）を検証する。
 */

import { describe, it, expect } from 'vitest';
import { decideEnemyAction } from '../../src/game/core/enemy-ai.js';
import { findPath, nextStep } from '../../src/game/core/pathfinding.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Enemy, Player } from '../../src/game/core/game-state.js';
import type { Floor, Cell, Position } from '../../src/game/core/types.js';
import { TILE_FLOOR, TILE_WALL } from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

function makeOpenFloor(width = 9, height = 9): Floor {
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

function makeState(enemy: Enemy, playerPos: Position, otherEnemies: Enemy[] = []): GameState {
  const base = createInitialGameState();
  const floor = makeOpenFloor();
  const player = makePlayer(playerPos);
  return {
    ...base,
    phase: 'exploring',
    player,
    enemies: [enemy, ...otherEnemies],
    map: floor, floor: 1,
    exploration: { currentFloor: floor, playerPos, floorNumber: 1, turn: 0 },
  };
}

const rngFixed05 = (): number => 0.5;
const rngFixed0 = (): number => 0;

// ---------------------------------------------------------------------------
// BFS 経路探索（pathfinding.ts）
// ---------------------------------------------------------------------------

describe('findPath: BFS経路探索', () => {
  it('開けたフロアで最短経路を返す', () => {
    const floor = makeOpenFloor();
    const path = findPath({ x: 1, y: 1 }, { x: 4, y: 1 }, floor);
    expect(path.length).toBe(3); // (2,1),(3,1),(4,1)
    expect(path[path.length - 1]).toEqual({ x: 4, y: 1 });
  });

  it('同一座標なら空配列を返す', () => {
    const floor = makeOpenFloor();
    const path = findPath({ x: 2, y: 2 }, { x: 2, y: 2 }, floor);
    expect(path).toHaveLength(0);
  });

  it('壁で囲まれた到達不可な座標には空配列を返す', () => {
    const floor = makeOpenFloor(5, 5);
    // (2,2)から(0,0)（壁）への経路
    const path = findPath({ x: 2, y: 2 }, { x: 0, y: 0 }, floor);
    expect(path).toHaveLength(0);
  });

  it('nextStep は最初の1ステップ座標を返す', () => {
    const floor = makeOpenFloor();
    const step = nextStep({ x: 1, y: 1 }, { x: 4, y: 1 }, floor);
    expect(step).toEqual({ x: 2, y: 1 });
  });

  it('経路がない場合 nextStep は from をそのまま返す', () => {
    const floor = makeOpenFloor(5, 5);
    const step = nextStep({ x: 2, y: 2 }, { x: 0, y: 0 }, floor);
    expect(step).toEqual({ x: 2, y: 2 });
  });

  it('L字型経路を正しく探索する', () => {
    const floor = makeOpenFloor();
    // (1,1) から (4,4) はL字路でも到達可能
    const path = findPath({ x: 1, y: 1 }, { x: 4, y: 4 }, floor);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 4, y: 4 });
  });
});

// ---------------------------------------------------------------------------
// straight (chase) AI
// ---------------------------------------------------------------------------

describe('AI: straight（直進追跡）', () => {
  it('隣接していれば attack を返す', () => {
    const enemy = makeEnemy({ x: 3, y: 4 }, 'straight');
    const state = makeState(enemy, { x: 4, y: 4 });
    const action = decideEnemyAction(enemy, state, rngFixed05);
    expect(action.type).toBe('attack');
  });

  it('離れていれば move を返す', () => {
    const enemy = makeEnemy({ x: 1, y: 1 }, 'straight');
    const state = makeState(enemy, { x: 4, y: 4 });
    const action = decideEnemyAction(enemy, state, rngFixed05);
    expect(action.type).toBe('move');
  });

  it('move の to がプレイヤーに近づいている', () => {
    const enemy = makeEnemy({ x: 1, y: 4 }, 'straight');
    const state = makeState(enemy, { x: 5, y: 4 });
    const action = decideEnemyAction(enemy, state, rngFixed05);
    if (action.type === 'move') {
      const before = Math.abs(1 - 5);
      const after = Math.abs(action.to.x - 5);
      expect(after).toBeLessThan(before);
    }
  });
});

// ---------------------------------------------------------------------------
// patrol AI
// ---------------------------------------------------------------------------

describe('AI: patrol（巡回）', () => {
  it('巡回パスがなければ skip を返す', () => {
    const enemy = makeEnemy({ x: 2, y: 2 }, 'patrol');
    const state = makeState(enemy, { x: 8, y: 8 }); // 遠い
    const action = decideEnemyAction(enemy, state, rngFixed05);
    expect(action.type).toBe('skip');
  });

  it('プレイヤーが視界内（距離≤5）なら追跡する', () => {
    const enemy = makeEnemy({ x: 2, y: 2 }, 'patrol');
    const state = makeState(enemy, { x: 3, y: 2 }); // 距離1
    const action = decideEnemyAction(enemy, state, rngFixed05);
    // 距離1なら attack
    expect(action.type).toBe('attack');
  });

  it('巡回パスがあれば move を返す', () => {
    const patrolPath = [{ x: 2, y: 2 }, { x: 5, y: 2 }];
    const enemy = makeEnemy({ x: 2, y: 2 }, 'patrol', {
      patrolPath, patrolIndex: 1, patrolForward: true,
    });
    const state = makeState(enemy, { x: 8, y: 8 }); // 視界外
    const action = decideEnemyAction(enemy, state, rngFixed05);
    expect(action.type).toBe('move');
  });
});

// ---------------------------------------------------------------------------
// guard AI
// ---------------------------------------------------------------------------

describe('AI: guard（守衛）', () => {
  it('プレイヤーが守備半径外なら守備位置に戻る（moveまたはskip）', () => {
    const guardPos = { x: 4, y: 4 };
    const enemy = makeEnemy({ x: 4, y: 4 }, 'guard', { guardPos });
    // プレイヤーは遠い
    const state = makeState(enemy, { x: 8, y: 8 });
    const action = decideEnemyAction(enemy, state, rngFixed05);
    // 守備位置にいるのでskip
    expect(action.type === 'skip' || action.type === 'move').toBe(true);
  });

  it('プレイヤーが守備半径内に入ったら追跡する', () => {
    const guardPos = { x: 4, y: 4 };
    const enemy = makeEnemy({ x: 4, y: 4 }, 'guard', { guardPos });
    // プレイヤーが守備半径内（距離2）
    const state = makeState(enemy, { x: 6, y: 4 });
    const action = decideEnemyAction(enemy, state, rngFixed05);
    // 距離2なのでmoveかattack
    expect(action.type === 'move' || action.type === 'attack').toBe(true);
  });

  it('隣接していれば attack を返す', () => {
    const guardPos = { x: 4, y: 4 };
    const enemy = makeEnemy({ x: 4, y: 4 }, 'guard', { guardPos });
    const state = makeState(enemy, { x: 5, y: 4 }); // 距離1
    const action = decideEnemyAction(enemy, state, rngFixed05);
    expect(action.type).toBe('attack');
  });
});

// ---------------------------------------------------------------------------
// sniper AI
// ---------------------------------------------------------------------------

describe('AI: sniper（遠距離）', () => {
  it('視線が通っていれば attack を返す', () => {
    const enemy = makeEnemy({ x: 1, y: 4 }, 'sniper', { attackRange: 5 } as any);
    const state = makeState(enemy, { x: 5, y: 4 }); // 同じ行、視線あり、距離4≤range5
    const action = decideEnemyAction(enemy, state, rngFixed05);
    expect(action.type).toBe('attack');
  });

  it('隣接していれば attack を返す', () => {
    const enemy = makeEnemy({ x: 3, y: 4 }, 'sniper');
    const state = makeState(enemy, { x: 4, y: 4 });
    const action = decideEnemyAction(enemy, state, rngFixed05);
    expect(action.type).toBe('attack');
  });
});

// ---------------------------------------------------------------------------
// support AI
// ---------------------------------------------------------------------------

describe('AI: support（回復型）', () => {
  it('瀕死の仲間がいれば heal を返す（隣接時）', () => {
    const woundedEnemy = makeEnemy({ x: 3, y: 4 }, 'straight', {
      id: 1, hp: 5, maxHp: 20, // HP 25% < threshold 60%
    });
    const supportEnemy = makeEnemy({ x: 4, y: 4 }, 'support', { id: 0 });
    const state = makeState(supportEnemy, { x: 8, y: 8 }, [woundedEnemy]);
    const action = decideEnemyAction(supportEnemy, state, rngFixed05);
    expect(action.type).toBe('heal');
    if (action.type === 'heal') {
      expect(action.targetId).toBe('1');
      expect(action.amount).toBeGreaterThan(0);
    }
  });

  it('瀕死の仲間がいないとき skip を返す', () => {
    const healthyEnemy = makeEnemy({ x: 3, y: 4 }, 'straight', {
      id: 1, hp: 20, maxHp: 20, // HP 100%
    });
    const supportEnemy = makeEnemy({ x: 4, y: 4 }, 'support', { id: 0 });
    const state = makeState(supportEnemy, { x: 8, y: 8 }, [healthyEnemy]);
    const action = decideEnemyAction(supportEnemy, state, rngFixed05);
    expect(action.type).toBe('skip');
  });
});

// ---------------------------------------------------------------------------
// ambush AI（stealth / 待ち伏せ）
// ---------------------------------------------------------------------------

describe('AI: ambush（待ち伏せ）', () => {
  it('rng が AMBUSH_SKIP_CHANCE 未満ならスキップする', () => {
    // rng=0 < 0.4 → skip
    const enemy = makeEnemy({ x: 2, y: 4 }, 'ambush');
    const state = makeState(enemy, { x: 5, y: 4 });
    const action = decideEnemyAction(enemy, state, rngFixed0);
    expect(action.type).toBe('skip');
  });

  it('rng が AMBUSH_SKIP_CHANCE 以上なら行動する（moveかattack）', () => {
    // rng=0.99 >= 0.4 → 行動
    const enemy = makeEnemy({ x: 2, y: 4 }, 'ambush');
    const state = makeState(enemy, { x: 5, y: 4 });
    const action = decideEnemyAction(enemy, state, () => 0.99);
    expect(action.type === 'move' || action.type === 'attack').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// flee AI（逃走）
// ---------------------------------------------------------------------------

describe('AI: flee（逃走）', () => {
  it('プレイヤーから遠ざかる方向に移動する', () => {
    // プレイヤー(4,4)、敵(3,4) → 逃げると左または上下に移動
    const enemy = makeEnemy({ x: 3, y: 4 }, 'flee');
    const state = makeState(enemy, { x: 4, y: 4 });
    const action = decideEnemyAction(enemy, state, rngFixed05);
    if (action.type === 'move') {
      // 移動後の距離がプレイヤーから離れているはず
      const before = Math.abs(3 - 4) + Math.abs(4 - 4);
      const after = Math.abs(action.to.x - 4) + Math.abs(action.to.y - 4);
      expect(after).toBeGreaterThanOrEqual(before);
    }
    // 逃げられない場合は skip も許容
    expect(action.type === 'move' || action.type === 'skip').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// explode AI（自爆）
// ---------------------------------------------------------------------------

describe('AI: explode（自爆）', () => {
  it('プレイヤーに隣接したとき explode を返す', () => {
    const enemy = makeEnemy({ x: 3, y: 4 }, 'explode');
    const state = makeState(enemy, { x: 4, y: 4 });
    const action = decideEnemyAction(enemy, state, rngFixed05);
    expect(action.type).toBe('explode');
  });

  it('プレイヤーと離れているとき skip を返す', () => {
    const enemy = makeEnemy({ x: 1, y: 4 }, 'explode');
    const state = makeState(enemy, { x: 5, y: 4 });
    const action = decideEnemyAction(enemy, state, rngFixed05);
    expect(action.type).toBe('skip');
  });
});

// ---------------------------------------------------------------------------
// group AI（群体）
// ---------------------------------------------------------------------------

describe('AI: group（群体）', () => {
  it('同種の仲間がプレイヤーを視認していれば自身も追跡する', () => {
    const groupEnemy1 = makeEnemy({ x: 5, y: 4 }, 'group', { id: 0, enemyType: 'metal_wolf' });
    // 仲間（同じenemyType）がプレイヤーを視認している
    const groupEnemy2 = makeEnemy({ x: 1, y: 4 }, 'group', { id: 1, enemyType: 'metal_wolf' });

    const base = createInitialGameState();
    const floor = makeOpenFloor();
    const player = makePlayer({ x: 6, y: 4 });
    const state: GameState = {
      ...base, phase: 'exploring',
      player,
      enemies: [groupEnemy1, groupEnemy2],
      map: floor, floor: 1,
      exploration: { currentFloor: floor, playerPos: player.pos, floorNumber: 1, turn: 0 },
    };

    // groupEnemy2は遠いが、groupEnemy1がプレイヤーに隣接 → groupEnemy2も追跡
    const action = decideEnemyAction(groupEnemy2, state, rngFixed05);
    expect(action.type === 'move' || action.type === 'attack').toBe(true);
  });
});
