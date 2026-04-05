/**
 * @fileoverview メカローグ ゲーム定数定義
 * マジックナンバーを排除し、全定数をここに集約する。
 */

// ---------------------------------------------------------------------------
// タイル種別
// ---------------------------------------------------------------------------

/** 通路（移動可能） */
export const TILE_FLOOR = '.' as const;
/** 壁（移動不可） */
export const TILE_WALL = '#' as const;
/** 下り階段（各階1つ） */
export const TILE_STAIRS_DOWN = '>' as const;
/** スタート地点 */
export const TILE_START = 'S' as const;
/** アイテム */
export const TILE_ITEM = '$' as const;
/** お金 */
export const TILE_GOLD = 'G' as const;
/** 敵 */
export const TILE_ENEMY = 'E' as const;
/** ボス */
export const TILE_BOSS = 'B' as const;
/** 落とし穴 */
export const TILE_TRAP = 'T' as const;
/** 休憩ポイント（HP回復） */
export const TILE_REST = 'R' as const;
/** 武器修理ポイント */
export const TILE_REPAIR = 'W' as const;
/** ショップ */
export const TILE_SHOP = 'P' as const;
/** ヒント石碑 */
export const TILE_HINT = 'H' as const;
/** 未発見タイル */
export const TILE_UNKNOWN = '?' as const;
/** ひび割れ壁（破壊可能） */
export const TILE_CRACKED_WALL = 'C' as const;
/** フロアに落ちている武器 */
export const TILE_WEAPON = 'V' as const;
/** 水たまり */
export const TILE_WATER = 'w' as const;
/** 溶岩（10階以降） */
export const TILE_LAVA = 'l' as const;
/** 氷（15階以降） */
export const TILE_ICE = 'i' as const;
/** ワープタイル（20階以降） */
export const TILE_WARP = 'X' as const;
/** 磁場（25階以降） */
export const TILE_MAGNETIC = 'M' as const;
/** 拠点倉庫アクセスポイント（休憩所フロア専用） */
export const TILE_STORAGE = 'A' as const;
/** オイルマス（2階以降。滑走。爆発で炎マスに変化） */
export const TILE_OIL = 'o' as const;
/** 炎マス（3階以降。毎ターンダメージ。3ターンで消滅） */
export const TILE_FIRE = 'f' as const;

// ---------------------------------------------------------------------------
// マップサイズ（階層別）
// ---------------------------------------------------------------------------

/**
 * 各フロア帯のマップサイズ定義。
 * #012: 初期フロアを 30×30 に拡大し、全クリ想定 10〜20時間に合わせてスケールアップ。
 */
export const FLOOR_SIZES = [
  { minFloor: 1,  maxFloor: 5,  width: 30, height: 30 },
  { minFloor: 6,  maxFloor: 10, width: 35, height: 35 },
  { minFloor: 11, maxFloor: 20, width: 40, height: 40 },
  { minFloor: 21, maxFloor: 30, width: 48, height: 48 },
  { minFloor: 31, maxFloor: Infinity, width: 55, height: 55 },
] as const;

// ---------------------------------------------------------------------------
// 視界
// ---------------------------------------------------------------------------

/** プレイヤーの視界半径（タイル数） */
export const VIEW_RADIUS = 5;

// ---------------------------------------------------------------------------
// 部屋サイズ制約
// ---------------------------------------------------------------------------

/** 部屋の最小幅・高さ（壁を含まない内寸） */
export const ROOM_MIN_INNER_SIZE = 3;
/** 再帰分割が停止する最小セル幅（壁込み） */
export const PARTITION_MIN_SIZE = 7;

// ---------------------------------------------------------------------------
// 特殊地形の登場階層閾値
// ---------------------------------------------------------------------------

/** 溶岩が出現し始める階 */
export const LAVA_MIN_FLOOR = 10;
/** 氷が出現し始める階 */
export const ICE_MIN_FLOOR = 15;
/** ワープが出現し始める階 */
export const WARP_MIN_FLOOR = 20;
/** 磁場が出現し始める階 */
export const MAGNETIC_MIN_FLOOR = 25;
/** オイルマスが出現し始める階 */
export const OIL_MIN_FLOOR = 2;
/** 炎マスが出現し始める階 */
export const FIRE_MIN_FLOOR = 3;
/** 炎マスが消えるまでのターン数 */
export const FIRE_TILE_DURATION = 3;
/** 炎マスのプレイヤーへの毎ターンダメージ率（最大HPに対する割合） */
export const FIRE_DAMAGE_PLAYER_RATE = 0.07;
/** 炎マスの敵への毎ターンダメージ率（最大HPに対する割合） */
export const FIRE_DAMAGE_ENEMY_RATE = 0.13;

// ---------------------------------------------------------------------------
// ボス・特殊部屋
// ---------------------------------------------------------------------------

/** ボス部屋が必ず出現する階の周期（5の倍数） */
export const BOSS_FLOOR_INTERVAL = 5;

// ---------------------------------------------------------------------------
// 配置確率（0〜1）
// ---------------------------------------------------------------------------

/** 通常敵の配置確率（通路1マスあたり） */
export const ENEMY_SPAWN_RATE = 0.04;
/** アイテムの配置確率（武器:アイテム = 2:7 比率） */
export const ITEM_SPAWN_RATE = 0.02;
/** 武器の配置確率（ITEM_SPAWN_RATE × 2/7 ≈ 0.006） */
export const WEAPON_SPAWN_RATE = 0.006;
/** ゴールドの配置確率 */
export const GOLD_SPAWN_RATE = 0.03;
/** 罠の配置確率 */
export const TRAP_SPAWN_RATE = 0.015;
/** ひび割れ壁の配置確率（壁1マスあたり） */
export const CRACKED_WALL_RATE = 0.06;
/** 特殊地形1マスあたりの配置確率 */
export const SPECIAL_TERRAIN_RATE = 0.03;
/** オイルマスの配置確率（床1マスあたり） */
export const OIL_SPAWN_RATE = 0.025;
/** 炎マスの配置確率（3〜6F: 稀, 7〜9F: 小, 10F〜: 溶岩同等） */
export const FIRE_SPAWN_RATE_RARE = 0.004;
export const FIRE_SPAWN_RATE_SMALL = 0.008;
export const FIRE_SPAWN_RATE_NORMAL = 0.025;
/** 休憩ポイントの配置確率（部屋1つあたり） */
export const REST_SPAWN_RATE = 0.08;
/** 武器修理ポイントの配置確率（部屋1つあたり。ショップの 1/6） */
export const REPAIR_SPAWN_RATE = 0.02;
/** ショップの配置確率（部屋1つあたり） */
export const SHOP_SPAWN_RATE = 0.10;
/** ヒント石碑の配置確率（部屋1つあたり） */
export const HINT_SPAWN_RATE = 0.05;
/** 宝物部屋の配置確率（全部屋中） */
export const TREASURE_ROOM_RATE = 0.1;
/** 罠部屋の配置確率（全部屋中） */
export const TRAP_ROOM_RATE = 0.1;
/** モンスターハウスの配置確率（全部屋中） */
export const MONSTER_HOUSE_RATE = 0.08;

// ---------------------------------------------------------------------------
// BFS検証
// ---------------------------------------------------------------------------

/** フロアの最大アイテム生成数（モンスターハウス・宝物部屋は除く） */
export const MAX_SPAWN_ITEMS = 3;
/** フロアの最大武器生成数（モンスターハウス・宝物部屋は除く） */
export const MAX_SPAWN_WEAPONS = 1;
/** フロアの最大ゴールド生成数（モンスターハウス・宝物部屋は除く） */
export const MAX_SPAWN_GOLD = 3;
/** 宝物部屋内の最大アイテム生成数 */
export const MAX_TREASURE_ROOM_ITEMS = 5;
/** 宝物部屋内の最大ゴールド生成数 */
export const MAX_TREASURE_ROOM_GOLD = 4;


/** BFSで到達可能性チェックする際に移動可能とみなすタイル一覧 */
export const WALKABLE_TILES = new Set([
  TILE_FLOOR,
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
  TILE_WATER,
  TILE_LAVA,
  TILE_ICE,
  TILE_WARP,
  TILE_MAGNETIC,
  TILE_STORAGE,
  TILE_OIL,
  TILE_FIRE,
]);

/** 破壊可能タイル一覧 */
export const DESTRUCTIBLE_TILES = new Set([TILE_CRACKED_WALL]);

// ---------------------------------------------------------------------------
// ターンシステム
// ---------------------------------------------------------------------------

/**
 * 敵がプレイヤーに向かって行動する視界距離（マンハッタン距離）。
 * この距離以内にプレイヤーがいる場合のみ敵は行動する。
 */
export const ENEMY_SIGHT_RANGE = 5;

/**
 * バンプ攻撃・通常攻撃のダメージ計算における最低保証ダメージ。
 * playerAtk - enemyDef の結果がこれを下回る場合は MIN_DAMAGE を適用する。
 */
export const MIN_DAMAGE = 1;

/**
 * プレイヤーの初期攻撃力。マシンパンチ相当（GDD 4.1）。
 */
export const INITIAL_PLAYER_ATK = 9;

/**
 * プレイヤーの初期防御力。マシン初期装甲値と同値（GDD 3.3）。
 */
export const INITIAL_PLAYER_DEF = 5;

// ---------------------------------------------------------------------------
// ショップシステム
// ---------------------------------------------------------------------------

/** ショップ在庫の武器の最小点数 */
export const SHOP_WEAPON_MIN = 3;
/** ショップ在庫の武器の最大点数 */
export const SHOP_WEAPON_MAX = 5;
/** ショップ在庫のアイテムの最小点数 */
export const SHOP_ITEM_MIN = 3;
/** ショップ在庫のアイテムの最大点数 */
export const SHOP_ITEM_MAX = 4;
/** 武器修理費用 (ゴールド / 耐久1点) */
export const REPAIR_COST_PER_DURABILITY = 15;

// ---------------------------------------------------------------------------
// 倉庫システム
// ---------------------------------------------------------------------------

/** 倉庫の最大格納数 */
export const STORAGE_MAX_CAPACITY = 50;

// ---------------------------------------------------------------------------
// マシン強化オプション定数
// ---------------------------------------------------------------------------

/** 強化オプション: ATK +2 (upgrade_core_i × 1、最大5回) */
export const UPGRADE_ATK_SMALL = {
  id: 'upgrade_atk_small',
  type: 'atk' as const,
  description: 'ATK +2',
  requiredItemId: 'upgrade_core_i',
  requiredCount: 1,
  effect: 2,
  maxTimes: 5,
};

/** 強化オプション: DEF +1 (upgrade_core_i × 2、最大5回) */
export const UPGRADE_DEF_SMALL = {
  id: 'upgrade_def_small',
  type: 'def' as const,
  description: 'DEF +1',
  requiredItemId: 'upgrade_core_i',
  requiredCount: 2,
  effect: 1,
  maxTimes: 5,
};

/** 強化オプション: MaxHP +10 (repair_kit_large × 1、最大5回) */
export const UPGRADE_MAX_HP = {
  id: 'upgrade_max_hp',
  type: 'maxHp' as const,
  description: 'MaxHP +10',
  requiredItemId: 'repair_kit_large',
  requiredCount: 1,
  effect: 10,
  maxTimes: 5,
};

/** 強化オプション: ATK +5 (upgrade_core_ii × 1、最大3回) */
export const UPGRADE_ATK_MEDIUM = {
  id: 'upgrade_atk_medium',
  type: 'atk' as const,
  description: 'ATK +5',
  requiredItemId: 'upgrade_core_ii',
  requiredCount: 1,
  effect: 5,
  maxTimes: 3,
};

/** 強化オプション: ATK +10 (upgrade_core_iii × 1、最大2回) */
export const UPGRADE_ATK_LARGE = {
  id: 'upgrade_atk_large',
  type: 'atk' as const,
  description: 'ATK +10',
  requiredItemId: 'upgrade_core_iii',
  requiredCount: 1,
  effect: 10,
  maxTimes: 2,
};

/** 全強化オプションの配列（upgrade-system で参照する） */
export const ALL_UPGRADE_OPTIONS = [
  UPGRADE_ATK_SMALL,
  UPGRADE_DEF_SMALL,
  UPGRADE_MAX_HP,
  UPGRADE_ATK_MEDIUM,
  UPGRADE_ATK_LARGE,
] as const;

// ---------------------------------------------------------------------------
// レベルシステム
// ---------------------------------------------------------------------------

/** パイロットレベルの上限 */
export const MAX_PILOT_LEVEL = 20;

// ---------------------------------------------------------------------------
// スキルシステム
// ---------------------------------------------------------------------------

/** スキル: power_strike のクールダウン（ターン数） */
export const SKILL_POWER_STRIKE_COOLDOWN = 62;
/** スキル: barrier のクールダウン（ターン数） */
export const SKILL_BARRIER_COOLDOWN = 55;
/** スキル: overcharge のクールダウン（ターン数） */
export const SKILL_OVERCHARGE_COOLDOWN = 53;
/** スキル: barrier が付与する一時 DEF ボーナス */
export const SKILL_BARRIER_DEF_BONUS = 10;
/** スキル: passive_regen の毎ターン回復量 */
export const SKILL_REGEN_AMOUNT = 1;
/** スキル: passive_tough の受ダメージ軽減量 */
export const SKILL_TOUGH_DAMAGE_REDUCTION = 2;
/** スキル: passive_tough の最低ダメージ（軽減後の下限） */
export const SKILL_TOUGH_MIN_DAMAGE = 1;
/** スキル: passive_scavenger のドロップ率ボーナス（0〜1） */
export const SKILL_SCAVENGER_DROP_BONUS = 0.20;
/** スキル: overcharge の攻撃範囲（前方タイル数） */
export const SKILL_OVERCHARGE_RANGE = 4;
/** スキル: power_strike の攻撃倍率 */
export const SKILL_POWER_STRIKE_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// セーブシステム
// ---------------------------------------------------------------------------

/** セーブデータのバージョン文字列。フォーマット変更時にインクリメントする */
export const SAVE_VERSION = 'v1';
/** localStorage に使用するセーブキーのプレフィックス */
export const SAVE_KEY_PREFIX = 'mechaRogue_save_v1_slot_';
/** セーブスロットの最大数 */
export const MAX_SAVE_SLOTS = 5;

// ---------------------------------------------------------------------------
// 休憩所フロアシステム
// ---------------------------------------------------------------------------

/** 休憩所フロアへ移行するHPしきい値（最大HPに対する割合） */
export const REST_FLOOR_HP_LOW_THRESHOLD = 1 / 3;
/** HP が低い場合の回復目標割合（最大HPの50%まで回復） */
export const REST_FLOOR_HP_RECOVERY_LOW = 0.5;
/** HP が高い場合の回復量割合（現在HPの50%分を追加） */
export const REST_FLOOR_HP_RECOVERY_RATE = 0.5;
/** 装備耐久値の回復割合（maxDurabilityの2/5分回復） */
export const REST_FLOOR_DURABILITY_RATE = 2 / 5;
