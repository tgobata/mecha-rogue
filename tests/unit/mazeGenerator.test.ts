/**
 * @fileoverview mazeGenerator / floorUtils / constants の単体テスト
 */

import { describe, it, expect } from 'vitest';
import { generateFloor, validateFloor } from '../../src/game/core/maze-generator.js';
import {
  getMapSize,
  getTileAt,
  isWalkable,
  isDestructible,
  posEqual,
  manhattanDistance,
  getNeighbors4,
} from '../../src/game/core/floorUtils.js';
import {
  TILE_FLOOR,
  TILE_WALL,
  TILE_STAIRS_DOWN,
  TILE_START,
  TILE_CRACKED_WALL,
  FLOOR_SIZES,
} from '../../src/game/core/constants.js';
import { RoomType } from '../../src/game/core/types.js';

// ---------------------------------------------------------------------------
// getMapSize
// ---------------------------------------------------------------------------
describe('getMapSize', () => {
  it('1〜5階は 30x30 を返す', () => {
    expect(getMapSize(1)).toEqual({ width: 30, height: 30 });
    expect(getMapSize(5)).toEqual({ width: 30, height: 30 });
  });

  it('6〜10階は 35x35 を返す', () => {
    expect(getMapSize(6)).toEqual({ width: 35, height: 35 });
    expect(getMapSize(10)).toEqual({ width: 35, height: 35 });
  });

  it('11〜20階は 40x40 を返す', () => {
    expect(getMapSize(15)).toEqual({ width: 40, height: 40 });
  });

  it('21〜30階は 48x48 を返す', () => {
    expect(getMapSize(25)).toEqual({ width: 48, height: 48 });
  });

  it('31階以降は 55x55 を返す', () => {
    expect(getMapSize(31)).toEqual({ width: 55, height: 55 });
    expect(getMapSize(99)).toEqual({ width: 55, height: 55 });
  });
});

// ---------------------------------------------------------------------------
// isWalkable / isDestructible
// ---------------------------------------------------------------------------
describe('isWalkable', () => {
  it('TILE_FLOOR は移動可能', () => {
    expect(isWalkable(TILE_FLOOR)).toBe(true);
  });

  it('TILE_WALL は移動不可', () => {
    expect(isWalkable(TILE_WALL)).toBe(false);
  });

  it('TILE_STAIRS_DOWN は移動可能', () => {
    expect(isWalkable(TILE_STAIRS_DOWN)).toBe(true);
  });

  it('TILE_START は移動可能', () => {
    expect(isWalkable(TILE_START)).toBe(true);
  });
});

describe('isDestructible', () => {
  it('TILE_CRACKED_WALL は破壊可能', () => {
    expect(isDestructible(TILE_CRACKED_WALL)).toBe(true);
  });

  it('TILE_WALL は破壊不可', () => {
    expect(isDestructible(TILE_WALL)).toBe(false);
  });

  it('TILE_FLOOR は破壊不可', () => {
    expect(isDestructible(TILE_FLOOR)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// posEqual / manhattanDistance / getNeighbors4
// ---------------------------------------------------------------------------
describe('posEqual', () => {
  it('同じ座標は true', () => {
    expect(posEqual({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(true);
  });

  it('異なる座標は false', () => {
    expect(posEqual({ x: 3, y: 4 }, { x: 3, y: 5 })).toBe(false);
  });
});

describe('manhattanDistance', () => {
  it('原点から (3,4) の距離は 7', () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
  });

  it('同じ座標の距離は 0', () => {
    expect(manhattanDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
});

describe('getNeighbors4', () => {
  it('(2,2) の隣接は上下左右の4マス', () => {
    const neighbors = getNeighbors4({ x: 2, y: 2 });
    expect(neighbors).toHaveLength(4);
    expect(neighbors).toContainEqual({ x: 2, y: 1 });
    expect(neighbors).toContainEqual({ x: 2, y: 3 });
    expect(neighbors).toContainEqual({ x: 1, y: 2 });
    expect(neighbors).toContainEqual({ x: 3, y: 2 });
  });
});

// シードを固定して再現性を確保（全 describe ブロックで共有）
const SEED = 12345;

// ---------------------------------------------------------------------------
// generateFloor: 基本構造の検証
// ---------------------------------------------------------------------------
describe('generateFloor', () => {

  it('1階: マップサイズが 30x30 になる', () => {
    const floor = generateFloor(1, SEED);
    expect(floor.width).toBe(30);
    expect(floor.height).toBe(30);
    expect(floor.cells.length).toBe(30);
    expect(floor.cells[0].length).toBe(30);
  });

  it('6階: マップサイズが 35x35 になる', () => {
    const floor = generateFloor(6, SEED);
    expect(floor.width).toBe(35);
    expect(floor.height).toBe(35);
  });

  it('floorNumber が正しく記録される', () => {
    const floor = generateFloor(3, SEED);
    expect(floor.floorNumber).toBe(3);
  });

  it('seed が記録される', () => {
    const floor = generateFloor(1, SEED);
    expect(floor.seed).toBe(SEED);
  });

  it('startPos が移動可能タイル上にある', () => {
    const floor = generateFloor(1, SEED);
    const tile = getTileAt(floor, floor.startPos);
    expect(isWalkable(tile)).toBe(true);
  });

  it('stairsPos が移動可能タイル上にある', () => {
    const floor = generateFloor(1, SEED);
    const tile = getTileAt(floor, floor.stairsPos);
    expect(isWalkable(tile)).toBe(true);
  });

  it('startPos に TILE_START がセットされている', () => {
    const floor = generateFloor(1, SEED);
    const tile = getTileAt(floor, floor.startPos);
    expect(tile).toBe(TILE_START);
  });

  it('stairsPos に TILE_STAIRS_DOWN がセットされている', () => {
    const floor = generateFloor(1, SEED);
    const tile = getTileAt(floor, floor.stairsPos);
    expect(tile).toBe(TILE_STAIRS_DOWN);
  });

  it('rooms が1つ以上存在する', () => {
    const floor = generateFloor(1, SEED);
    expect(floor.rooms.length).toBeGreaterThan(0);
  });

  it('外周が全て壁になっている', () => {
    const floor = generateFloor(1, SEED);
    for (let x = 0; x < floor.width; x++) {
      expect(floor.cells[0][x].tile).toBe(TILE_WALL);
      expect(floor.cells[floor.height - 1][x].tile).toBe(TILE_WALL);
    }
    for (let y = 0; y < floor.height; y++) {
      expect(floor.cells[y][0].tile).toBe(TILE_WALL);
      expect(floor.cells[y][floor.width - 1].tile).toBe(TILE_WALL);
    }
  });

  it('全タイルが isVisible=false, isExplored=false で初期化されている', () => {
    const floor = generateFloor(1, SEED);
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        expect(floor.cells[y][x].isVisible).toBe(false);
        expect(floor.cells[y][x].isExplored).toBe(false);
      }
    }
  });

  it('同じシードで同じフロアが生成される（再現性）', () => {
    const floor1 = generateFloor(1, SEED);
    const floor2 = generateFloor(1, SEED);
    // 全タイルが一致するか確認
    let identical = true;
    for (let y = 0; y < floor1.height && identical; y++) {
      for (let x = 0; x < floor1.width && identical; x++) {
        if (floor1.cells[y][x].tile !== floor2.cells[y][x].tile) {
          identical = false;
        }
      }
    }
    expect(identical).toBe(true);
  });

  it('シードが違えば異なるフロアが生成される', () => {
    const floor1 = generateFloor(1, 1);
    const floor2 = generateFloor(1, 99999);
    let different = false;
    for (let y = 0; y < floor1.height && !different; y++) {
      for (let x = 0; x < floor1.width && !different; x++) {
        if (floor1.cells[y][x].tile !== floor2.cells[y][x].tile) {
          different = true;
        }
      }
    }
    expect(different).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateFloor: BFS到達可能性
// ---------------------------------------------------------------------------
describe('validateFloor', () => {
  it('generateFloor が返すフロアは validateFloor を通過する', () => {
    for (let f = 1; f <= 35; f += 5) {
      const floor = generateFloor(f, f * 1000);
      expect(validateFloor(floor)).toBe(true);
    }
  });

  it('孤立した通路がある場合は false を返す', () => {
    // 1階フロアを生成してから人工的に孤立通路を作る
    const floor = generateFloor(1, 42);
    // マップ右下隅の内側に孤立した FLOOR を強制セット
    // （外周から2マス内側、壁に囲まれた位置）
    const isoX = floor.width - 3;
    const isoY = floor.height - 3;
    // 孤立させるために周囲を壁にする
    floor.cells[isoY][isoX].tile = TILE_FLOOR;
    floor.cells[isoY - 1][isoX].tile = TILE_WALL;
    floor.cells[isoY + 1][isoX].tile = TILE_WALL;
    floor.cells[isoY][isoX - 1].tile = TILE_WALL;
    floor.cells[isoY][isoX + 1].tile = TILE_WALL;
    // 階段も元の位置から別の場所へ（孤立セルの影響を排除）
    // 孤立セルが startPos でも stairsPos でもないことを確認してから評価
    if (
      !(isoX === floor.startPos.x && isoY === floor.startPos.y) &&
      !(isoX === floor.stairsPos.x && isoY === floor.stairsPos.y)
    ) {
      expect(validateFloor(floor)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// ボス部屋: 5の倍数階に BOSS タイプの部屋が1つ含まれる
// ---------------------------------------------------------------------------
describe('ボス部屋', () => {
  it('5階にはボス部屋が存在する', () => {
    const floor = generateFloor(5, SEED);
    const bossRooms = floor.rooms.filter((r) => r.type === RoomType.BOSS);
    expect(bossRooms.length).toBeGreaterThanOrEqual(1);
  });

  it('10階にはボス部屋が存在する', () => {
    const floor = generateFloor(10, SEED);
    const bossRooms = floor.rooms.filter((r) => r.type === RoomType.BOSS);
    expect(bossRooms.length).toBeGreaterThanOrEqual(1);
  });

  it('3階にはボス部屋が存在しない', () => {
    const floor = generateFloor(3, SEED);
    const bossRooms = floor.rooms.filter((r) => r.type === RoomType.BOSS);
    expect(bossRooms.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getTileAt: 範囲外は壁を返す
// ---------------------------------------------------------------------------
describe('getTileAt', () => {
  it('範囲外座標は TILE_WALL を返す', () => {
    const floor = generateFloor(1, SEED);
    expect(getTileAt(floor, { x: -1, y: 0 })).toBe(TILE_WALL);
    expect(getTileAt(floor, { x: 0, y: -1 })).toBe(TILE_WALL);
    expect(getTileAt(floor, { x: floor.width, y: 0 })).toBe(TILE_WALL);
    expect(getTileAt(floor, { x: 0, y: floor.height })).toBe(TILE_WALL);
  });
});
