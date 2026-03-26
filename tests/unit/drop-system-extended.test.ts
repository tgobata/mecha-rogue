/**
 * @fileoverview ドロップシステム P1 拡充テスト
 *
 * 10000 回試行での gold 分布、drop_rate 検証、同一シードでの再現性、
 * フロア番号別 gold の正値保証を検証する。
 */

import { describe, it, expect } from 'vitest';
import { rollDrops, rollFloorGold } from '../../src/game/core/drop-system.js';

// ---------------------------------------------------------------------------
// シード付き簡易 RNG（再現性テスト用）
// ---------------------------------------------------------------------------

/**
 * 線形合同法による疑似乱数生成器。
 * 同じシードを渡すと同じ系列を返す。
 */
function makeSeedRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// 1. 10000 回試行: gold が enemies.json の goldDrop ±20% 範囲に収まること
// ---------------------------------------------------------------------------

describe('ドロップ確率: gold の統計的検証（10000 回）', () => {
  it('scout_drone（goldDrop=5）の 10000 回の gold が全て 4〜6 の範囲', () => {
    const N = 10000;
    // ±20% → 5*0.8=4.0〜5*1.2=6.0, Math.round → 4〜6
    for (let i = 0; i < N; i++) {
      const rng = makeSeedRng(i * 31 + 7);
      const drops = rollDrops('scout_drone_lv1', 1, rng);
      const gold = drops.find((d) => d.type === 'gold');
      expect(gold).toBeDefined();
      expect(gold!.amount).toBeGreaterThanOrEqual(4);
      expect(gold!.amount).toBeLessThanOrEqual(6);
    }
  });

  it('death_machine（goldDrop=120）の 10000 回の gold が全て 96〜144 の範囲', () => {
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const rng = makeSeedRng(i * 13 + 3);
      const drops = rollDrops('death_machine_lv1', 26, rng);
      const gold = drops.find((d) => d.type === 'gold');
      expect(gold).toBeDefined();
      // 96〜144 の範囲
      expect(gold!.amount).toBeGreaterThanOrEqual(96);
      expect(gold!.amount).toBeLessThanOrEqual(144);
    }
  });

  it('guard_bot（goldDrop=12）の 10000 回の gold が全て 10〜15 の範囲', () => {
    // 12*0.8=9.6→10, 12*1.2=14.4→14 だが Math.max(1,…) なのでそのまま
    // 実際: 12*(1 + (rng*0.4-0.2)) → rng=0: 12*0.8=9.6, rng=1: 12*1.2=14.4
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const rng = makeSeedRng(i * 17 + 5);
      const drops = rollDrops('guard_bot_lv1', 2, rng);
      const gold = drops.find((d) => d.type === 'gold');
      expect(gold).toBeDefined();
      expect(gold!.amount).toBeGreaterThanOrEqual(10);
      expect(gold!.amount).toBeLessThanOrEqual(15);
    }
  });

  it('10000 回試行で gold の平均が goldDrop の ±5% 範囲', () => {
    const N = 10000;
    const GOLD_DROP = 5; // scout_drone
    let total = 0;
    for (let i = 0; i < N; i++) {
      const rng = makeSeedRng(i * 23 + 11);
      const drops = rollDrops('scout_drone_lv1', 1, rng);
      const gold = drops.find((d) => d.type === 'gold');
      total += gold!.amount!;
    }
    const avg = total / N;
    expect(avg).toBeGreaterThanOrEqual(GOLD_DROP * 0.95);
    expect(avg).toBeLessThanOrEqual(GOLD_DROP * 1.05);
  });
});

// ---------------------------------------------------------------------------
// 2. drop_rate=0.6 なら 10000 回で 55%〜65% の範囲にアイテムがドロップされること
// ---------------------------------------------------------------------------

describe('ドロップ確率: enemy_drop_rate 統計的検証（10000 回）', () => {
  const EXPECTED_DROP_RATE = 0.6; // drop-tables.json の enemy_drop_rate
  const TOLERANCE = 0.05; // ±5%

  it('10000 回試行でアイテム（非gold）のドロップ率が 55%〜65% の範囲', () => {
    const N = 10000;
    let dropCount = 0;
    for (let i = 0; i < N; i++) {
      const rng = makeSeedRng(i * 41 + 19);
      const drops = rollDrops('scout_drone_lv1', 1, rng);
      const hasItem = drops.some((d) => d.type !== 'gold');
      if (hasItem) dropCount++;
    }
    const dropRate = dropCount / N;
    expect(dropRate).toBeGreaterThanOrEqual(EXPECTED_DROP_RATE - TOLERANCE);
    expect(dropRate).toBeLessThanOrEqual(EXPECTED_DROP_RATE + TOLERANCE);
  });

  it('ドロップありのとき type は weapon/item/tool のいずれか', () => {
    const validTypes = new Set(['weapon', 'item', 'tool']);
    for (let i = 0; i < 1000; i++) {
      const rng = makeSeedRng(i);
      const drops = rollDrops('scout_drone_lv1', 1, rng);
      for (const drop of drops) {
        if (drop.type !== 'gold') {
          expect(validTypes.has(drop.type)).toBe(true);
        }
      }
    }
  });

  it('weapon/item/tool の比率が drop-tables.json の重みに概ね対応している（5000 回）', () => {
    // scout_drone_lv3 のドロップ重み: item x4(合計88), weapon x1(12), tool 0
    // 実際の比率: weapon≈12%, item≈88%, tool=0%
    // appearsFrom=8 なのでフロア8で検証
    const counts = { weapon: 0, item: 0, tool: 0 };
    let itemTotal = 0;
    for (let i = 0; i < 5000; i++) {
      const rng = makeSeedRng(i * 7 + 3);
      const drops = rollDrops('scout_drone_lv3', 8, rng);
      for (const drop of drops) {
        if (drop.type === 'weapon' || drop.type === 'item' || drop.type === 'tool') {
          counts[drop.type]++;
          itemTotal++;
        }
      }
    }
    if (itemTotal > 0) {
      const weaponRate = counts.weapon / itemTotal;
      const itemRate = counts.item / itemTotal;
      // scout_drone_lv3: weapon weight=12/100=12%, item weight=88/100=88%
      expect(weaponRate).toBeGreaterThanOrEqual(0.05);
      expect(weaponRate).toBeLessThanOrEqual(0.25);
      expect(itemRate).toBeGreaterThanOrEqual(0.75);
      expect(itemRate).toBeLessThanOrEqual(0.95);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. 同じシードを渡した場合に同じドロップ結果になること（再現性）
// ---------------------------------------------------------------------------

describe('ドロップ再現性: 同一シードで同一結果', () => {
  it('同じシードの RNG で rollDrops を呼ぶと同じ結果になる', () => {
    const rng1 = makeSeedRng(12345);
    const rng2 = makeSeedRng(12345);
    const result1 = rollDrops('scout_drone_lv1', 1, rng1);
    const result2 = rollDrops('scout_drone_lv1', 1, rng2);
    expect(result1).toEqual(result2);
  });

  it('異なるシードでは異なる結果になることが多い（100 回試行）', () => {
    let sameCount = 0;
    const N = 100;
    for (let i = 0; i < N; i++) {
      const rng1 = makeSeedRng(i * 1000);
      const rng2 = makeSeedRng(i * 1000 + 1);
      const r1 = rollDrops('scout_drone_lv1', 1, rng1);
      const r2 = rollDrops('scout_drone_lv1', 1, rng2);
      if (JSON.stringify(r1) === JSON.stringify(r2)) sameCount++;
    }
    // 偶然一致する確率は低い（gold だけなら近い値になりやすいが、gold ±20% の範囲が狭いため完全一致も起こる）
    // 少なくとも 50% は異なるはず
    expect(sameCount).toBeLessThan(N * 0.5);
  });

  it('同一シードで rollFloorGold も再現性がある', () => {
    const rng1 = makeSeedRng(99999);
    const rng2 = makeSeedRng(99999);
    const g1 = rollFloorGold(1, rng1);
    const g2 = rollFloorGold(1, rng2);
    expect(g1).toBe(g2);
  });

  it('シードが違うと rollFloorGold の結果が全て同じにはならない（広いフロアで検証）', () => {
    // floor=31: 値域 80〜300 で値が多様になる
    const N = 100;
    const values = new Set<number>();
    for (let i = 0; i < N; i++) {
      const g = rollFloorGold(31, makeSeedRng(i * 500));
      values.add(g);
    }
    // 100回試行で少なくとも 5 種類以上の値が出るはず（値域=80〜300=221通り）
    expect(values.size).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 4. フロア番号が変わっても gold が正の値であること
// ---------------------------------------------------------------------------

describe('フロア別 gold は常に正値', () => {
  const testFloors = [1, 2, 5, 6, 10, 11, 20, 21, 30, 31, 35, 40, 50];

  for (const floor of testFloors) {
    it(`floor=${floor} でも gold > 0 (rollFloorGold)`, () => {
      for (let i = 0; i < 100; i++) {
        const rng = makeSeedRng(i * floor);
        const gold = rollFloorGold(floor, rng);
        expect(gold).toBeGreaterThan(0);
      }
    });
  }

  it('全フロア帯で rollDrops の gold amount > 0', () => {
    const floors = [1, 5, 6, 10, 11, 20, 21, 30, 31, 40];
    for (const floor of floors) {
      const rng = makeSeedRng(floor * 137);
      const drops = rollDrops('scout_drone_lv1', floor, rng);
      const gold = drops.find((d) => d.type === 'gold');
      expect(gold).toBeDefined();
      expect(gold!.amount).toBeGreaterThan(0);
    }
  });

  it('高フロアほど rollFloorGold の期待値が高い（1F < 11F < 31F）', () => {
    const N = 1000;
    let sum1 = 0, sum11 = 0, sum31 = 0;
    for (let i = 0; i < N; i++) {
      const rng1 = makeSeedRng(i);
      const rng11 = makeSeedRng(i + N);
      const rng31 = makeSeedRng(i + N * 2);
      sum1 += rollFloorGold(1, rng1);
      sum11 += rollFloorGold(11, rng11);
      sum31 += rollFloorGold(31, rng31);
    }
    expect(sum11 / N).toBeGreaterThan(sum1 / N);
    expect(sum31 / N).toBeGreaterThan(sum11 / N);
  });
});
