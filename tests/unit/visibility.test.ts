/**
 * @fileoverview 視界システムのユニットテスト
 *
 * updateVisibility の isVisible/isExplored フラグ更新を詳細に検証する。
 */

import { describe, it, expect } from 'vitest';
import { updateVisibility } from '../../src/game/core/visibility.js';
import type { Floor, Cell, Position } from '../../src/game/core/types.js';
import { TILE_FLOOR, TILE_WALL, TILE_START } from '../../src/game/core/constants.js';
import { VIEW_RADIUS } from '../../src/game/core/constants.js';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** 外周壁・内部通路の N×N フロアを生成する */
function makeOpenFloor(width = 11, height = 11): Floor {
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      cells[y][x] = {
        tile: isEdge ? TILE_WALL : TILE_FLOOR,
        isVisible: false,
        isExplored: false,
      };
    }
  }
  cells[1][1].tile = TILE_START;
  return {
    floorNumber: 1, width, height, cells, rooms: [],
    startPos: { x: 1, y: 1 }, stairsPos: { x: 9, y: 9 }, seed: 0,
  };
}

/** 中央(5,5)に縦壁（x=5）を持つフロアを生成する（y=4,6 は壁、y=0/1/2/3/5/7/8/9/10 は通路 or 壁外） */
function makeFloorWithVerticalWall(): Floor {
  const width = 11, height = 11;
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      // x=5 の縦列を壁にする（端を除く）
      const isVertWall = x === 5 && !isEdge;
      cells[y][x] = {
        tile: (isEdge || isVertWall) ? TILE_WALL : TILE_FLOOR,
        isVisible: false,
        isExplored: false,
      };
    }
  }
  return {
    floorNumber: 1, width, height, cells, rooms: [],
    startPos: { x: 1, y: 1 }, stairsPos: { x: 9, y: 9 }, seed: 0,
  };
}

// ---------------------------------------------------------------------------
// 1. updateVisibility 後: プレイヤー位置の isVisible = true
// ---------------------------------------------------------------------------

describe('updateVisibility: プレイヤー位置の isVisible', () => {
  it('プレイヤー座標の isVisible は true になる', () => {
    const floor = makeOpenFloor();
    const pos: Position = { x: 5, y: 5 };
    const result = updateVisibility(floor, pos, VIEW_RADIUS);
    expect(result.cells[5][5].isVisible).toBe(true);
  });

  it('プレイヤー座標の isExplored も true になる', () => {
    const floor = makeOpenFloor();
    const pos: Position = { x: 5, y: 5 };
    const result = updateVisibility(floor, pos, VIEW_RADIUS);
    expect(result.cells[5][5].isExplored).toBe(true);
  });

  it('視界半径 0 でもプレイヤー座標自体は isVisible', () => {
    const floor = makeOpenFloor();
    const pos: Position = { x: 5, y: 5 };
    const result = updateVisibility(floor, pos, 0);
    expect(result.cells[5][5].isVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. updateVisibility 後: 半径外のセルは isVisible = false
// ---------------------------------------------------------------------------

describe('updateVisibility: 半径外セルは isVisible=false', () => {
  it('VIEW_RADIUS=3 のとき半径 4 以上のセルは isVisible=false', () => {
    const floor = makeOpenFloor();
    const pos: Position = { x: 5, y: 5 };
    const radius = 3;
    const result = updateVisibility(floor, pos, radius);
    // (5,1) は ユークリッド距離 4 > 3 なので不可視
    expect(result.cells[1][5].isVisible).toBe(false);
    // (5,9) も同様
    expect(result.cells[9][5].isVisible).toBe(false);
  });

  it('マンハッタン距離が大きいセルでも、ユークリッド距離が radius 内なら isVisible', () => {
    const floor = makeOpenFloor();
    const pos: Position = { x: 5, y: 5 };
    const radius = 3;
    const result = updateVisibility(floor, pos, radius);
    // (5, 5+3) = (5,8) → dist=3 ≤ 3 → 視界内
    expect(result.cells[8][5].isVisible).toBe(true);
  });

  it('半径外の角は isVisible=false', () => {
    const floor = makeOpenFloor();
    const pos: Position = { x: 5, y: 5 };
    const radius = 2;
    const result = updateVisibility(floor, pos, radius);
    // (5+2, 5+2) → ユークリッド距離 = sqrt(8) ≈ 2.83 > 2 → 不可視
    expect(result.cells[7][7].isVisible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. 移動後に前の位置が isVisible = false になること
// ---------------------------------------------------------------------------

describe('updateVisibility: 移動後の再計算', () => {
  it('プレイヤーが移動すると前のターンの視野外セルが isVisible=false になる', () => {
    const floor = makeOpenFloor();
    const pos1: Position = { x: 3, y: 5 };
    const pos2: Position = { x: 8, y: 5 };

    // 1回目: (3,5)付近を視界に入れる
    const floor1 = updateVisibility(floor, pos1, 2);
    expect(floor1.cells[5][3].isVisible).toBe(true);

    // 2回目: (8,5)付近を視界に入れる（前のフロアから再計算）
    const floor2 = updateVisibility(floor1, pos2, 2);
    // (3,5) は (8,5) から距離5 > 2 なので isVisible=false
    expect(floor2.cells[5][3].isVisible).toBe(false);
  });

  it('updateVisibility は毎回全セルの isVisible をリセットしてから設定する', () => {
    const floor = makeOpenFloor();
    const pos1: Position = { x: 3, y: 5 };
    const pos2: Position = { x: 7, y: 5 };

    const floor1 = updateVisibility(floor, pos1, 3);
    // (3,5) は isVisible=true
    expect(floor1.cells[5][3].isVisible).toBe(true);

    const floor2 = updateVisibility(floor1, pos2, 3);
    // (3,5) は (7,5) から距離4 > 3 なので isVisible=false
    expect(floor2.cells[5][3].isVisible).toBe(false);
    // (7,5) は isVisible=true
    expect(floor2.cells[5][7].isVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. isExplored は一度 true になったら false に戻らないこと（永続性）
// ---------------------------------------------------------------------------

describe('isExplored の永続性', () => {
  it('isExplored は一度 true になったら false に戻らない', () => {
    const floor = makeOpenFloor();
    const pos1: Position = { x: 3, y: 5 };
    const pos2: Position = { x: 8, y: 5 };

    // 1回目の視界で(3,5)を探索済みにする
    const floor1 = updateVisibility(floor, pos1, 2);
    expect(floor1.cells[5][3].isExplored).toBe(true);

    // 2回目: 遠くへ移動（(3,5)は isVisible=false になる）
    const floor2 = updateVisibility(floor1, pos2, 2);
    expect(floor2.cells[5][3].isVisible).toBe(false);
    // しかし isExplored は true のまま
    expect(floor2.cells[5][3].isExplored).toBe(true);
  });

  it('複数回移動しても一度探索したセルの isExplored は保持される', () => {
    const floor = makeOpenFloor();
    const positions: Position[] = [
      { x: 2, y: 5 },
      { x: 8, y: 5 },
      { x: 5, y: 2 },
      { x: 5, y: 8 },
    ];
    let currentFloor = floor;
    const exploredAt: { x: number; y: number }[] = [];

    for (const pos of positions) {
      currentFloor = updateVisibility(currentFloor, pos, 2);
      // この位置の周囲を「探索済み」として記録
      exploredAt.push(pos);
    }

    // 最終的に全ての探索済み位置が isExplored=true であること
    for (const pos of exploredAt) {
      expect(currentFloor.cells[pos.y][pos.x].isExplored).toBe(true);
    }
  });

  it('初期状態では isExplored=false', () => {
    const floor = makeOpenFloor();
    // プレイヤーが全く動いていない状態では未探索
    expect(floor.cells[5][5].isExplored).toBe(false);
  });

  it('更新後は新しい Floor オブジェクトを返す（元の Floor は変更なし）', () => {
    const floor = makeOpenFloor();
    const pos: Position = { x: 5, y: 5 };
    const result = updateVisibility(floor, pos, VIEW_RADIUS);
    // 元のフロアは変更されていない
    expect(floor.cells[5][5].isVisible).toBe(false);
    expect(floor.cells[5][5].isExplored).toBe(false);
    // 新しいフロアは更新されている
    expect(result.cells[5][5].isVisible).toBe(true);
    expect(result.cells[5][5].isExplored).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. 壁で視線遮蔽: 壁の反対側のセルは isVisible = false
// ---------------------------------------------------------------------------

describe('視線遮蔽: 壁で視界がブロックされる', () => {
  it('縦壁の反対側のセルは isVisible=false', () => {
    const floor = makeFloorWithVerticalWall();
    // プレイヤー(3,5)、縦壁 x=5、壁の反対側(7,5)
    const pos: Position = { x: 3, y: 5 };
    const result = updateVisibility(floor, pos, VIEW_RADIUS);
    // (7,5) は壁(x=5)で遮蔽されるので不可視
    expect(result.cells[5][7].isVisible).toBe(false);
  });

  it('壁タイル自体は isVisible=true（壁は見える）', () => {
    const floor = makeFloorWithVerticalWall();
    const pos: Position = { x: 3, y: 5 };
    const result = updateVisibility(floor, pos, VIEW_RADIUS);
    // 壁(5,5)自体は視界内
    expect(result.cells[5][5].isVisible).toBe(true);
  });

  it('壁がない方向のセルは isVisible=true', () => {
    const floor = makeFloorWithVerticalWall();
    const pos: Position = { x: 5, y: 5 }; // プレイヤーが壁上（通路は x=5 列が壁なので隣接通路に置く）
    // プレイヤー(3,5)、左側(1,5)は視界内
    const pos2: Position = { x: 3, y: 5 };
    const result = updateVisibility(floor, pos2, VIEW_RADIUS);
    // (1,5) は壁（外周）なので isVisible=true ではないが、(2,5) は通路で見える
    expect(result.cells[5][2].isVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. フロア遷移後: 新フロアのスタート地点周辺が isVisible = true
// ---------------------------------------------------------------------------

describe('フロア遷移後の視界初期化', () => {
  it('startPos で updateVisibility を呼ぶとスタート地点が isVisible', () => {
    const floor = makeOpenFloor();
    const startPos = floor.startPos; // (1,1)
    const result = updateVisibility(floor, startPos, VIEW_RADIUS);
    expect(result.cells[startPos.y][startPos.x].isVisible).toBe(true);
  });

  it('startPos 周辺（半径以内）のセルが isVisible', () => {
    const floor = makeOpenFloor();
    const startPos = { x: 5, y: 5 }; // 中央を startPos として検証
    const result = updateVisibility(floor, startPos, VIEW_RADIUS);
    // 隣接セルは必ず visible
    expect(result.cells[5][6].isVisible).toBe(true); // 右
    expect(result.cells[6][5].isVisible).toBe(true); // 下
    expect(result.cells[5][4].isVisible).toBe(true); // 左
    expect(result.cells[4][5].isVisible).toBe(true); // 上
  });

  it('新フロア生成直後（全 isExplored=false）に updateVisibility を呼ぶと探索が始まる', () => {
    const floor = makeOpenFloor();
    // 全セル isExplored=false を確認
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        expect(floor.cells[y][x].isExplored).toBe(false);
      }
    }
    // updateVisibility 後はスタート地点付近が isExplored=true
    const result = updateVisibility(floor, { x: 5, y: 5 }, VIEW_RADIUS);
    expect(result.cells[5][5].isExplored).toBe(true);
  });
});
