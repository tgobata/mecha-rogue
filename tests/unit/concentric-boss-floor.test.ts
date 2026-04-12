import { describe, test, expect } from 'vitest';
import { generateFloor, validateFloor } from '../../src/game/core/maze-generator.js';
import { getTileAt, isWalkable } from '../../src/game/core/floorUtils.js';
import { TILE_STAIRS_DOWN } from '../../src/game/core/constants.js';

const BOSS_FLOORS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

describe('同心円ボスフロア（5の倍数階）', () => {
  test('全ボス階で validateFloor が通る（各3シード）', { timeout: 60_000 }, () => {
    for (const f of BOSS_FLOORS) {
      for (let seed = 0; seed < 3; seed++) {
        const floor = generateFloor(f, seed);
        expect(validateFloor(floor), `${f}階 seed${seed}: validateFloor`).toBe(true);
      }
    }
  });

  test('stairsPos が TILE_STAIRS_DOWN', { timeout: 30_000 }, () => {
    for (const f of BOSS_FLOORS) {
      for (let seed = 0; seed < 3; seed++) {
        const floor = generateFloor(f, seed);
        expect(getTileAt(floor, floor.stairsPos), `${f}階 seed${seed}: stairs`).toBe(TILE_STAIRS_DOWN);
      }
    }
  });

  test('startPos が移動可能タイル', { timeout: 30_000 }, () => {
    for (const f of BOSS_FLOORS) {
      for (let seed = 0; seed < 3; seed++) {
        const floor = generateFloor(f, seed);
        expect(
          isWalkable(getTileAt(floor, floor.startPos)),
          `${f}階 seed${seed}: start walkable`,
        ).toBe(true);
      }
    }
  });

  test('ボス階のマップは同階帯の通常フロア以上の幅', () => {
    // floor 5 → compare with floor 4 (same size band)
    // floor 10 → compare with floor 9
    for (const f of BOSS_FLOORS) {
      const bossFloor   = generateFloor(f, 0);
      const normalFloor = generateFloor(f - 1, 0);
      expect(bossFloor.width, `${f}階: bossFloor.width >= normalFloor.width`)
        .toBeGreaterThanOrEqual(normalFloor.width);
    }
  });
});
