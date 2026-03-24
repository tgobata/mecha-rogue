/**
 * @fileoverview 状態異常システムのユニットテスト
 *
 * 全7状態異常（frozen/shocked/burning/oiled/stunned/shielded/regen）の
 * 付与・継続・解除・組み合わせを検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  applyStatusEffects,
  canAct,
  isShockedSkip,
  absorbWithShield,
  applyWeaponSpecial,
  addStatusEffect,
} from '../../src/game/core/status-effects.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import { createWeaponInstance } from '../../src/game/core/weapon-system.js';
import type { Player, Enemy, StatusEffect } from '../../src/game/core/game-state.js';
import type { Floor, Cell } from '../../src/game/core/types.js';
import { TILE_FLOOR, TILE_WALL } from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeFloor(): Floor {
  const w = 5; const h = 5;
  const cells: Cell[][] = [];
  for (let y = 0; y < h; y++) {
    cells[y] = [];
    for (let x = 0; x < w; x++) {
      const e = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      cells[y][x] = { tile: e ? TILE_WALL : TILE_FLOOR, isVisible: false, isExplored: false };
    }
  }
  return { floorNumber: 1, width: w, height: h, cells, rooms: [], startPos: { x: 2, y: 2 }, stairsPos: { x: 3, y: 3 }, seed: 0 };
}

function makePlayer(effects: StatusEffect[] = []): Player {
  return { pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, atk: 8, def: 5, facing: 'down', statusEffects: effects };
}

function makeEnemy(effects: StatusEffect[] = []): Enemy {
  return { id: 0, enemyType: 'test', pos: { x: 3, y: 2 }, hp: 50, maxHp: 50, atk: 5, def: 0, expReward: 10, aiType: 'straight', facing: 'down', statusEffects: effects };
}

const dummyState = { ...createInitialGameState(), map: makeFloor() };

// ---------------------------------------------------------------------------
// burning（炎上）
// ---------------------------------------------------------------------------

describe('status: burning（炎上）', () => {
  it('毎ターン magnitude ダメージを受ける', () => {
    const player = makePlayer([{ type: 'burning', remainingTurns: 3, magnitude: 5 }]);
    const { entity, damageDealt } = applyStatusEffects(player, dummyState);
    expect(damageDealt).toBe(5);
    expect(entity.hp).toBe(95);
  });

  it('remainingTurns が 1 のとき適用後に解除される', () => {
    const player = makePlayer([{ type: 'burning', remainingTurns: 1, magnitude: 3 }]);
    const { entity } = applyStatusEffects(player, dummyState);
    expect(entity.statusEffects).toHaveLength(0);
  });

  it('remainingTurns が 2 以上なら継続する', () => {
    const player = makePlayer([{ type: 'burning', remainingTurns: 2, magnitude: 3 }]);
    const { entity } = applyStatusEffects(player, dummyState);
    expect(entity.statusEffects![0].remainingTurns).toBe(1);
  });

  it('oiled が付与されているとダメージが 1.5 倍になる', () => {
    const player = makePlayer([
      { type: 'burning', remainingTurns: 2, magnitude: 10 },
      { type: 'oiled',   remainingTurns: 3 },
    ]);
    const { damageDealt } = applyStatusEffects(player, dummyState);
    expect(damageDealt).toBe(15); // 10 * 1.5
  });
});

// ---------------------------------------------------------------------------
// frozen（凍結）
// ---------------------------------------------------------------------------

describe('status: frozen（凍結）', () => {
  it('canAct が false を返す', () => {
    const player = makePlayer([{ type: 'frozen', remainingTurns: 2 }]);
    expect(canAct(player)).toBe(false);
  });

  it('frozen でない場合は canAct が true を返す', () => {
    const player = makePlayer([]);
    expect(canAct(player)).toBe(true);
  });

  it('remainingTurns が 1 のターン後に解除される', () => {
    const player = makePlayer([{ type: 'frozen', remainingTurns: 1 }]);
    const { entity } = applyStatusEffects(player, dummyState);
    expect(entity.statusEffects).toHaveLength(0);
  });

  it('凍結中は HP ダメージが発生しない', () => {
    const player = makePlayer([{ type: 'frozen', remainingTurns: 2 }]);
    const { damageDealt } = applyStatusEffects(player, dummyState);
    expect(damageDealt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// stunned（スタン）
// ---------------------------------------------------------------------------

describe('status: stunned（スタン）', () => {
  it('canAct が false を返す', () => {
    const player = makePlayer([{ type: 'stunned', remainingTurns: 1 }]);
    expect(canAct(player)).toBe(false);
  });

  it('1ターン後に解除される', () => {
    const player = makePlayer([{ type: 'stunned', remainingTurns: 1 }]);
    const { entity } = applyStatusEffects(player, dummyState);
    expect(entity.statusEffects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// shocked（感電）
// ---------------------------------------------------------------------------

describe('status: shocked（感電）', () => {
  it('毎ターン magnitude ダメージを受ける', () => {
    const player = makePlayer([{ type: 'shocked', remainingTurns: 3, magnitude: 2 }]);
    const { damageDealt } = applyStatusEffects(player, dummyState);
    expect(damageDealt).toBe(2);
  });

  it('isShockedSkip が偶数 remainingTurns のとき true を返す', () => {
    const player = makePlayer([{ type: 'shocked', remainingTurns: 2 }]);
    expect(isShockedSkip(player)).toBe(true);
  });

  it('isShockedSkip が奇数 remainingTurns のとき false を返す', () => {
    const player = makePlayer([{ type: 'shocked', remainingTurns: 3 }]);
    expect(isShockedSkip(player)).toBe(false);
  });

  it('shocked がない場合は isShockedSkip が false', () => {
    const player = makePlayer([]);
    expect(isShockedSkip(player)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// oiled（オイル）
// ---------------------------------------------------------------------------

describe('status: oiled（オイル）', () => {
  it('それ自体はダメージを与えない', () => {
    const player = makePlayer([{ type: 'oiled', remainingTurns: 3 }]);
    const { damageDealt } = applyStatusEffects(player, dummyState);
    expect(damageDealt).toBe(0);
  });

  it('burning と組み合わせるとダメージが 1.5 倍', () => {
    const player = makePlayer([
      { type: 'oiled',   remainingTurns: 2 },
      { type: 'burning', remainingTurns: 2, magnitude: 4 },
    ]);
    const { damageDealt } = applyStatusEffects(player, dummyState);
    expect(damageDealt).toBe(6); // 4 * 1.5
  });
});

// ---------------------------------------------------------------------------
// shielded（シールド）
// ---------------------------------------------------------------------------

describe('status: shielded（シールド）', () => {
  it('ダメージをシールド量まで吸収する', () => {
    const player = makePlayer([{ type: 'shielded', remainingTurns: 3, magnitude: 10 }]);
    const { finalDamage, updatedEntity } = absorbWithShield(player, 8);
    expect(finalDamage).toBe(0); // 8 <= 10 なので全吸収
    expect(updatedEntity.statusEffects![0].magnitude).toBe(2); // 10 - 8
  });

  it('シールドを超えるダメージは残りが通る', () => {
    const player = makePlayer([{ type: 'shielded', remainingTurns: 3, magnitude: 5 }]);
    const { finalDamage } = absorbWithShield(player, 12);
    expect(finalDamage).toBe(7); // 12 - 5
  });

  it('シールドが全吸収されると statusEffects から除去される', () => {
    const player = makePlayer([{ type: 'shielded', remainingTurns: 3, magnitude: 5 }]);
    const { updatedEntity } = absorbWithShield(player, 5);
    const hasShield = updatedEntity.statusEffects!.some((e) => e.type === 'shielded');
    expect(hasShield).toBe(false);
  });

  it('シールドがない場合は originalDamage をそのまま返す', () => {
    const player = makePlayer([]);
    const { finalDamage } = absorbWithShield(player, 10);
    expect(finalDamage).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// regen（修復）
// ---------------------------------------------------------------------------

describe('status: regen（修復）', () => {
  it('毎ターン magnitude HP 回復する', () => {
    const player = makePlayer([{ type: 'regen', remainingTurns: 3, magnitude: 5 }]);
    const damaged = { ...player, hp: 80 };
    const { entity } = applyStatusEffects(damaged, dummyState);
    expect(entity.hp).toBe(85);
  });

  it('maxHp を超えて回復しない', () => {
    const player = makePlayer([{ type: 'regen', remainingTurns: 2, magnitude: 20 }]);
    // hp=95, maxHp=100 → 100まで回復
    const nearFull = { ...player, hp: 95 };
    const { entity } = applyStatusEffects(nearFull, dummyState);
    expect(entity.hp).toBe(100);
  });

  it('1ターンで解除される', () => {
    const player = makePlayer([{ type: 'regen', remainingTurns: 1, magnitude: 5 }]);
    const { entity } = applyStatusEffects(player, dummyState);
    expect(entity.statusEffects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addStatusEffect
// ---------------------------------------------------------------------------

describe('addStatusEffect', () => {
  it('新しい状態異常を追加する', () => {
    const player = makePlayer([]);
    const updated = addStatusEffect(player, { type: 'burning', remainingTurns: 3 });
    expect(updated.statusEffects).toHaveLength(1);
    expect(updated.statusEffects![0].type).toBe('burning');
  });

  it('同じ種別がある場合、remainingTurns が長い方で上書きする', () => {
    const player = makePlayer([{ type: 'frozen', remainingTurns: 1 }]);
    const updated = addStatusEffect(player, { type: 'frozen', remainingTurns: 3 });
    expect(updated.statusEffects).toHaveLength(1);
    expect(updated.statusEffects![0].remainingTurns).toBe(3);
  });

  it('同じ種別で remainingTurns が短い場合は上書きしない', () => {
    const player = makePlayer([{ type: 'frozen', remainingTurns: 5 }]);
    const updated = addStatusEffect(player, { type: 'frozen', remainingTurns: 2 });
    expect(updated.statusEffects![0].remainingTurns).toBe(5);
  });

  it('元のエンティティは変更されない（immutable）', () => {
    const player = makePlayer([]);
    addStatusEffect(player, { type: 'burning', remainingTurns: 3 });
    expect(player.statusEffects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyWeaponSpecial
// ---------------------------------------------------------------------------

describe('applyWeaponSpecial', () => {
  it('freeze_ray は frozen StatusEffect を返す', () => {
    const w = createWeaponInstance('freeze_ray');
    const effect = applyWeaponSpecial(w);
    expect(effect).not.toBeNull();
    expect(effect!.type).toBe('frozen');
    expect(effect!.remainingTurns).toBeGreaterThan(0);
  });

  it('emp_pulse は stunned StatusEffect を返す', () => {
    const w = createWeaponInstance('emp_pulse');
    const effect = applyWeaponSpecial(w);
    expect(effect).not.toBeNull();
    expect(effect!.type).toBe('stunned');
  });

  it('special が null の武器は null を返す', () => {
    const w = createWeaponInstance('blade_arm'); // special=null
    const effect = applyWeaponSpecial(w);
    expect(effect).toBeNull();
  });

  it('対象外の special は null を返す', () => {
    const w = createWeaponInstance('machine_gun'); // special=double_shot
    const effect = applyWeaponSpecial(w);
    expect(effect).toBeNull();
  });
});
