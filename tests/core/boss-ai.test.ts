import { describe, it, expect } from 'vitest';
import { decideBossAction } from '../../src/game/core/boss-ai';
import { createInitialGameState } from '../../src/game/core/game-state';
import type { GameState, Enemy, Player } from '../../src/game/core/game-state';
import type { Floor } from '../../src/game/core/types';
import { TILE_FLOOR } from '../../src/game/core/constants';

// テスト用モック状態作成ヘルパー
function createMockState(playerPos = { x: 5, y: 5 }, enemyPos = { x: 5, y: 3 }): { state: GameState; boss: Enemy } {
  const state = createInitialGameState();
  state.phase = 'exploring';

  const player: Player = {
    pos: playerPos,
    hp: 100, maxHp: 100, atk: 10, def: 5, facing: 'up',
  };
  state.player = player;

  const boss: Enemy = {
    id: 1,
    enemyType: 'dummy_boss',
    pos: enemyPos,
    hp: 100, maxHp: 100, atk: 10, def: 5, expReward: 100,
    aiType: 'boss',
    facing: 'down',
    isBoss: true,
    bossState: { id: 'dummy_boss' }
  };
  state.enemies = [boss];

  const cells = Array(10).fill(null).map(() => Array(10).fill({ tile: TILE_FLOOR, isVisible: true, isExplored: true }));
  state.map = {
    floorNumber: 5, width: 10, height: 10, cells,
    rooms: [], startPos: { x: 0, y: 0 }, stairsPos: { x: 9, y: 9 }, seed: 123
  } as unknown as import('../../src/game/core/types').Floor;

  return { state, boss };
}

describe('Boss AI System', () => {

  it('Mach Runner (4F) takes multiple actions per turn', () => {
    // 距離2: move→隣接→attack+break で2アクション
    const { state, boss } = createMockState();
    boss.bossState = { id: 'mach_runner', actionsPerTurn: 3 };

    const actions = decideBossAction(boss, state, Math.random);
    // 1回目 move（距離2→1）、2回目 attack+break → 2アクション
    expect(actions.length).toBe(2);
    expect(actions[0].type).toBe('move');
    expect(actions[1].type).toBe('attack');
  });

  it('Mach Runner (4F) uses all 3 actions when target is far', () => {
    // 距離5: 3回すべて move
    const { state, boss } = createMockState({ x: 5, y: 5 }, { x: 5, y: 0 });
    boss.bossState = { id: 'mach_runner', actionsPerTurn: 3 };

    const actions = decideBossAction(boss, state, Math.random);
    expect(actions.length).toBe(3);
    expect(actions.every(a => a.type === 'move')).toBe(true);
  });

  it('Eternal Core (40F) attacks without moving', () => {
    const { state, boss } = createMockState({ x: 5, y: 5 }, { x: 8, y: 8 });
    boss.bossState = { id: 'eternal_core' };

    const actions = decideBossAction(boss, state, Math.random);
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe('attack'); // 固定砲台なので距離があってもattackを返す
  });

  it('Iron Fortress (9F) fires cannon every 3 turns', () => {
    const { state, boss } = createMockState();
    boss.bossState = { id: 'iron_fortress', cannonCooldown: 3 };
    
    // 初回（cooldown undefined -> 0 なので砲撃アクション扱い（実装上はskip等））
    let actions = decideBossAction(boss, state, Math.random);
    expect(boss.bossState.currentCooldown).toBe(3);

    // 次のターン（クールダウン消化）
    actions = decideBossAction(boss, state, Math.random);
    expect(boss.bossState.currentCooldown).toBe(2);
  });

  it('Default boss chases and attacks', () => {
    const { state, boss } = createMockState({ x: 5, y: 5 }, { x: 5, y: 4 }); // 隣接
    boss.bossState = { id: 'unknown_boss' };

    const actions = decideBossAction(boss, state, Math.random);
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe('attack');
  });

});
