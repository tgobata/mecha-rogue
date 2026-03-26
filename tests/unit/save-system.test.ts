import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  saveGame,
  loadGame,
  deleteSave,
  hasSave,
  getAllSaves,
} from '../../src/game/core/save-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import { SAVE_KEY_PREFIX, MAX_SAVE_SLOTS } from '../../src/game/core/constants.js';

// localStorage と window の手動モック
const localStorageMock = (function() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() { return Object.keys(store).length; }
  };
})();

// global.window を定義して save-system.ts の isStorageAvailable() をパスさせる
if (typeof (global as any).window === 'undefined') {
  (global as any).window = global;
}
(global as any).localStorage = localStorageMock;
(window as any).localStorage = localStorageMock;

describe('セーブ・ロードシステム (save-system) - マルチスロット対応', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('初期状態では slot 1-5 すべてで hasSave() は false を返す', () => {
    for (let i = 1; i <= MAX_SAVE_SLOTS; i++) {
      expect(hasSave(i)).toBe(false);
    }
  });

  it('範囲外のスロット指定は無視されるか、常に false/null を返す', () => {
    const state = createInitialGameState();
    saveGame(state, 0);
    saveGame(state, 6);
    expect(hasSave(0)).toBe(false);
    expect(hasSave(6)).toBe(false);
    expect(loadGame(0)).toBeNull();
    expect(loadGame(6)).toBeNull();
  });

  it('特定のスロットにセーブすると、そのスロットのみ hasSave() が true になる', () => {
    const state = createInitialGameState();
    saveGame(state, 3);
    expect(hasSave(3)).toBe(true);
    expect(hasSave(1)).toBe(false);
    expect(hasSave(5)).toBe(false);
  });

  it('loadGame(slot) で保存したスロットの state を復元できる', () => {
    const state2 = createInitialGameState();
    state2.inventory.gold = 2222;
    saveGame(state2, 2);

    const state4 = createInitialGameState();
    state4.inventory.gold = 4444;
    saveGame(state4, 4);

    const loaded2 = loadGame(2);
    const loaded4 = loadGame(4);

    expect(loaded2).not.toBeNull();
    expect(loaded2!.gameState.inventory.gold).toBe(2222);
    expect(loaded4).not.toBeNull();
    expect(loaded4!.gameState.inventory.gold).toBe(4444);
  });

  it('getAllSaves() で全スロットのサマリーを一括取得できる', () => {
    const state = createInitialGameState();
    state.pilot.level = 10;
    saveGame(state, 1);
    saveGame(state, 5);

    const summaries = getAllSaves();
    expect(summaries.length).toBe(MAX_SAVE_SLOTS);
    expect(summaries[0]).not.toBeNull(); // Slot 1
    expect(summaries[0]!.level).toBe(10); // サマリーからレベルが取れる
    expect(summaries[1]).toBeNull();     // Slot 2
    expect(summaries[4]).not.toBeNull(); // Slot 5
  });

  it('saveGame() がメインデータとサマリーデータの両方を保存する', () => {
    const state = createInitialGameState();
    saveGame(state, 1);
    
    const mainKey = `${SAVE_KEY_PREFIX}1`;
    const summaryKey = `${SAVE_KEY_PREFIX}1_summary`;
    
    expect(localStorage.getItem(mainKey)).not.toBeNull();
    expect(localStorage.getItem(summaryKey)).not.toBeNull();
    
    const summary = JSON.parse(localStorage.getItem(summaryKey)!);
    expect(summary.level).toBe(state.pilot.level);
  });

  it('deleteSave(slot) で特定のセーブデータを削除できる', () => {
    const state = createInitialGameState();
    saveGame(state, 1);
    saveGame(state, 2);

    deleteSave(1);
    expect(hasSave(1)).toBe(false);
    expect(hasSave(2)).toBe(true);
  });

  it('バージョン違いのデータはロード時にマイグレーション（nullにならない）(slot 指定)', () => {
    const state = createInitialGameState();
    saveGame(state, 1);

    // 強制的にバージョンを書き換える
    const key = `${SAVE_KEY_PREFIX}1`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.version = 'v999_invalid';
      localStorage.setItem(key, JSON.stringify(parsed));
    }

    // バージョン不一致でも migration を試みてデータを返す
    const loaded = loadGame(1);
    expect(loaded).not.toBeNull();
  });

  it('localStorage が例外を吐くときは安全に失敗する（エラーを握りつぶす）', () => {
    const state = createInitialGameState();
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    // エラーがスローされないことを確認
    expect(() => saveGame(state, 1)).not.toThrow();

    setItemSpy.mockRestore();
  });
});
