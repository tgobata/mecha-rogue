/**
 * @fileoverview ターンシステム
 *
 * プレイヤーの1アクションを受け取り、以下の順序で処理して新しい GameState を返す。
 *
 * 1. プレイヤー行動フェーズ
 *    - move_*  : 指定方向へ移動。敵がいればバンプ攻撃。階段タイルで次階層へ遷移。
 *    - attack  : 向いている方向の隣接マスに攻撃。
 *    - wait    : 何もしない。
 *
 * 2. 敵行動フェーズ（プレイヤーとのマンハッタン距離 ≤ ENEMY_SIGHT_RANGE のみ）
 *    - 隣接していれば攻撃、そうでなければプレイヤーへ向かって1歩移動。
 *
 * 3. ターン後処理
 *    - HP0以下の敵を除去し EXP 加算。
 *    - プレイヤーHP0以下で phase を 'gameover' に変更。
 *    - ターン数カウントアップ。
 *
 * 設計原則:
 * - 純粋関数。引数の state を直接変更せず、必ず新しいオブジェクトを返す。
 * - React 非依存。
 * - マジックナンバー禁止（constants.ts の定数を使う）。
 */

import weaponsRaw from '../assets/data/weapons.json';
import itemsRaw from '../assets/data/items.json';
import enemyDefsRaw from '../assets/data/enemies.json';
import bossDefsRaw from '../assets/data/bosses.json';
import { checkAchievements } from '../systems/achievement-system';
import { RoomType, type Position } from './types';
import {
  TILE_STAIRS_DOWN,
  TILE_ITEM,
  TILE_WEAPON,
  TILE_GOLD,
  TILE_SHOP,
  TILE_FLOOR,
  TILE_TRAP,
  TILE_HINT,
  TILE_ICE,
  TILE_LAVA,
  TILE_WARP,
  ENEMY_SIGHT_RANGE,
  MIN_DAMAGE,
  INITIAL_PLAYER_ATK,
  INITIAL_PLAYER_DEF,
} from './constants';
import { addExp } from './level-system';
import { getTileAt, isWalkable, manhattanDistance, getDirection } from './floorUtils';
import { generateFloor } from './maze-generator';
import type { GameState, Enemy, Player, Direction, EnemyAiType, Trap, Hint, TrapType } from './game-state';
import { INITIAL_FACING } from './game-state';
import { getShopInventory } from './shop-system';
import { applyStartReturn } from './start-return';
import { decideEnemyAction, canEnemyAttackEnemy } from './enemy-ai';
import type { EnemyAction } from './enemy-ai';
import { findEnemyDataByBaseAndLevel, getLevelColor } from './enemy-data-loader';
import { decideBossAction } from './boss-ai';
import { applyStatusEffects, canAct, isShockedSkip, absorbWithShield, applyWeaponSpecial, addStatusEffect } from './status-effects';
import { rollDrops, rollFloorGold, rollFloorItem, rollFloorWeapon } from './drop-system';
import type { DropResult } from './drop-system';
import { createWeaponInstance } from './weapon-system';
import type { EquippedWeapon, EquippedShield, EquippedArmor } from './game-state';
import { consumeDurability, isBroken, getAttackTargetPositions } from './weapon-system';
import { updateVisibility } from './visibility';
import { VIEW_RADIUS } from './constants';

/** レベルに応じたインベントリの最大容量を計算する（アイテム・武器共通） */
export function getInventoryCapacity(level: number): number {
  return 10 + level * 2;
}

// ---------------------------------------------------------------------------
// 敵データ型（enemies.json の各エントリ）
// ---------------------------------------------------------------------------

/** enemies.json の1エントリを表す型 */
interface EnemyDefinition {
  id: string;
  name: string;
  hp: number;
  atk: number;
  def: number;
  expReward: number;
  goldDrop: number;
  aiType?: EnemyAiType;
  movementPattern?: string;
  appearsFrom: number;
  speed?: number;
  baseEnemyId?: string;
  level?: number;
  factionType?: 'neutral' | 'faction_a' | 'berserker';
  canAttackAllies?: boolean;
  levelColor?: string;
  attackMissColor?: string;
  equippedWeapon?: string | null;
  equippedArmor?: string | null;
  equippedShield?: string | null;
  equipDropChance?: number;
}

/** bosses.json の1エントリを表す型 */
interface BossDefinition {
  id: string;
  name: string;
  floor: number;
  tier: string;
  hp: number;
  atk: number;
  def: number;
  expReward: number;
  goldReward: number;
  special: string;
  [key: string]: any; // ボス固有パラメータ
}

/** weapons.json の全定義（category 判定に使用） */
const WEAPON_DEFS_ALL = weaponsRaw as unknown as Array<{
  id: string;
  name: string;
  category: string;
  durability: number | null;
  def?: number;
  blockChance?: number;
  maxHpBonus?: number;
}>;

/** items.json の全定義（アイテム名取得に使用） */
const ITEM_DEFS_ALL = itemsRaw as unknown as Array<{ id: string; name: string }>;

/** items.json のアイテムID から日本語名を返す。見つからなければ id をそのまま返す */
function getItemDisplayName(itemId: string): string {
  return ITEM_DEFS_ALL.find((d) => d.id === itemId)?.name ?? itemId;
}

/** enemies.json から静的インポートした敵定義リスト（Node.js・ブラウザ両対応） */
const ENEMY_DEFS: EnemyDefinition[] = enemyDefsRaw as unknown as EnemyDefinition[];
/** bosses.json から静的インポートしたボス定義リスト */
const BOSS_DEFS: BossDefinition[] = bossDefsRaw as unknown as BossDefinition[];

/**
 * enemyType（ID文字列）を日本語名に変換する。
 * enemies.json → bosses.json の順に検索し、どちらにもなければフォールバック辞書を参照する。
 * 全て見つからない場合は enemyType をそのまま返す。
 *
 * @param enemyType - 敵の ID 文字列（例: "scout_drone"）
 * @returns 日本語名（例: "スカウトドローン"）
 */
export function getEnemyName(enemyType: string): string {
  const def = (ENEMY_DEFS as EnemyDefinition[]).find((d) => d.id === enemyType);
  if (def) return def.name;
  const boss = (BOSS_DEFS as BossDefinition[]).find((d) => d.id === enemyType);
  if (boss) return boss.name;
  // フォールバック（JSON に存在しない旧 ID などの保険）
  const fallback: Record<string, string> = {
    last_boss_shadow: 'ラストボスシャドウ',
    death_machine: 'デスマシン',
  };
  return fallback[enemyType] ?? enemyType;
}

// ---------------------------------------------------------------------------
// プレイヤーアクション型
// ---------------------------------------------------------------------------

/**
 * プレイヤーが1ターンに取れるアクション。
 * - 'move_up' / 'move_down' / 'move_left' / 'move_right' : 移動（または方向への攻撃）
 * - 'attack' : 向いている方向の隣接マスに攻撃
 * - 'wait'   : 行動なし（ターンを消費するだけ）
 * - 'turn_up' / 'turn_down' / 'turn_left' / 'turn_right' : 向きのみ変更（ターン消費なし）
 */
export type PlayerAction =
  | 'move_up'
  | 'move_down'
  | 'move_left'
  | 'move_right'
  | 'attack'
  | 'wait'
  | 'discard_weapon'
  | 'sell_item'
  | 'sell_weapon'
  | 'turn_up'
  | 'turn_down'
  | 'turn_left'
  | 'turn_right';

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * アクションに対応する方向のオフセット（dx, dy）を返す。
 * 移動・攻撃方向の計算に使う。
 *
 * @param action - move_* アクション
 * @returns { dx, dy } の座標オフセット
 */
function actionToDelta(action: PlayerAction): { dx: number; dy: number } | null {
  switch (action) {
    case 'move_up':    return { dx: 0, dy: -1 };
    case 'move_down':  return { dx: 0, dy: 1 };
    case 'move_left':  return { dx: -1, dy: 0 };
    case 'move_right': return { dx: 1, dy: 0 };
    default:           return null;
  }
}

/**
 * アクションに対応する Direction を返す。
 * 向きの更新に使う。
 *
 * @param action - move_* アクション
 * @returns Direction または null（move 以外の場合）
 */
function actionToDirection(action: PlayerAction): Direction | null {
  switch (action) {
    case 'move_up':    return 'up';
    case 'move_down':  return 'down';
    case 'move_left':  return 'left';
    case 'move_right': return 'right';
    default:           return null;
  }
}

/**
 * Direction に対応する座標オフセットを返す。
 * 敵AIの移動計算・attack アクションで使う。
 *
 * @param dir - 方向
 * @returns { dx, dy } の座標オフセット
 */
function directionToDelta(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'up':    return { dx: 0, dy: -1 };
    case 'down':  return { dx: 0, dy: 1 };
    case 'left':  return { dx: -1, dy: 0 };
    case 'right': return { dx: 1, dy: 0 };
  }
}

/**
 * 指定座標に敵がいるか確認し、いれば返す。
 * bossSize を持つ多タイルボスは、占有する全タイルで照合する。
 *
 * @param enemies - 敵リスト
 * @param pos - 確認する座標
 * @returns 敵がいれば Enemy、いなければ undefined
 */
function enemyAt(enemies: Enemy[], pos: Position): Enemy | undefined {
  return enemies.find((e) => {
    const size = e.bossSize ?? 1;
    return pos.x >= e.pos.x && pos.x < e.pos.x + size &&
           pos.y >= e.pos.y && pos.y < e.pos.y + size;
  });
}

/**
 * ダメージ計算: atk - def、最低 MIN_DAMAGE を保証する。
 *
 * @param atk - 攻撃力
 * @param def - 防御力（装甲値）
 * @returns 最終ダメージ量
 */
function calcDamage(atk: number, def: number): number {
  return Math.max(MIN_DAMAGE, atk - def);
}

/**
 * プレイヤーの実効攻撃力を返す。
 * 装備武器がある場合は player.atk + weapon.atk を合算する。
 *
 * @param player - 現在のプレイヤー状態
 * @returns 実効攻撃力
 */
function effectiveAtk(player: Player): number {
  const weaponAtk = player.equippedWeapon?.atk ?? 0;
  return player.atk + weaponAtk;
}

// ---------------------------------------------------------------------------
// フロア遷移
// ---------------------------------------------------------------------------

/**
 * 次の階層のフロアを生成し、新しい探索・プレイヤー・敵の状態を返す。
 * GameState の不変性を保つため、変更後のフィールドのみ返す。
 *
 * @param state - 現在の GameState（フロア遷移前）
 * @returns フロア遷移後の部分的な GameState フィールド
 */
export function transitionToNextFloor(
  state: GameState,
): Pick<GameState, 'exploration' | 'player' | 'enemies' | 'map' | 'floor' | 'traps' | 'hints' | 'triggeredMonsterHouses' | 'isBlackMarket'> {
  const nextFloorNumber = state.floor + 1;
  const newMap = generateFloor(nextFloorNumber);

  // 新フロアのスタート座標にプレイヤーを配置（装備・道具・ステータス異常を引き継ぐ）
  const currentPlayer = state.player;
  const newPlayer: Player = {
    ...(currentPlayer ?? {}),
    pos: newMap.startPos,
    hp: currentPlayer?.hp ?? state.machine.hp,
    maxHp: currentPlayer?.maxHp ?? state.machine.maxHp,
    atk: currentPlayer?.atk ?? INITIAL_PLAYER_ATK,
    def: currentPlayer?.def ?? INITIAL_PLAYER_DEF,
    facing: INITIAL_FACING,
    animState: 'idle' as const,
  };

  // 新フロアの敵を生成（マップ上の TILE_ENEMY タイルから）
  const newEnemies = spawnEnemiesFromMap(newMap, nextFloorNumber);
  
  // 新フロアのトラップ・ヒントを生成
  const newTraps = spawnTrapsFromMap(newMap);
  const newHints = spawnHintsFromMap(newMap, nextFloorNumber);

  // 10階ごとなら闇商人存在チェック
  let isBlackMarket = false;
  if (nextFloorNumber % 10 === 0) {
    isBlackMarket = newMap.cells.some(row => row.some(c => c.tile === TILE_SHOP));
  }

  // スタート地点の視界を初期化
  const visibleMap = updateVisibility(newMap, newMap.startPos, VIEW_RADIUS);

  return {
    exploration: {
      currentFloor: visibleMap,
      playerPos: newMap.startPos,
      floorNumber: nextFloorNumber,
      turn: state.exploration?.turn ?? 0,
    },
    player: newPlayer,
    enemies: newEnemies,
    traps: newTraps,
    hints: newHints,
    triggeredMonsterHouses: [],
    isBlackMarket,
    map: visibleMap,
    floor: nextFloorNumber,
  };
}

/**
 * 1階層上のフロアへ遷移する。
 * B1F からは遷移できない（呼び出し元で確認すること）。
 */
export function transitionToPrevFloor(
  state: GameState,
): Pick<GameState, 'exploration' | 'player' | 'enemies' | 'map' | 'floor' | 'traps' | 'hints' | 'triggeredMonsterHouses' | 'isBlackMarket'> {
  const prevFloorNumber = Math.max(1, state.floor - 1);
  const newMap = generateFloor(prevFloorNumber);
  const currentPlayer = state.player;
  const newPlayer: Player = {
    ...(currentPlayer ?? {}),
    pos: newMap.startPos,
    hp: currentPlayer?.hp ?? state.machine.hp,
    maxHp: currentPlayer?.maxHp ?? state.machine.maxHp,
    atk: currentPlayer?.atk ?? INITIAL_PLAYER_ATK,
    def: currentPlayer?.def ?? INITIAL_PLAYER_DEF,
    facing: INITIAL_FACING,
    animState: 'idle' as const,
  };
  const newEnemies = spawnEnemiesFromMap(newMap, prevFloorNumber);
  const newTraps = spawnTrapsFromMap(newMap);
  const newHints = spawnHintsFromMap(newMap, prevFloorNumber);
  let isBlackMarket = false;
  if (prevFloorNumber % 10 === 0) {
    isBlackMarket = newMap.cells.some(row => row.some(c => c.tile === TILE_SHOP));
  }
  const visibleMap = updateVisibility(newMap, newMap.startPos, VIEW_RADIUS);
  return {
    exploration: {
      currentFloor: visibleMap,
      playerPos: newMap.startPos,
      floorNumber: prevFloorNumber,
      turn: state.exploration?.turn ?? 0,
    },
    player: newPlayer,
    enemies: newEnemies,
    traps: newTraps,
    hints: newHints,
    triggeredMonsterHouses: [],
    isBlackMarket,
    map: visibleMap,
    floor: prevFloorNumber,
  };
}

/**
 * フロア上のトラップタイルからトラップエンティティを生成する。
 */
function spawnTrapsFromMap(floor: import('./types').Floor): Trap[] {
  const traps: Trap[] = [];
  let idCounter = 0;
  // TODO: 詳細な確率はGDDに沿って後で調整可能。今は等確率。
  const types: TrapType[] = [
    'visible_pitfall',
    'hidden_pitfall',
    'large_pitfall',
    'landmine',
    'poison_gas',
    'arrow_trap',
    'teleport_trap',
    'item_loss',
    'summon_trap',
    'rust_trap'
  ];

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (floor.cells[y][x].tile === TILE_TRAP) {
        const type = types[Math.floor(Math.random() * types.length)];
        // hidden_pitfall以外は基本最初は可視（あるいは発見次第可視）。ここではGDDに従い調整。
        const isVisible = (type !== 'hidden_pitfall' && type !== 'landmine' && type !== 'poison_gas' && type !== 'item_loss');
        traps.push({
          id: idCounter++,
          type,
          pos: { x, y },
          isVisible,
          isTriggered: false,
        });
      }
    }
  }
  return traps;
}

/**
 * 武器スロットの指定インデックスの武器を破棄（捨てる）する。
 *
 * @param state - 現在の GameState
 * @param index - player.weaponSlots のインデックス
 * @returns 破棄後の新しい GameState
 */
export function discardWeapon(state: GameState, index: number): GameState {
  if (!state.player || !state.player.weaponSlots) return state;
  const slots = state.player.weaponSlots;
  if (index < 0 || index >= slots.length) return state;

  const targetWeapon = slots[index];
  const newSlots = slots.filter((_, i) => i !== index);
  
  // 現在装備中の武器を捨てた場合、素手にする
  const isEquipped = state.player.equippedWeapon?.id === targetWeapon.id;
  const newEquipped = isEquipped ? null : state.player.equippedWeapon;

  return {
    ...state,
    player: {
      ...state.player,
      weaponSlots: newSlots,
      equippedWeapon: newEquipped,
    },
    // inventory.equippedWeapons も同期させる（セーブ・ロード用）
    inventory: {
      ...state.inventory,
      equippedWeapons: state.inventory.equippedWeapons.filter((_, i) => i !== index),
    }
  };
}

/**
 * フロア上のヒント石碑タイルからヒントエンティティを生成する。
 */
function spawnHintsFromMap(floor: import('./types').Floor, floorNumber: number): Hint[] {
  const hints: Hint[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (floor.cells[y][x].tile === TILE_HINT) {
        hints.push({
          pos: { x, y },
          text: `【石碑】 古き記録： 次の試練は階層 ${Math.ceil((floorNumber + 1) / 5) * 5} に待ち受けるだろう...`
        });
      }
    }
  }
  return hints;
}

/**
 * フロアのタイルから敵エンティティを生成する。
 * TILE_ENEMY タイルに enemies.json から読み込んだ敵定義を割り当てる。
 *
 * - フロア番号に応じて appearsFrom <= floorNumber の敵定義のみ候補とする。
 * - 候補が複数ある場合は均等にランダム選択する。
 * - 階層スケール（hpScale / atkScale）は基本パラメータに乗算する。
 *
 * @param floor - 対象のフロア
 * @param floorNumber - フロア番号（難易度スケール用）
 * @returns 生成された Enemy の配列
 */
export function spawnEnemiesFromMap(
  floor: import('./types').Floor,
  floorNumber: number,
): Enemy[] {
  const enemies: Enemy[] = [];
  let idCounter = 0;

  // 階層に応じた基本パラメータスケール（シンプルな線形スケール）
  const hpScale = 1 + (floorNumber - 1) * 0.1;
  const atkScale = 1 + (floorNumber - 1) * 0.08;

  // このフロアに出現可能な敵定義を取得する
  const availableDefs = ENEMY_DEFS.filter((def) =>
    def.appearsFrom <= floorNumber &&
    ((def as any).appearsUntil === undefined || (def as any).appearsUntil >= floorNumber)
  );

  // 出現可能な定義がなければ fallback として先頭要素を使う
  const pool: EnemyDefinition[] =
    availableDefs.length > 0 ? availableDefs : ENEMY_DEFS.slice(0, 1);

  // 対象フロアのボス定義を取得
  const bossDef = BOSS_DEFS.find((def) => def.floor === floorNumber);

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (floor.cells[y][x].tile === 'E') {
        // 通常敵の生成
        const def = pool[Math.floor(Math.random() * pool.length)];
        const scaledHp = Math.round(def.hp * hpScale);
        const scaledAtk = Math.round(def.atk * atkScale);

        enemies.push({
          id: idCounter++,
          enemyType: def.id,
          name: def.name,
          pos: { x, y },
          hp: scaledHp,
          maxHp: scaledHp,
          atk: scaledAtk,
          def: def.def,
          expReward: Math.round(def.expReward * hpScale),
          aiType: (def.aiType ?? def.movementPattern ?? 'straight') as EnemyAiType,
          facing: 'down',
          attackRange: (def as any).attackRange ?? 1,
          // 派閥・レベルフィールド
          baseEnemyId: def.baseEnemyId,
          level: def.level ?? 1,
          factionType: def.factionType,
          canAttackAllies: def.canAttackAllies ?? false,
          levelColor: def.levelColor,
          attackMissColor: def.attackMissColor,
          equippedWeaponId: def.equippedWeapon ?? null,
          equippedArmorId: def.equippedArmor ?? null,
          equippedShieldId: def.equippedShield ?? null,
          equipDropChance: def.equipDropChance ?? 0,
          lastAttackedEnemyId: null,
        });
      } else if (floor.cells[y][x].tile === 'B' && bossDef) {
        if (bossDef.id === 'bug_swarm') {
          // バグスウォーム: 8体の小虫として分散して出現
          const unitHp = (bossDef as any).unitHp ?? 10;
          const unitAtk = (bossDef as any).unitAtk ?? 1;
          const unitExp = Math.floor(bossDef.expReward / 8);
          const spawnOffsets = [
            { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
            { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
            { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 },
          ];
          let unitIndex = 0;
          for (const off of spawnOffsets) {
            const ux = x + off.dx;
            const uy = y + off.dy;
            if (ux < 0 || uy < 0 || uy >= floor.height || ux >= floor.width) continue;
            const t = floor.cells[uy][ux].tile;
            if (!isWalkable(t)) continue;
            enemies.push({
              id: idCounter++,
              enemyType: bossDef.id,
              pos: { x: ux, y: uy },
              hp: unitHp,
              maxHp: unitHp,
              atk: unitAtk,
              def: bossDef.def,
              expReward: unitExp,
              aiType: 'boss',
              facing: 'down',
              isBoss: true,
              bossSize: 1,
              bossState: { ...bossDef, swarmUnitIndex: unitIndex++ },
            });
            if (unitIndex >= 8) break;
          }
        } else {
          // 通常ボスの生成（ボスはスケール適用せずそのままのステータスを使用）
          enemies.push({
            id: idCounter++,
            enemyType: bossDef.id,
            pos: { x, y },
            hp: bossDef.hp,
            maxHp: bossDef.hp,
            atk: bossDef.atk,
            def: bossDef.def,
            expReward: bossDef.expReward,
            aiType: 'boss', // boss-ai に処理を委譲
            facing: 'down',
            isBoss: true,
            bossSize: (bossDef as any).size ?? 2,
            bossState: { ...bossDef }, // ボス専用パラメータを保持
          });
        }
      }
    }
  }

  return enemies;
}

// ---------------------------------------------------------------------------
// プレイヤー行動フェーズ
// ---------------------------------------------------------------------------

/**
 * プレイヤー行動フェーズを処理する。
 * 移動・バンプ攻撃・attack・wait の各アクションを純粋関数として処理する。
 *
 * @param state - 行動前の GameState
 * @param action - プレイヤーのアクション
 * @returns プレイヤー行動後の部分的な状態（player・enemies・それ以外の変化）
 */
/** アイテム/武器/ゴールドピックアップ情報 */
type PickupInfo =
  | { type: 'item'; pos: Position; itemId: string }
  | { type: 'weapon'; pos: Position; weaponId: string }
  | { type: 'gold'; pos: Position; amount: number }
  | { type: 'shop'; pos: Position };

function processPlayerAction(
  state: GameState,
  action: PlayerAction,
): { player: Player; enemies: Enemy[]; shouldTransitionFloor: boolean; pickup: PickupInfo | null; logMessages: string[]; triggeredTrapId?: number } {
  const player = state.player!;
  let newPlayer = { ...player };
  let newEnemies = [...state.enemies];
  let shouldTransitionFloor = false;
  let pickup: PickupInfo | null = null;
  const logMessages: string[] = [];
  let triggeredTrapId: number | undefined = undefined;

  const delta = actionToDelta(action);

  if (delta !== null) {
    // move_* アクション: 向きを更新
    const dir = actionToDirection(action)!;
    newPlayer = { ...newPlayer, facing: dir };

    const targetPos: Position = {
      x: player.pos.x + delta.dx,
      y: player.pos.y + delta.dy,
    };

    // 階段タイルは敵が乗っていても常に通過できる（バンプ攻撃より優先）
    const _stairsCheck = state.map ? getTileAt(state.map, targetPos) : null;
    // 移動先に敵がいるか確認（バンプ攻撃）
    const targetEnemy = _stairsCheck === TILE_STAIRS_DOWN ? undefined : enemyAt(newEnemies, targetPos);
    if (targetEnemy !== undefined) {
      // 透明ボス（phantom）への攻撃をブロック
      const isTargetInvisible = targetEnemy.bossState?.isInvisible === true;
      const hasTrapSensor = newPlayer.equippedTools?.some((t: any) => t.id === 'trap_sensor' && t.isEquipped);
      const isRevealedBySmoke = (targetEnemy.bossState?.revealedTurns ?? 0) > 0;
      if (isTargetInvisible && !hasTrapSensor && !isRevealedBySmoke) {
        logMessages.push('透明な敵には攻撃が当たらない！（煙幕弾かトラップセンサーが必要）');
        // ダメージ処理をスキップ（移動もキャンセル）
      } else {
        // バンプ攻撃: 装備武器の atk を加算した実効攻撃力でダメージ計算
        const weapon = newPlayer.equippedWeapon ?? null;
        const dmg = calcDamage(effectiveAtk(newPlayer), targetEnemy.def);

        // シールド吸収
        const { finalDamage, updatedEntity: shieldedEnemy } = absorbWithShield(targetEnemy, dmg);

        // 状態異常付与
        let hitEnemy = { ...shieldedEnemy, hp: shieldedEnemy.hp - finalDamage, animState: 'hit' as const };
        if (weapon) {
          const statusEffect = applyWeaponSpecial(weapon);
          if (statusEffect) {
            hitEnemy = addStatusEffect(hitEnemy, statusEffect) as typeof hitEnemy;
          }
          // バンプ攻撃でも耐久消費
          const updatedWeapon = consumeDurability(weapon);
          if (isBroken(updatedWeapon)) {
            logMessages.push(`武器「${weapon.name}」が壊れた！`);
          }
          newPlayer = {
            ...newPlayer,
            equippedWeapon: isBroken(updatedWeapon) ? null : updatedWeapon,
            animState: 'attack' as const,
          };
        } else {
          // 素手攻撃でもアニメーション
          newPlayer = { ...newPlayer, animState: 'attack' as const };
        }

        newEnemies = newEnemies.map((e) =>
          e.id === targetEnemy.id ? hitEnemy : e,
        );
      }
    } else {
      // 移動先のタイルを確認
      const mapData = state.map!;
      const targetTile = getTileAt(mapData, targetPos);

      if (isWalkable(targetTile)) {
        let slidePos = targetPos;
        let slideTile = targetTile;
        
        // 氷の滑走処理
        // TODO: upgrade-system からのパーツ情報を参照する（spike_tires）
        // 現在は status-effect に spike_tires がないので単に判定
        const hasSpikeTires = false;
        if (targetTile === TILE_ICE && !hasSpikeTires) {
           while (isWalkable(getTileAt(mapData, { x: slidePos.x + delta.dx, y: slidePos.y + delta.dy }))) {
              const nx = slidePos.x + delta.dx;
              const ny = slidePos.y + delta.dy;
              if (enemyAt(newEnemies, { x: nx, y: ny }) !== undefined) break; // 敵にぶつかる
              slidePos = { x: nx, y: ny };
              slideTile = getTileAt(mapData, slidePos);
              if (slideTile !== TILE_ICE) break; // 氷から出たら止まる
           }
        }
        
        // ワープ処理
        if (slideTile === TILE_WARP) {
           const warpTiles: Position[] = [];
           for (let y = 0; y < mapData.height; y++) {
             for (let x = 0; x < mapData.width; x++) {
                if (mapData.cells[y][x].tile === TILE_WARP && (x !== slidePos.x || y !== slidePos.y)) {
                   warpTiles.push({ x, y });
                }
             }
           }
           if (warpTiles.length > 0) {
              slidePos = warpTiles[Math.floor(Math.random() * warpTiles.length)];
              slideTile = getTileAt(mapData, slidePos);
              logMessages.push('ワープゾーンに入り、別の場所へ転移した！');
           }
        }

        // 移動実行
        newPlayer = { ...newPlayer, pos: slidePos, animState: 'move' as const };

        // 溶岩ダメージ
        const hasHeatResist = false; // TODO: アップグレード判定
        if (slideTile === TILE_LAVA && !hasHeatResist) {
           newPlayer = { ...newPlayer, hp: newPlayer.hp - 5, hpEverDroppedBelowMax: true };
           logMessages.push('溶岩の熱で5ダメージを受けた！');
        }

        // トラップチェック
        if (slideTile === TILE_TRAP) {
           const trap = state.traps.find(t => t.pos.x === slidePos.x && t.pos.y === slidePos.y);
           if (trap && !trap.isTriggered) {
              triggeredTrapId = trap.id;
              logMessages.push('罠を踏んだ！');
              // 罠の具体的効果は processTurn で解決する
           }
        }

        // ヒントチェック
        if (slideTile === TILE_HINT) {
           const hint = state.hints.find(h => h.pos.x === slidePos.x && h.pos.y === slidePos.y);
           if (hint) {
              logMessages.push(hint.text);
           }
        }

        // 階段タイルを踏んだら次階層へ（ボスフロアではボス撃破が必要）
        if (slideTile === TILE_STAIRS_DOWN) {
          const isBossFloor = state.floor > 0 && BOSS_DEFS.some((def) => def.floor === state.floor);
          const bossAlive = isBossFloor && newEnemies.some((e) => e.isBoss && e.hp > 0);
          if (bossAlive) {
            logMessages.push('ボスを倒さなければ下階へは行けない！');
          } else {
            shouldTransitionFloor = true;
          }
        }

        // アイテムピックアップ類
        if (slideTile === TILE_ITEM) {
          // 既に確定済みのIDがあればそれを使う（ポーチ満杯で一度失敗した場合も同じアイテム）
          const slideCell = state.map!.cells[slidePos.y][slidePos.x];
          const itemId = slideCell.itemId ?? rollFloorItem(state.floor, Math.random);
          if (itemId) {
            if (!slideCell.itemId) { slideCell.itemId = itemId; }
            pickup = { type: 'item', pos: slidePos, itemId };
          }
        }
        if (slideTile === TILE_WEAPON) {
          const slideCell = state.map!.cells[slidePos.y][slidePos.x];
          const weaponId = slideCell.weaponId ?? rollFloorWeapon(state.floor, Math.random);
          if (weaponId) {
            if (!slideCell.weaponId) { slideCell.weaponId = weaponId; }
            pickup = { type: 'weapon', pos: slidePos, weaponId };
          } else {
            // このフロアでは出現する武器がない（フロア1など）
            logMessages.push('古い武器の残骸があったが、使い物にならなかった');
          }
        }
        if (slideTile === TILE_GOLD) {
          const amount = rollFloorGold(state.floor, Math.random);
          pickup = { type: 'gold', pos: slidePos, amount };
        }
        if (slideTile === TILE_SHOP) {
          pickup = { type: 'shop', pos: slidePos };
        }
      }
      // 壁などの場合は移動しない（方向だけ更新済み）
    }
  } else if (action === 'attack') {
    // attack アクション: 装備武器の範囲タイプで攻撃
    const weapon = newPlayer.equippedWeapon ?? null;
    const targetPositions = getAttackTargetPositions(
      player.pos,
      newPlayer.facing,
      weapon,
      state.map,
    );

    for (const targetPos of targetPositions) {
      const targetEnemy = enemyAt(newEnemies, targetPos);
      if (targetEnemy !== undefined) {
        // 透明ボス（phantom）への攻撃をブロック
        const isTargetInvisibleA = targetEnemy.bossState?.isInvisible === true;
        const hasTrapSensorA = newPlayer.equippedTools?.some((t: any) => t.id === 'trap_sensor' && t.isEquipped);
        const isRevealedBySmokeA = (targetEnemy.bossState?.revealedTurns ?? 0) > 0;
        if (isTargetInvisibleA && !hasTrapSensorA && !isRevealedBySmokeA) {
          logMessages.push('透明な敵には攻撃が当たらない！（煙幕弾かトラップセンサーが必要）');
          continue; // このターゲットをスキップ
        }

        // attack アクション: 装備武器の atk を加算した実効攻撃力でダメージ計算
        const dmg = calcDamage(effectiveAtk(newPlayer), targetEnemy.def);

        // シールド吸収
        const { finalDamage, updatedEntity: shieldedEnemy } = absorbWithShield(targetEnemy, dmg);

        // 状態異常付与（武器special）
        let hitEnemy = { ...shieldedEnemy, hp: shieldedEnemy.hp - finalDamage, animState: 'hit' as const };
        if (weapon) {
          const statusEffect = applyWeaponSpecial(weapon);
          if (statusEffect) {
            hitEnemy = addStatusEffect(hitEnemy, statusEffect);
          }
        }

        newEnemies = newEnemies.map((e) =>
          e.id === targetEnemy.id ? hitEnemy : e,
        );
      }
    }

    // 武器耐久度消費
    if (weapon) {
      const updatedWeapon = consumeDurability(weapon);
      if (isBroken(updatedWeapon)) {
        logMessages.push(`武器「${weapon.name}」が壊れた！`);
      }
      newPlayer = {
        ...newPlayer,
        equippedWeapon: isBroken(updatedWeapon) ? null : updatedWeapon,
        animState: 'attack' as const,
      };
    } else {
      // 素手攻撃でも空マス・壁への空振りでもアニメーションを設定する
      newPlayer = { ...newPlayer, animState: 'attack' as const };
    }
  }
  // wait: 何もしない

  return { player: newPlayer, enemies: newEnemies, shouldTransitionFloor, pickup, logMessages, triggeredTrapId };
}

// ---------------------------------------------------------------------------
// 敵行動フェーズ
// ---------------------------------------------------------------------------

/**
 * 敵AIの1ターン分の行動を処理する。
 * decideEnemyAction を使って各敵の行動を決定する。
 * 視界内（マンハッタン距離 ≤ ENEMY_SIGHT_RANGE）の敵のみ行動する。
 *
 * @param state - プレイヤー行動後の中間状態（player・enemies は更新済み）
 * @param currentPlayer - 更新後のプレイヤー
 * @param currentEnemies - 更新後の敵リスト
 * @returns 敵行動後の player・enemies
 */
function processEnemyActions(
  state: GameState,
  currentPlayer: Player,
  currentEnemies: Enemy[],
): { player: Player; enemies: Enemy[]; enemyEventMessages: string[] } {
  let newPlayer = { ...currentPlayer };
  const processedEnemies: Enemy[] = [];
  const enemyEventMessages: string[] = [];
  // 敵VS敵攻撃で先行追加されたエントリのIDセット（二重追加防止）
  const preAddedEnemyIds = new Set<number>();

  for (const enemy of currentEnemies) {
    // 敵VS敵攻撃で既に processedEnemies に先行追加されたエントリはスキップ
    if (preAddedEnemyIds.has(enemy.id)) {
      continue;
    }

    const dist = manhattanDistance(enemy.pos, newPlayer.pos);

    // 視界外の敵は行動しない
    if (dist > ENEMY_SIGHT_RANGE) {
      processedEnemies.push(enemy);
      continue;
    }

    // 状態異常による行動不可チェック
    if (!canAct(enemy) || isShockedSkip(enemy)) {
      processedEnemies.push(enemy);
      continue;
    }

    // enemy-ai または boss-ai に行動を委譲
    const stateWithCurrent: GameState = {
      ...state,
      player: newPlayer,
      enemies: [...processedEnemies, ...currentEnemies.filter(
        (e) => e.id !== enemy.id && !processedEnemies.some((p) => p.id === e.id),
      )],
    };

    let actions: EnemyAction[] = [];
    if (enemy.aiType === 'boss') {
      actions = decideBossAction(enemy, stateWithCurrent, Math.random);
    } else {
      actions = [decideEnemyAction(enemy, stateWithCurrent, Math.random)];
    }

    // 複数アクション（マッハランナーなど）に対応するためループ処理
    let currentEnemyState = enemy;
    for (const action of actions) {
      if (currentEnemyState.hp <= 0) break; // 途中で死んだら以降のアクションキャンセル

      switch (action.type) {
        case 'attack': {
          if (action.targetId === 'player') {
            // 盾・アーマーの def ボーナスを加算
            const shieldDef = newPlayer.equippedShield?.def ?? 0;
            const armorDef = newPlayer.equippedArmor?.def ?? 0;
            const effectiveDef = newPlayer.def + shieldDef + armorDef;
            // 盾の blockChance 判定（確率でダメージ完全ブロック）
            const blockChance = newPlayer.equippedShield?.blockChance ?? 0;
            const isBlocked = blockChance > 0 && Math.random() < blockChance;
            const dmg = isBlocked ? 0 : calcDamage(currentEnemyState.atk, effectiveDef);
            const { finalDamage, updatedEntity: shieldedPlayer } = absorbWithShield(newPlayer, dmg);
            // プレイヤーの向きを維持しつつ animState を 'hit' に
            newPlayer = {
              ...shieldedPlayer,
              hp: shieldedPlayer.hp - finalDamage,
              animState: 'hit' as const,
              facing: newPlayer.facing, // 明示的に維持
              ...(finalDamage > 0 && { hpEverDroppedBelowMax: true }),
            };
            // 盾・アーマー耐久度消費（武器の半分: 50%の確率で1減少）
            if (finalDamage > 0 || isBlocked) {
              if (newPlayer.equippedShield && newPlayer.equippedShield.durability > 0 && Math.random() < 0.5) {
                const newDur = newPlayer.equippedShield.durability - 1;
                const broke = newDur <= 0;
                const updatedShield = broke ? null : { ...newPlayer.equippedShield, durability: newDur };
                const _eqSh = newPlayer.equippedShield!;
                let _shieldMatchDone = false;
                const updatedShieldSlots = broke
                  ? (newPlayer.shieldSlots ?? []).filter(s =>
                      (_eqSh.instanceId && s.instanceId) ? s.instanceId !== _eqSh.instanceId : s.shieldId !== _eqSh.shieldId)
                  : (newPlayer.shieldSlots ?? []).map(s => {
                      const match = (_eqSh.instanceId && s.instanceId)
                        ? s.instanceId === _eqSh.instanceId
                        : (s.shieldId === _eqSh.shieldId && !_shieldMatchDone);
                      if (match && !(_eqSh.instanceId && s.instanceId)) _shieldMatchDone = true;
                      return match ? { ...s, durability: newDur } : s;
                    });
                if (broke) {
                  enemyEventMessages.push(`盾「${newPlayer.equippedShield.name}」が壊れた！`);
                }
                newPlayer = { ...newPlayer, equippedShield: updatedShield, shieldSlots: updatedShieldSlots };
              }
              if (newPlayer.equippedArmor && newPlayer.equippedArmor.durability > 0 && Math.random() < 0.5) {
                const newDur = newPlayer.equippedArmor.durability - 1;
                const broke = newDur <= 0;
                const updatedArmor = broke ? null : { ...newPlayer.equippedArmor, durability: newDur };
                const _eqAr = newPlayer.equippedArmor!;
                let _armorMatchDone = false;
                const updatedArmorSlots = broke
                  ? (newPlayer.armorSlots ?? []).filter(a =>
                      (_eqAr.instanceId && a.instanceId) ? a.instanceId !== _eqAr.instanceId : a.armorId !== _eqAr.armorId)
                  : (newPlayer.armorSlots ?? []).map(a => {
                      const match = (_eqAr.instanceId && a.instanceId)
                        ? a.instanceId === _eqAr.instanceId
                        : (a.armorId === _eqAr.armorId && !_armorMatchDone);
                      if (match && !(_eqAr.instanceId && a.instanceId)) _armorMatchDone = true;
                      return match ? { ...a, durability: newDur } : a;
                    });
                if (broke) {
                  enemyEventMessages.push(`防具「${newPlayer.equippedArmor.name}」が壊れた！`);
                }
                newPlayer = { ...newPlayer, equippedArmor: updatedArmor, armorSlots: updatedArmorSlots };
              }
            }
            currentEnemyState = {
              ...currentEnemyState,
              animState: 'attack' as const,
              facing: getDirection(currentEnemyState.pos, newPlayer.pos)
            };
          } else {
            // 敵が他の敵を攻撃する処理
            const targetEnemyId = parseInt(action.targetId, 10);
            // processedEnemies と未処理の currentEnemies の両方からターゲットを探す
            const targetInProcessed = processedEnemies.findIndex((e) => e.id === targetEnemyId);
            const targetInCurrent = currentEnemies.findIndex(
              (e) => e.id === targetEnemyId && !processedEnemies.some((p) => p.id === e.id),
            );

            // ターゲットを取得（processedEnemies 優先）
            let targetEnemy: Enemy | undefined;
            let targetSource: 'processed' | 'current' | undefined;
            if (targetInProcessed >= 0) {
              targetEnemy = processedEnemies[targetInProcessed];
              targetSource = 'processed';
            } else if (targetInCurrent >= 0) {
              targetEnemy = currentEnemies[targetInCurrent];
              targetSource = 'current';
            }

            if (targetEnemy && targetSource) {
              // 攻撃可否チェック
              if (canEnemyAttackEnemy(currentEnemyState, targetEnemy)) {
                const dmg = Math.max(1, currentEnemyState.atk - targetEnemy.def);
                const hitTarget = { ...targetEnemy, hp: targetEnemy.hp - dmg, animState: 'hit' as const };

                // ターゲットを更新
                if (targetSource === 'processed') {
                  processedEnemies[targetInProcessed] = hitTarget;
                } else {
                  // currentEnemies 内のターゲットを先行追加（ダメージ反映済み）
                  // ループ先頭で preAddedEnemyIds をチェックして二重追加を防ぐ
                  processedEnemies.push(hitTarget);
                  preAddedEnemyIds.add(hitTarget.id);
                }

                const attackerName = currentEnemyState.name ?? getEnemyName(currentEnemyState.enemyType);
                const targetName = targetEnemy.name ?? getEnemyName(targetEnemy.enemyType);
                enemyEventMessages.push(`${attackerName}が${targetName}を攻撃！ ${dmg}ダメージ！`);

                // 撃破判定
                if (hitTarget.hp <= 0) {
                  enemyEventMessages.push(`${attackerName}が${targetName}を撃破！`);

                  // ドロップ処理
                  const drops: DropResult[] = rollDrops(targetEnemy.enemyType, state.floor, Math.random);
                  for (const drop of drops) {
                    if (drop.type === 'gold' && drop.amount) {
                      // 敵撃破のゴールドは stateWithPickup で処理できないため
                      // ここでは battleLog にのみ記録する（実装を単純化）
                      enemyEventMessages.push(`${drop.amount}Gがこぼれ落ちた！`);
                    }
                  }

                  // レベルアップ処理
                  const { updatedEnemy: leveledUp, message: lvMsg } = levelUpEnemy(currentEnemyState);
                  currentEnemyState = leveledUp;
                  enemyEventMessages.push(lvMsg);
                }

                currentEnemyState = {
                  ...currentEnemyState,
                  animState: 'attack' as const,
                  facing: getDirection(currentEnemyState.pos, targetEnemy.pos),
                };
              }
            }
          }
          break;
        }

        case 'move': {
          // 敵が階段タイルに乗ることを禁止（プレイヤーが詰まるのを防ぐ）
          const moveTile = state.map ? getTileAt(state.map, action.to) : null;
          if (moveTile !== TILE_STAIRS_DOWN) {
            currentEnemyState = { ...currentEnemyState, pos: action.to };
          }
          break;
        }

        case 'heal': {
          // 対象の敵を回復（processedEnemies の中から探す）
          const targetIdx = processedEnemies.findIndex((e) => String(e.id) === action.targetId);
          if (targetIdx >= 0) {
            const target = processedEnemies[targetIdx];
            const healed = { ...target, hp: Math.min(target.maxHp, target.hp + action.amount) };
            processedEnemies[targetIdx] = healed;
          }
          break;
        }

        case 'explode': {
          // 自爆: プレイヤーにダメージを与え、自身はHP=0にする
          const shieldDefEx = newPlayer.equippedShield?.def ?? 0;
          const armorDefEx = newPlayer.equippedArmor?.def ?? 0;
          const effectiveDefEx = newPlayer.def + shieldDefEx + armorDefEx;
          const blockChanceEx = newPlayer.equippedShield?.blockChance ?? 0;
          const isBlockedEx = blockChanceEx > 0 && Math.random() < blockChanceEx;
          const dmg = isBlockedEx ? 0 : calcDamage(currentEnemyState.atk, effectiveDefEx);
          const { finalDamage, updatedEntity: shieldedPlayer } = absorbWithShield(newPlayer, dmg);
          newPlayer = { ...shieldedPlayer, hp: shieldedPlayer.hp - finalDamage, animState: 'hit' as const, ...(finalDamage > 0 && { hpEverDroppedBelowMax: true }) };
          // 盾・アーマー耐久度消費（武器の半分: 50%の確率で1減少）
          if (finalDamage > 0 || isBlockedEx) {
            if (newPlayer.equippedShield && newPlayer.equippedShield.durability > 0 && Math.random() < 0.5) {
              const newDur = newPlayer.equippedShield.durability - 1;
              const broke = newDur <= 0;
              const updatedShield = broke ? null : { ...newPlayer.equippedShield, durability: newDur };
              const _eqSh2 = newPlayer.equippedShield!;
              let _shieldMatchDone2 = false;
              const updatedShieldSlots = broke
                ? (newPlayer.shieldSlots ?? []).filter(s =>
                    (_eqSh2.instanceId && s.instanceId) ? s.instanceId !== _eqSh2.instanceId : s.shieldId !== _eqSh2.shieldId)
                : (newPlayer.shieldSlots ?? []).map(s => {
                    const match = (_eqSh2.instanceId && s.instanceId)
                      ? s.instanceId === _eqSh2.instanceId
                      : (s.shieldId === _eqSh2.shieldId && !_shieldMatchDone2);
                    if (match && !(_eqSh2.instanceId && s.instanceId)) _shieldMatchDone2 = true;
                    return match ? { ...s, durability: newDur } : s;
                  });
              newPlayer = { ...newPlayer, equippedShield: updatedShield, shieldSlots: updatedShieldSlots };
            }
            if (newPlayer.equippedArmor && newPlayer.equippedArmor.durability > 0 && Math.random() < 0.5) {
              const newDur = newPlayer.equippedArmor.durability - 1;
              const broke = newDur <= 0;
              const updatedArmor = broke ? null : { ...newPlayer.equippedArmor, durability: newDur };
              const _eqAr2 = newPlayer.equippedArmor!;
              let _armorMatchDone2 = false;
              const updatedArmorSlots = broke
                ? (newPlayer.armorSlots ?? []).filter(a =>
                    (_eqAr2.instanceId && a.instanceId) ? a.instanceId !== _eqAr2.instanceId : a.armorId !== _eqAr2.armorId)
                : (newPlayer.armorSlots ?? []).map(a => {
                    const match = (_eqAr2.instanceId && a.instanceId)
                      ? a.instanceId === _eqAr2.instanceId
                      : (a.armorId === _eqAr2.armorId && !_armorMatchDone2);
                    if (match && !(_eqAr2.instanceId && a.instanceId)) _armorMatchDone2 = true;
                    return match ? { ...a, durability: newDur } : a;
                  });
              newPlayer = { ...newPlayer, equippedArmor: updatedArmor, armorSlots: updatedArmorSlots };
            }
          }
          currentEnemyState = { ...currentEnemyState, hp: 0, animState: 'attack' as const };
          break;
        }

        case 'absorb_wall': {
          // ジャンクキングがひび割れ壁を吸収してHP+/ATK+
          const wallPos = (action as { type: 'absorb_wall'; wallPos: Position }).wallPos;
          if (state.map && wallPos.y >= 0 && wallPos.y < state.map.height && wallPos.x >= 0 && wallPos.x < state.map.width) {
            state.map.cells[wallPos.y][wallPos.x].tile = TILE_FLOOR;
          }
          const absorbHp = currentEnemyState.bossState?.absorbHpPerWall ?? 10;
          const absorbAtk = currentEnemyState.bossState?.absorbAtkBonus ?? 3;
          const newAbsorbCount = (currentEnemyState.bossState?.absorbCount ?? 0) + 1;
          currentEnemyState = {
            ...currentEnemyState,
            hp: Math.min(currentEnemyState.maxHp + 50, currentEnemyState.hp + absorbHp),
            atk: currentEnemyState.atk + absorbAtk,
            bossState: {
              ...currentEnemyState.bossState,
              absorbCount: newAbsorbCount,
            },
          };
          enemyEventMessages.push(`ジャンクキングが廃材を吸収！ HP+${absorbHp}、ATK+${absorbAtk}（計${newAbsorbCount}個吸収）`);
          break;
        }

        case 'skip':
        default:
          break;
      }
    }
    processedEnemies.push(currentEnemyState);
  }

  return { player: newPlayer, enemies: processedEnemies, enemyEventMessages };
}

/**
 * 1体の敵を移動させる。
 * 移動後の座標が他の敵やプレイヤーと被らないよう確認する。
 *
 * @param enemy - 移動する敵
 * @param player - 現在のプレイヤー
 * @param state - 現在の GameState（マップ参照用）
 * @param alreadyMoved - 今ターンで既に行動済みの敵リスト（衝突判定用）
 * @returns 移動後の Enemy
 */
function moveEnemy(
  enemy: Enemy,
  player: Player,
  state: GameState,
  alreadyMoved: Enemy[],
): Enemy {
  const mapData = state.map!;

  // 候補移動方向をマンハッタン距離が縮まる方向で優先ソートする
  const candidates = getCandidateMoves(enemy.pos, player.pos);

  for (const candidate of candidates) {
    const tile = getTileAt(mapData, candidate);
    if (!isWalkable(tile)) continue;

    // プレイヤー座標と重ならない
    if (candidate.x === player.pos.x && candidate.y === player.pos.y) continue;

    // 他の敵と重ならない（処理済み + 未処理両方）
    const allEnemies = [...alreadyMoved, ...state.enemies.filter(
      (e) => e.id !== enemy.id && !alreadyMoved.some((m) => m.id === e.id),
    )];
    if (allEnemies.some((e) => e.pos.x === candidate.x && e.pos.y === candidate.y)) {
      continue;
    }

    // 移動可能な方向へ移動
    return { ...enemy, pos: candidate };
  }

  // 移動できる場所がなければその場に留まる
  return enemy;
}

/**
 * 移動元からターゲットへのマンハッタン距離が縮まる方向の候補を返す。
 * 距離が縮まる方向を優先し、縮まらない方向も次点として含める（詰まり防止）。
 *
 * @param from - 移動元座標
 * @param target - 目標座標（プレイヤー）
 * @returns 座標の候補リスト（優先度順）
 */
function getCandidateMoves(from: Position, target: Position): Position[] {
  const dx = target.x - from.x;
  const dy = target.y - from.y;

  // マンハッタン距離が縮まる移動方向を優先する
  const preferred: Position[] = [];
  const fallback: Position[] = [];

  const directions: Position[] = [
    { x: from.x,     y: from.y - 1 }, // 上
    { x: from.x,     y: from.y + 1 }, // 下
    { x: from.x - 1, y: from.y     }, // 左
    { x: from.x + 1, y: from.y     }, // 右
  ];

  for (const pos of directions) {
    const newDx = target.x - pos.x;
    const newDy = target.y - pos.y;
    const newDist = Math.abs(newDx) + Math.abs(newDy);
    const oldDist = Math.abs(dx) + Math.abs(dy);

    if (newDist < oldDist) {
      preferred.push(pos);
    } else {
      fallback.push(pos);
    }
  }

  return [...preferred, ...fallback];
}

// ---------------------------------------------------------------------------
// 敵レベルアップ処理
// ---------------------------------------------------------------------------

/**
 * 敵を1レベルアップさせる。
 * enemies.json から次レベルのデータを検索し、存在すれば全データを上書きする。
 * 存在しない場合（最大レベル等）はステータスのみ上昇させる。
 *
 * @param enemy - レベルアップする敵
 * @returns 更新後の敵と表示メッセージ
 */
function levelUpEnemy(
  enemy: Enemy,
): { updatedEnemy: Enemy; message: string } {
  const currentLevel = enemy.level ?? 1;
  const newLevel = Math.min(5, currentLevel + 1);
  const displayName = enemy.name ?? getEnemyName(enemy.enemyType);

  // 既に最大レベルなら現在レベルのまま（上限到達）
  if (newLevel === currentLevel) {
    return {
      updatedEnemy: enemy,
      message: `${displayName}はすでに最大レベルだ！`,
    };
  }

  const newData = findEnemyDataByBaseAndLevel(enemy.baseEnemyId, newLevel);

  if (!newData) {
    // データなし: ステータスのみ上昇
    const newMaxHp = Math.floor(enemy.maxHp * 1.5);
    const newHp = Math.floor(enemy.hp * 1.5);
    const newAtk = Math.floor(enemy.atk * 1.3);
    const newDef = Math.floor(enemy.def * 1.2);
    const updatedEnemy: Enemy = {
      ...enemy,
      level: newLevel,
      maxHp: newMaxHp,
      hp: newHp,
      atk: newAtk,
      def: newDef,
      levelColor: getLevelColor(newLevel),
    };
    return {
      updatedEnemy,
      message: `${displayName}がLv.${newLevel}に上昇した！`,
    };
  }

  // 新レベルのデータで上書き（ID と座標は維持）
  const updatedEnemy: Enemy = {
    ...enemy,
    enemyType: newData.id,
    name: newData.name,
    hp: newData.hp,
    maxHp: newData.hp,
    atk: newData.atk,
    def: newData.def,
    expReward: newData.expReward,
    aiType: (newData.movementPattern ?? 'straight') as EnemyAiType,
    attackRange: newData.attackRange ?? 1,
    level: newData.level,
    baseEnemyId: newData.baseEnemyId,
    factionType: newData.factionType,
    canAttackAllies: newData.canAttackAllies ?? false,
    levelColor: newData.levelColor ?? getLevelColor(newLevel),
    attackMissColor: newData.attackMissColor,
    equippedWeaponId: newData.equippedWeapon ?? null,
    equippedArmorId: newData.equippedArmor ?? null,
    equippedShieldId: newData.equippedShield ?? null,
    equipDropChance: newData.equipDropChance ?? 0,
    // id と pos は維持（ユニーク識別子・位置）
    id: enemy.id,
    pos: enemy.pos,
  };
  return {
    updatedEnemy,
    message: `${newData.name}に進化した！`,
  };
}

// ---------------------------------------------------------------------------
// ターン後処理
// ---------------------------------------------------------------------------

/**
 * HP0以下の敵を除去し、獲得EXPをパイロットに加算し、ドロップを処理する。
 * EXP加算は level-system の addExp を使用してレベルアップを自動処理する。
 *
 * @param state - 現在の GameState
 * @param enemies - 敵行動後の敵リスト
 * @returns 更新後の enemies・pilot・player・machine・battleLog・inventory（ドロップゴールド含む）
 */
function processDefeatedEnemies(
  state: GameState,
  enemies: Enemy[],
): Pick<GameState, 'enemies' | 'pilot' | 'player' | 'machine' | 'battleLog' | 'inventory'> & { enemiesDefeatedCount: number, goldEarnedCount: number, bossDefeatedIds: string[] } {
  const dead = enemies.filter((e) => e.hp <= 0);
  const alive = enemies.filter((e) => e.hp > 0);

  // 今回倒したボスのID（isBoss フラグが立っている敵の enemyType）
  const bossDefeatedIds = dead
    .filter((e) => e.isBoss === true)
    .map((e) => e.enemyType);

  const totalExp = dead.reduce((acc, e) => acc + e.expReward, 0);

  // level-system の addExp でレベルアップ処理（battleLog への追記も含む）
  const stateAfterExp = totalExp > 0 ? addExp(state, totalExp) : state;

  // ドロップ処理: 倒した敵それぞれのドロップを集計
  let goldGained = 0;
  const droppedItems: Array<{ itemId: string; quantity: number; unidentified: boolean }> = [];
  const droppedWeapons: EquippedWeapon[] = [];
  for (const deadEnemy of dead) {
    const drops: DropResult[] = rollDrops(deadEnemy.enemyType, state.floor, Math.random);
    for (const drop of drops) {
      if (drop.type === 'gold' && drop.amount) {
        goldGained += drop.amount;
      } else if (drop.type === 'item' && drop.id) {
        droppedItems.push({ itemId: drop.id, quantity: drop.amount ?? 1, unidentified: false });
      } else if (drop.type === 'weapon' && drop.id) {
        try {
          const wi = createWeaponInstance(drop.id);
          droppedWeapons.push({
            instanceId: wi.instanceId,
            weaponId: wi.id,
            durability: wi.durability ?? 999,
            weaponLevel: 1,
            rarity: 'C',
          });
        } catch { /* 存在しない武器IDは無視 */ }
      }
    }
  }

  let inventory = stateAfterExp.inventory;
  if (goldGained > 0) {
    inventory = { ...inventory, gold: inventory.gold + goldGained };
  }
  if (droppedItems.length > 0) {
    // ポーチ容量を超えないようにドロップアイテムを制限する
    const maxPouch = stateAfterExp.machine.itemPouch;
    const freeSlots = Math.max(0, maxPouch - inventory.items.length);
    const itemsToAdd = droppedItems.slice(0, freeSlots);
    if (itemsToAdd.length > 0) {
      inventory = { ...inventory, items: [...inventory.items, ...itemsToAdd] };
    }
  }
  if (droppedWeapons.length > 0) {
    // 武器スロット容量を超えないようにドロップ武器を制限する
    const maxWeaponSlots = stateAfterExp.machine.weaponSlots;
    const freeWeaponSlots = Math.max(0, maxWeaponSlots - inventory.equippedWeapons.length);
    const weaponsToAdd = droppedWeapons.slice(0, freeWeaponSlots);
    if (weaponsToAdd.length > 0) {
      inventory = { ...inventory, equippedWeapons: [...inventory.equippedWeapons, ...weaponsToAdd] };
    }
  }

  return {
    enemies: alive,
    pilot: stateAfterExp.pilot,
    player: stateAfterExp.player,
    machine: stateAfterExp.machine,
    battleLog: stateAfterExp.battleLog ?? [],
    inventory,
    enemiesDefeatedCount: dead.length,
    goldEarnedCount: goldGained,
    bossDefeatedIds,
  };
}

// ---------------------------------------------------------------------------
// トラップ発動処理
// ---------------------------------------------------------------------------

function handleTrapTrigger(
  trapId: number,
  state: GameState,
  player: Player,
  enemies: Enemy[],
  logMessages: string[]
): { player: Player; enemies: Enemy[]; traps: Trap[]; shouldTransitionFloor: boolean } {
  const newPlayer = { ...player };
  let newEnemies = [...enemies];
  const newTraps = [...state.traps];
  let shouldTransitionFloor = false;

  const trapIndex = newTraps.findIndex(t => t.id === trapId);
  if (trapIndex < 0) return { player, enemies, traps: state.traps, shouldTransitionFloor };
  
  const trap = { ...newTraps[trapIndex] };
  
  switch (trap.type) {
    case 'visible_pitfall':
    case 'hidden_pitfall': {
      newPlayer.hp -= 20;
      newPlayer.hpEverDroppedBelowMax = true;
      const isBossFloorPit = state.floor > 0 && BOSS_DEFS.some((def) => def.floor === state.floor);
      const bossAlivePit = isBossFloorPit && newEnemies.some((e) => e.isBoss && e.hp > 0);
      if (bossAlivePit) {
        logMessages.push('落とし穴に落ちた！ 20のダメージ！ ボスを倒さなければ下階へは行けない！');
      } else {
        logMessages.push('落とし穴に落ちた！ 20のダメージを受けて次階層へ！');
        shouldTransitionFloor = true;
      }
      trap.isTriggered = true;
      break;
    }
    case 'large_pitfall': {
      newPlayer.hp -= 50;
      newPlayer.hpEverDroppedBelowMax = true;
      const isBossFloorLarge = state.floor > 0 && BOSS_DEFS.some((def) => def.floor === state.floor);
      const bossAliveLarge = isBossFloorLarge && newEnemies.some((e) => e.isBoss && e.hp > 0);
      if (bossAliveLarge) {
        logMessages.push('巨大な落とし穴に落ちた！ 50のダメージ！ ボスを倒さなければ下階へは行けない！');
      } else {
        logMessages.push('巨大な落とし穴に落ちた！ 50のダメージを受けて次階層へ！');
        shouldTransitionFloor = true;
      }
      trap.isTriggered = true;
      break;
    }
    case 'landmine':
      logMessages.push('地雷が爆発した！ 25のダメージ！');
      newPlayer.hp -= 25;
      newPlayer.hpEverDroppedBelowMax = true;
      newEnemies = newEnemies.map(e => {
        if (Math.abs(e.pos.x - trap.pos.x) <= 1 && Math.abs(e.pos.y - trap.pos.y) <= 1) {
          return { ...e, hp: e.hp - 25 };
        }
        return e;
      });
      trap.isTriggered = true;
      trap.isVisible = true;
      break;
    case 'poison_gas':
      logMessages.push('毒ガスを吸い込んだ！ 10のダメージ！');
      newPlayer.hp -= 10;
      newPlayer.hpEverDroppedBelowMax = true;
      trap.isTriggered = true;
      break;
    case 'arrow_trap':
      logMessages.push('矢が飛んできた！ 15のダメージ！');
      newPlayer.hp -= 15;
      newPlayer.hpEverDroppedBelowMax = true;
      trap.isTriggered = true;
      break;
    case 'teleport_trap':
      logMessages.push('ワープ罠だ！ どこかに飛ばされた！');
      if (state.map) {
         let wpos = newPlayer.pos;
         for (let i=0; i<50; i++) {
           const rx = Math.floor(Math.random() * state.map.width);
           const ry = Math.floor(Math.random() * state.map.height);
           if (state.map.cells[ry][rx].tile === TILE_FLOOR) { wpos = {x: rx, y: ry}; break; }
         }
         newPlayer.pos = wpos;
      }
      trap.isTriggered = true;
      break;
    case 'summon_trap':
      logMessages.push('モンスター召喚罠だ！');
      trap.isTriggered = true;
      break;
    case 'rust_trap':
      logMessages.push('錆び罠だ！');
      trap.isTriggered = true;
      break;
    case 'item_loss':
      logMessages.push('アイテム没収罠だ！');
      trap.isTriggered = true;
      break;
  }
  
  newTraps[trapIndex] = trap;
  return { player: newPlayer, enemies: newEnemies, traps: newTraps, shouldTransitionFloor };
}

// ---------------------------------------------------------------------------
// メイン: processTurn
// ---------------------------------------------------------------------------

/**
 * プレイヤーの1アクションを受け取り、ターン処理を行って新しい GameState を返す。
 *
 * 処理順序:
 * 1. プレイヤー行動フェーズ（移動・バンプ攻撃・attack・wait）
 * 2. フロア遷移チェック（階段踏んだ場合は次階層を生成して返す）
 * 3. 敵行動フェーズ（視界内の敵が行動）
 * 4. ターン後処理（撃破敵除去・EXP加算・ゲームオーバー判定・ターン++）
 *
 * @param state - 処理前の GameState
 * @param action - プレイヤーが取るアクション
 * @returns 処理後の新しい GameState
 * @throws exploration または player が null の場合（探索中以外は呼ばない想定）
 */
export function processTurn(state: GameState, action: PlayerAction): GameState {
  // exploring フェーズ以外では呼ばれないことを想定する
  if (state.phase !== 'exploring' || state.player === null || state.map === null || state.exploration === null) {
    return state;
  }

  // 方向転換のみ（ターン消費なし）: 敵フェーズをスキップして facing のみ更新
  const TURN_TO_DIR: Partial<Record<PlayerAction, Direction>> = {
    turn_up: 'up', turn_down: 'down', turn_left: 'left', turn_right: 'right',
  };
  const turnDir = TURN_TO_DIR[action];
  if (turnDir) {
    return {
      ...state,
      player: { ...state.player!, facing: turnDir, animState: 'idle' as const },
    };
  }

  // ターン開始: 全 animState をリセット（前ターンのアニメ状態をクリア）
  const stateWithReset: GameState = {
    ...state,
    player: { ...state.player, animState: 'idle' as const },
    enemies: state.enemies.map((e) => ({ ...e, animState: 'idle' as const })),
  };
  const stateForAction = stateWithReset;

  // ─── フェーズ1: プレイヤー行動 ──────────────────────────────────────────
  const {
    player: playerAfterAction,
    enemies: enemiesAfterPlayerAction,
    shouldTransitionFloor,
    pickup,
    logMessages,
    triggeredTrapId,
  } = processPlayerAction(stateForAction, action);

  let stateWithPickup = stateForAction;
  // プレイヤー行動で発生したメッセージを記録
  const newBattleLog = state.battleLog ? [...state.battleLog, ...logMessages] : [...logMessages];

  // ─── モンスターハウストリガー ──────────────────────────────────────────
  const triggeredMonsterHouses = [...state.triggeredMonsterHouses];
  if (!shouldTransitionFloor && state.map) {
    const playerRoom = state.map.rooms.find(r => 
      playerAfterAction.pos.x >= r.bounds.x && playerAfterAction.pos.x < r.bounds.x + r.bounds.width &&
      playerAfterAction.pos.y >= r.bounds.y && playerAfterAction.pos.y < r.bounds.y + r.bounds.height
    );
    if (playerRoom && playerRoom.type === RoomType.MONSTER_HOUSE) {
      if (!triggeredMonsterHouses.includes(playerRoom.id)) {
        newBattleLog.push('モンスターハウスだ！ 敵が押し寄せてくる！');
        triggeredMonsterHouses.push(playerRoom.id);
      }
    }
  }

  // ─── トラップ発動処理 ─────────────────────────────────────────────────
  let playerAfterTrap = playerAfterAction;
  let enemiesAfterTrap = enemiesAfterPlayerAction;
  let trapsAfterAction = state.traps;
  let finalShouldTransitionFloor = shouldTransitionFloor;
  
  if (triggeredTrapId !== undefined) {
    const trapResult = handleTrapTrigger(triggeredTrapId, state, playerAfterAction, enemiesAfterPlayerAction, newBattleLog);
    playerAfterTrap = trapResult.player;
    enemiesAfterTrap = trapResult.enemies;
    trapsAfterAction = trapResult.traps;
    if (trapResult.shouldTransitionFloor) finalShouldTransitionFloor = true;
  }

  stateWithPickup = {
    ...stateWithPickup,
    battleLog: newBattleLog.slice(-50),
    triggeredMonsterHouses,
    traps: trapsAfterAction,
  };

  // ─── アイテム/ゴールドピックアップ処理 ─────────────────────────────────
  // ピックアップがあればマップのタイルを TILE_FLOOR に更新し、インベントリに反映する
  let customPickupMsg: string | null = null;
  
  if (pickup !== null) {
    if (pickup.type === 'item') {
      const maxCap = state.machine.itemPouch;
      if (stateWithPickup.inventory.items.length >= maxCap) {
        customPickupMsg = `アイテムポーチがいっぱいで ${getItemDisplayName(pickup.itemId)} を拾えなかった`;
      } else {
        state.map.cells[pickup.pos.y][pickup.pos.x].tile = TILE_FLOOR;
        // Check if item should be unidentified when picked up
        const itemDef = ITEM_DEFS_ALL.find((d: {id: string}) => d.id === pickup.itemId);
        const isUnidentifiedItem = itemDef && (itemDef as {category?: string}).category === 'unidentified';
        const newItems = [
          ...stateWithPickup.inventory.items,
          { itemId: pickup.itemId, quantity: 1, unidentified: isUnidentifiedItem ? true : false },
        ];
        stateWithPickup = {
          ...stateWithPickup,
          inventory: { ...stateWithPickup.inventory, items: newItems },
        };
      }
    } else if (pickup.type === 'weapon') {
      const maxCap = getInventoryCapacity(state.pilot.level);
      // 武器定義から category を確認
      const weaponDef = WEAPON_DEFS_ALL.find((d) => d.id === pickup.weaponId);
      const weaponCategory = weaponDef?.category ?? 'melee';

      if (weaponCategory === 'shield') {
        // 盾ピックアップ処理
        const currentShieldCount = stateWithPickup.player?.shieldSlots?.length ?? stateWithPickup.inventory.equippedShields.length;
        const maxShieldSlots = state.machine.shieldSlots ?? 1;
        if (currentShieldCount >= maxShieldSlots) {
          customPickupMsg = `盾枠がいっぱいで ${WEAPON_DEFS_ALL.find(d => d.id === pickup.weaponId)?.name ?? pickup.weaponId} を拾えなかった`;
        } else {
          state.map.cells[pickup.pos.y][pickup.pos.x].tile = TILE_FLOOR;
          const shieldDef = weaponDef;
          if (shieldDef) {
            const newShield: EquippedShield = {
              instanceId: `sh_${Date.now()}_${Math.floor(Math.random()*1e9)}`,
              shieldId: shieldDef.id,
              durability: shieldDef.durability ?? 30,
              maxDurability: shieldDef.durability ?? 30,
              def: shieldDef.def ?? 3,
              blockChance: shieldDef.blockChance ?? 0,
              name: shieldDef.name,
            };
            const prevPlayer = stateWithPickup.player;
            stateWithPickup = {
              ...stateWithPickup,
              inventory: {
                ...stateWithPickup.inventory,
                equippedShields: [...(stateWithPickup.inventory.equippedShields ?? []), newShield],
              },
              player: prevPlayer
                ? {
                    ...prevPlayer,
                    shieldSlots: [...(prevPlayer.shieldSlots ?? []), newShield],
                  }
                : prevPlayer,
            };
          }
        }
      } else if (weaponCategory === 'armor') {
        // アーマーピックアップ処理
        const currentArmorCount = stateWithPickup.player?.armorSlots?.length ?? stateWithPickup.inventory.equippedArmors.length;
        const maxArmorSlots = state.machine.armorSlots ?? 1;
        if (currentArmorCount >= maxArmorSlots) {
          customPickupMsg = `アーマー枠がいっぱいで ${WEAPON_DEFS_ALL.find(d => d.id === pickup.weaponId)?.name ?? pickup.weaponId} を拾えなかった`;
        } else {
          state.map.cells[pickup.pos.y][pickup.pos.x].tile = TILE_FLOOR;
          const armorDef = weaponDef;
          if (armorDef) {
            const newArmor: EquippedArmor = {
              instanceId: `ar_${Date.now()}_${Math.floor(Math.random()*1e9)}`,
              armorId: armorDef.id,
              durability: armorDef.durability ?? 40,
              maxDurability: armorDef.durability ?? 40,
              def: armorDef.def ?? 5,
              maxHpBonus: armorDef.maxHpBonus ?? 0,
              name: armorDef.name,
            };
            const prevPlayer = stateWithPickup.player;
            stateWithPickup = {
              ...stateWithPickup,
              inventory: {
                ...stateWithPickup.inventory,
                equippedArmors: [...(stateWithPickup.inventory.equippedArmors ?? []), newArmor],
              },
              player: prevPlayer
                ? {
                    ...prevPlayer,
                    armorSlots: [...(prevPlayer.armorSlots ?? []), newArmor],
                    // アーマーの maxHpBonus を反映
                    maxHp: (prevPlayer.maxHp ?? 0) + (armorDef.maxHpBonus ?? 0),
                  }
                : prevPlayer,
            };
          }
        }
      } else {
        // 通常武器ピックアップ処理
        const maxCap = state.machine.weaponSlots;
        if (stateWithPickup.inventory.equippedWeapons.length >= maxCap) {
          customPickupMsg = `武器スロットがいっぱいで ${WEAPON_DEFS_ALL.find(d => d.id === pickup.weaponId)?.name ?? pickup.weaponId} を拾えなかった`;
        } else {
          state.map.cells[pickup.pos.y][pickup.pos.x].tile = TILE_FLOOR;
          try {
            const wi = createWeaponInstance(pickup.weaponId);
            const newWeapon: EquippedWeapon = {
              instanceId: wi.instanceId,
              weaponId: wi.id,
              durability: wi.durability ?? 999,
              weaponLevel: 1,
              rarity: 'C',
            };
            // inventory.equippedWeapons（セーブ用）と
            // player.weaponSlots（表示用）の両方を同期して更新する
            const prevPlayer = stateWithPickup.player;
            stateWithPickup = {
              ...stateWithPickup,
              inventory: {
                ...stateWithPickup.inventory,
                equippedWeapons: [...stateWithPickup.inventory.equippedWeapons, newWeapon],
              },
              player: prevPlayer
                ? {
                    ...prevPlayer,
                    weaponSlots: [...(prevPlayer.weaponSlots ?? []), wi],
                  }
                : prevPlayer,
            };
          } catch {
            // 武器IDが weapons.json に存在しない場合は無視
          }
        }
      }
    } else if (pickup.type === 'shop') {
      // 同じショップに再訪しても在庫が変わらないよう、座標をキーに保持する
      const shopKey = `${pickup.pos.x},${pickup.pos.y}`;
      const existingInventories = state.exploration?.shopInventories ?? {};
      const shopInventory = existingInventories[shopKey] ?? getShopInventory(state.floor, Math.random);
      const shopInventories = existingInventories[shopKey]
        ? existingInventories
        : { ...existingInventories, [shopKey]: shopInventory };
      return {
        ...state,
        phase: 'shop',
        exploration: {
          ...state.exploration!,
          shopInventory,
          shopInventories,
        },
        player: playerAfterAction,
      };
    } else {
      state.map.cells[pickup.pos.y][pickup.pos.x].tile = TILE_FLOOR;
      stateWithPickup = {
        ...stateWithPickup,
        inventory: { ...stateWithPickup.inventory, gold: stateWithPickup.inventory.gold + pickup.amount },
      };
    }
  }

  // ─── ピックアップ後の playerAfterTrap へ weaponSlots/shieldSlots/armorSlots を同期 ───────────
  // stateWithPickup.player には盾・アーマー・武器ピックアップ後のスロット情報が入っているが、
  // playerAfterTrap は processPlayerAction の戻り値（ピックアップ前）のため、
  // 以降の processEnemyActions / finalPlayer に引き継がれなかった。
  if (stateWithPickup.player) {
    const sp = stateWithPickup.player;
    if (
      sp.weaponSlots !== playerAfterTrap.weaponSlots ||
      sp.shieldSlots !== playerAfterTrap.shieldSlots ||
      sp.armorSlots !== playerAfterTrap.armorSlots ||
      sp.equippedShield !== playerAfterTrap.equippedShield ||
      sp.equippedArmor !== playerAfterTrap.equippedArmor ||
      sp.maxHp !== playerAfterTrap.maxHp
    ) {
      playerAfterTrap = {
        ...playerAfterTrap,
        weaponSlots: sp.weaponSlots,
        shieldSlots: sp.shieldSlots,
        armorSlots: sp.armorSlots,
        equippedShield: sp.equippedShield,
        equippedArmor: sp.equippedArmor,
        maxHp: sp.maxHp,
      };
    }
  }

  // ─── 耐久度消費を inventory.equippedWeapons に同期 ──────────────────
  // playerAfterTrap.equippedWeapon の durability が変化した場合（攻撃時）、
  // stateWithPickup.inventory.equippedWeapons にも反映する。
  if (playerAfterTrap.equippedWeapon) {
    const ew = playerAfterTrap.equippedWeapon;
    // weaponSlots 内の装備中武器を更新済みインスタンスで上書き（耐久度表示を正確に）
    // instanceId が両方あればそれで一致判定、なければ id で判定（後方互換）
    const newWeaponSlots = (playerAfterTrap.weaponSlots ?? []).map((w) =>
      (ew.instanceId && w.instanceId)
        ? w.instanceId === ew.instanceId ? ew : w
        : w.id === ew.id ? ew : w,
    );
    playerAfterTrap = { ...playerAfterTrap, weaponSlots: newWeaponSlots };
    let _weaponMatchDone = false;
    const newEquippedWeapons = stateWithPickup.inventory.equippedWeapons.map((entry) => {
      const match = (ew.instanceId && entry.instanceId)
        ? entry.instanceId === ew.instanceId
        : (entry.weaponId === ew.id && !_weaponMatchDone);
      if (match && !(ew.instanceId && entry.instanceId)) _weaponMatchDone = true;
      return match ? { ...entry, durability: ew.durability ?? entry.durability } : entry;
    });
    stateWithPickup = {
      ...stateWithPickup,
      inventory: { ...stateWithPickup.inventory, equippedWeapons: newEquippedWeapons },
    };
  } else if (playerAfterTrap.equippedWeapon === null) {
    // 武器が壊れて null になった場合: weaponSlots から除去し equippedWeapons も同期
    const prevEquippedId = stateForAction.player?.equippedWeapon?.id;
    if (prevEquippedId) {
      const prevEquippedInstanceId = stateForAction.player?.equippedWeapon?.instanceId;
      const newWeaponSlots = (playerAfterTrap.weaponSlots ?? []).filter((w) =>
        prevEquippedInstanceId && w.instanceId
          ? w.instanceId !== prevEquippedInstanceId
          : w.id !== prevEquippedId,
      );
      const newEquippedWeapons = stateWithPickup.inventory.equippedWeapons.filter((entry) =>
        prevEquippedInstanceId && entry.instanceId
          ? entry.instanceId !== prevEquippedInstanceId
          : entry.weaponId !== prevEquippedId,
      );
      playerAfterTrap = { ...playerAfterTrap, weaponSlots: newWeaponSlots };
      stateWithPickup = {
        ...stateWithPickup,
        inventory: { ...stateWithPickup.inventory, equippedWeapons: newEquippedWeapons },
      };
    }
  }

  // ─── 設置済み爆弾カウントダウン & 爆発処理 ────────────────────────────
  let bombsState = stateWithPickup;
  let currentBombs = bombsState.placedBombs ?? [];
  if (currentBombs.length > 0) {
    const explosions: import('./game-state').PlacedBomb[] = [];
    const remainingBombs: import('./game-state').PlacedBomb[] = [];
    for (const bomb of currentBombs) {
      const updated = { ...bomb, turnsLeft: bomb.turnsLeft - 1 };
      if (updated.turnsLeft <= 0) {
        explosions.push(bomb);
      } else {
        remainingBombs.push(updated);
      }
    }
    // 爆発処理
    let bombPlayer = playerAfterTrap;
    let bombEnemies = enemiesAfterTrap;
    for (const bomb of explosions) {
      // 爆発範囲のタイル計算
      const blastTiles: Position[] = [];
      if (bomb.radius === 0) {
        blastTiles.push(bomb.pos);
      } else {
        const range = bomb.radius === 1 ? 1 : bomb.radius === 2 ? 1 : 2;
        const useOrthOnly = bomb.radius === 1;
        for (let dy = -range; dy <= range; dy++) {
          for (let dx = -range; dx <= range; dx++) {
            if (useOrthOnly && dx !== 0 && dy !== 0) continue;
            blastTiles.push({ x: bomb.pos.x + dx, y: bomb.pos.y + dy });
          }
        }
      }
      // 敵にダメージ
      bombEnemies = bombEnemies.map((e) => {
        if (blastTiles.some((t) => t.x === e.pos.x && t.y === e.pos.y)) {
          const dmg = Math.max(1, bomb.damage - (e.def ?? 0));
          return { ...e, hp: e.hp - dmg };
        }
        return e;
      });
      // プレイヤーにダメージ
      if (blastTiles.some((t) => t.x === bombPlayer.pos.x && t.y === bombPlayer.pos.y)) {
        const playerDmg = Math.max(1, Math.floor(bomb.damage * 0.5) - (bombPlayer.def ?? 0));
        bombPlayer = { ...bombPlayer, hp: bombPlayer.hp - playerDmg, hpEverDroppedBelowMax: true };
        newBattleLog.push(`爆弾が爆発！ プレイヤーに${playerDmg}ダメージ！`);
      }
      newBattleLog.push(`爆弾が爆発した！（ダメージ${bomb.damage}）`);
    }
    // 爆弾で倒した敵を除去
    const bombDeadEnemies = bombEnemies.filter((e) => e.hp <= 0);
    bombEnemies = bombEnemies.filter((e) => e.hp > 0);
    for (const dead of bombDeadEnemies) {
      newBattleLog.push(`${dead.name ?? dead.enemyType}を爆弾で倒した！`);
    }
    playerAfterTrap = bombPlayer;
    enemiesAfterTrap = bombEnemies;
    bombsState = { ...bombsState, placedBombs: remainingBombs };
  } else {
    bombsState = { ...bombsState, placedBombs: [] };
  }
  stateWithPickup = bombsState;

  // ─── 修理ナノボット HoT 処理 ──────────────────────────────────────────
  if (playerAfterTrap.healTurnsLeft && playerAfterTrap.healTurnsLeft > 0) {
    const healAmt = playerAfterTrap.healPerTurn ?? 0;
    const newHp = Math.min(playerAfterTrap.maxHp, playerAfterTrap.hp + healAmt);
    const actualHeal = newHp - playerAfterTrap.hp;
    const newTurnsLeft = playerAfterTrap.healTurnsLeft - 1;
    playerAfterTrap = {
      ...playerAfterTrap,
      hp: newHp,
      healTurnsLeft: newTurnsLeft,
      healPerTurn: newTurnsLeft > 0 ? playerAfterTrap.healPerTurn : 0,
    };
    if (actualHeal > 0) {
      newBattleLog.push(`ナノボット修復: +${actualHeal}HP（残${newTurnsLeft}ターン）`);
    }
  }

  // ─── フロア遷移 ────────────────────────────────────────────────────────
  if (finalShouldTransitionFloor) {
    const transitionFields = transitionToNextFloor({
      ...stateWithPickup,
      player: playerAfterTrap,
      enemies: enemiesAfterTrap,
    });
    return {
      ...stateWithPickup,
      ...transitionFields,
      placedBombs: [],
      phase: 'exploring',
    };
  }

  // ─── フェーズ2: 敵行動 ─────────────────────────────────────────────────
  const {
    player: playerAfterEnemies,
    enemies: enemiesAfterEnemies,
    enemyEventMessages,
  } = processEnemyActions(
    { ...stateWithPickup, enemies: enemiesAfterTrap },
    playerAfterTrap,
    enemiesAfterTrap,
  );

  // 敵VS敵イベントメッセージを battleLog に追記
  if (enemyEventMessages.length > 0) {
    stateWithPickup = {
      ...stateWithPickup,
      battleLog: [...(stateWithPickup.battleLog ?? []), ...enemyEventMessages].slice(-50),
    };
  }

  // ─── フェーズ3: ターン後処理 ──────────────────────────────────────────
  const {
    enemies: survivingEnemies,
    pilot: updatedPilot,
    player: playerAfterLevelUp,
    machine: machineAfterLevelUp,
    battleLog: updatedBattleLog,
    inventory: updatedInventory,
    enemiesDefeatedCount,
    goldEarnedCount,
    bossDefeatedIds,
  } = processDefeatedEnemies(
    { ...stateWithPickup, player: playerAfterEnemies },
    enemiesAfterEnemies,
  );

  // ボス撃破記録を更新
  const updatedBossesDefeated =
    bossDefeatedIds.length > 0
      ? [...new Set([...(stateWithPickup.bossesDefeated ?? []), ...bossDefeatedIds])]
      : (stateWithPickup.bossesDefeated ?? []);

  // レベルアップ後の実プレイヤー（playerAfterLevelUp が null なら playerAfterEnemies を使う）
  const finalPlayer = playerAfterLevelUp ?? playerAfterEnemies;

  // 実績チェック: bossesDefeated 更新後の仮ステートで判定する
  const stateForAchievements: typeof stateWithPickup = {
    ...stateWithPickup,
    player: finalPlayer,
    inventory: updatedInventory,
    bossesDefeated: updatedBossesDefeated,
    achievements: stateWithPickup.achievements ?? [],
  };
  const newlyUnlocked = checkAchievements(stateForAchievements);
  const updatedAchievements =
    newlyUnlocked.length > 0
      ? [...(stateWithPickup.achievements ?? []), ...newlyUnlocked]
      : (stateWithPickup.achievements ?? []);

  // ゲームオーバー（マシンHP 0）判定: GameCanvas 側で gameover を検知して applyStartReturn を実行させる
  if (finalPlayer.hp <= 0) {
    return {
      ...stateWithPickup,
      pilot: updatedPilot,
      inventory: updatedInventory,
      machine: { ...machineAfterLevelUp, hp: 0 },
      player: finalPlayer,
      enemies: survivingEnemies,
      battleLog: updatedBattleLog,
      bossesDefeated: updatedBossesDefeated,
      achievements: updatedAchievements,
      phase: 'gameover',
    };
  }

  // プレイヤー移動後の視界を更新
  const updatedMap = updateVisibility(stateWithPickup.map!, finalPlayer.pos, VIEW_RADIUS);

  // exploration の同期更新（playerPos・turn）
  const prevExploration = stateWithPickup.exploration!;
  const newExploration = {
    ...prevExploration,
    currentFloor: updatedMap,
    playerPos: finalPlayer.pos,
    turn: prevExploration.turn + 1,
  };

  // machine.hp を player.hp と同期する（レベルアップ済みのマシン状態を基準にする）
  const newMachine = {
    ...machineAfterLevelUp,
    hp: finalPlayer.hp,
  };

  // ピックアップのログをバトルログに追記
  let finalBattleLog = updatedBattleLog;
  if (customPickupMsg !== null) {
    finalBattleLog = [...finalBattleLog, customPickupMsg];
  } else if (pickup !== null) {
    let pickupMsg: string;
    if (pickup.type === 'item') {
      pickupMsg = `📦 ${getItemDisplayName(pickup.itemId)} を拾った`;
    } else if (pickup.type === 'weapon') {
      const pdDef = WEAPON_DEFS_ALL.find((d) => d.id === pickup.weaponId);
      const pdCat = pdDef?.category ?? 'melee';
      const pdName = pdDef?.name ?? pickup.weaponId;
      if (pdCat === 'shield') {
        pickupMsg = `🛡 ${pdName} を拾った`;
      } else if (pdCat === 'armor') {
        pickupMsg = `🛡 ${pdName} を拾った（アーマー）`;
      } else {
        pickupMsg = `⚔ ${pdName} を拾った`;
      }
    } else {
      pickupMsg = `💰 ${pickup.amount}G を拾った`;
    }
    finalBattleLog = [...finalBattleLog, pickupMsg];
  }

  return {
    ...stateWithPickup,
    phase: stateWithPickup.phase,
    pilot: updatedPilot,
    machine: newMachine,
    inventory: updatedInventory,
    exploration: newExploration,
    map: updatedMap,
    player: finalPlayer,
    enemies: survivingEnemies,
    battleLog: finalBattleLog,
    bossesDefeated: updatedBossesDefeated,
    achievements: updatedAchievements,
  };
}
