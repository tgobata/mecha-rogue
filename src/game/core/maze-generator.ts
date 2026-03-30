/**
 * @fileoverview 迷路生成システム（再帰分割法 + BFS到達可能性検証）
 *
 * アルゴリズム概要:
 * 1. マップ全体を壁で初期化する
 * 2. 再帰分割法（Recursive Division）で矩形を部屋単位に分割する
 * 3. 隣接する部屋ペアを廊下でつなぐ
 * 4. 部屋タイプ（ボス・宝物・罠・モンスターハウス）を確率的に割り当てる
 * 5. 階層に応じた特殊地形を配置する
 * 6. スタート座標と階段座標を決定する
 * 7. BFS で全通路がスタートから到達可能か検証する
 * 8. 敵・アイテム・ゴールドをランダム配置する
 */

import bossDefsRaw from '../assets/data/bosses.json';
import {
  TILE_FLOOR,
  TILE_WALL,
  TILE_STAIRS_DOWN,
  TILE_START,
  TILE_ITEM,
  TILE_WEAPON,
  TILE_GOLD,
  TILE_ENEMY,
  TILE_BOSS,
  TILE_TRAP,
  TILE_REST,
  TILE_REPAIR,
  TILE_SHOP,
  TILE_HINT,
  TILE_CRACKED_WALL,
  TILE_WATER,
  TILE_LAVA,
  TILE_ICE,
  TILE_WARP,
  TILE_MAGNETIC,
  TILE_STORAGE,
  PARTITION_MIN_SIZE,
  ROOM_MIN_INNER_SIZE,
  LAVA_MIN_FLOOR,
  ICE_MIN_FLOOR,
  WARP_MIN_FLOOR,
  MAGNETIC_MIN_FLOOR,
  ENEMY_SPAWN_RATE,
  ITEM_SPAWN_RATE,
  WEAPON_SPAWN_RATE,
  GOLD_SPAWN_RATE,
  TRAP_SPAWN_RATE,
  CRACKED_WALL_RATE,
  SPECIAL_TERRAIN_RATE,
  REST_SPAWN_RATE,
  REPAIR_SPAWN_RATE,
  SHOP_SPAWN_RATE,
  HINT_SPAWN_RATE,
  TREASURE_ROOM_RATE,
  TRAP_ROOM_RATE,
  MONSTER_HOUSE_RATE,
  MAX_SPAWN_ITEMS,
  MAX_SPAWN_WEAPONS,
  MAX_SPAWN_GOLD,
  MAX_TREASURE_ROOM_ITEMS,
  MAX_TREASURE_ROOM_GOLD,
  WALKABLE_TILES,
} from './constants';
import { getMapSize, getTileAt, setTileAt, isWalkable, getNeighbors4 } from './floorUtils';
import type { Floor, Cell, Room, Position, TileType, Bounds } from './types';
import { RoomType } from './types';

/** bosses.json で定義されているボスフロア番号のセット */
const BOSS_FLOOR_SET = new Set<number>((bossDefsRaw as Array<{ floor: number }>).map((b) => b.floor));

// ---------------------------------------------------------------------------
// シードベース乱数（Mulberry32）
// ---------------------------------------------------------------------------

/**
 * シードベースの疑似乱数生成器を作成する（Mulberry32）。
 * シード未指定時は現在時刻をシードとして使う。
 *
 * @param seed - 乱数シード。省略時は Date.now()。
 * @returns [0, 1) の浮動小数点数を返す関数
 */
function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return function rng(): number {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// 内部型
// ---------------------------------------------------------------------------

/** 再帰分割で管理する矩形領域（分割前の大きなセル） */
interface Partition {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// フロア初期化
// ---------------------------------------------------------------------------

/**
 * 全マスを壁で埋めた2次元 Cell 配列を生成する。
 */
function createEmptyCells(width: number, height: number): Cell[][] {
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = { tile: TILE_WALL, isVisible: false, isExplored: false };
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// 再帰分割
// ---------------------------------------------------------------------------

/**
 * 矩形を再帰的に分割し、最小サイズ以下になったら葉ノード（部屋候補）として返す。
 *
 * @param partition - 分割対象の矩形
 * @param rng - 乱数生成器
 * @param leaves - 収集先の葉ノード配列（副作用）
 */
function dividePartition(
  partition: Partition,
  rng: () => number,
  leaves: Partition[],
): void {
  const canSplitH = partition.height >= PARTITION_MIN_SIZE * 2;
  const canSplitV = partition.width >= PARTITION_MIN_SIZE * 2;

  if (!canSplitH && !canSplitV) {
    leaves.push(partition);
    return;
  }

  // 縦横どちらで分割するか選択（両方可能なら乱数）
  const splitVertically = canSplitV && (!canSplitH || rng() < 0.5);

  if (splitVertically) {
    // x軸方向で分割
    const minSplit = partition.x + PARTITION_MIN_SIZE;
    const maxSplit = partition.x + partition.width - PARTITION_MIN_SIZE;
    if (minSplit >= maxSplit) {
      leaves.push(partition);
      return;
    }
    const splitX = minSplit + Math.floor(rng() * (maxSplit - minSplit));
    dividePartition(
      { x: partition.x, y: partition.y, width: splitX - partition.x, height: partition.height },
      rng,
      leaves,
    );
    dividePartition(
      { x: splitX, y: partition.y, width: partition.x + partition.width - splitX, height: partition.height },
      rng,
      leaves,
    );
  } else {
    // y軸方向で分割
    const minSplit = partition.y + PARTITION_MIN_SIZE;
    const maxSplit = partition.y + partition.height - PARTITION_MIN_SIZE;
    if (minSplit >= maxSplit) {
      leaves.push(partition);
      return;
    }
    const splitY = minSplit + Math.floor(rng() * (maxSplit - minSplit));
    dividePartition(
      { x: partition.x, y: partition.y, width: partition.width, height: splitY - partition.y },
      rng,
      leaves,
    );
    dividePartition(
      { x: partition.x, y: splitY, width: partition.width, height: partition.y + partition.height - splitY },
      rng,
      leaves,
    );
  }
}

// ---------------------------------------------------------------------------
// 部屋生成
// ---------------------------------------------------------------------------

/**
 * 葉ノード（パーティション）内に部屋の矩形を生成し、セルを FLOOR で塗る。
 * 部屋はパーティション内でランダムなオフセット・サイズになる。
 *
 * @returns 生成した部屋の Bounds（壁込みの外形）
 */
function carveRoomInPartition(
  partition: Partition,
  cells: Cell[][],
  rng: () => number,
): Bounds {
  const maxInnerW = partition.width - 2;
  const maxInnerH = partition.height - 2;

  // 内寸をランダムに決定（最小 ROOM_MIN_INNER_SIZE）
  const innerW =
    ROOM_MIN_INNER_SIZE + Math.floor(rng() * (maxInnerW - ROOM_MIN_INNER_SIZE + 1));
  const innerH =
    ROOM_MIN_INNER_SIZE + Math.floor(rng() * (maxInnerH - ROOM_MIN_INNER_SIZE + 1));

  // 部屋の左上（外壁含む）をランダムに配置
  const roomX = partition.x + 1 + Math.floor(rng() * (partition.width - innerW - 2));
  const roomY = partition.y + 1 + Math.floor(rng() * (partition.height - innerH - 2));

  // 内部を FLOOR で塗る
  for (let y = roomY; y < roomY + innerH; y++) {
    for (let x = roomX; x < roomX + innerW; x++) {
      cells[y][x].tile = TILE_FLOOR;
    }
  }

  return { x: roomX - 1, y: roomY - 1, width: innerW + 2, height: innerH + 2 };
}

// ---------------------------------------------------------------------------
// 廊下生成（L字型）
// ---------------------------------------------------------------------------

/** 部屋の中心座標を返す（内寸基準） */
function roomCenter(bounds: Bounds): Position {
  return {
    x: bounds.x + Math.floor(bounds.width / 2),
    y: bounds.y + Math.floor(bounds.height / 2),
  };
}

/**
 * 2点間をL字型の廊下で接続する。
 * 縦→横 または 横→縦 をランダムに選択する。
 */
function carveCorridor(
  from: Position,
  to: Position,
  cells: Cell[][],
  rng: () => number,
): void {
  const hFirst = rng() < 0.5;

  if (hFirst) {
    carveHorizontal(cells, from.y, Math.min(from.x, to.x), Math.max(from.x, to.x));
    carveVertical(cells, to.x, Math.min(from.y, to.y), Math.max(from.y, to.y));
  } else {
    carveVertical(cells, from.x, Math.min(from.y, to.y), Math.max(from.y, to.y));
    carveHorizontal(cells, to.y, Math.min(from.x, to.x), Math.max(from.x, to.x));
  }
}

function carveHorizontal(cells: Cell[][], y: number, x1: number, x2: number): void {
  for (let x = x1; x <= x2; x++) {
    if (cells[y]?.[x] !== undefined) {
      cells[y][x].tile = TILE_FLOOR;
    }
  }
}

function carveVertical(cells: Cell[][], x: number, y1: number, y2: number): void {
  for (let y = y1; y <= y2; y++) {
    if (cells[y]?.[x] !== undefined) {
      cells[y][x].tile = TILE_FLOOR;
    }
  }
}

// ---------------------------------------------------------------------------
// 部屋接続（最小スパニングツリー風: 隣接ペアを順番に接続）
// ---------------------------------------------------------------------------

/**
 * 全部屋を順番に隣接ペアで廊下接続する。
 * シャッフルして接続順をランダム化する。
 */
function connectRooms(rooms: Room[], cells: Cell[][], rng: () => number): void {
  if (rooms.length === 0) return;

  // Fisher-Yates シャッフル
  const shuffled = [...rooms];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // 隣接ペアを廊下で接続（全部屋が連結になる）
  for (let i = 0; i < shuffled.length - 1; i++) {
    const fromCenter = roomCenter(shuffled[i].bounds);
    const toCenter = roomCenter(shuffled[i + 1].bounds);
    carveCorridor(fromCenter, toCenter, cells, rng);
  }

  // 追加で数本のランダム接続を加えてループ構造を作る（探索の多様性）
  const extraConnections = Math.max(1, Math.floor(rooms.length * 0.3));
  for (let i = 0; i < extraConnections; i++) {
    const a = shuffled[Math.floor(rng() * shuffled.length)];
    const b = shuffled[Math.floor(rng() * shuffled.length)];
    if (a !== b) {
      carveCorridor(roomCenter(a.bounds), roomCenter(b.bounds), cells, rng);
    }
  }
}

// ---------------------------------------------------------------------------
// BFS 到達可能性検証
// ---------------------------------------------------------------------------

/**
 * start から BFS で到達できる通路タイルのセットを返す。
 */
function bfsReachable(floor: Floor, start: Position): Set<string> {
  const visited = new Set<string>();
  const queue: Position[] = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of getNeighbors4(current)) {
      const key = `${neighbor.x},${neighbor.y}`;
      if (!visited.has(key) && isWalkable(getTileAt(floor, neighbor))) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

/**
 * フロアの全通路タイルがスタート地点から BFS で到達可能か検証する。
 *
 * @param floor - 検証対象のフロア
 * @returns 全通路が到達可能なら true
 */
export function validateFloor(floor: Floor): boolean {
  // スタート地点が移動可能でなければ即 false
  if (!isWalkable(getTileAt(floor, floor.startPos))) return false;

  const reachable = bfsReachable(floor, floor.startPos);

  // 全 WALKABLE タイルが reachable に含まれるか確認
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (isWalkable(floor.cells[y][x].tile)) {
        if (!reachable.has(`${x},${y}`)) {
          return false;
        }
      }
    }
  }

  // 階段も到達可能か
  return reachable.has(`${floor.stairsPos.x},${floor.stairsPos.y}`);
}

// ---------------------------------------------------------------------------
// 部屋タイプ割り当て
// ---------------------------------------------------------------------------

/**
 * 各部屋にタイプを割り当てる。
 * ボス部屋は5の倍数階に1部屋、その他は確率で割り当て。
 */
function assignRoomTypes(rooms: Room[], floorNumber: number, rng: () => number): void {
  const isBossFloor = BOSS_FLOOR_SET.has(floorNumber);
  let bossAssigned = false;

  // スタート・階段部屋を除く（index 0 = スタート、index 1 = 階段 とするため後で処理）
  for (const room of rooms) {
    if (room.type !== RoomType.NORMAL) continue; // 既に割り当て済み

    if (isBossFloor && !bossAssigned) {
      room.type = RoomType.BOSS;
      room.isLocked = true;
      bossAssigned = true;
      continue;
    }

    const roll = rng();
    if (roll < TREASURE_ROOM_RATE) {
      room.type = RoomType.TREASURE;
    } else if (roll < TREASURE_ROOM_RATE + TRAP_ROOM_RATE) {
      room.type = RoomType.TRAP;
    } else if (roll < TREASURE_ROOM_RATE + TRAP_ROOM_RATE + MONSTER_HOUSE_RATE) {
      room.type = RoomType.MONSTER_HOUSE;
    }
    // それ以外は NORMAL のまま
  }
}

// ---------------------------------------------------------------------------
// 特殊地形配置
// ---------------------------------------------------------------------------

/**
 * 階層に応じた特殊地形タイルを通路に配置する。
 * 溶岩・氷・ワープ・磁場は対応階以降のみ配置。
 */
function placeSpecialTerrain(
  floor: Floor,
  floorNumber: number,
  rng: () => number,
): void {
  // 配置候補: 通路タイル（部屋・廊下）
  const candidates: Position[] = [];
  for (let y = 1; y < floor.height - 1; y++) {
    for (let x = 1; x < floor.width - 1; x++) {
      if (floor.cells[y][x].tile === TILE_FLOOR) {
        candidates.push({ x, y });
      }
    }
  }

  for (const pos of candidates) {
    // スタートと階段は除外
    if (
      (pos.x === floor.startPos.x && pos.y === floor.startPos.y) ||
      (pos.x === floor.stairsPos.x && pos.y === floor.stairsPos.y)
    ) {
      continue;
    }

    const roll = rng();
    if (roll < SPECIAL_TERRAIN_RATE) {
      const terrainRoll = rng();
      // 複数の特殊地形を均等に振り分ける
      const availableTiles: TileType[] = [TILE_WATER];
      if (floorNumber >= LAVA_MIN_FLOOR) availableTiles.push(TILE_LAVA);
      if (floorNumber >= ICE_MIN_FLOOR) availableTiles.push(TILE_ICE);
      if (floorNumber >= WARP_MIN_FLOOR) availableTiles.push(TILE_WARP);
      if (floorNumber >= MAGNETIC_MIN_FLOOR) availableTiles.push(TILE_MAGNETIC);

      const idx = Math.floor(terrainRoll * availableTiles.length);
      floor.cells[pos.y][pos.x].tile = availableTiles[idx];
    }
  }
}

// ---------------------------------------------------------------------------
// ひび割れ壁配置
// ---------------------------------------------------------------------------

/**
 * 内部の壁タイルに確率的にひび割れ壁を配置する。
 */
function placeCrackedWalls(floor: Floor, rng: () => number): void {
  for (let y = 1; y < floor.height - 1; y++) {
    for (let x = 1; x < floor.width - 1; x++) {
      if (floor.cells[y][x].tile === TILE_WALL && rng() < CRACKED_WALL_RATE) {
        floor.cells[y][x].tile = TILE_CRACKED_WALL;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 部屋内特殊タイル配置（REST・REPAIR・SHOP・HINT）
// ---------------------------------------------------------------------------

/**
 * 通常部屋の中心付近に施設タイルを確率で配置する。
 */
function placeRoomFacilities(floor: Floor, rng: () => number): void {
  for (const room of floor.rooms) {
    if (room.type !== RoomType.NORMAL) continue;

    const center = roomCenter(room.bounds);
    // 中心が FLOOR であることを確認
    if (floor.cells[center.y]?.[center.x]?.tile !== TILE_FLOOR) continue;

    const roll = rng();
    if (roll < REST_SPAWN_RATE) {
      floor.cells[center.y][center.x].tile = TILE_REST;
    } else if (roll < REST_SPAWN_RATE + REPAIR_SPAWN_RATE) {
      floor.cells[center.y][center.x].tile = TILE_REPAIR;
    } else if (roll < REST_SPAWN_RATE + REPAIR_SPAWN_RATE + SHOP_SPAWN_RATE) {
      floor.cells[center.y][center.x].tile = TILE_SHOP;
    } else if (roll < REST_SPAWN_RATE + REPAIR_SPAWN_RATE + SHOP_SPAWN_RATE + HINT_SPAWN_RATE) {
      floor.cells[center.y][center.x].tile = TILE_HINT;
    }
  }
}

// ---------------------------------------------------------------------------
// 敵・アイテム・ゴールド・罠の配置
// ---------------------------------------------------------------------------

/**
 * フロアの FLOOR タイルに確率的に敵・アイテム・ゴールド・罠を配置する。
 * スタート地点・階段・特殊施設タイルは除外する。
 */
function placeEntities(
  floor: Floor,
  floorNumber: number,
  rng: () => number,
): void {
  const isBossFloor = BOSS_FLOOR_SET.has(floorNumber);

  let spawnedItems = 0;
  let spawnedWeapons = 0;
  let spawnedGold = 0;
  const hasMonsterHouse = floor.rooms.some((r) => r.type === RoomType.MONSTER_HOUSE);

  // 宝物部屋に属するセルを事前にマークする（宝物部屋は専用ループで配置するため通常配置から除外する）
  const treasureRoomCells = new Set<string>();
  for (const room of floor.rooms) {
    if (room.type !== RoomType.TREASURE) continue;
    const innerX1 = room.bounds.x + 1;
    const innerY1 = room.bounds.y + 1;
    const innerX2 = room.bounds.x + room.bounds.width - 2;
    const innerY2 = room.bounds.y + room.bounds.height - 2;
    for (let ry = innerY1; ry <= innerY2; ry++) {
      for (let rx = innerX1; rx <= innerX2; rx++) {
        treasureRoomCells.add(`${rx},${ry}`);
      }
    }
  }

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const tile = floor.cells[y][x].tile;
      if (tile !== TILE_FLOOR) continue;

      // 宝物部屋内セルは専用ループで配置するためスキップ
      if (treasureRoomCells.has(`${x},${y}`)) continue;

      // スタート周辺は敵を配置しない（マンハッタン距離3以内）
      const distFromStart =
        Math.abs(x - floor.startPos.x) + Math.abs(y - floor.startPos.y);
      if (distFromStart <= 3) continue;

      const roll = rng();
      // 配置優先度: 敵 > アイテム > 武器 > ゴールド > 罠（武器:アイテム = 2:7）
      if (roll < ENEMY_SPAWN_RATE) {
        // ボス部屋にはボスタイルを使う（専用配置で上書き済みのはずだが保険）
        floor.cells[y][x].tile = TILE_ENEMY;
      } else if (roll < ENEMY_SPAWN_RATE + ITEM_SPAWN_RATE) {
        if (hasMonsterHouse || spawnedItems < MAX_SPAWN_ITEMS) {
          floor.cells[y][x].tile = TILE_ITEM;
          spawnedItems++;
        }
      } else if (roll < ENEMY_SPAWN_RATE + ITEM_SPAWN_RATE + WEAPON_SPAWN_RATE) {
        if (hasMonsterHouse || spawnedWeapons < MAX_SPAWN_WEAPONS) {
          floor.cells[y][x].tile = TILE_WEAPON;
          spawnedWeapons++;
        }
      } else if (roll < ENEMY_SPAWN_RATE + ITEM_SPAWN_RATE + WEAPON_SPAWN_RATE + GOLD_SPAWN_RATE) {
        if (hasMonsterHouse || spawnedGold < MAX_SPAWN_GOLD) {
          floor.cells[y][x].tile = TILE_GOLD;
          spawnedGold++;
        }
      } else if (roll < ENEMY_SPAWN_RATE + ITEM_SPAWN_RATE + WEAPON_SPAWN_RATE + GOLD_SPAWN_RATE + TRAP_SPAWN_RATE) {
        floor.cells[y][x].tile = TILE_TRAP;
      }
    }
  }

  // ボス部屋にボスを配置
  if (isBossFloor) {
    for (const room of floor.rooms) {
      if (room.type === RoomType.BOSS) {
        const center = roomCenter(room.bounds);
        if (floor.cells[center.y]?.[center.x] !== undefined) {
          floor.cells[center.y][center.x].tile = TILE_BOSS;
        }
        break;
      }
    }
  }

  // モンスターハウスの部屋内全マスに敵を高密度配置
  for (const room of floor.rooms) {
    if (room.type !== RoomType.MONSTER_HOUSE) continue;
    const innerX1 = room.bounds.x + 1;
    const innerY1 = room.bounds.y + 1;
    const innerX2 = room.bounds.x + room.bounds.width - 2;
    const innerY2 = room.bounds.y + room.bounds.height - 2;
    for (let y = innerY1; y <= innerY2; y++) {
      for (let x = innerX1; x <= innerX2; x++) {
        if (floor.cells[y]?.[x]?.tile === TILE_FLOOR) {
          // モンスターハウスは高確率で敵
          if (rng() < 0.6) {
            floor.cells[y][x].tile = TILE_ENEMY;
          }
        }
      }
    }
  }

  // 罠部屋の部屋内に罠を高密度配置
  for (const room of floor.rooms) {
    if (room.type !== RoomType.TRAP) continue;
    const innerX1 = room.bounds.x + 1;
    const innerY1 = room.bounds.y + 1;
    const innerX2 = room.bounds.x + room.bounds.width - 2;
    const innerY2 = room.bounds.y + room.bounds.height - 2;
    for (let y = innerY1; y <= innerY2; y++) {
      for (let x = innerX1; x <= innerX2; x++) {
        if (floor.cells[y]?.[x]?.tile === TILE_FLOOR) {
          if (rng() < 0.5) {
            floor.cells[y][x].tile = TILE_TRAP;
          }
        }
      }
    }
  }

  // 宝物部屋の部屋内にアイテム・ゴールドを高密度配置
  // MAX_TREASURE_ROOM_ITEMS / MAX_TREASURE_ROOM_GOLD を上限として超過を防ぐ
  for (const room of floor.rooms) {
    if (room.type !== RoomType.TREASURE) continue;
    const innerX1 = room.bounds.x + 1;
    const innerY1 = room.bounds.y + 1;
    const innerX2 = room.bounds.x + room.bounds.width - 2;
    const innerY2 = room.bounds.y + room.bounds.height - 2;
    let treasureItems = 0;
    let treasureGold = 0;
    for (let y = innerY1; y <= innerY2; y++) {
      for (let x = innerX1; x <= innerX2; x++) {
        if (floor.cells[y]?.[x]?.tile === TILE_FLOOR) {
          const r = rng();
          if (r < 0.4 && treasureItems < MAX_TREASURE_ROOM_ITEMS) {
            floor.cells[y][x].tile = TILE_ITEM;
            treasureItems++;
          } else if (r < 0.7 && treasureGold < MAX_TREASURE_ROOM_GOLD) {
            floor.cells[y][x].tile = TILE_GOLD;
            treasureGold++;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 最低アイテム数保証
// ---------------------------------------------------------------------------

/**
 * フロアに最低 minItems 個の TILE_ITEM と最低 minWeapons 個の TILE_WEAPON を保証する。
 * 不足している場合、スタート地点から遠い TILE_FLOOR タイルを順に上書きする。
 *
 * @param floor - 対象フロア（直接変更する）
 * @param minItems - アイテム最低数
 * @param minWeapons - 武器最低数
 * @param rng - 乱数関数
 */
function ensureMinimumItems(
  floor: Floor,
  minItems: number,
  rng: () => number,
  minWeapons: number = 1,
): void {
  // 現在の個数をカウント
  let itemCount = 0;
  let weaponCount = 0;
  const floorTiles: Position[] = [];

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const tile = floor.cells[y][x].tile;
      if (tile === TILE_ITEM) itemCount++;
      else if (tile === TILE_WEAPON) weaponCount++;
      else if (tile === TILE_FLOOR) {
        // スタート周辺（マンハッタン距離3以内）は除外
        const dist = Math.abs(x - floor.startPos.x) + Math.abs(y - floor.startPos.y);
        if (dist > 3) {
          floorTiles.push({ x, y });
        }
      }
    }
  }

  // スタートから遠い順にシャッフル（ランダム）して補充
  // Fisher-Yates shuffle
  for (let i = floorTiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [floorTiles[i], floorTiles[j]] = [floorTiles[j], floorTiles[i]];
  }

  let idx = 0;
  // アイテムを補充
  while (itemCount < minItems && idx < floorTiles.length) {
    const pos = floorTiles[idx++];
    floor.cells[pos.y][pos.x].tile = TILE_ITEM;
    itemCount++;
  }
  // 武器を補充
  while (weaponCount < minWeapons && idx < floorTiles.length) {
    const pos = floorTiles[idx++];
    floor.cells[pos.y][pos.x].tile = TILE_WEAPON;
    weaponCount++;
  }
}

// ---------------------------------------------------------------------------
// スタート・階段配置
// ---------------------------------------------------------------------------

/**
 * 指定の部屋の内部でランダムな FLOOR タイル座標を返す。
 */
function randomFloorInRoom(room: Room, cells: Cell[][], rng: () => number): Position | null {
  const candidates: Position[] = [];
  const innerX1 = room.bounds.x + 1;
  const innerY1 = room.bounds.y + 1;
  const innerX2 = room.bounds.x + room.bounds.width - 2;
  const innerY2 = room.bounds.y + room.bounds.height - 2;
  for (let y = innerY1; y <= innerY2; y++) {
    for (let x = innerX1; x <= innerX2; x++) {
      if (cells[y]?.[x]?.tile === TILE_FLOOR) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

// ---------------------------------------------------------------------------
// メイン: フロア生成
// ---------------------------------------------------------------------------

/**
 * 指定の階層のフロアを生成して返す。
 *
 * @param floorNumber - 生成する階層番号（1始まり）
 * @param seed - 乱数シード。省略時は Date.now() を使用する。
 * @returns 生成済みの Floor オブジェクト
 * @throws 最大試行回数を超えても有効なフロアを生成できなかった場合
 */
export function generateFloor(floorNumber: number, seed?: number): Floor {
  const resolvedSeed = seed ?? Date.now();
  const rng = createRng(resolvedSeed);

  const { width, height } = getMapSize(floorNumber);

  // 最大リトライ回数（BFS 検証失敗時に再生成する）
  const MAX_RETRY = 10;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const floor = attemptGenerate(floorNumber, width, height, resolvedSeed + attempt, rng);
    if (validateFloor(floor)) {
      return floor;
    }
  }

  // フォールバック: 全マス FLOOR の単純なフロアを返す（ゲームを止めない）
  return generateFallbackFloor(floorNumber, width, height, resolvedSeed);
}

/**
 * 1回分のフロア生成を試みる。
 */
function attemptGenerate(
  floorNumber: number,
  width: number,
  height: number,
  seed: number,
  rng: () => number,
): Floor {
  const cells = createEmptyCells(width, height);

  // 再帰分割で葉ノード（パーティション）一覧を取得
  const leaves: Partition[] = [];
  dividePartition({ x: 0, y: 0, width, height }, rng, leaves);

  // 各葉ノードに部屋を彫り込む
  const rooms: Room[] = [];
  for (let i = 0; i < leaves.length; i++) {
    const bounds = carveRoomInPartition(leaves[i], cells, rng);
    rooms.push({
      id: i,
      type: RoomType.NORMAL,
      bounds,
      doors: [],
      isLocked: false,
    });
  }

  // 部屋を廊下で接続
  connectRooms(rooms, cells, rng);

  // スタート部屋（index 0）・階段部屋（最後の部屋）を決定
  const startRoom = rooms[0];
  const stairsRoom = rooms[rooms.length - 1];

  // 仮の Floor オブジェクトを作成（randomFloorInRoom に必要）
  const tempFloor: Floor = {
    floorNumber,
    width,
    height,
    cells,
    rooms,
    startPos: { x: 0, y: 0 },
    stairsPos: { x: 0, y: 0 },
    seed,
  };

  const startPos =
    randomFloorInRoom(startRoom, cells, rng) ?? roomCenter(startRoom.bounds);
  const stairsPos =
    randomFloorInRoom(stairsRoom, cells, rng) ?? roomCenter(stairsRoom.bounds);

  tempFloor.startPos = startPos;
  tempFloor.stairsPos = stairsPos;

  // スタートと階段のタイルをセット
  setTileAt(tempFloor, startPos, TILE_START);
  setTileAt(tempFloor, stairsPos, TILE_STAIRS_DOWN);

  // 部屋タイプ割り当て（スタート・階段部屋は NORMAL のまま）
  // スタート・階段部屋がボス等に割り当てられないようindex除外
  const assignableRooms = rooms.slice(1, rooms.length - 1);
  assignRoomTypes(assignableRooms, floorNumber, rng);

  // 特殊地形配置
  placeSpecialTerrain(tempFloor, floorNumber, rng);

  // ひび割れ壁配置
  placeCrackedWalls(tempFloor, rng);

  // 施設配置（REST・REPAIR・SHOP・HINT）
  placeRoomFacilities(tempFloor, rng);

  // 敵・アイテム・ゴールド・罠配置
  placeEntities(tempFloor, floorNumber, rng);

  // 最低アイテム/武器数保証: アイテム3個・武器1個未満なら補充する
  ensureMinimumItems(tempFloor, 3, rng, 1);

  return tempFloor;
}

/**
 * 休憩所フロアを生成する。
 * 4F→5F間、9F→10F間など floor % 5 === 4 の階段を降りると入る。
 * 敵なし・一部屋構成・ゆったりした雰囲気のフロア。
 *
 * @param parentFloor - 休憩所に入る直前のフロア番号
 * @returns 休憩所フロアの Floor オブジェクト
 */
export function generateRestFloor(parentFloor: number): Floor {
  const width = 22;
  const height = 22;
  const cells = createEmptyCells(width, height);

  // 内部 (1..20, 1..20) すべて TILE_FLOOR にする
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      cells[y][x] = { tile: TILE_FLOOR, isVisible: true, isExplored: true };
    }
  }
  // 外縁は壁（すでに TILE_WALL）だが isExplored を true にして最初から見える
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells[y][x].isExplored = true;
      cells[y][x].isVisible = true;
    }
  }

  const startPos: Position = { x: 3, y: 11 };
  const stairsPos: Position = { x: 19, y: 11 };

  cells[startPos.y][startPos.x].tile = TILE_START;
  cells[stairsPos.y][stairsPos.x].tile = TILE_STAIRS_DOWN;

  // NPC・設備の配置
  cells[6][10].tile = TILE_SHOP;     // ショップ NPC
  cells[16][10].tile = TILE_REPAIR;  // 修理屋
  cells[11][14].tile = TILE_STORAGE; // 拠点倉庫アクセス

  const bounds: Bounds = { x: 0, y: 0, width, height };
  const room: Room = {
    id: 0,
    type: RoomType.NORMAL,
    bounds,
    doors: [],
    isLocked: false,
  };

  return {
    floorNumber: parentFloor,
    width,
    height,
    cells,
    rooms: [room],
    startPos,
    stairsPos,
    seed: parentFloor * 7777,
    isRestFloor: true,
  };
}

/**
 * BFS 検証が全試行で失敗した場合のフォールバックフロアを生成する。
 * 全マス FLOOR の単純な構造で、ゲームが止まらないことを優先する。
 */
function generateFallbackFloor(
  floorNumber: number,
  width: number,
  height: number,
  seed: number,
): Floor {
  const cells = createEmptyCells(width, height);

  // 外周を壁、内部を FLOOR にする
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      cells[y][x].tile = TILE_FLOOR;
    }
  }

  const startPos: Position = { x: 1, y: 1 };
  const stairsPos: Position = { x: width - 2, y: height - 2 };
  cells[startPos.y][startPos.x].tile = TILE_START;
  cells[stairsPos.y][stairsPos.x].tile = TILE_STAIRS_DOWN;

  const bounds: Bounds = { x: 0, y: 0, width, height };
  const room: Room = {
    id: 0,
    type: RoomType.NORMAL,
    bounds,
    doors: [],
    isLocked: false,
  };

  return {
    floorNumber,
    width,
    height,
    cells,
    rooms: [room],
    startPos,
    stairsPos,
    seed,
  };
}
