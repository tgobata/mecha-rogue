/**
 * @fileoverview ゲーム全体の状態型定義とファクトリ関数
 *
 * GameState を1オブジェクトに集約し、セーブ・ロード・描画・ロジックの
 * 全システムが参照する唯一の真実の源（Single Source of Truth）とする。
 * React に依存しない純粋 TypeScript。
 */

import type { Floor, Position } from './types';
import {
  BOSS_FLOOR_INTERVAL,
  INITIAL_PLAYER_ATK,
  INITIAL_PLAYER_DEF,
} from './constants';

// ---------------------------------------------------------------------------
// スキルシステム型定義（skill-system.ts と共有）
// ---------------------------------------------------------------------------

/**
 * プレイヤーが習得できるスキルID。
 * 各スキルの詳細定義は skill-system.ts の SKILL_DEFINITIONS を参照。
 */
export type SkillId =
  | 'power_strike'     // アクティブ: ATK×2 の一撃
  | 'barrier'          // アクティブ: 1ターン DEF+10
  | 'overcharge'       // アクティブ: 前方3マス範囲攻撃
  | 'passive_regen'    // パッシブ: 毎ターン HP+1 回復
  | 'passive_tough'    // パッシブ: 受ダメージ -2（下限1）
  | 'passive_scavenger'; // パッシブ: アイテムドロップ率 +20%

/**
 * プレイヤーが習得済みのスキルのランタイムインスタンス。
 * アクティブスキルのクールダウン残り回数を保持する。
 */
export interface SkillInstance {
  /** スキルID */
  id: SkillId;
  /** 残クールダウンターン数（パッシブは常に 0） */
  cooldownRemaining: number;
}

// ---------------------------------------------------------------------------
// 倉庫システム型定義（storage-system.ts と共有）
// ---------------------------------------------------------------------------

/**
 * 倉庫に格納されているアイテムの1エントリ。
 * 武器の場合は耐久度等の状態を保持するため WeaponInstance を含む。
 */
export interface StorageItem {
  /** アイテムID（JSON データと対応） */
  id: string;
  /** アイテム種別 */
  type: 'weapon' | 'item';
  /** 武器の場合は耐久度等のランタイム状態を保持する */
  instance?: WeaponInstance;
}

// ---------------------------------------------------------------------------
// 武器システム型定義
// ---------------------------------------------------------------------------

/** 武器レアリティ */
export type WeaponRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/** 武器カテゴリ（melee/ranged/special は攻撃武器。shield は盾。armor はアーマー。） */
export type WeaponCategory = 'melee' | 'ranged' | 'special' | 'shield' | 'armor';

/** 攻撃範囲タイプ */
export type RangeType = 'single' | 'line' | 'splash';

/**
 * ランタイム上の武器インスタンス。
 * weapons.json の定義から生成し、耐久度変化などを追跡する。
 */
export interface WeaponInstance {
  /** weapons.json の id */
  id: string;
  /** インスタンス固有ID（同一weapons.idを複数所持したとき区別するため） */
  instanceId?: string;
  name: string;
  category: WeaponCategory;
  atk: number;
  /** 攻撃射程（タイル数） */
  range: number;
  rangeType: RangeType;
  /** 現在耐久度（null は壊れない武器） */
  durability: number | null;
  /** 最大耐久度（null は壊れない武器） */
  maxDurability: number | null;
  /** 1回使用あたりの耐久消耗量 */
  durabilityLoss: number;
  rarity: WeaponRarity;
  /** 使用エネルギー */
  energyCost: number;
  /** 特殊効果ID（weapons.json の special フィールド） */
  special: string | null;
  /** weapons.json の元の rangeType 文字列（詳細判定用） */
  rawRangeType: string;
  /** この修理屋訪問中に修理済みか（1回限り制限） */
  repairedAtShop?: boolean;
  /** この修理屋訪問中に強化済みか（1回限り制限） */
  upgradedAtShop?: boolean;
}

// ---------------------------------------------------------------------------
// 盾・アーマー装備型定義
// ---------------------------------------------------------------------------

/**
 * 装備中の盾のランタイムインスタンス。
 * weapons.json の category === 'shield' エントリから生成する。
 */
export interface EquippedShield {
  /** ユニークインスタンスID（重複アイテム識別用） */
  instanceId?: string;
  /** weapons.json の id */
  shieldId: string;
  /** 現在耐久度 */
  durability: number;
  /** 最大耐久度 */
  maxDurability: number;
  /** 防御ボーナス */
  def: number;
  /** ダメージ完全ブロック確率 (0.0〜1.0)。省略時は 0 扱い */
  blockChance?: number;
  /** 表示名 */
  name: string;
  /** 修理屋で修理済みフラグ（1回限り） */
  repairedAtShop?: boolean;
  /** 修理屋で強化済みフラグ（1回限り） */
  upgradedAtShop?: boolean;
}

/**
 * 装備中のアーマーのランタイムインスタンス。
 * weapons.json の category === 'armor' エントリから生成する。
 */
export interface EquippedArmor {
  /** ユニークインスタンスID（重複アイテム識別用） */
  instanceId?: string;
  /** weapons.json の id */
  armorId: string;
  /** 現在耐久度 */
  durability: number;
  /** 最大耐久度 */
  maxDurability: number;
  /** 防御ボーナス */
  def: number;
  /** 最大HP増加量。省略時は 0 扱い */
  maxHpBonus?: number;
  /** 表示名 */
  name: string;
  /** 修理屋で修理済みフラグ（1回限り） */
  repairedAtShop?: boolean;
  /** 修理屋で強化済みフラグ（1回限り） */
  upgradedAtShop?: boolean;
}

// ---------------------------------------------------------------------------
// 道具システム型定義
// ---------------------------------------------------------------------------

/** 道具カテゴリ */
export type ToolCategory = 'vision' | 'defense' | 'offense' | 'mobility' | 'utility';

/**
 * ランタイム上の道具インスタンス。
 * tools-equipment.json の定義から生成する。
 */
export interface ToolInstance {
  /** tools-equipment.json の id */
  id: string;
  name: string;
  category: ToolCategory;
  /** true=装備型（常時効果）、false=使い捨て型 */
  isEquipType: boolean;
  /** 装備型のみ。装備中かどうか */
  isEquipped: boolean;
  /** 使い捨て型の残回数（装備型は -1） */
  charges: number;
  /** 効果ID文字列（tools-equipment.json の effect フィールド） */
  effect: string;
}

// ---------------------------------------------------------------------------
// 状態異常型定義
// ---------------------------------------------------------------------------

/** 状態異常の種別 */
export type StatusEffectType =
  | 'frozen'     // 凍結: 移動・行動不可
  | 'shocked'    // 感電: 1ターンおきにスキップ、移動時ダメージ
  | 'burning'    // 炎上: 毎ターンダメージ
  | 'oiled'      // オイル: 凍結・炎上ダメージ1.5倍
  | 'stunned'    // スタン: 次の1ターン行動不可
  | 'shielded'   // シールド: ダメージ吸収 → スプライト"B"
  | 'regen'      // 修復: 毎ターンHP回復
  | 'attack_up'  // 攻撃力強化: ATK一時アップ → スプライト"A"
  | 'speed_up';  // 速度強化: 行動速度アップ → スプライト"S"

/**
 * エンティティに付与されている状態異常の1エントリ。
 */
export interface StatusEffect {
  type: StatusEffectType;
  remainingTurns: number;
  /** 効果量（ダメージ/回復量等）。省略時は 0 扱い */
  magnitude?: number;
  /** 付与した武器/敵のID */
  sourceId?: string;
}

// ---------------------------------------------------------------------------
// ゲームフェーズ
// ---------------------------------------------------------------------------

/**
 * ゲームの現在フェーズ。
 * - 'title'     : タイトル画面
 * - 'exploring' : フロア探索中（通常ターン）
 * - 'combat'    : 戦闘中（将来の拡張用。現状はターン制で exploring と兼用）
 * - 'shop'      : ショップ画面表示中
 * - 'gameover'  : ゲームオーバー（マシンHP0 → スタート帰還ペナルティ適用後）
 */
export type GamePhase = 'title' | 'base' | 'exploring' | 'combat' | 'shop' | 'repair' | 'storage' | 'gameover' | 'bossIntro' | 'achievements';

// ---------------------------------------------------------------------------
// 方向
// ---------------------------------------------------------------------------

/**
 * プレイヤーや敵が向いている方向。
 * ターンシステム・描画の両方で参照する。
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

// ---------------------------------------------------------------------------
// 敵 AI タイプ
// ---------------------------------------------------------------------------

/**
 * 敵の行動AIの種別（GDD 7.2 より）。
 * ターンシステムで参照する。
 */
export type EnemyAiType =
  | 'straight'   // プレイヤーに向かって直進（BFS最短経路）
  | 'patrol'     // 決まったルートを往復巡回
  | 'guard'      // 初期位置付近に留まり、近づくと攻撃
  | 'sniper'     // 視線が通れば遠距離攻撃、通らなければ接近
  | 'support'    // 他の敵HPが低いと回復
  | 'ambush'     // 一定確率でターンをスキップ（待ち伏せ型）
  | 'flee'       // 逃走型
  | 'group'      // 群体型
  | 'explode'    // 自爆型
  | 'oil_drum'   // オイルドラム: 周囲にオイルを撒く
  | 'igniter'    // 着火ロボ: オイルマスを見つけて着火
  | 'fire_body'  // ファイヤーピーポー: オイルマス上で着火、炎ダメージ無効
  | 'boss';      // ボス型（boss-ai.ts で専用処理）

// ---------------------------------------------------------------------------
// 敵エンティティ
// ---------------------------------------------------------------------------

/**
 * フロア上に存在する1体の敵を表すエンティティ。
 * ターンシステムが参照・更新するランタイム情報のみ保持する。
 */
export interface Enemy {
  /** フロア内でユニークな識別子（生成時に連番で振る） */
  id: number;
  /** 敵の種別名（JSON データの敵IDと対応） */
  enemyType: string;
  /** 表示名（日本語）。enemies.json の name フィールドから設定する */
  name?: string;
  /** フロア上の現在座標 */
  pos: Position;
  /** 現在HP */
  hp: number;
  /** 最大HP */
  maxHp: number;
  /** 攻撃力 */
  atk: number;
  /** 防御力 */
  def: number;
  /** 倒したときに獲得できる経験値 */
  expReward: number;
  /** AIの行動パターン */
  aiType: EnemyAiType;
  /** 敵が向いている方向 */
  facing: Direction;
  /** 射程（スナイパー型などの遠距離攻撃距離。省略時は1） */
  attackRange?: number;
  /** 現在付与されている状態異常リスト（省略時は空配列扱い） */
  statusEffects?: StatusEffect[];
  /** 巡回AIの巡回ポイントリスト */
  patrolPath?: Position[];
  /** 巡回AIの現在インデックスと方向 */
  patrolIndex?: number;
  patrolForward?: boolean;
  /** guard AIの初期配置座標（守備範囲の中心） */
  guardPos?: Position;
  /** ボス専用フラグ。これが true の場合は boss-ai に処理を委譲する */
  isBoss?: boolean;
  /** ボスの描画サイズ（タイル単位）。bosses.json の size フィールドと対応。省略時は 2 扱い */
  bossSize?: number;
  /** ボス固有の内部ステータス（フェーズ移行やクールダウン管理用） */
  bossState?: any;
  /**
   * アニメーション状態。turn-system.ts が更新する。
   * undefined の場合は idle として扱う。
   */
  animState?: 'idle' | 'move' | 'attack' | 'hit';
  // ---------------------------------------------------------------------------
  // 派閥・レベルシステム（enemies.json リデザイン対応フィールド）
  // ---------------------------------------------------------------------------
  /** 派閥種別: neutral=中立、faction_a=派閥A（同士討ちなし）、berserker=全方向攻撃 */
  factionType?: 'neutral' | 'faction_a' | 'berserker';
  /** true の場合、他の敵も攻撃対象にする（berserker 専用） */
  canAttackAllies?: boolean;
  /** 現在のレベル（1〜5）。enemies.json の level フィールドと対応 */
  level?: number;
  /** ベース敵ID。例: "scout_drone"。レベルアップ時に同じベースの次レベルを検索する */
  baseEnemyId?: string;
  /** 表示色（HEX 文字列）。レベルに応じて変化 */
  levelColor?: string;
  /** 攻撃空振り時のタイル色 */
  attackMissColor?: string;
  /** 装備武器ID（enemies.json の equippedWeapon フィールド） */
  equippedWeaponId?: string | null;
  /** 装備アーマーID */
  equippedArmorId?: string | null;
  /** 装備シールドID */
  equippedShieldId?: string | null;
  /** 装備ドロップ確率（0.0〜1.0） */
  equipDropChance?: number;
  /** 直前に攻撃した敵のID（ターン内重複攻撃防止用） */
  lastAttackedEnemyId?: number | null;
  /** 特殊能力ID（enemies.json の special フィールド）。fire_immune など */
  special?: string | null;
}

// ---------------------------------------------------------------------------
// トラップエンティティ
// ---------------------------------------------------------------------------

/**
 * ターン中に発生したビジュアルエフェクト情報。
 * processTurn から GameCanvas へ伝達するために使用。
 */
export interface TurnEffect {
  type: 'explosion' | 'trajectory' | 'area_buff' | 'electric';
  /** 爆発・バフの中心座標 */
  center?: { x: number; y: number };
  /** 爆発半径 */
  radius?: number;
  /** 軌道の始点 */
  from?: { x: number; y: number };
  /** 軌道の終点 */
  to?: { x: number; y: number };
  /** エフェクト色（省略時はデフォルト色を使用） */
  color?: string;
}

/**
 * トラップの種別。
 */
export type TrapType =
  | 'visible_pitfall'   // 常に表示。1階層落下、ダメージ20
  | 'hidden_pitfall'    // 隠し。攻撃やセンサーで発見。落下ダメージ20〜50
  | 'large_pitfall'     // 常に表示。2階層落下、ダメージ50
  | 'landmine'          // 地雷。踏むとダメージ25、周囲1タイル
  | 'poison_gas'        // 毒ガス噴出。3ターン毎ターンダメージ10
  | 'arrow_trap'        // 矢の罠。一方向からダメージ15
  | 'teleport_trap'     // ランダムワープ
  | 'item_loss'         // アイテム没収
  | 'summon_trap'       // 敵召喚（周囲2〜3体）
  | 'rust_trap';        // 武器錆び（耐久度-10）

/**
 * 迷路内に配置されたトラップエンティティ。
 */
export interface Trap {
  id: number;
  type: TrapType;
  pos: Position;
  /** 隠しトラップが見つかっているか、または最初から可視なトラップか */
  isVisible: boolean;
  /** すでに発動済みか（地雷など使い捨て用） */
  isTriggered: boolean;
}

// ---------------------------------------------------------------------------
// 設置済み爆弾エンティティ
// ---------------------------------------------------------------------------

/**
 * プレイヤーが設置した時限爆弾。
 * 毎ターン turnsLeft を減らし、0 になったら爆発する。
 */
export interface PlacedBomb {
  /** ユニークID */
  id: number;
  /** 設置位置 */
  pos: Position;
  /** 残りターン数（0になった時に爆発） */
  turnsLeft: number;
  /**
   * 爆発半径:
   * 0=設置マスのみ, 1=設置マス+直交4マス(計5), 2=3×3範囲(計9), 3=5×5範囲(計25)
   */
  radius: number;
  /** 爆発ダメージ */
  damage: number;
}

// ---------------------------------------------------------------------------
// ヒントメッセージエンティティ
// ---------------------------------------------------------------------------

/** ボス用のヒント石碑に対応するテキストデータ */
export interface Hint {
  pos: Position;
  text: string;
}

// ---------------------------------------------------------------------------
// プレイヤーエンティティ（ランタイム用）
// ---------------------------------------------------------------------------

/**
 * ターンシステムが参照するプレイヤーのランタイム情報。
 * ステータスの詳細は PilotStats / MachineStats が持つが、
 * ターン処理で頻繁にアクセスする座標・HP・攻撃力・防御力をここにフラット化する。
 */
export interface Player {
  /** フロア上の現在座標 */
  pos: Position;
  /** 現在HP（MachineStats.hp と同期する） */
  hp: number;
  /** 最大HP（MachineStats.maxHp と同期する） */
  maxHp: number;
  /** 有効攻撃力（装備武器の攻撃力を反映した合算値） */
  atk: number;
  /** 有効防御力（MachineStats.armor を反映した値） */
  def: number;
  /** 現在向いている方向 */
  facing: Direction;
  /**
   * アニメーション状態。turn-system.ts が更新する。
   * undefined の場合は idle として扱う。
   */
  animState?: 'idle' | 'move' | 'attack' | 'hit' | 'item_use' | 'near_death';
  /** 現在付与されている状態異常リスト（省略時は空配列扱い） */
  statusEffects?: StatusEffect[];
  /**
   * HP が一度でも最大値を下回ったかを示すフラグ。
   * false/undefined = ゲーム開始直後（H スプライト表示）
   * true            = ダメージを受けた後（HP回復時に F スプライト表示）
   */
  hpEverDroppedBelowMax?: boolean;
  /** 修理ナノボットによる毎ターン回復量（0の場合は効果なし） */
  healPerTurn?: number;
  /** 修理ナノボットの残りターン数 */
  healTurnsLeft?: number;
  /** 現在装備中の武器（null は素手） */
  equippedWeapon?: WeaponInstance | null;
  /** 所持武器一覧（最大 MachineStats.weaponSlots 本） */
  weaponSlots?: WeaponInstance[];
  /** 装備中の盾（null は未装備） */
  equippedShield?: EquippedShield | null;
  /** 装備中のアーマー（null は未装備） */
  equippedArmor?: EquippedArmor | null;
  /** 所持盾一覧（最大 MachineStats.shieldSlots 個） */
  shieldSlots?: EquippedShield[];
  /** 所持アーマー一覧（最大 MachineStats.armorSlots 個） */
  armorSlots?: EquippedArmor[];
  /** 装備中の道具一覧（最大 MachineStats.toolSlots 個） */
  equippedTools?: ToolInstance[];
  /** 使い捨て型道具のインベントリ */
  toolInventory?: ToolInstance[];
}

// ---------------------------------------------------------------------------
// パイロット（主人公）スキル
// ---------------------------------------------------------------------------

/**
 * パイロットスキル名一覧（GDD 3.2 より）。
 * 各スキルはSPを割り振ることでレベルが上がる。
 */
export type PilotSkillName =
  | 'ironControl'       // 鉄壁操縦: 被ダメージ-2%/Lv（最大10）
  | 'hawkEye'           // ホークアイ: 視界+0.5タイル/Lv（最大4）
  | 'treasureHunter'    // トレジャーハンター: アイテムドロップ率+3%/Lv（最大10）
  | 'engineer'          // エンジニア: 武器耐久消耗-5%/Lv（最大10）
  | 'speedStar'         // スピードスター: 移動速度+1（Lv5到達時のみ、最大5）
  | 'bargainer'         // 値切り上手: ショップ割引+3%/Lv（最大10）
  | 'survival';         // サバイバル: 休憩ポイント回復量+10%/Lv（最大5）

/** スキルごとに割り振ったSPのレベルを記録するマップ */
export type AllocatedSkills = Partial<Record<PilotSkillName, number>>;

// ---------------------------------------------------------------------------
// パイロットステータス（GDD 3.1）
// ---------------------------------------------------------------------------

/**
 * パイロット（主人公）のステータス。
 * マシンと装備に依存する強さとは分離して管理する。
 */
export interface PilotStats {
  /** パイロットレベル（1始まり） */
  level: number;
  /** 現在の経験値 */
  exp: number;
  /** 次のレベルアップに必要な累積経験値 */
  expToNextLevel: number;
  /**
   * 操縦技術。回避率に影響。
   * 初期値 10、レベルアップで +1。
   */
  pilotSkill: number;
  /**
   * 判断力。クリティカル率に影響。
   * 初期値 10、レベルアップで +1。
   */
  judgment: number;
  /**
   * 幸運。アイテムドロップ率に影響。
   * 初期値 5、レベルアップで +0.5（小数管理）。
   */
  luck: number;
  /** 未割り振りのスキルポイント（SP）。レベルアップで +2。 */
  skillPoints: number;
  /** 各スキルに割り振ったレベルのマップ */
  allocatedSkills: AllocatedSkills;
}

// ---------------------------------------------------------------------------
// マシン強化パーツ記録
// ---------------------------------------------------------------------------

/**
 * マシンに適用済みの強化パーツ一覧。
 * キーはパーツID（JSON データと対応）、値は適用回数。
 * 同一パーツを複数回使えるものがあるため number で管理する。
 */
export type AppliedMachineParts = Record<string, number>;

// ---------------------------------------------------------------------------
// マシンステータス（GDD 3.3）
// ---------------------------------------------------------------------------

/**
 * マシン（機体）のステータス。
 * HP0 でスタート帰還ペナルティが発動する。
 */
export interface MachineStats {
  /** 現在のマシンHP */
  hp: number;
  /** マシンHP最大値（フレーム強化パーツで増加） */
  maxHp: number;
  /**
   * 装甲値。受けるダメージを軽減する。
   * 初期値 5、最大 500。
   */
  armor: number;
  /**
   * 移動速度。1ターンに移動できるタイル数。
   * 初期値 1、最大 5。
   */
  moveSpeed: number;
  /**
   * 武器スロット数。同時装備可能な武器の最大本数。
   * 初期値 2、最大 5。
   */
  weaponSlots: number;
  /**
   * 盾スロット数。同時装備可能な盾の最大個数。
   * 初期値 1、最大 3。
   */
  shieldSlots: number;
  /**
   * アーマースロット数。同時装備可能なアーマーの最大個数。
   * 初期値 1、最大 3。
   */
  armorSlots: number;
  /**
   * 道具スロット数。同時装備可能な道具の最大個数。
   * 初期値 3、最大 8。
   */
  toolSlots: number;
  /**
   * アイテムポーチの最大容量。持ち運べるアイテム数の上限。
   * 初期値 10、最大 30。
   */
  itemPouch: number;
  /** 現在のエネルギー量（特殊武器・道具の使用に消費） */
  energy: number;
  /**
   * エネルギー最大値（リアクター強化パーツで増加）。
   * 初期値 100、最大 999。
   */
  maxEnergy: number;
  /** 適用済み強化パーツの記録（永続効果はゲームオーバー後も維持） */
  appliedParts: AppliedMachineParts;
}

// ---------------------------------------------------------------------------
// アイテム参照（インベントリ内の最小表現）
// ---------------------------------------------------------------------------

/**
 * インベントリ内のアイテムエントリ。
 * 詳細データは JSON アセットから itemId で引く。
 */
export interface InventoryItem {
  /** アイテムID（JSON データと対応） */
  itemId: string;
  /** スタック数（使い捨てアイテムなど） */
  quantity: number;
  /**
   * 未鑑定フラグ。true の場合は itemId を表示せず「？？？のパーツ」と表示。
   * 鑑定スコープ使用で false になる。
   */
  unidentified: boolean;
}

// ---------------------------------------------------------------------------
// 武器エントリ（スロット装備中）
// ---------------------------------------------------------------------------

/**
 * 武器スロットに装備中の武器。
 * 耐久度は実行時に変化するためここで管理する。
 */
export interface EquippedWeapon {
  /** ユニークインスタンスID（重複アイテム識別用） */
  instanceId?: string;
  /** 武器ID（JSON データと対応） */
  weaponId: string;
  /** 現在の耐久度 */
  durability: number;
  /** 武器レベル（強化コアで 1〜5 に強化可能） */
  weaponLevel: number;
  /** レアリティコード（'C' | 'U' | 'R' | 'E' | 'L'） */
  rarity: string;
}

// ---------------------------------------------------------------------------
// 道具エントリ（スロット装備中）
// ---------------------------------------------------------------------------

/**
 * 道具スロットに装備中の道具。
 * 装備型道具は常時効果を発揮する。
 */
export interface EquippedTool {
  /** 道具ID（JSON データと対応） */
  toolId: string;
}

// ---------------------------------------------------------------------------
// インベントリ
// ---------------------------------------------------------------------------

/**
 * プレイヤーのインベントリ全体。
 * アイテムポーチ・装備中武器・装備中道具・所持金を含む。
 */
export interface Inventory {
  /**
   * アイテムポーチ内のアイテム一覧。
   * 最大数は MachineStats.itemPouch に依存する。
   */
  items: InventoryItem[];
  /**
   * 装備中の武器リスト。
   * 最大数は MachineStats.weaponSlots に依存する。
   */
  equippedWeapons: EquippedWeapon[];
  /**
   * 所持盾リスト。
   * 最大数は MachineStats.shieldSlots に依存する。
   */
  equippedShields: EquippedShield[];
  /**
   * 所持アーマーリスト。
   * 最大数は MachineStats.armorSlots に依存する。
   */
  equippedArmors: EquippedArmor[];
  /**
   * 装備中の道具リスト。
   * 最大数は MachineStats.toolSlots に依存する。
   */
  equippedTools: EquippedTool[];
  /** 所持金（ゴールド）。ゲームオーバー時に50%失う。 */
  gold: number;
  /** インベントリのソート順 ('default' | 'name' | 'category') */
  sortKey: 'default' | 'name' | 'category';
}

// ---------------------------------------------------------------------------
// フロア・探索状態
// ---------------------------------------------------------------------------

/**
 * 現在フロアと探索に関する状態。
 * currentFloor は generateFloor() が返す Floor オブジェクト。
 */
export interface ExplorationState {
  /** 現在のフロアデータ（タイル・部屋・敵配置などを含む） */
  currentFloor: Floor;
  /** プレイヤーの現在座標（Floor.cells[y][x] と対応） */
  playerPos: Position;
  /** 現在の階層番号（1始まり）。下り階段で増加。 */
  floorNumber: number;
  /**
   * 経過ターン数（0始まり）。
   * プレイヤーが1行動するごとに +1 する。
   */
  turn: number;
  /**
   * ショップの在庫データ。
   * ショップマスに乗ったときに shop-system.ts によって生成される。
   */
  shopInventory?: Array<{
    id: string;
    type: 'weapon' | 'item';
    buy: number;
    sell: number;
    /** 残り在庫数（0 = 売り切れ） */
    stock: number;
  }>;
  /**
   * フロア内の各ショップ座標ごとの在庫データ。
   * キーは "x,y" 形式。同じショップに再訪しても在庫が変わらないよう保持。
   */
  shopInventories?: Record<string, Array<{
    id: string;
    type: 'weapon' | 'item';
    buy: number;
    sell: number;
    /** 残り在庫数（0 = 売り切れ） */
    stock: number;
  }>>;
  /** 現在開いているショップの座標キー（"x,y"）。buyItem の在庫同期に使用 */
  currentShopKey?: string;
}

// ---------------------------------------------------------------------------
// GameState（ゲーム全体の状態）
// ---------------------------------------------------------------------------

/**
 * ゲーム全体の状態を表すルートオブジェクト。
 * セーブ・ロードはこのオブジェクトを JSON シリアライズして行う。
 * React に依存せず、純粋 TypeScript で扱える。
 *
 * @example
 * ```ts
 * let state = createInitialGameState();
 * state = applyPlayerMove(state, { x: 1, y: 0 });
 * ```
 */
export interface GameState {
  /** ゲームの現在フェーズ */
  phase: GamePhase;
  /** パイロット（主人公）のステータス */
  pilot: PilotStats;
  /** マシン（機体）のステータス */
  machine: MachineStats;
  /** プレイヤーのインベントリ（ポーチ・装備・所持金） */
  inventory: Inventory;
  /**
   * フロア・探索状態。
   * phase が 'title' の場合は null（フロア未生成）。
   */
  exploration: ExplorationState | null;
  /**
   * プレイヤーのランタイム情報（座標・HP・攻防など）。
   * ターンシステムが直接参照・更新する。
   * phase が 'title' の場合は null。
   */
  player: Player | null;
  /**
   * 現在フロアに存在する敵のリスト。
   * フロア遷移時に新しいリストで置き換える。
   * phase が 'title' の場合は空配列。
   */
  enemies: Enemy[];
  /**
   * 現在フロアに存在するトラップのリスト。
   */
  traps: Trap[];
  /**
   * プレイヤーが設置した時限爆弾のリスト。
   * 毎ターン処理されカウントダウンする。
   */
  placedBombs: PlacedBomb[];
  /**
   * 現在フロアに存在するヒントのリスト。
   */
  hints: Hint[];
  /**
   * 入室により起動済みのモンスターハウスの Room ID リスト。
   */
  triggeredMonsterHouses: number[];
  /**
   * そのフロアのショップが闇商人どうか。
   */
  isBlackMarket?: boolean;
  /**
   * 現在のフロアが休憩所フロアかどうか。
   * turn-system の transitionToNextFloor で設定される。
   */
  isRestFloor?: boolean;
  /**
   * 現在フロアのマップデータ（Floor 型）。
   * exploration.currentFloor と同じ参照だが、
   * ターンシステムから直接アクセスしやすいよう別フィールドとして公開する。
   * phase が 'title' の場合は null。
   */
  map: Floor | null;
  /**
   * 現在の階層番号（1始まり）。
   * exploration.floorNumber と同期する。
   */
  floor: number;
  /**
   * 直近の戦闘・イベントのログ文字列リスト。
   * level-system などが「Lv.X → HP+N ATK+N」などのメッセージを追記する。
   */
  battleLog: string[];
  /**
   * 今ターンに発生したビジュアルエフェクトのリスト。
   * processTurn が毎ターン冒頭にリセットし、特殊能力処理で追記する。
   */
  turnEffects?: TurnEffect[];
  /**
   * プレイヤーが習得済みのスキルのランタイムインスタンス一覧。
   * skill-system.ts が参照・更新する。
   */
  skills: SkillInstance[];
  /**
   * フロアをまたいで物品を保管できる倉庫。
   * storage-system.ts が参照・更新する。
   */
  storage: StorageItem[];
  /**
   * 倉庫に預けているゴールド。
   * ゲームオーバー時も失われない。
   */
  storedGold: number;
  /**
   * マシン強化の適用回数を記録するマップ。
   * キーは UpgradeOption.id、値は適用済み回数。
   * upgrade-system.ts が参照・更新する。
   */
  upgradeCount: Record<string, number>;
  /**
   * ロック解除された実績IDのリスト。
   */
  achievements: string[];
  /**
   * 撃破済みボスのIDリスト（achievement-system がボス撃破実績の判定に使用）。
   */
  bossesDefeated: string[];
  /**
   * 炎マスの残りターン数マップ。キーは "x,y" 形式、値は残りターン数。
   * ターン終了時にデクリメントし、0になったら通常マスへ戻す。
   */
  fireTileTimers?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// 初期値定数（GDD 3.1 / 3.3 の初期値に対応）
// ---------------------------------------------------------------------------

/** パイロット初期レベル */
const INITIAL_PILOT_LEVEL = 1;
/** プレイヤーの初期向き方向 */
export const INITIAL_FACING: Direction = 'down';
/** パイロット初期経験値 */
const INITIAL_PILOT_EXP = 0;
/** Lv1→Lv2 に必要な経験値 */
const INITIAL_EXP_TO_NEXT_LEVEL = 100;
/** 操縦技術の初期値（GDD 3.1） */
const INITIAL_PILOT_SKILL = 10;
/** 判断力の初期値（GDD 3.1） */
const INITIAL_JUDGMENT = 10;
/** 幸運の初期値（GDD 3.1） */
const INITIAL_LUCK = 5;
/** 初期スキルポイント */
const INITIAL_SKILL_POINTS = 0;

/** マシンHP初期値（GDD 3.3） */
const INITIAL_MACHINE_HP = 100;
/** 装甲値初期値（GDD 3.3） */
const INITIAL_ARMOR = 5;
/** 移動速度初期値（GDD 3.3） */
const INITIAL_MOVE_SPEED = 1;
/** 武器スロット初期値（GDD 3.3） */
const INITIAL_WEAPON_SLOTS = 2;
/** 盾スロット初期値 */
const INITIAL_SHIELD_SLOTS = 1;
/** アーマースロット初期値 */
const INITIAL_ARMOR_SLOTS = 1;
/** 道具スロット初期値（GDD 3.3） */
const INITIAL_TOOL_SLOTS = 3;
/** アイテムポーチ初期容量（GDD 3.3） */
const INITIAL_ITEM_POUCH = 15;
/** エネルギー初期値（GDD 3.3） */
const INITIAL_ENERGY = 100;
/** 所持金初期値 */
const INITIAL_GOLD = 0;

// BOSS_FLOOR_INTERVAL は constants.ts からのインポートを利用（マジックナンバー回避）
void BOSS_FLOOR_INTERVAL; // 型チェック用参照（未使用 lint 回避）

// ---------------------------------------------------------------------------
// ファクトリ関数
// ---------------------------------------------------------------------------

/**
 * ゲーム開始時の初期 GameState を生成して返す。
 *
 * - phase は 'title'（フロア未生成）
 * - パイロットは GDD 3.1 の初期値
 * - マシンは GDD 3.3 の初期値
 * - インベントリは空（所持金 0、スロット未装備）
 * - exploration は null（タイトル画面ではフロア不要）
 *
 * @returns 初期化された GameState
 */
export function createInitialGameState(): GameState {
  return {
    phase: 'title',

    pilot: {
      level: INITIAL_PILOT_LEVEL,
      exp: INITIAL_PILOT_EXP,
      expToNextLevel: INITIAL_EXP_TO_NEXT_LEVEL,
      pilotSkill: INITIAL_PILOT_SKILL,
      judgment: INITIAL_JUDGMENT,
      luck: INITIAL_LUCK,
      skillPoints: INITIAL_SKILL_POINTS,
      allocatedSkills: {},
    },

    machine: {
      hp: INITIAL_MACHINE_HP,
      maxHp: INITIAL_MACHINE_HP,
      armor: INITIAL_ARMOR,
      moveSpeed: INITIAL_MOVE_SPEED,
      weaponSlots: INITIAL_WEAPON_SLOTS,
      shieldSlots: INITIAL_SHIELD_SLOTS,
      armorSlots: INITIAL_ARMOR_SLOTS,
      toolSlots: INITIAL_TOOL_SLOTS,
      itemPouch: INITIAL_ITEM_POUCH,
      energy: INITIAL_ENERGY,
      maxEnergy: INITIAL_ENERGY,
      appliedParts: {},
    },

    inventory: {
      items: [],
      equippedWeapons: [],
      equippedShields: [],
      equippedArmors: [],
      equippedTools: [],
      gold: INITIAL_GOLD,
      sortKey: 'default',
    },

    exploration: null,

    player: null,
    enemies: [],
    traps: [],
    placedBombs: [],
    hints: [],
    triggeredMonsterHouses: [],
    isBlackMarket: false,
    isRestFloor: false,
    map: null,
    floor: 1,
    battleLog: [],
    skills: [],
    storage: [],
    storedGold: 0,
    upgradeCount: {},
    achievements: [],
    bossesDefeated: [],
    fireTileTimers: {},
  };
}

/**
 * `createInitialGameState` の短縮エイリアス。
 * 外部モジュールから `createInitialState()` として呼べるようにする。
 *
 * @returns 初期化された GameState
 */
export const createInitialState = createInitialGameState;
