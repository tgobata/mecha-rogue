/**
 * @fileoverview 道具システムのユニットテスト
 *
 * createToolInstance, useTool（装備型toggle・使い捨て消費）を検証する。
 */

import { describe, it, expect } from 'vitest';
import { createToolInstance, useTool } from '../../src/game/core/tool-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { GameState, Player } from '../../src/game/core/game-state.js';
import type { Floor, Cell } from '../../src/game/core/types.js';
import { TILE_FLOOR, TILE_WALL } from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeFloor(): Floor {
  const width = 5; const height = 5;
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      cells[y][x] = { tile: isEdge ? TILE_WALL : TILE_FLOOR, isVisible: false, isExplored: false };
    }
  }
  return { floorNumber: 1, width, height, cells, rooms: [], startPos: { x: 2, y: 2 }, stairsPos: { x: 3, y: 3 }, seed: 0 };
}

function makeState(playerOverrides: Partial<Player> = {}): GameState {
  const base = createInitialGameState();
  const floor = makeFloor();
  const player: Player = {
    pos: { x: 2, y: 2 }, hp: 100, maxHp: 100,
    atk: 8, def: 5, facing: 'down',
    equippedTools: [], toolInventory: [],
    ...playerOverrides,
  };
  return {
    ...base,
    phase: 'exploring', player,
    enemies: [], map: floor, floor: 1,
    exploration: { currentFloor: floor, playerPos: player.pos, floorNumber: 1, turn: 0 },
  };
}

// ---------------------------------------------------------------------------
// createToolInstance
// ---------------------------------------------------------------------------

describe('createToolInstance', () => {
  it('scout_lens（装備型）のインスタンスを生成する', () => {
    const t = createToolInstance('scout_lens');
    expect(t.id).toBe('scout_lens');
    expect(t.isEquipType).toBe(true);
    expect(t.charges).toBe(-1);
    expect(t.isEquipped).toBe(false);
  });

  it('装備型の category が正しい', () => {
    const t = createToolInstance('scout_lens');
    expect(t.category).toBe('vision');
  });

  it('phase_shifter（非passive）は使い捨て型として生成される', () => {
    const t = createToolInstance('phase_shifter');
    expect(t.isEquipType).toBe(false);
    expect(t.charges).toBe(1);
  });

  it('存在しないIDで例外を投げる', () => {
    expect(() => createToolInstance('invalid_tool_xyz')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// useTool: 装備型（toggle）
// ---------------------------------------------------------------------------

describe('useTool: 装備型 toggle', () => {
  it('未装備の装備型道具を使うと equippedTools に追加される', () => {
    const state = makeState();
    const result = useTool(state, 'scout_lens');
    expect(result.player!.equippedTools).toHaveLength(1);
    expect(result.player!.equippedTools![0].id).toBe('scout_lens');
    expect(result.player!.equippedTools![0].isEquipped).toBe(true);
  });

  it('装備中の道具を再度使うと equippedTools から削除される（toggle off）', () => {
    const tool = { ...createToolInstance('scout_lens'), isEquipped: true };
    const state = makeState({ equippedTools: [tool] });
    const result = useTool(state, 'scout_lens');
    expect(result.player!.equippedTools).toHaveLength(0);
  });

  it('スロット上限を超えると追加されない', () => {
    // machine.toolSlots = 3（初期値）
    const tools = [
      { ...createToolInstance('scout_lens'), isEquipped: true },
      { ...createToolInstance('radar_module'), isEquipped: true },
      { ...createToolInstance('trap_sensor'), isEquipped: true },
    ];
    const state = makeState({ equippedTools: tools });
    const result = useTool(state, 'reactive_armor');
    // 上限なのでそのまま
    expect(result.player!.equippedTools).toHaveLength(3);
  });

  it('元の state は変更されない（immutable）', () => {
    const state = makeState();
    const original = state.player!.equippedTools!.length;
    useTool(state, 'scout_lens');
    expect(state.player!.equippedTools!.length).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// useTool: 使い捨て型
// ---------------------------------------------------------------------------

describe('useTool: 使い捨て型', () => {
  it('charges が 2 の道具を使うと 1 になる', () => {
    const tool = { ...createToolInstance('phase_shifter'), charges: 2 };
    const state = makeState({ toolInventory: [tool] });
    const result = useTool(state, 'phase_shifter');
    expect(result.player!.toolInventory![0].charges).toBe(1);
  });

  it('charges が 1 の道具を使うと toolInventory から削除される', () => {
    const tool = createToolInstance('phase_shifter'); // charges=1
    const state = makeState({ toolInventory: [tool] });
    const result = useTool(state, 'phase_shifter');
    expect(result.player!.toolInventory).toHaveLength(0);
  });

  it('toolInventory にない道具を使っても state が変化しない', () => {
    const state = makeState({ toolInventory: [] });
    const result = useTool(state, 'phase_shifter');
    expect(result).toBe(state);
  });

  it('player が null のとき state をそのまま返す', () => {
    const base = createInitialGameState();
    const result = useTool(base, 'scout_lens');
    expect(result).toBe(base);
  });
});
