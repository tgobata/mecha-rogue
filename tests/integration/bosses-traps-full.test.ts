import { describe, it, expect, vi, afterEach } from 'vitest';
import { decideBossAction } from '../../src/game/core/boss-ai';
import { processTurn } from '../../src/game/core/turn-system';
import { createInitialGameState } from '../../src/game/core/game-state';
import type { GameState, Enemy, Player } from '../../src/game/core/game-state';
import { 
  TILE_FLOOR, 
  TILE_WARP, 
  TILE_TRAP,
  TILE_LAVA
} from '../../src/game/core/constants';
import { RoomType } from '../../src/game/core/types';

// Helper to create a basic state for testing
function createTestState(playerPos = { x: 5, y: 5 }, enemyPos = { x: 5, y: 3 }): { state: GameState; boss: Enemy } {
  const state = createInitialGameState();
  state.phase = 'exploring';

  const player: Player = {
    pos: playerPos,
    hp: 100, maxHp: 100, atk: 10, def: 5, facing: 'up',
  };
  state.player = player;

  const boss: Enemy = {
    id: 1,
    enemyType: 'test_boss',
    pos: enemyPos,
    hp: 500, maxHp: 500, atk: 20, def: 10, expReward: 1000,
    aiType: 'boss',
    facing: 'down',
    isBoss: true,
    bossState: { id: 'test_boss' }
  };
  state.enemies = [boss];

  const cells = Array(10).fill(null).map(() => Array(10).fill({ tile: TILE_FLOOR, isVisible: true, isExplored: true }));
  state.map = {
    floorNumber: 1, width: 10, height: 10, cells,
    rooms: [{ id: 0, type: RoomType.NORMAL, bounds: { x: 0, y: 0, width: 10, height: 10 }, doors: [] }],
    startPos: { x: 0, y: 0 }, stairsPos: { x: 9, y: 9 }, seed: 123
  } as any;
  
  state.exploration = {
    currentFloor: state.map!,
    playerPos: state.player.pos,
    floorNumber: 1,
    turn: 0
  };

  return { state, boss };
}

describe('Full Boss AI & Trap Suite', () => {

  describe('Boss AI Individual Behaviors', () => {
    
    it('Bug Swarm (2F) - Initial Teleport Surround', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'bug_swarm' };
      const actions = decideBossAction(boss, state, Math.random);
      expect(actions.length).toBe(1);
      // Bug Swarm は初遭遇時にプレイヤー包囲位置へテレポートする
      expect(actions[0].type).toBe('teleport');
    });

    it('Mach Runner (4F) - Triple Action', () => {
      // 距離2: 1回目move→隣接→2回目attack+break = 2アクション（位置更新が正しく機能している）
      const { state, boss } = createTestState();
      boss.bossState = { id: 'mach_runner', actionsPerTurn: 3 };
      const actions = decideBossAction(boss, state, Math.random);
      expect(actions.length).toBe(2);
      expect(actions[0].type).toBe('move');
      expect(actions[1].type).toBe('attack');
    });

    it('Junk King (5F) - Basic Chase', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'junk_king' };
      const actions = decideBossAction(boss, state, Math.random);
      expect(actions.length).toBe(1);
    });

    it('Phantom (7F) - Invisible Chase', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'phantom' };
      const actions = decideBossAction(boss, state, Math.random);
      expect(actions.length).toBe(1);
    });

    it('Iron Fortress (9F) - Cannon Cooldown', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'iron_fortress', cannonCooldown: 3 };
      
      decideBossAction(boss, state, Math.random);
      expect(boss.bossState.currentCooldown).toBe(3);
      
      decideBossAction(boss, state, Math.random);
      expect(boss.bossState.currentCooldown).toBe(2);
    });

    it('Samurai Master (10F) - Double Action', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'samurai_master', attacksPerTurn: 2 };
      const actions = decideBossAction(boss, state, Math.random);
      expect(actions.length).toBe(2);
    });

    it('Shadow Twin (15F) - Basic Chase', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'shadow_twin' };
      const actions = decideBossAction(boss, state, Math.random);
      expect(actions.length).toBe(1);
    });

    it('Queen of Shadow (20F) - Phase Basic Chase', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'queen_of_shadow' };
      const actions = decideBossAction(boss, state, Math.random);
      expect(actions.length).toBe(1);
    });

    it('Mind Controller (25F) - Basic Chase', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'mind_controller' };
      const actions = decideBossAction(boss, state, Math.random);
      expect(actions.length).toBe(1);
    });

    it('Overload (30F) - Shield Cooldown', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'overload', shieldCooldown: 3 };
      
      decideBossAction(boss, state, Math.random);
      expect(boss.bossState.currentCooldown).toBe(3);
    });

    it('Time Eater (35F) - Rewind Cooldown', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'time_eater', rewindCooldown: 5 };
      
      decideBossAction(boss, state, Math.random);
      expect(boss.bossState.currentCooldown).toBe(4); // 5 is set, then -- happens
    });

    it('Eternal Core (40F) - Stationary Attack', () => {
      const { state, boss } = createTestState({ x: 5, y: 5 }, { x: 8, y: 8 });
      boss.bossState = { id: 'eternal_core' };
      const actions = decideBossAction(boss, state, Math.random);
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('attack');
    });

    it('Final Boss (50F) - Ability Rotation Cooldown', () => {
      const { state, boss } = createTestState();
      boss.bossState = { id: 'final_boss', abilityRotationTurns: 5 };
      
      decideBossAction(boss, state, Math.random);
      expect(boss.bossState.currentCooldown).toBe(4);
    });
  });

  describe('Comprehensive Trap Interactions', () => {
    // 可視罠には75%のランダム発動判定があるため、Math.random をモックして確実に発動させる
    afterEach(() => { vi.restoreAllMocks(); });

    it('Pitfall Trap (visible_pitfall) - Damages and drops floor', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4); // 0.4 < 0.75 → 確実に発動
      const { state } = createTestState({ x: 0, y: 0 });
      state.map!.cells[1][0].tile = TILE_TRAP;
      state.traps = [{ id: 101, type: 'visible_pitfall', pos: { x: 0, y: 1 }, isVisible: true, isTriggered: false }];

      const next = processTurn(state, 'move_down');
      expect(next.player?.hp).toBeLessThanOrEqual(80); // 100 - 20
      expect(next.floor).toBe(2);
    });

    it('Landmine (landmine) - AoE Damage', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4); // 0.4 < 0.75 → 確実に発動
      const { state } = createTestState({ x: 0, y: 0 });
      state.map!.cells[1][0].tile = TILE_TRAP;
      const enemy = { ...state.enemies[0], pos: { x: 1, y: 1 }, hp: 100 };
      state.enemies = [enemy];
      state.traps = [{ id: 102, type: 'landmine', pos: { x: 0, y: 1 }, isVisible: true, isTriggered: false }];

      const next = processTurn(state, 'move_down');
      expect(next.player?.hp).toBeLessThanOrEqual(75); // 100 - 25（敵の攻撃分さらに減る可能性あり）
      expect(next.enemies[0].hp).toBe(75); // 100 - 25 (AoE)
      expect(next.battleLog).toEqual(expect.arrayContaining(['地雷が爆発した！ 25のダメージ！']));
    });

    it('Poison Gas (poison_gas) - Simple Damage', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4); // 0.4 < 0.75 → 確実に発動
      const { state } = createTestState({ x: 0, y: 0 });
      state.map!.cells[1][0].tile = TILE_TRAP;
      state.traps = [{ id: 103, type: 'poison_gas', pos: { x: 0, y: 1 }, isVisible: true, isTriggered: false }];

      const next = processTurn(state, 'move_down');
      expect(next.player?.hp).toBeLessThanOrEqual(90); // 100 - 10
      expect(next.battleLog).toEqual(expect.arrayContaining(['毒ガスを吸い込んだ！ 10のダメージ！']));
    });

    it('Arrow Trap (arrow_trap) - Simple Damage', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4); // 0.4 < 0.75 → 確実に発動
      const { state } = createTestState({ x: 0, y: 0 });
      state.map!.cells[1][0].tile = TILE_TRAP;
      state.traps = [{ id: 104, type: 'arrow_trap', pos: { x: 0, y: 1 }, isVisible: true, isTriggered: false }];

      const next = processTurn(state, 'move_down');
      expect(next.player?.hp).toBeLessThanOrEqual(85); // 100 - 15
      expect(next.battleLog).toEqual(expect.arrayContaining(['矢が飛んできた！ 15のダメージ！']));
    });

    it('Teleport Trap (teleport_trap) - Changes position', () => {
      // 0.4 < 0.75 → 発動。テレポート先: Math.floor(0.4 * 10) = 4 → row4(TILE_FLOOR)
      vi.spyOn(Math, 'random').mockReturnValue(0.4);
      const { state } = createTestState({ x: 0, y: 0 });
      state.map!.cells[1][0].tile = TILE_TRAP;
      state.traps = [{ id: 105, type: 'teleport_trap', pos: { x: 0, y: 1 }, isVisible: true, isTriggered: false }];

      const next = processTurn(state, 'move_down');
      expect(next.player?.pos).not.toEqual({ x: 0, y: 1 });
      expect(next.player?.pos).not.toEqual({ x: 0, y: 0 });
    });
  });

  describe('Special Terrain', () => {
    it('Lava Tile - Movement damage', () => {
      const { state } = createTestState({ x: 0, y: 0 });
      state.map!.cells[1][0].tile = TILE_LAVA;

      const next = processTurn(state, 'move_down');
      expect(next.player?.hp).toBe(95); // 100 - 5
    });
  });
});
