/**
 * @fileoverview ドロップシステムのユニットテスト
 *
 * rollDrops の確率・gold計算・DropResult 型を検証する。
 */

import { describe, it, expect } from 'vitest';
import { rollDrops, rollFloorGold } from '../../src/game/core/drop-system.js';

// ---------------------------------------------------------------------------
// ヘルパー: 固定 RNG
// ---------------------------------------------------------------------------

/** 常に 0 を返す RNG（ドロップ確率0%相当） */
const rngAlways0 = (): number => 0;

/** 常に 0.99 を返す RNG（ドロップ確率最大） */
const rngAlways099 = (): number => 0.99;

/** 常に 0.5 を返す RNG */
const rngAlways05 = (): number => 0.5;

// ---------------------------------------------------------------------------
// rollDrops: gold ドロップ
// ---------------------------------------------------------------------------

describe('rollDrops: gold ドロップ', () => {
  it('戻り値に必ず gold エントリが含まれる', () => {
    const drops = rollDrops('scout_drone', 1, rngAlways05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold).toBeDefined();
  });

  it('gold amount が 0 より大きい', () => {
    const drops = rollDrops('scout_drone', 1, rngAlways05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold!.amount).toBeGreaterThan(0);
  });

  it('gold は enemies.json の goldDrop の ±20% 範囲内', () => {
    // scout_drone の goldDrop = 5
    // range: 5 * 0.8 = 4 〜 5 * 1.2 = 6
    const drops = rollDrops('scout_drone', 1, rngAlways05);
    const gold = drops.find((d) => d.type === 'gold');
    expect(gold!.amount).toBeGreaterThanOrEqual(4);
    expect(gold!.amount).toBeLessThanOrEqual(6);
  });

  it('存在しない enemyId でも gold が返る（0 gold）またはエラーなし', () => {
    expect(() => rollDrops('unknown_enemy', 1, rngAlways05)).not.toThrow();
  });

  it('death_machine（goldDrop=120）の gold が正しい範囲', () => {
    // range: 120 * 0.8 = 96 〜 120 * 1.2 = 144
    const drops = rollDrops('death_machine', 26, rngAlways05);
    const gold = drops.find((d) => d.type === 'gold');
    if (gold) {
      expect(gold.amount).toBeGreaterThanOrEqual(96);
      expect(gold.amount).toBeLessThanOrEqual(144);
    }
  });
});

// ---------------------------------------------------------------------------
// rollDrops: アイテムドロップ率
// ---------------------------------------------------------------------------

describe('rollDrops: アイテムドロップ判定', () => {
  it('rng が常に 0 のとき（drop_rate以下）アイテムがドロップされる', () => {
    // enemy_drop_rate = 0.6: rng=0 < 0.6 なのでドロップあり
    const drops = rollDrops('scout_drone', 1, rngAlways0);
    const nonGold = drops.filter((d) => d.type !== 'gold');
    expect(nonGold.length).toBeGreaterThan(0);
  });

  it('rng が常に 0.99 のとき（drop_rate超）アイテムはドロップされない', () => {
    // rng=0.99 >= 0.6 なのでドロップなし（goldのみ）
    const drops = rollDrops('scout_drone', 1, rngAlways099);
    const nonGold = drops.filter((d) => d.type !== 'gold');
    expect(nonGold).toHaveLength(0);
  });

  it('ドロップ結果の type が weapon / item / tool / gold のいずれか', () => {
    const validTypes = new Set(['weapon', 'item', 'tool', 'gold']);
    const drops = rollDrops('scout_drone', 1, rngAlways05);
    for (const d of drops) {
      expect(validTypes.has(d.type)).toBe(true);
    }
  });

  it('weapon ドロップには id が含まれる', () => {
    // rng=0 でドロップあり、0.0 < 0.3 でカテゴリ weapon
    let callCount = 0;
    const rng = (): number => {
      callCount++;
      // 1回目: gold variance (-20%), 2回目: drop判定(0<0.6), 3回目: カテゴリ選択
      if (callCount === 2) return 0;   // drop確定
      if (callCount === 3) return 0;   // weapon選択
      return 0.5;
    };
    const drops = rollDrops('scout_drone', 1, rng);
    const weaponDrop = drops.find((d) => d.type === 'weapon');
    if (weaponDrop) {
      expect(weaponDrop.id).toBeDefined();
      expect(typeof weaponDrop.id).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// rollFloorGold
// ---------------------------------------------------------------------------

describe('rollFloorGold', () => {
  it('floor 1-5 の gold が 3〜15 の範囲', () => {
    for (let floor = 1; floor <= 5; floor++) {
      const gold = rollFloorGold(floor, rngAlways05);
      expect(gold).toBeGreaterThanOrEqual(3);
      expect(gold).toBeLessThanOrEqual(15);
    }
  });

  it('floor 31 以降の gold が 80〜300 の範囲', () => {
    const gold = rollFloorGold(35, rngAlways05);
    expect(gold).toBeGreaterThanOrEqual(80);
    expect(gold).toBeLessThanOrEqual(300);
  });

  it('高フロアほど gold の下限が高い', () => {
    const goldFloor1 = rollFloorGold(1, rngAlways0);
    const goldFloor31 = rollFloorGold(31, rngAlways0);
    expect(goldFloor31).toBeGreaterThan(goldFloor1);
  });
});
