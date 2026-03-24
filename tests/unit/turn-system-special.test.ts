import { describe, it, expect, vi } from 'vitest';
import { processTurn } from '../../src/game/core/turn-system';
import { createInitialGameState } from '../../src/game/core/game-state';
import {
  TILE_FLOOR,
  TILE_LAVA,
  TILE_ICE,
  TILE_WARP,
  TILE_TRAP,
  TILE_HINT,
  TILE_WALL,
} from '../../src/game/core/constants';
import { RoomType } from '../../src/game/core/types';

// モック用の簡易マップ構成関数
function createMockMap(width: number, height: number) {
  const cells = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      tile: TILE_FLOOR,
      isVisible: true,
      isExplored: true,
    }))
  );
  return {
    floorNumber: 1,
    width,
    height,
    cells,
    rooms: [
      {
        id: 0,
        type: RoomType.NORMAL,
        bounds: { x: 0, y: 0, width, height },
        doors: [],
        isLocked: false,
      },
    ],
    startPos: { x: 0, y: 0 },
    stairsPos: { x: width - 1, y: height - 1 },
    seed: 1234,
  };
}

describe('processTurn: Special Mechanics', () => {
  it('Lava Tile damages player', () => {
    const state = createInitialGameState();
    state.phase = 'exploring';
    state.map = createMockMap(5, 5);
    state.map.cells[0][1].tile = TILE_LAVA; // 右隣を溶岩に
    state.player = {
      pos: { x: 0, y: 0 },
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 5,
      facing: 'down',
    };
    state.exploration = {
      currentFloor: state.map,
      playerPos: { x: 0, y: 0 },
      floorNumber: 1,
      turn: 0,
    };

    const nextState = processTurn(state, 'move_right');

    expect(nextState.player?.pos).toEqual({ x: 1, y: 0 });
    expect(nextState.player?.hp).toBe(95); // 100 - 5
    expect(nextState.battleLog).toEqual(expect.arrayContaining(['溶岩の熱で5ダメージを受けた！']));
  });

  it('Ice Tile makes player slide until hitting wall or floor', () => {
    const state = createInitialGameState();
    state.phase = 'exploring';
    state.map = createMockMap(5, 5);
    // (1,0)と(2,0)を氷にする。(3,0)で止まるはず。
    state.map.cells[0][1].tile = TILE_ICE;
    state.map.cells[0][2].tile = TILE_ICE;
    state.map.cells[0][3].tile = TILE_FLOOR;
    
    state.player = {
      pos: { x: 0, y: 0 },
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 5,
      facing: 'down',
    };
    state.exploration = {
      currentFloor: state.map,
      playerPos: { x: 0, y: 0 },
      floorNumber: 1,
      turn: 0,
    };

    const nextState = processTurn(state, 'move_right');

    // 0 から右に動いて 1 と 2 が氷なので 3 まで一気に滑る
    expect(nextState.player?.pos).toEqual({ x: 3, y: 0 });
  });

  it('Warp Tile teleports player to another Warp Tile', () => {
    const state = createInitialGameState();
    state.phase = 'exploring';
    state.map = createMockMap(5, 5);
    // 踏む側のワープ
    state.map.cells[0][1].tile = TILE_WARP;
    // 飛び先候補のワープ
    state.map.cells[4][4].tile = TILE_WARP;
    
    state.player = {
      pos: { x: 0, y: 0 },
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 5,
      facing: 'down',
    };
    state.exploration = {
      currentFloor: state.map,
      playerPos: { x: 0, y: 0 },
      floorNumber: 1,
      turn: 0,
    };

    const nextState = processTurn(state, 'move_right');

    // (4,4) にワープするはず
    expect(nextState.player?.pos).toEqual({ x: 4, y: 4 });
    expect(nextState.battleLog).toEqual(expect.arrayContaining(['ワープゾーンに入り、別の場所へ転移した！']));
  });

  it('Trap Tile (large_pitfall) triggers damage and floor transition', () => {
    const state = createInitialGameState();
    state.phase = 'exploring';
    state.map = createMockMap(5, 5);
    state.map.cells[0][1].tile = TILE_TRAP;
    
    // トラップを配置
    state.traps = [{
      id: 999,
      type: 'large_pitfall',
      pos: { x: 1, y: 0 },
      isVisible: true,
      isTriggered: false
    }];

    state.player = {
      pos: { x: 0, y: 0 },
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 5,
      facing: 'down',
    };
    state.exploration = {
      currentFloor: state.map,
      playerPos: { x: 0, y: 0 },
      floorNumber: 1,
      turn: 0,
    };

    const nextState = processTurn(state, 'move_right');

    // 次フロアへ落ちる場合、transitionToNextFloor が呼ばれて新マップ上にジャンプし、HPは減る
    expect(nextState.floor).toBe(2);
    expect(nextState.player?.hp).toBe(50); // 100 - 50 (large_pitfall)
  });

  it('Hint Tile logs hint to battle log', () => {
    const state = createInitialGameState();
    state.phase = 'exploring';
    state.map = createMockMap(5, 5);
    state.map.cells[0][1].tile = TILE_HINT;
    
    // ヒントを配置
    state.hints = [{
      pos: { x: 1, y: 0 },
      text: '【石碑】 古き記録： 次の試練は階層 5 に待ち受けるだろう...'
    }];

    state.player = {
      pos: { x: 0, y: 0 },
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 5,
      facing: 'down',
    };
    state.exploration = { ...state.exploration! };
    state.exploration.turn = 0;

    const nextState = processTurn(state, 'move_right');

    expect(nextState.battleLog).toEqual(expect.arrayContaining(['【石碑】 古き記録： 次の試練は階層 5 に待ち受けるだろう...']));
  });

  it('Monster House entry triggers log and flag', () => {
    const state = createInitialGameState();
    state.phase = 'exploring';
    state.map = createMockMap(5, 5);
    
    // 最初の部屋をモンスターハウスにする
    state.map.rooms[0].type = RoomType.MONSTER_HOUSE;
    
    state.player = {
      pos: { x: 0, y: 0 },
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 5,
      facing: 'down',
    };
    state.exploration = {
      currentFloor: state.map,
      playerPos: { x: 0, y: 0 },
      floorNumber: 1,
      turn: 0,
    };

    const nextState = processTurn(state, 'move_right');

    // 部屋内を動いたので発動する
    expect(nextState.triggeredMonsterHouses).toContain(0);
    expect(nextState.battleLog).toEqual(expect.arrayContaining(['モンスターハウスだ！ 敵が押し寄せてくる！']));
  });
});
