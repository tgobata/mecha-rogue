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
  TILE_OIL,
  TILE_FIRE,
  OIL_MIN_FLOOR,
  FIRE_MIN_FLOOR,
  OIL_SPAWN_RATE,
  FIRE_SPAWN_RATE_RARE,
  FIRE_SPAWN_RATE_SMALL,
  FIRE_SPAWN_RATE_NORMAL,
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

/** ボスフロア番号 → ボスサイズ（タイル数）のマップ */
const BOSS_FLOOR_SIZE_MAP = new Map<number, number>(
  (bossDefsRaw as Array<{ floor: number; size?: number }>).map((b) => [b.floor, b.size ?? 2]),
);

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

/**
 * 2点間をN マス幅のL字型廊下で接続する（ボス部屋への通路用）。
 *
 * @param width - 廊下幅（ボスサイズに合わせる）
 */
function carveCorridorN(
  from: Position,
  to: Position,
  cells: Cell[][],
  rng: () => number,
  width: number,
): void {
  const hFirst = rng() < 0.5;
  if (hFirst) {
    for (let d = 0; d < width; d++) {
      carveHorizontal(cells, from.y + d, Math.min(from.x, to.x), Math.max(from.x, to.x));
    }
    for (let d = 0; d < width; d++) {
      carveVertical(cells, to.x + d, Math.min(from.y, to.y), Math.max(from.y, to.y));
    }
  } else {
    for (let d = 0; d < width; d++) {
      carveVertical(cells, from.x + d, Math.min(from.y, to.y), Math.max(from.y, to.y));
    }
    for (let d = 0; d < width; d++) {
      carveHorizontal(cells, to.y + d, Math.min(from.x, to.x), Math.max(from.x, to.x));
    }
  }
}

/**
 * ボス部屋の床をボスサイズに合わせて拡張する。
 * 内寸 = max(8, bossSize * 2 + 2) × max(8, bossSize * 2 + 2)。
 * 既存の部屋中心を基準にグリッド境界を超えないよう床タイルを追加し、bounds を更新する。
 *
 * @param bossSize - ボスのタイルサイズ（bosses.json の size フィールド）
 */
function expandBossRoom(room: Room, cells: Cell[][], bossSize: number): void {
  const innerSize = Math.max(8, bossSize * 2 + 2);
  const centerX = room.bounds.x + Math.floor(room.bounds.width / 2);
  const centerY = room.bounds.y + Math.floor(room.bounds.height / 2);

  const half = Math.floor(innerSize / 2);
  const x1 = Math.max(1, centerX - half);
  const y1 = Math.max(1, centerY - half);
  const x2 = Math.min((cells[0]?.length ?? 2) - 2, centerX + half);
  const y2 = Math.min(cells.length - 2, centerY + half);

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (cells[y]?.[x] !== undefined) {
        cells[y][x].tile = TILE_FLOOR;
      }
    }
  }

  room.bounds = {
    x: x1 - 1,
    y: y1 - 1,
    width:  x2 - x1 + 3,
    height: y2 - y1 + 3,
  };
}

// ---------------------------------------------------------------------------
// 部屋接続（最小スパニングツリー風: 隣接ペアを順番に接続）
// ---------------------------------------------------------------------------

/**
 * 全部屋を順番に隣接ペアで廊下接続する。
 * シャッフルして接続順をランダム化する。
 */
function connectRooms(rooms: Room[], cells: Cell[][], rng: () => number, bossCorridorWidth: number = 1): void {
  if (rooms.length === 0) return;

  // Fisher-Yates シャッフル
  const shuffled = [...rooms];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // 隣接ペアを廊下で接続（全部屋が連結になる）
  // ボス部屋に接続する廊下はボスサイズ幅にする
  for (let i = 0; i < shuffled.length - 1; i++) {
    const fromCenter = roomCenter(shuffled[i].bounds);
    const toCenter = roomCenter(shuffled[i + 1].bounds);
    const isBossConnection =
      shuffled[i].type === RoomType.BOSS || shuffled[i + 1].type === RoomType.BOSS;
    if (isBossConnection && bossCorridorWidth > 1) {
      carveCorridorN(fromCenter, toCenter, cells, rng, bossCorridorWidth);
    } else {
      carveCorridor(fromCenter, toCenter, cells, rng);
    }
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
// オイルマス配置
// ---------------------------------------------------------------------------

/**
 * 2階以降にオイルマスをランダム配置する。
 * 階段・スタート地点は除外し、BFS で到達可能性を担保するため、
 * 配置後に階段への経路が塞がれないよう隣接チェックを行う。
 */
function placeOilTiles(
  floor: Floor,
  floorNumber: number,
  rng: () => number,
): void {
  if (floorNumber < OIL_MIN_FLOOR) return;

  // 4の倍数階（オイルドラム多出現）は2倍の密度
  const rate = (floorNumber % 4 === 0) ? OIL_SPAWN_RATE * 2 : OIL_SPAWN_RATE;

  for (let y = 1; y < floor.height - 1; y++) {
    for (let x = 1; x < floor.width - 1; x++) {
      if (floor.cells[y][x].tile !== TILE_FLOOR) continue;
      if (x === floor.startPos.x && y === floor.startPos.y) continue;
      if (x === floor.stairsPos.x && y === floor.stairsPos.y) continue;
      // 階段の隣接マスもオイルで埋めない（移動不能防止）
      const nearStairs =
        Math.abs(x - floor.stairsPos.x) + Math.abs(y - floor.stairsPos.y) <= 1;
      if (nearStairs) continue;

      if (rng() < rate) {
        floor.cells[y][x].tile = TILE_OIL;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 炎マス配置
// ---------------------------------------------------------------------------

/**
 * 3階以降に炎マスをランダム配置する（初期配置のみ。残りターン管理はターンシステム側）。
 * 3〜6F: 稀、7〜9F: 小、10F〜: 溶岩と同程度。
 * スタート・階段付近には配置しない。
 */
function placeFireTiles(
  floor: Floor,
  floorNumber: number,
  rng: () => number,
): void {
  if (floorNumber < FIRE_MIN_FLOOR) return;

  let rate: number;
  if (floorNumber >= 10) {
    rate = FIRE_SPAWN_RATE_NORMAL;
  } else if (floorNumber >= 7) {
    rate = FIRE_SPAWN_RATE_SMALL;
  } else {
    rate = FIRE_SPAWN_RATE_RARE;
  }

  for (let y = 1; y < floor.height - 1; y++) {
    for (let x = 1; x < floor.width - 1; x++) {
      if (floor.cells[y][x].tile !== TILE_FLOOR) continue;
      if (x === floor.startPos.x && y === floor.startPos.y) continue;
      if (x === floor.stairsPos.x && y === floor.stairsPos.y) continue;
      const nearStairs =
        Math.abs(x - floor.stairsPos.x) + Math.abs(y - floor.stairsPos.y) <= 1;
      if (nearStairs) continue;

      if (rng() < rate) {
        floor.cells[y][x].tile = TILE_FIRE;
      }
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
  /** 各階のショップ配置上限 */
  const MAX_SHOPS_PER_FLOOR = 2;
  let shopCount = 0;

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
      if (shopCount < MAX_SHOPS_PER_FLOOR) {
        floor.cells[center.y][center.x].tile = TILE_SHOP;
        shopCount++;
      }
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

  // ジャンクキング系のボス部屋にデブリ壁（TILE_CRACKED_WALL）を散らばらせる
  const bossFloorDef = (bossDefsRaw as any[]).find(b => b.floor === floorNumber);
  if (bossFloorDef && (bossFloorDef.id === 'junk_king' || bossFloorDef.id === 'junk_king_lv2')) {
    const debrisCount = 19; // 配置するデブリ数
    let placed = 0;
    for (const room of floor.rooms) {
      if (room.type !== RoomType.BOSS) continue;
      const innerX1 = room.bounds.x + 1;
      const innerY1 = room.bounds.y + 1;
      const innerX2 = room.bounds.x + room.bounds.width - 2;
      const innerY2 = room.bounds.y + room.bounds.height - 2;
      // 部屋内のFLOORタイルをランダムにデブリに変換
      const candidates: Position[] = [];
      for (let dy = innerY1; dy <= innerY2; dy++) {
        for (let dx = innerX1; dx <= innerX2; dx++) {
          if (floor.cells[dy]?.[dx]?.tile !== TILE_FLOOR) continue;
          // ボス配置中心から2マス以内は除外
          const centerPos = roomCenter(room.bounds);
          if (Math.abs(dx - centerPos.x) <= 2 && Math.abs(dy - centerPos.y) <= 2) continue;
          candidates.push({ x: dx, y: dy });
        }
      }
      // シャッフルして最大 debrisCount 個置く
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (const cand of candidates.slice(0, debrisCount)) {
        floor.cells[cand.y][cand.x].tile = TILE_CRACKED_WALL;
        placed++;
        if (placed >= debrisCount) break;
      }
      break;
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
// 同心円ボスフロア（5の倍数階）
// ---------------------------------------------------------------------------

/** 同心円レイアウトで使う矩形境界（各辺の座標を保持） */
interface RingBounds {
  x: number;      // 左壁の x 座標
  y: number;      // 上壁の y 座標
  right: number;  // 右壁の x 座標（inclusive）
  bottom: number; // 下壁の y 座標（inclusive）
}

/**
 * 5の倍数階用: マップサイズを 1.1〜1.2倍に拡張した値を返す。
 * 階層が増すごとに倍率が上がる（1.1 → 1.133 → 1.167 → 1.2 → 繰り返し）。
 */
function getConcentricMapSize(floorNumber: number): { width: number; height: number } {
  const base = getMapSize(floorNumber);
  const step = Math.floor(floorNumber / 5) - 1; // 0-indexed (floor5=0, floor10=1, ...)
  const scale = 1.1 + (step % 4) * 0.033;
  const s = Math.min(1.2, Math.max(1.1, scale));
  return {
    width:  Math.round(base.width  * s),
    height: Math.round(base.height * s),
  };
}

/**
 * 同心円ボスフロアを生成する（5の倍数階専用）。
 *
 * 構造:
 *   - マップ中央にボス大部屋（階段あり）
 *   - ボス部屋を取り囲む層（リング）が複数存在し、各層は壁・部屋・通路で構成される
 *   - 外側層 → 内側層への入り口は1か所のみ
 *   - プレイヤーは最外層からスタート
 *   - 特殊地形は入り口周辺に配置しない
 */
export function generateConcentricBossFloor(floorNumber: number, seed?: number): Floor {
  const resolvedSeed = seed ?? Date.now();
  const MAX_RETRY = 15;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const floor = attemptGenerateConcentric(floorNumber, resolvedSeed + attempt);
    if (validateFloor(floor)) return floor;
  }

  const { width, height } = getConcentricMapSize(floorNumber);
  return generateFallbackFloor(floorNumber, width, height, resolvedSeed);
}

/**
 * 同心円ボスフロアの1回分生成を試みる。
 */
function attemptGenerateConcentric(floorNumber: number, seed: number): Floor {
  const rng = createRng(seed);
  const { width, height } = getConcentricMapSize(floorNumber);
  const cells = createEmptyCells(width, height);

  const bossSize = BOSS_FLOOR_SIZE_MAP.get(floorNumber) ?? 2;
  const bossInnerSize = Math.max(8, bossSize * 2 + 2);

  // マップ中心
  const cx = Math.floor(width  / 2);
  const cy = Math.floor(height / 2);

  // ボス部屋の内部（床タイル領域）
  const bossHalf = Math.floor(bossInnerSize / 2);
  const bossX1 = cx - bossHalf;
  const bossY1 = cy - bossHalf;
  const bossX2 = cx + bossHalf;
  const bossY2 = cy + bossHalf;

  // ボス部屋を囲む壁ライン（リング0の内壁）
  const bossWall: RingBounds = {
    x: bossX1 - 1, y: bossY1 - 1,
    right: bossX2 + 1, bottom: bossY2 + 1,
  };

  // ---- リング数・厚みを計算 ----
  const MIN_RING_THICKNESS = 7;
  const availLeft   = bossWall.x - 1;
  const availTop    = bossWall.y - 1;
  const availRight  = (width  - 1) - bossWall.right  - 1;
  const availBottom = (height - 1) - bossWall.bottom - 1;
  const available   = Math.min(availLeft, availTop, availRight, availBottom);
  const numRings    = Math.max(2, Math.floor(available / MIN_RING_THICKNESS));
  const ringThickness = Math.floor(available / numRings);

  // wallBounds[0] = ボス壁, wallBounds[i] = リング i の外壁境界
  const wallBounds: RingBounds[] = [bossWall];
  for (let i = 1; i <= numRings; i++) {
    const exp = i * ringThickness;
    wallBounds.push({
      x:      bossWall.x      - exp,
      y:      bossWall.y      - exp,
      right:  bossWall.right  + exp,
      bottom: bossWall.bottom + exp,
    });
  }
  // 最外壁はマップ外周にクランプ
  wallBounds[numRings] = { x: 0, y: 0, right: width - 1, bottom: height - 1 };

  // ---- ボス部屋の床を彫る ----
  for (let y = bossY1; y <= bossY2; y++) {
    for (let x = bossX1; x <= bossX2; x++) {
      cells[y][x].tile = TILE_FLOOR;
    }
  }

  // ---- 入り口位置の保護セット（特殊地形禁止ゾーン） ----
  const protectedPos = new Set<string>();
  // ボス部屋内部を保護（階段・ボスは特殊地形禁止）
  for (let y = bossY1; y <= bossY2; y++) {
    for (let x = bossX1; x <= bossX2; x++) {
      protectedPos.add(`${x},${y}`);
    }
  }

  // ---- 各リングを彫り、仕切り・入り口を設置 ----
  // リング i = wallBounds[i-1]（内壁）と wallBounds[i]（外壁）の間
  for (let ringIdx = 1; ringIdx <= numRings; ringIdx++) {
    const inner = wallBounds[ringIdx - 1];
    const outer = wallBounds[ringIdx];

    carveRingFloor(cells, inner, outer);
    addRingRoomStructure(cells, inner, outer, rng, protectedPos);
    cutEntranceInWall(cells, inner, rng, protectedPos);
  }

  // ---- ボスを中心に配置 ----
  cells[cy][cx].tile = TILE_BOSS;

  // ---- 階段をボス部屋内のランダム位置に配置（ボス位置除く） ----
  const bossFloorTiles: Position[] = [];
  for (let y = bossY1; y <= bossY2; y++) {
    for (let x = bossX1; x <= bossX2; x++) {
      if (x !== cx || y !== cy) bossFloorTiles.push({ x, y });
    }
  }
  shuffleArray(bossFloorTiles, rng);
  const stairsPos: Position = bossFloorTiles[0] ?? { x: bossX1, y: bossY2 };
  cells[stairsPos.y][stairsPos.x].tile = TILE_STAIRS_DOWN;

  // ---- プレイヤースタートを最外リングのランダム床に配置 ----
  const outerInner = wallBounds[numRings - 1];
  const outerOuter = wallBounds[numRings];
  const startPos: Position =
    randomFloorInRingArea(cells, outerInner, outerOuter, rng)
    ?? { x: outerOuter.x + 2, y: outerOuter.y + 2 };
  cells[startPos.y][startPos.x].tile = TILE_START;

  // ---- 部屋リスト構築（BFS検証・entity配置に必要） ----
  const rooms: Room[] = [];
  rooms.push({
    id: 0,
    type: RoomType.BOSS,
    bounds: {
      x: bossWall.x,
      y: bossWall.y,
      width:  bossWall.right  - bossWall.x + 1,
      height: bossWall.bottom - bossWall.y + 1,
    },
    doors: [],
    isLocked: true,
  });
  for (let i = 1; i <= numRings; i++) {
    const wb = wallBounds[i];
    rooms.push({
      id: i,
      type: RoomType.NORMAL,
      bounds: {
        x: wb.x,
        y: wb.y,
        width:  wb.right  - wb.x + 1,
        height: wb.bottom - wb.y + 1,
      },
      doors: [],
      isLocked: false,
    });
  }

  const tempFloor: Floor = {
    floorNumber, width, height, cells, rooms, startPos, stairsPos, seed,
  };

  // ---- 特殊地形・エンティティ配置（保護ゾーンを避ける） ----
  placeSpecialTerrainConcentric(tempFloor, floorNumber, rng, protectedPos);
  placeOilTilesConcentric(tempFloor, floorNumber, rng, protectedPos);
  placeFireTilesConcentric(tempFloor, floorNumber, rng, protectedPos);
  placeCrackedWalls(tempFloor, rng);
  placeShopsConcentric(tempFloor, bossWall, rng, protectedPos);
  placeEntities(tempFloor, floorNumber, rng);
  ensureMinimumItems(tempFloor, 3, rng, 1);

  return tempFloor;
}

// ---------------------------------------------------------------------------
// 同心円ボスフロア用ヘルパー
// ---------------------------------------------------------------------------

/**
 * inner と outer の間のリング状エリアを TILE_FLOOR で塗りつぶす。
 * inner 壁・outer 壁は TILE_WALL のまま残す。
 */
function carveRingFloor(cells: Cell[][], inner: RingBounds, outer: RingBounds): void {
  for (let y = outer.y + 1; y <= outer.bottom - 1; y++) {
    for (let x = outer.x + 1; x <= outer.right - 1; x++) {
      // inner 領域（壁ラインを含む）はスキップ
      if (x >= inner.x && x <= inner.right && y >= inner.y && y <= inner.bottom) continue;
      if (cells[y]?.[x] !== undefined) {
        cells[y][x].tile = TILE_FLOOR;
      }
    }
  }
}

/**
 * リングの上下左右アームそれぞれに仕切り壁を追加し、部屋風の構造を作る。
 * 各仕切りには通路ギャップを設け、コーナー経由で全体が連結されることを保証する。
 */
function addRingRoomStructure(
  cells: Cell[][],
  inner: RingBounds,
  outer: RingBounds,
  rng: () => number,
  protectedPos: Set<string>,
): void {
  const GAP   = 2; // 仕切りに残す通路幅（タイル数）
  const MIN_SEG = 6; // セグメントの最小長

  // ---- 上アーム: y = outer.y+1 〜 inner.y-1, x = outer.x+1 〜 outer.right-1 ----
  const topH = inner.y - outer.y - 1;
  const topW = outer.right - outer.x - 1;
  if (topH >= 3 && topW >= MIN_SEG * 2) {
    const nd = Math.max(1, Math.floor(topW / MIN_SEG) - 1);
    const sl = Math.floor(topW / (nd + 1));
    for (let d = 1; d <= nd; d++) {
      const divX = outer.x + d * sl;
      if (divX <= outer.x || divX >= outer.right) continue;
      const gapY = outer.y + 1 + Math.floor(rng() * Math.max(1, topH - GAP));
      for (let y = outer.y + 1; y < inner.y; y++) {
        if (y >= gapY && y < gapY + GAP) continue;
        if (!protectedPos.has(`${divX},${y}`) && cells[y]?.[divX] !== undefined) {
          cells[y][divX].tile = TILE_WALL;
        }
      }
    }
  }

  // ---- 下アーム: y = inner.bottom+1 〜 outer.bottom-1 ----
  const botH = outer.bottom - inner.bottom - 1;
  const botW = outer.right - outer.x - 1;
  if (botH >= 3 && botW >= MIN_SEG * 2) {
    const nd = Math.max(1, Math.floor(botW / MIN_SEG) - 1);
    const sl = Math.floor(botW / (nd + 1));
    for (let d = 1; d <= nd; d++) {
      const divX = outer.x + d * sl;
      if (divX <= outer.x || divX >= outer.right) continue;
      const gapY = inner.bottom + 1 + Math.floor(rng() * Math.max(1, botH - GAP));
      for (let y = inner.bottom + 1; y < outer.bottom; y++) {
        if (y >= gapY && y < gapY + GAP) continue;
        if (!protectedPos.has(`${divX},${y}`) && cells[y]?.[divX] !== undefined) {
          cells[y][divX].tile = TILE_WALL;
        }
      }
    }
  }

  // ---- 左アーム: x = outer.x+1 〜 inner.x-1, y = inner.y 〜 inner.bottom ----
  const leftW = inner.x - outer.x - 1;
  const leftH = inner.bottom - inner.y + 1;
  if (leftW >= 3 && leftH >= MIN_SEG * 2) {
    const nd = Math.max(1, Math.floor(leftH / MIN_SEG) - 1);
    const sl = Math.floor(leftH / (nd + 1));
    for (let d = 1; d <= nd; d++) {
      const divY = inner.y + d * sl;
      if (divY <= inner.y || divY >= inner.bottom) continue;
      const gapX = outer.x + 1 + Math.floor(rng() * Math.max(1, leftW - GAP));
      for (let x = outer.x + 1; x < inner.x; x++) {
        if (x >= gapX && x < gapX + GAP) continue;
        if (!protectedPos.has(`${x},${divY}`) && cells[divY]?.[x] !== undefined) {
          cells[divY][x].tile = TILE_WALL;
        }
      }
    }
  }

  // ---- 右アーム: x = inner.right+1 〜 outer.right-1 ----
  const rightW = outer.right - inner.right - 1;
  const rightH = inner.bottom - inner.y + 1;
  if (rightW >= 3 && rightH >= MIN_SEG * 2) {
    const nd = Math.max(1, Math.floor(rightH / MIN_SEG) - 1);
    const sl = Math.floor(rightH / (nd + 1));
    for (let d = 1; d <= nd; d++) {
      const divY = inner.y + d * sl;
      if (divY <= inner.y || divY >= inner.bottom) continue;
      const gapX = inner.right + 1 + Math.floor(rng() * Math.max(1, rightW - GAP));
      for (let x = inner.right + 1; x < outer.right; x++) {
        if (x >= gapX && x < gapX + GAP) continue;
        if (!protectedPos.has(`${x},${divY}`) && cells[divY]?.[x] !== undefined) {
          cells[divY][x].tile = TILE_WALL;
        }
      }
    }
  }
}

/**
 * inner 壁の1辺にランダムな位置で2タイル幅の入り口を開ける。
 * 入り口とその周囲 BUFFER タイルを protectedPos に登録する。
 */
function cutEntranceInWall(
  cells: Cell[][],
  inner: RingBounds,
  rng: () => number,
  protectedPos: Set<string>,
): void {
  const EW     = 2; // 入り口幅
  const MARGIN = 2; // コーナーから離す距離
  const BUFFER = 2; // 保護半径

  const innerW = inner.right  - inner.x + 1;
  const innerH = inner.bottom - inner.y + 1;

  // 辺をシャッフルして試みる
  const sides: Array<0 | 1 | 2 | 3> = [0, 1, 2, 3];
  shuffleArray(sides, rng);

  for (const side of sides) {
    if (side === 0 && innerW >= EW + MARGIN * 2) {
      // 上壁 (y = inner.y)
      const minX = inner.x + MARGIN;
      const maxX = inner.right - MARGIN - EW;
      if (maxX < minX) continue;
      const sx = minX + Math.floor(rng() * (maxX - minX + 1));
      for (let i = 0; i < EW; i++) carveEntranceTile(cells, sx + i, inner.y, BUFFER, protectedPos);
      return;
    }
    if (side === 1 && innerW >= EW + MARGIN * 2) {
      // 下壁 (y = inner.bottom)
      const minX = inner.x + MARGIN;
      const maxX = inner.right - MARGIN - EW;
      if (maxX < minX) continue;
      const sx = minX + Math.floor(rng() * (maxX - minX + 1));
      for (let i = 0; i < EW; i++) carveEntranceTile(cells, sx + i, inner.bottom, BUFFER, protectedPos);
      return;
    }
    if (side === 2 && innerH >= EW + MARGIN * 2) {
      // 左壁 (x = inner.x)
      const minY = inner.y + MARGIN;
      const maxY = inner.bottom - MARGIN - EW;
      if (maxY < minY) continue;
      const sy = minY + Math.floor(rng() * (maxY - minY + 1));
      for (let i = 0; i < EW; i++) carveEntranceTile(cells, inner.x, sy + i, BUFFER, protectedPos);
      return;
    }
    if (side === 3 && innerH >= EW + MARGIN * 2) {
      // 右壁 (x = inner.right)
      const minY = inner.y + MARGIN;
      const maxY = inner.bottom - MARGIN - EW;
      if (maxY < minY) continue;
      const sy = minY + Math.floor(rng() * (maxY - minY + 1));
      for (let i = 0; i < EW; i++) carveEntranceTile(cells, inner.right, sy + i, BUFFER, protectedPos);
      return;
    }
  }

  // フォールバック: 上壁中央を強制的に開ける
  const fx = Math.floor((inner.x + inner.right) / 2);
  const fy = inner.y;
  carveEntranceTile(cells, fx, fy, BUFFER, protectedPos);
  if (cells[fy]?.[fx + 1] !== undefined) carveEntranceTile(cells, fx + 1, fy, BUFFER, protectedPos);
}

/**
 * 指定座標を TILE_FLOOR にし、BUFFER 半径内を protectedPos に登録する。
 */
function carveEntranceTile(
  cells: Cell[][],
  x: number,
  y: number,
  buffer: number,
  protectedPos: Set<string>,
): void {
  if (cells[y]?.[x] !== undefined) {
    cells[y][x].tile = TILE_FLOOR;
  }
  for (let dy = -buffer; dy <= buffer; dy++) {
    for (let dx = -buffer; dx <= buffer; dx++) {
      protectedPos.add(`${x + dx},${y + dy}`);
    }
  }
}

/**
 * 配列を Fisher-Yates シャッフルする（副作用あり）。
 */
function shuffleArray<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * inner と outer の間のリングエリアでランダムな TILE_FLOOR 座標を返す。
 */
function randomFloorInRingArea(
  cells: Cell[][],
  inner: RingBounds,
  outer: RingBounds,
  rng: () => number,
): Position | null {
  const candidates: Position[] = [];
  for (let y = outer.y + 1; y <= outer.bottom - 1; y++) {
    for (let x = outer.x + 1; x <= outer.right - 1; x++) {
      if (x >= inner.x && x <= inner.right && y >= inner.y && y <= inner.bottom) continue;
      if (cells[y]?.[x]?.tile === TILE_FLOOR) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * protectedPos を避けて特殊地形を配置する（同心円ボスフロア用）。
 */
function placeSpecialTerrainConcentric(
  floor: Floor,
  floorNumber: number,
  rng: () => number,
  protectedPos: Set<string>,
): void {
  for (let y = 1; y < floor.height - 1; y++) {
    for (let x = 1; x < floor.width - 1; x++) {
      if (floor.cells[y][x].tile !== TILE_FLOOR) continue;
      if (protectedPos.has(`${x},${y}`)) continue;
      if ((x === floor.startPos.x  && y === floor.startPos.y) ||
          (x === floor.stairsPos.x && y === floor.stairsPos.y)) continue;

      const roll = rng();
      if (roll < SPECIAL_TERRAIN_RATE) {
        const tr = rng();
        const av: TileType[] = [TILE_WATER];
        if (floorNumber >= LAVA_MIN_FLOOR)     av.push(TILE_LAVA);
        if (floorNumber >= ICE_MIN_FLOOR)      av.push(TILE_ICE);
        if (floorNumber >= WARP_MIN_FLOOR)     av.push(TILE_WARP);
        if (floorNumber >= MAGNETIC_MIN_FLOOR) av.push(TILE_MAGNETIC);
        floor.cells[y][x].tile = av[Math.floor(tr * av.length)];
      }
    }
  }
}

/**
 * protectedPos を避けてオイルマスを配置する（同心円ボスフロア用）。
 */
function placeOilTilesConcentric(
  floor: Floor,
  floorNumber: number,
  rng: () => number,
  protectedPos: Set<string>,
): void {
  if (floorNumber < OIL_MIN_FLOOR) return;
  const rate = (floorNumber % 4 === 0) ? OIL_SPAWN_RATE * 2 : OIL_SPAWN_RATE;

  for (let y = 1; y < floor.height - 1; y++) {
    for (let x = 1; x < floor.width - 1; x++) {
      if (floor.cells[y][x].tile !== TILE_FLOOR) continue;
      if (protectedPos.has(`${x},${y}`)) continue;
      if ((x === floor.startPos.x  && y === floor.startPos.y) ||
          (x === floor.stairsPos.x && y === floor.stairsPos.y)) continue;
      const nearStairs =
        Math.abs(x - floor.stairsPos.x) + Math.abs(y - floor.stairsPos.y) <= 1;
      if (nearStairs) continue;
      if (rng() < rate) floor.cells[y][x].tile = TILE_OIL;
    }
  }
}

/**
 * protectedPos を避けて炎マスを配置する（同心円ボスフロア用）。
 */
function placeFireTilesConcentric(
  floor: Floor,
  floorNumber: number,
  rng: () => number,
  protectedPos: Set<string>,
): void {
  if (floorNumber < FIRE_MIN_FLOOR) return;
  let rate: number;
  if (floorNumber >= 10)     rate = FIRE_SPAWN_RATE_NORMAL;
  else if (floorNumber >= 7) rate = FIRE_SPAWN_RATE_SMALL;
  else                       rate = FIRE_SPAWN_RATE_RARE;

  for (let y = 1; y < floor.height - 1; y++) {
    for (let x = 1; x < floor.width - 1; x++) {
      if (floor.cells[y][x].tile !== TILE_FLOOR) continue;
      if (protectedPos.has(`${x},${y}`)) continue;
      if ((x === floor.startPos.x  && y === floor.startPos.y) ||
          (x === floor.stairsPos.x && y === floor.stairsPos.y)) continue;
      const nearStairs =
        Math.abs(x - floor.stairsPos.x) + Math.abs(y - floor.stairsPos.y) <= 1;
      if (nearStairs) continue;
      if (rng() < rate) floor.cells[y][x].tile = TILE_FIRE;
    }
  }
}

/**
 * 同心円ボスフロアにショップを配置する（通常階と同じ確率）。
 * ボス部屋エリアおよび保護ゾーンを除いた TILE_FLOOR セルに配置する。
 */
function placeShopsConcentric(
  floor: Floor,
  bossWall: RingBounds,
  rng: () => number,
  protectedPos: Set<string>,
): void {
  const MAX_SHOPS_PER_FLOOR = 2;

  const candidates: Position[] = [];
  for (let y = 1; y < floor.height - 1; y++) {
    for (let x = 1; x < floor.width - 1; x++) {
      if (floor.cells[y][x].tile !== TILE_FLOOR) continue;
      if (protectedPos.has(`${x},${y}`)) continue;
      // ボス部屋エリア内はスキップ
      if (x >= bossWall.x && x <= bossWall.right && y >= bossWall.y && y <= bossWall.bottom) continue;
      candidates.push({ x, y });
    }
  }

  shuffleArray(candidates, rng);

  let shopCount = 0;
  for (const pos of candidates) {
    if (shopCount >= MAX_SHOPS_PER_FLOOR) break;
    if (rng() < SHOP_SPAWN_RATE) {
      floor.cells[pos.y][pos.x].tile = TILE_SHOP;
      shopCount++;
    }
  }
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
  // 5の倍数階は同心円ボスフロアを生成する
  if (floorNumber % 5 === 0) {
    return generateConcentricBossFloor(floorNumber, seed);
  }

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

  // スタート部屋（index 0）・階段部屋（最後の部屋）を決定
  const startRoom = rooms[0];
  const stairsRoom = rooms[rooms.length - 1];

  // 部屋タイプ割り当て（廊下接続前に行いボス部屋を特定する）
  // スタート・階段部屋がボス等に割り当てられないようindex除外
  const assignableRooms = rooms.slice(1, rooms.length - 1);
  assignRoomTypes(assignableRooms, floorNumber, rng);

  // ボス部屋を拡張（ボス階層のみ）
  const bossSize = BOSS_FLOOR_SIZE_MAP.get(floorNumber) ?? 2;
  if (BOSS_FLOOR_SET.has(floorNumber)) {
    const bossRoom = assignableRooms.find(r => r.type === RoomType.BOSS);
    if (bossRoom) expandBossRoom(bossRoom, cells, bossSize);
  }

  // 部屋を廊下で接続（ボス部屋への廊下はボスサイズ幅）
  connectRooms(rooms, cells, rng, bossSize);

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

  // 特殊地形配置
  placeSpecialTerrain(tempFloor, floorNumber, rng);

  // オイルマス配置
  placeOilTiles(tempFloor, floorNumber, rng);

  // 炎マス配置
  placeFireTiles(tempFloor, floorNumber, rng);

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
  const width = 14;
  const height = 14;
  const cells = createEmptyCells(width, height);

  // 内部 (1..12, 1..12) すべて TILE_FLOOR にする
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

  const startPos: Position = { x: 2, y: 7 };
  const stairsPos: Position = { x: 12, y: 7 };

  cells[startPos.y][startPos.x].tile = TILE_START;
  cells[stairsPos.y][stairsPos.x].tile = TILE_STAIRS_DOWN;

  // NPC・設備の配置
  cells[3][7].tile = TILE_SHOP;     // ショップ NPC
  cells[11][7].tile = TILE_REPAIR;  // 修理屋
  cells[7][10].tile = TILE_STORAGE; // 拠点倉庫アクセス

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
