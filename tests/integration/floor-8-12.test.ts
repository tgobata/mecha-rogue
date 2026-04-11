/**
 * @fileoverview 8F〜12F コンテンツ 統合テスト
 *
 * 対象:
 *  - ボスAI: Big Oil Drum Lv.1 (8F), Bug Swarm Lv.2 (12F)
 *  - 8F〜12F 登場敵との戦闘ダメージ計算
 *  - 8F〜12F 武器のインスタンス生成・耐久
 *  - 8F〜12F 敵のドロップ (gold)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { decideBossAction } from '../../src/game/core/boss-ai';
import { processTurn } from '../../src/game/core/turn-system';
import { createInitialGameState } from '../../src/game/core/game-state';
import { createWeaponInstance } from '../../src/game/core/weapon-system';
import { rollDrops } from '../../src/game/core/drop-system';
import type { GameState, Enemy, Player } from '../../src/game/core/game-state';
import { TILE_FLOOR, TILE_WALL, MIN_DAMAGE } from '../../src/game/core/constants';
import { RoomType } from '../../src/game/core/types';
import type { Cell, Floor } from '../../src/game/core/types';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeOpenFloor(width = 15, height = 15): Floor {
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      cells[y][x] = { tile: isEdge ? TILE_WALL : TILE_FLOOR, isVisible: true, isExplored: true };
    }
  }
  return {
    floorNumber: 8, width, height, cells, rooms: [],
    startPos: { x: 1, y: 1 }, stairsPos: { x: 13, y: 13 }, seed: 42,
  };
}

/** 10x10 の全 TILE_FLOOR マップ（bosses-traps-full.test.ts と同パターン） */
function makeFlatMap(width = 10, height = 10) {
  // 各行を独立オブジェクトで生成（Array.fill の共有参照バグを避ける）
  const cells = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      tile: TILE_FLOOR,
      isVisible: true,
      isExplored: true,
    }))
  );
  return {
    floorNumber: 8, width, height, cells,
    rooms: [{ id: 0, type: RoomType.NORMAL, bounds: { x: 0, y: 0, width, height }, doors: [] }],
    startPos: { x: 0, y: 0 }, stairsPos: { x: 9, y: 9 }, seed: 42,
  } as any;
}

function makeBoss(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 1,
    enemyType: 'big_oil_drum_lv1',
    pos: { x: 5, y: 5 },
    hp: 320, maxHp: 320, atk: 22, def: 5, expReward: 600,
    aiType: 'boss', facing: 'down',
    isBoss: true,
    bossSize: 2,
    bossState: { id: 'big_oil_drum' },
    ...overrides,
  };
}

function makeBossState(playerPos = { x: 5, y: 5 }, bossPos = { x: 5, y: 1 }): { state: GameState; boss: Enemy } {
  const state = createInitialGameState();
  state.phase = 'exploring';
  state.player = { pos: playerPos, hp: 100, maxHp: 100, atk: 10, def: 5, facing: 'up' };
  const boss = makeBoss({ pos: bossPos });
  state.enemies = [boss];
  state.map = makeFlatMap();
  state.exploration = { currentFloor: state.map!, playerPos, floorNumber: 8, turn: 0 };
  return { state, boss };
}

function makeCombatState(
  playerOverrides: Partial<Player> = {},
  enemies: Enemy[] = [],
): GameState {
  const base = createInitialGameState();
  const floor = makeOpenFloor();
  const player: Player = {
    pos: { x: 7, y: 7 }, hp: 200, maxHp: 200, atk: 10, def: 5, facing: 'up',
    ...playerOverrides,
  };
  return {
    ...base, phase: 'exploring',
    player, enemies, map: floor, floor: 8,
    exploration: { currentFloor: floor, playerPos: player.pos, floorNumber: 8, turn: 0 },
  };
}

function makeEnemy(id: number, pos: { x: number; y: number }, overrides: Partial<Enemy> = {}): Enemy {
  return {
    id, enemyType: 'test', pos,
    hp: 200, maxHp: 200, atk: 5, def: 0, expReward: 10,
    aiType: 'straight', facing: 'down',
    ...overrides,
  };
}

const ABOVE_PLAYER = { x: 7, y: 6 }; // プレイヤー(7,7)の真上

// ---------------------------------------------------------------------------
// 1. ボスAI: Big Oil Drum Lv.1 (8F)
// ---------------------------------------------------------------------------

describe('Big Oil Drum Lv.1 (8F) - Boss AI', () => {
  it('毎ターン spread_oil アクションを出力する', () => {
    const { state, boss } = makeBossState({ x: 5, y: 9 }, { x: 5, y: 2 });
    boss.bossState = { id: 'big_oil_drum', rollCooldownLeft: 3 };
    const actions = decideBossAction(boss, state, Math.random);
    expect(actions.some((a) => a.type === 'spread_oil')).toBe(true);
  });

  it('rollCooldownLeft > 1 のターンは通常移動（spread_oil + move/attack）', () => {
    const { state, boss } = makeBossState({ x: 5, y: 9 }, { x: 5, y: 2 });
    boss.bossState = { id: 'big_oil_drum', rollCooldownLeft: 3 };
    const actions = decideBossAction(boss, state, Math.random);
    // spread_oil は含む
    expect(actions.some((a) => a.type === 'spread_oil')).toBe(true);
    // ロール突進は起きない（rollCooldownLeft が 1 以上残る）
    expect(actions.every((a) => a.type !== 'cannon_aoe')).toBe(true);
  });

  it('rollCooldownLeft=1 のターンはドラムロール（移動距離 > 0 の move または attack）', () => {
    // プレイヤーが遠い場合: rollDist(=3) 分 move
    const { state, boss } = makeBossState({ x: 5, y: 9 }, { x: 5, y: 2 });
    boss.bossState = { id: 'big_oil_drum', rollCooldownLeft: 1, rollDistance: 3, rollCooldown: 3 };
    const actions = decideBossAction(boss, state, Math.random);
    expect(actions.some((a) => a.type === 'spread_oil')).toBe(true);
    // ロール後に move か attack が来る
    expect(actions.some((a) => a.type === 'move' || a.type === 'attack')).toBe(true);
  });

  it('rollCooldownLeft がリセットされる（rollCooldown 値に戻る）', () => {
    const { state, boss } = makeBossState({ x: 5, y: 9 }, { x: 5, y: 2 });
    boss.bossState = { id: 'big_oil_drum', rollCooldownLeft: 1, rollDistance: 3, rollCooldown: 3 };
    decideBossAction(boss, state, Math.random);
    expect(boss.bossState.rollCooldownLeft).toBe(3);
  });

  it('隣接時（dist=1）は spread_oil + attack', () => {
    // boss(5,2) player(5,3) → bossEdgeDist = 0 or 1（bossSize=2）
    const { state, boss } = makeBossState({ x: 5, y: 4 }, { x: 5, y: 2 });
    boss.bossState = { id: 'big_oil_drum', rollCooldownLeft: 3, rollCooldown: 3 };
    const actions = decideBossAction(boss, state, Math.random);
    expect(actions.some((a) => a.type === 'spread_oil')).toBe(true);
    expect(actions.some((a) => a.type === 'attack')).toBe(true);
  });

  it('アクション配列は 1 件以上返る', () => {
    const { state, boss } = makeBossState();
    boss.bossState = { id: 'big_oil_drum', rollCooldownLeft: 3 };
    const actions = decideBossAction(boss, state, Math.random);
    expect(actions.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 2. ボスAI: Bug Swarm Lv.2 (12F)
// ---------------------------------------------------------------------------

describe('Bug Swarm Lv.2 (12F) - Boss AI', () => {
  it('初遭遇時はプレイヤー包囲位置へテレポートする', () => {
    const { state, boss } = makeBossState({ x: 5, y: 5 }, { x: 5, y: 2 });
    boss.bossState = { id: 'bug_swarm_lv2' }; // hasEngaged なし
    const actions = decideBossAction(boss, state, Math.random);
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe('teleport');
  });

  it('hasEngaged=true の場合は通常追跡（move または attack）', () => {
    const { state, boss } = makeBossState({ x: 5, y: 5 }, { x: 5, y: 2 });
    boss.bossState = { id: 'bug_swarm_lv2', hasEngaged: true };
    const actions = decideBossAction(boss, state, Math.random);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    // 初回テレポートは発生しない
    expect(actions.every((a) => a.type !== 'teleport')).toBe(true);
  });

  it('Lv.1 と同じスウォームインデックスで包囲位置を決定する', () => {
    const { state, boss } = makeBossState({ x: 5, y: 5 }, { x: 5, y: 2 });
    boss.bossState = { id: 'bug_swarm_lv2', swarmUnitIndex: 0 };
    const actions = decideBossAction(boss, state, Math.random);
    expect(actions[0].type).toBe('teleport');
    // unitIndex=0 → offset={dx:-1,dy:0} → target={4,5}
    expect((actions[0] as any).to).toEqual({ x: 4, y: 5 });
  });
});

// ---------------------------------------------------------------------------
// 3. 8F〜12F 登場敵との戦闘ダメージ計算
// ---------------------------------------------------------------------------

describe('8F〜12F 戦闘: プレイヤー → 敵 ダメージ計算', () => {
  it('Guard Bot Lv.3 (def=12): player.atk=20 → ダメージ 8 (20-12)', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 92, maxHp: 92, atk: 18, def: 12, enemyType: 'guard_bot_lv3' });
    const state = makeCombatState({ atk: 20, facing: 'up' }, [enemy]);
    const next = processTurn(state, 'attack');
    expect(next.enemies[0].hp).toBe(84); // 92 - 8
  });

  it('Guard Bot Lv.3 (def=12): player.atk=10 → MIN_DAMAGE 保証', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 92, maxHp: 92, atk: 18, def: 12, enemyType: 'guard_bot_lv3' });
    const state = makeCombatState({ atk: 10, facing: 'up' }, [enemy]);
    const next = processTurn(state, 'attack');
    expect(next.enemies[0].hp).toBe(92 - MIN_DAMAGE); // MIN_DAMAGE = 1
  });

  it('Shield Knight Lv.1 (def=20): player.atk=30 → ダメージ 10 (30-20)', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 80, maxHp: 80, atk: 12, def: 20, enemyType: 'shield_knight_lv1' });
    const state = makeCombatState({ atk: 30, facing: 'up' }, [enemy]);
    const next = processTurn(state, 'attack');
    expect(next.enemies[0].hp).toBe(70); // 80 - 10
  });

  it('Shield Knight Lv.1 (def=20): player.atk=15 → MIN_DAMAGE 保証 (15-20<0)', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 80, maxHp: 80, atk: 12, def: 20, enemyType: 'shield_knight_lv1' });
    const state = makeCombatState({ atk: 15, facing: 'up' }, [enemy]);
    const next = processTurn(state, 'attack');
    expect(next.enemies[0].hp).toBe(80 - MIN_DAMAGE);
  });

  it('Slime X Lv.3 (hp=69, def=0): player.atk=15 → ダメージ 15 (atk15 - def0)', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 69, maxHp: 69, atk: 14, def: 0, enemyType: 'slime_x_lv3' });
    const state = makeCombatState({ atk: 15, def: 5, facing: 'up' }, [enemy]);
    const next = processTurn(state, 'attack');
    // ダメージ = max(MIN_DAMAGE, player.atk - enemy.def) = max(1, 15-0) = 15
    expect(next.enemies[0].hp).toBe(54); // 69 - 15
  });

  it('Rust Hound Lv.3 (hp=64, def=2): player.atk=20 → ダメージ 18 (20-2)', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 64, maxHp: 64, atk: 16, def: 2, enemyType: 'rust_hound_lv3' });
    const state = makeCombatState({ atk: 20, facing: 'up' }, [enemy]);
    const next = processTurn(state, 'attack');
    expect(next.enemies[0].hp).toBe(46); // 64 - 18
  });

  it('Assault Mecha Lv.2 (hp=90, def=5): player.atk=25 → ダメージ 20 (25-5)', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 90, maxHp: 90, atk: 27, def: 5, enemyType: 'assault_mecha_lv2' });
    const state = makeCombatState({ atk: 25, facing: 'up' }, [enemy]);
    const next = processTurn(state, 'attack');
    expect(next.enemies[0].hp).toBe(70); // 90 - 20
  });

  it('Spark Lv.4 (hp=70, def=4): player.atk=30 → ダメージ 26 (30-4)', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 70, maxHp: 70, atk: 42, def: 4, enemyType: 'spark_lv4' });
    const state = makeCombatState({ atk: 30, facing: 'up' }, [enemy]);
    const next = processTurn(state, 'attack');
    expect(next.enemies[0].hp).toBe(44); // 70 - 26
  });
});

describe('8F〜12F 戦闘: 敵 → プレイヤー ダメージ計算', () => {
  it('Spark Lv.3 (atk=28): player.def=5 → プレイヤー受けるダメージ 23 (28-5)', () => {
    // 敵がプレイヤーに隣接していれば次ターンに攻撃してくる
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 46, maxHp: 46, atk: 28, def: 2, enemyType: 'spark_lv3', aiType: 'straight' });
    const state = makeCombatState({ atk: 1, def: 5, facing: 'down' }, [enemy]); // 攻撃しない方向
    const next = processTurn(state, 'wait');
    // enemy は隣接してプレイヤーに攻撃: damage = max(1, 28-5) = 23
    expect(next.player!.hp).toBe(200 - 23);
  });

  it('Spark Lv.4 (atk=42): player.def=5 → プレイヤー受けるダメージ 37 (42-5)', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 70, maxHp: 70, atk: 42, def: 4, enemyType: 'spark_lv4', aiType: 'straight' });
    const state = makeCombatState({ atk: 1, def: 5, facing: 'down' }, [enemy]);
    const next = processTurn(state, 'wait');
    expect(next.player!.hp).toBe(200 - 37);
  });

  it('Guard Bot Lv.4 (atk=28, def=18): 高防御の敵はプレイヤー攻撃が低下する', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 140, maxHp: 140, atk: 28, def: 18, enemyType: 'guard_bot_lv4' });
    const state = makeCombatState({ atk: 20, facing: 'up' }, [enemy]);
    const next = processTurn(state, 'attack');
    // damage = max(1, 20-18) = 2
    expect(next.enemies[0].hp).toBe(138);
  });

  it('Mine Layer Lv.2 (atk=12): player.def=5 → ダメージ 7 (12-5)', () => {
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 68, maxHp: 68, atk: 12, def: 2, enemyType: 'mine_layer_lv2', aiType: 'straight' });
    const state = makeCombatState({ atk: 1, def: 5, facing: 'down' }, [enemy]);
    const next = processTurn(state, 'wait');
    expect(next.player!.hp).toBe(200 - 7);
  });
});

// ---------------------------------------------------------------------------
// 4. 8F〜12F 武器インスタンス生成・耐久
// ---------------------------------------------------------------------------

describe('8F〜12F 武器: インスタンス生成', () => {
  it('missile_pod (8F+): 正しい atk と durability を持つ', () => {
    const w = createWeaponInstance('missile_pod');
    expect(w.id).toBe('missile_pod');
    expect(w.atk).toBe(30);
    expect(w.durability).toBe(22);
    expect(w.maxDurability).toBe(22);
  });

  it('sniper_rifle (7F+): atk=40, durability=28', () => {
    const w = createWeaponInstance('sniper_rifle');
    expect(w.atk).toBe(40);
    expect(w.durability).toBe(28);
    expect(w.maxDurability).toBe(28);
  });

  it('homing_missile (12F+): atk=25, durability=17', () => {
    const w = createWeaponInstance('homing_missile');
    expect(w.atk).toBe(25);
    expect(w.durability).toBe(17);
    expect(w.maxDurability).toBe(17);
  });

  it('beam_cannon (10F+): atk=42, durability=20', () => {
    const w = createWeaponInstance('beam_cannon');
    expect(w.atk).toBe(42);
    expect(w.durability).toBe(20);
  });

  it('machine_gun_2 (8F+): atk=16, durability=50（高耐久）', () => {
    const w = createWeaponInstance('machine_gun_2');
    expect(w.atk).toBe(16);
    expect(w.durability).toBe(50);
  });

  it('grenade_launcher (11F+): atk=35, durability=17', () => {
    const w = createWeaponInstance('grenade_launcher');
    expect(w.atk).toBe(35);
    expect(w.durability).toBe(17);
  });

  it('missile_pod を装備した攻撃で耐久が 1 減る', () => {
    const weapon = createWeaponInstance('missile_pod'); // durability=22
    const enemy = makeEnemy(0, ABOVE_PLAYER, { hp: 200, def: 0 });
    const state = makeCombatState({ atk: 30, facing: 'up', equippedWeapon: weapon }, [enemy]);
    const next = processTurn(state, 'attack');
    expect(next.player!.equippedWeapon?.durability).toBe(21); // 22 - 1
  });

  it('sniper_rifle を装備した攻撃で耐久が 1 減る', () => {
    const weapon = createWeaponInstance('sniper_rifle'); // durability=28
    const state = makeCombatState({ atk: 40, facing: 'up', equippedWeapon: weapon });
    const next = processTurn(state, 'attack');
    expect(next.player!.equippedWeapon?.durability).toBe(27); // 28 - 1
  });

  it('indestructible_armor (8F+): durability=160、攻撃範囲は none', () => {
    const w = createWeaponInstance('indestructible_armor');
    expect(w.durability).toBe(160);
    expect(w.atk).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. 8F〜12F 敵のドロップ
// ---------------------------------------------------------------------------

describe('8F〜12F 敵: ドロップ (gold)', () => {
  const rng05 = () => 0.5;

  it('rust_hound_lv3 はゴールドをドロップする', () => {
    const drops = rollDrops('rust_hound_lv3', 9, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('spark_lv3 はゴールドをドロップする', () => {
    const drops = rollDrops('spark_lv3', 9, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('guard_bot_lv3 はゴールドをドロップする', () => {
    const drops = rollDrops('guard_bot_lv3', 8, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('guard_bot_lv4 はゴールドをドロップする', () => {
    const drops = rollDrops('guard_bot_lv4', 11, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('shield_knight_lv1 はゴールドをドロップする', () => {
    const drops = rollDrops('shield_knight_lv1', 8, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('mine_layer_lv2 はゴールドをドロップする', () => {
    const drops = rollDrops('mine_layer_lv2', 8, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('assault_mecha_lv2 はゴールドをドロップする', () => {
    const drops = rollDrops('assault_mecha_lv2', 9, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('oil_drum_lv2 はゴールドをドロップする（Big Oil Drum の配下）', () => {
    const drops = rollDrops('oil_drum_lv2', 8, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('rust_hound_lv4 (12F) はゴールドをドロップする', () => {
    const drops = rollDrops('rust_hound_lv4', 12, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('spark_lv4 (12F) はゴールドをドロップする', () => {
    const drops = rollDrops('spark_lv4', 12, rng05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
    expect(gold!.amount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. 複数体同時戦闘 (8F〜12F の敵密度)
// ---------------------------------------------------------------------------

describe('8F〜12F 複数敵: 同ターン処理', () => {
  it('Guard Bot Lv.3 と Spark Lv.3 が同時にプレイヤーを攻撃できる', () => {
    // 両敵がプレイヤーに隣接している状態で wait
    const spark = makeEnemy(0, { x: 7, y: 6 }, { hp: 46, atk: 28, def: 2, aiType: 'straight', enemyType: 'spark_lv3' });
    const guard = makeEnemy(1, { x: 7, y: 8 }, { hp: 92, atk: 18, def: 12, aiType: 'straight', enemyType: 'guard_bot_lv3' });
    const state = makeCombatState({ atk: 1, def: 5, facing: 'right' }, [spark, guard]);
    const next = processTurn(state, 'wait');
    // Spark atk=28-def5=23, Guard atk=18-def5=13 → 合計 36 ダメージ
    expect(next.player!.hp).toBe(200 - 23 - 13);
  });

  it('敵を倒すと enemies 配列から除外 (または hp=0)', () => {
    const weakEnemy = makeEnemy(0, ABOVE_PLAYER, { hp: 5, maxHp: 5, def: 0, enemyType: 'slime_x_lv3' });
    const state = makeCombatState({ atk: 20, facing: 'up' }, [weakEnemy]);
    const next = processTurn(state, 'attack');
    const defeated = next.enemies.find((e) => e.id === 0);
    // 倒された敵は hp<=0 または配列から消える
    expect(defeated === undefined || defeated.hp <= 0).toBe(true);
  });
});
