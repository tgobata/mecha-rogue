/**
 * @fileoverview メカローグ コア型定義
 * ゲーム全体で共有する型をここに集約する。React に依存しない純粋 TypeScript。
 */

import type {
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
  TILE_UNKNOWN,
  TILE_CRACKED_WALL,
  TILE_WATER,
  TILE_LAVA,
  TILE_ICE,
  TILE_WARP,
  TILE_MAGNETIC,
} from './constants';

// ---------------------------------------------------------------------------
// タイル
// ---------------------------------------------------------------------------

/**
 * マップ上のタイル種別。
 * 各値は constants.ts の TILE_* 定数と一致する。
 */
export type TileType =
  | typeof TILE_FLOOR
  | typeof TILE_WALL
  | typeof TILE_STAIRS_DOWN
  | typeof TILE_START
  | typeof TILE_ITEM
  | typeof TILE_WEAPON
  | typeof TILE_GOLD
  | typeof TILE_ENEMY
  | typeof TILE_BOSS
  | typeof TILE_TRAP
  | typeof TILE_REST
  | typeof TILE_REPAIR
  | typeof TILE_SHOP
  | typeof TILE_HINT
  | typeof TILE_UNKNOWN
  | typeof TILE_CRACKED_WALL
  | typeof TILE_WATER
  | typeof TILE_LAVA
  | typeof TILE_ICE
  | typeof TILE_WARP
  | typeof TILE_MAGNETIC;

// ---------------------------------------------------------------------------
// 座標
// ---------------------------------------------------------------------------

/** マップ上の2次元座標。x が列、y が行。 */
export interface Position {
  readonly x: number;
  readonly y: number;
}

// ---------------------------------------------------------------------------
// セル
// ---------------------------------------------------------------------------

/**
 * マップの1マス分の情報。
 * isVisible: 現在プレイヤーの視野内か
 * isExplored: 一度でも視野に入ったか（探索済み）
 */
export interface Cell {
  tile: TileType;
  isVisible: boolean;
  isExplored: boolean;
}

// ---------------------------------------------------------------------------
// 部屋タイプ
// ---------------------------------------------------------------------------

/** 部屋の種別 */
export enum RoomType {
  /** 通常部屋 */
  NORMAL = 'NORMAL',
  /** モンスターハウス（入室で大量敵出現） */
  MONSTER_HOUSE = 'MONSTER_HOUSE',
  /** 宝物部屋（隠し壁の奥） */
  TREASURE = 'TREASURE',
  /** 罠部屋（落とし穴・地雷多数） */
  TRAP = 'TRAP',
  /** ボス部屋（5の倍数階に必ず出現、入室でドアロック） */
  BOSS = 'BOSS',
}

// ---------------------------------------------------------------------------
// 部屋の矩形範囲
// ---------------------------------------------------------------------------

/**
 * 部屋の外周を含む矩形。
 * x, y は左上隅の座標、width / height は壁を含む総サイズ。
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// ドア
// ---------------------------------------------------------------------------

/** 部屋の出入口（通路との接続点） */
export interface Door {
  position: Position;
  /** ドアがロックされているか（ボス部屋などで使用） */
  isLocked: boolean;
}

// ---------------------------------------------------------------------------
// 部屋
// ---------------------------------------------------------------------------

/**
 * フロア上の1つの部屋。
 * bounds は壁を含む外形。内部タイルは bounds を1マス縮めた領域。
 */
export interface Room {
  /** フロア内でユニークな識別子 */
  id: number;
  type: RoomType;
  bounds: Bounds;
  doors: Door[];
  /** ボス部屋など、入室後にロックされる部屋か */
  isLocked: boolean;
}

// ---------------------------------------------------------------------------
// フロア
// ---------------------------------------------------------------------------

/**
 * 1フロア分のマップデータ。
 * cells は [y][x] の2次元配列（行優先）。
 */
export interface Floor {
  /** フロア番号（1始まり） */
  floorNumber: number;
  /** マップ幅（タイル数） */
  width: number;
  /** マップ高さ（タイル数） */
  height: number;
  /**
   * タイルの2次元配列。
   * アクセス: cells[y][x]
   */
  cells: Cell[][];
  /** このフロアに存在する部屋一覧 */
  rooms: Room[];
  /** プレイヤーのスタート座標 */
  startPos: Position;
  /** 下り階段の座標 */
  stairsPos: Position;
  /** 生成に使用したシード値（再現性のため保持） */
  seed: number;
}
