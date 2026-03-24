/**
 * @fileoverview renderer ロジックのユニットテスト
 *
 * Canvas API は jsdom では動作しないため、描画関数そのものはテストしない。
 * renderer.ts の純粋ロジック部分（getDefaultSpriteList, Viewport 計算）を検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultSpriteList,
} from '../../src/game/systems/renderer.js';

// ---------------------------------------------------------------------------
// 1. getDefaultSpriteList が正しいキーと URL のペアを返すこと
// ---------------------------------------------------------------------------

describe('getDefaultSpriteList', () => {
  it('配列を返す', () => {
    const list = getDefaultSpriteList();
    expect(Array.isArray(list)).toBe(true);
  });

  it('少なくとも 1 件以上のスプライトを含む', () => {
    const list = getDefaultSpriteList();
    expect(list.length).toBeGreaterThan(0);
  });

  it('各エントリは [name: string, url: string] のタプル', () => {
    const list = getDefaultSpriteList();
    for (const entry of list) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry).toHaveLength(2);
      expect(typeof entry[0]).toBe('string');
      expect(typeof entry[1]).toBe('string');
    }
  });

  it('tile_wall のエントリは含まれない（デフォルト色を使用するため）', () => {
    const list = getDefaultSpriteList();
    const tileWall = list.find(([name]) => name === 'tile_wall');
    expect(tileWall).toBeUndefined();
  });

  it('tile_floor のエントリは含まれない（デフォルト色を使用するため）', () => {
    const list = getDefaultSpriteList();
    const tileFloor = list.find(([name]) => name === 'tile_floor');
    expect(tileFloor).toBeUndefined();
  });

  it('tile_stairs のエントリが含まれる', () => {
    const list = getDefaultSpriteList();
    const tileStairs = list.find(([name]) => name === 'tile_stairs');
    expect(tileStairs).toBeDefined();
    expect(tileStairs![1]).toContain('stairs');
  });

  it('player スプライトのエントリが含まれる', () => {
    const list = getDefaultSpriteList();
    const playerSprites = list.filter(([name]) => name.startsWith('player_'));
    expect(playerSprites.length).toBeGreaterThan(0);
  });

  it('URL は /sprites/ パスから始まる', () => {
    const list = getDefaultSpriteList();
    for (const [, url] of list) {
      expect(url.startsWith('/sprites/')).toBe(true);
    }
  });

  it('URL は .png で終わる', () => {
    const list = getDefaultSpriteList();
    for (const [, url] of list) {
      expect(url.endsWith('.png')).toBe(true);
    }
  });

  it('スプライト名が重複していない', () => {
    const list = getDefaultSpriteList();
    const names = list.map(([name]) => name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('scout_drone_0 / scout_drone_1 のエントリが含まれる', () => {
    const list = getDefaultSpriteList();
    const s0 = list.find(([name]) => name === 'scout_drone_0');
    const s1 = list.find(([name]) => name === 'scout_drone_1');
    expect(s0).toBeDefined();
    expect(s1).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Viewport 計算ロジックの検証（純粋関数として抽出して検証）
// ---------------------------------------------------------------------------

/**
 * renderer.ts 内の startTileX / startTileY 計算ロジックを
 * 純粋関数として再現してテストする。
 *
 * 実際の計算:
 *   halfX = Math.floor(tilesX / 2)
 *   startTileX = centerX - halfX
 */
function calcStartTileX(centerX: number, tilesX: number): number {
  const halfX = Math.floor(tilesX / 2);
  return centerX - halfX;
}

function calcStartTileY(centerY: number, tilesY: number): number {
  const halfY = Math.floor(tilesY / 2);
  return centerY - halfY;
}

describe('Viewport 計算: startTileX / startTileY', () => {
  it('centerX=10, tilesX=15 のとき startTileX = 10 - 7 = 3', () => {
    // halfX = floor(15/2) = 7
    const startTileX = calcStartTileX(10, 15);
    expect(startTileX).toBe(3);
  });

  it('centerX=0, tilesX=15 のとき startTileX = 0 - 7 = -7（負値も正しく計算）', () => {
    const startTileX = calcStartTileX(0, 15);
    expect(startTileX).toBe(-7);
  });

  it('centerX=5, tilesX=11 のとき startTileX = 5 - 5 = 0', () => {
    // halfX = floor(11/2) = 5
    const startTileX = calcStartTileX(5, 11);
    expect(startTileX).toBe(0);
  });

  it('centerY=10, tilesY=15 のとき startTileY = 10 - 7 = 3', () => {
    const startTileY = calcStartTileY(10, 15);
    expect(startTileY).toBe(3);
  });

  it('tilesX が偶数のとき halfX = tilesX/2 - 0.5 を切り捨て', () => {
    // tilesX=14: halfX = floor(14/2) = 7
    const startTileX = calcStartTileX(10, 14);
    expect(startTileX).toBe(3); // 10 - 7 = 3
  });

  it('tilesX=1 のとき startTileX = centerX（最小タイル数）', () => {
    // halfX = floor(1/2) = 0
    const startTileX = calcStartTileX(5, 1);
    expect(startTileX).toBe(5);
  });

  it('プレイヤー(centerX)は startTileX から halfX タイル目に位置する', () => {
    const centerX = 10;
    const tilesX = 15;
    const halfX = Math.floor(tilesX / 2);
    const startTileX = calcStartTileX(centerX, tilesX);
    // プレイヤーのスクリーン座標 = centerX - startTileX = halfX
    expect(centerX - startTileX).toBe(halfX);
  });

  it('startTileX + halfX = centerX', () => {
    const centerX = 8;
    const tilesX = 13;
    const halfX = Math.floor(tilesX / 2);
    const startTileX = calcStartTileX(centerX, tilesX);
    expect(startTileX + halfX).toBe(centerX);
  });
});

// ---------------------------------------------------------------------------
// 3. スプライトリストの整合性確認
// ---------------------------------------------------------------------------

describe('getDefaultSpriteList: スプライトリスト整合性', () => {
  it('階段(stairs)などのタイルスプライトが含まれる', () => {
    const list = getDefaultSpriteList();
    const names = new Set(list.map(([name]) => name));
    expect(names.has('tile_stairs')).toBe(true);
  });

  it('プレイヤースプライトがアニメーション 2 フレーム分ある（idle_0, idle_1）', () => {
    const list = getDefaultSpriteList();
    const names = new Set(list.map(([name]) => name));
    expect(names.has('player_idle_0')).toBe(true);
    expect(names.has('player_idle_1')).toBe(true);
  });

  it('敵スプライトが 0 フレーム目と 1 フレーム目のペアで存在する', () => {
    const list = getDefaultSpriteList();
    const enemySprites = list.filter(([name]) => name.match(/_(0|1)$/) && !name.startsWith('player_') && !name.startsWith('tile_'));
    // 偶数個（ペアになっている）
    expect(enemySprites.length % 2).toBe(0);
    expect(enemySprites.length).toBeGreaterThan(0);
  });
});
