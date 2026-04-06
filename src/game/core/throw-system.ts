/**
 * @fileoverview アイテム・装備投げるシステム
 *
 * プレイヤーがアイテムや装備を投げる際の軌道計算・命中判定・効果適用を担う。
 */

import type { GameState, Enemy, Direction, StatusEffect, WeaponInstance, EquippedShield, EquippedArmor } from './game-state';
import type { Position, Cell } from './types';
import {
  TILE_WALL,
  TILE_CRACKED_WALL,
  TILE_FLOOR,
  TILE_ITEM,
  TILE_WEAPON,
  TILE_TRAP,
  TILE_SHOP,
  TILE_LAVA,
  TILE_HINT,
  TILE_FIRE,
} from './constants';
import itemsRaw from '../assets/data/items.json';
import { applyBlastToTraps } from './turn-system';

const ALL_ITEMS = itemsRaw as any[];

// アイテム定義取得
function getItemDef(itemId: string): any {
  return ALL_ITEMS.find(d => d.id === itemId) ?? null;
}

// ---------------------------------------------------------------------------
// アイテムグレードダウンマッピング
// ---------------------------------------------------------------------------
const ITEM_DEGRADE_MAP: Record<string, string | null> = {
  'repair_kit_large': 'repair_kit_medium',
  'repair_kit_medium': 'repair_kit_small',
  'repair_kit_small': null,
  'full_repair_kit': 'repair_kit_large',
  'nanobot_l': 'nanobot_m',
  'nanobot_m': 'nanobot_s',
  'nanobot_s': null,
  'upgrade_core_iii': 'upgrade_core_ii',
  'upgrade_core_ii': 'upgrade_core_i',
  'upgrade_core_i': null,
  'armor_plate_iii': 'armor_plate_ii',
  'armor_plate_ii': 'armor_plate_i',
  'armor_plate_i': null,
  'nanobot_repair_l': 'nanobot_repair_m',
  'nanobot_repair_m': 'nanobot_repair_s',
  'nanobot_repair_s': null,
  'boost_engine_ii': 'boost_engine_i',
  'boost_engine_i': null,
};

// ---------------------------------------------------------------------------
// 軌道計算
// ---------------------------------------------------------------------------

/** 投げの軌道計算結果 */
export interface ThrowTrajectory {
  /** アイテムが着地するマス */
  landPos: Position;
  /** 命中した敵（なければ null） */
  hitEnemy: Enemy | null;
  /** 飛行中に通過したタイル座標リスト（発射元を除く、着地点を含む） */
  path: Position[];
}

/** 方向デルタ */
const DIR_DELTA: Record<Direction, { dx: number; dy: number }> = {
  up:    { dx: 0, dy: -1 },
  down:  { dx: 0, dy:  1 },
  left:  { dx: -1, dy: 0 },
  right: { dx:  1, dy: 0 },
};

/** 射程: 6〜12マスをランダムに決定 */
const THROW_RANGE_MIN = 6;
const THROW_RANGE_MAX = 12;
const HIT_CHANCE_MIN = 0.80;
const HIT_CHANCE_MAX = 0.90;

/**
 * 投げアイテムの軌道を計算する。
 * 射程7〜8マス（ランダム）、壁の1マス手前に落ちる、敵に80-90%で命中する。
 * path に飛行中の通過タイル一覧を含めて返す（軌道アニメーション用）。
 */
function calcThrowTrajectory(
  fromPos: Position,
  direction: Direction,
  cells: Cell[][],
  enemies: Enemy[],
): ThrowTrajectory {
  const { dx, dy } = DIR_DELTA[direction];
  const mapHeight = cells.length;
  const mapWidth = cells[0]?.length ?? 0;
  const throwRange = THROW_RANGE_MIN + Math.floor(Math.random() * (THROW_RANGE_MAX - THROW_RANGE_MIN + 1));

  let landPos: Position = fromPos; // 壁の場合は発射元の足元に落ちる
  const path: Position[] = [];

  for (let i = 1; i <= throwRange; i++) {
    const pos: Position = { x: fromPos.x + dx * i, y: fromPos.y + dy * i };

    // マップ外
    if (pos.y < 0 || pos.y >= mapHeight || pos.x < 0 || pos.x >= mapWidth) {
      break;
    }

    const cell = cells[pos.y]?.[pos.x];
    if (!cell) break;

    // 壁 → 手前（前回の landPos）に着地
    if (cell.tile === TILE_WALL || cell.tile === TILE_CRACKED_WALL) {
      break;
    }

    path.push(pos);
    landPos = pos;

    // 敵の命中判定（空中では罠は無視）
    const enemy = enemies.find(e => e.pos.x === pos.x && e.pos.y === pos.y && e.hp > 0);
    if (enemy) {
      const hitChance = HIT_CHANCE_MIN + Math.random() * (HIT_CHANCE_MAX - HIT_CHANCE_MIN);
      if (Math.random() < hitChance) {
        return { landPos: pos, hitEnemy: enemy, path };
      }
      // 外れ: 敵を通り抜けて続行
    }
  }

  return { landPos, hitEnemy: null, path };
}

// ---------------------------------------------------------------------------
// フロアへのアイテム設置ヘルパー
// ---------------------------------------------------------------------------

/** 着地・武器配置可能タイルか判定（isPlaceable と同一ロジック） */
function canPlaceItemOnCell(cell: Cell): boolean {
  return !IMPLACEABLE_TILES.has(cell.tile as any);
}

/**
 * 着地点から最も近い設置可能タイルを Chebyshev 距離で探す。
 * maxRadius まで探して見つからなければ null を返す。
 */
function findNearestPlaceablePos(cells: Cell[][], fromPos: Position, maxRadius: number = 4): Position | null {
  const mapHeight = cells.length;
  const mapWidth = cells[0]?.length ?? 0;

  for (let r = 0; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = fromPos.x + dx;
        const ny = fromPos.y + dy;
        if (ny < 0 || ny >= mapHeight || nx < 0 || nx >= mapWidth) continue;
        const cell = cells[ny]?.[nx];
        if (cell && canPlaceItemOnCell(cell)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

/** アイテムをフロアに落とす。設置不可なら周囲を探し、見つからなければ消滅ログを出す。 */
function dropItemOnFloor(
  state: GameState,
  itemId: string,
  pos: Position,
  alwaysDrop: boolean = false,
  logs?: string[],
  itemName?: string,
): GameState {
  if (!state.map) return state;
  if (!alwaysDrop && Math.random() >= 0.5) return state; // 50%で消える

  const cells = state.map.cells.map(row => [...row]) as Cell[][];
  const placePos = findNearestPlaceablePos(cells, pos);

  if (!placePos) {
    if (logs && itemName) logs.push(`${itemName} は消えた`);
    return state;
  }

  const cell = cells[placePos.y][placePos.x];
  cells[placePos.y][placePos.x] = { ...cell, tile: TILE_ITEM, itemId };
  return { ...state, map: { ...state.map, cells } };
}

// ---------------------------------------------------------------------------
// 公開 API: アイテムを投げる
// ---------------------------------------------------------------------------

export interface ThrowResult {
  nextState: GameState;
  logs: string[];
  /** 軌道アニメーション用の通過タイル一覧 */
  path: Position[];
  /** 着地点（エリアエフェクト用） */
  landPos?: Position;
  /** 投げたアイテムのeffect文字列 */
  thrownEffect?: string;
  /** 投げたアイテムの有効半径 */
  thrownRadius?: number;
}

/**
 * アイテムポーチのアイテムを投げる。
 * @param state - 現在のゲーム状態
 * @param itemIndex - inventory.items のインデックス
 * @param direction - 投げる方向
 */
export function throwInventoryItem(
  state: GameState,
  itemIndex: number,
  direction: Direction,
): ThrowResult {
  const item = state.inventory.items[itemIndex];
  if (!item || !state.player || !state.map) {
    return { nextState: state, logs: ['投げるアイテムがない'], path: [] };
  }

  const def = getItemDef(item.itemId);
  if (!def) return { nextState: state, logs: ['不明なアイテム'], path: [] };

  const itemName: string = def.name ?? item.itemId;
  const logs: string[] = [];

  // インベントリからアイテムを消費（quantity > 1 は1個減らす）
  let nextState: GameState;
  if (item.quantity > 1) {
    const newItems = state.inventory.items.map((it, i) =>
      i === itemIndex ? { ...it, quantity: it.quantity - 1 } : it
    );
    nextState = { ...state, inventory: { ...state.inventory, items: newItems } };
  } else {
    const newItems = state.inventory.items.filter((_, i) => i !== itemIndex);
    nextState = { ...state, inventory: { ...state.inventory, items: newItems } };
  }

  // 軌道計算
  const { landPos, hitEnemy, path } = calcThrowTrajectory(
    state.player.pos,
    direction,
    state.map.cells as Cell[][],
    state.enemies,
  );

  logs.push(`${itemName} を${directionLabel(direction)}に投げた！`);

  if (hitEnemy) {
    logs.push(`${hitEnemy.name ?? hitEnemy.enemyType} に命中！`);
    nextState = applyItemEffectOnEnemy(nextState, def, item.itemId, hitEnemy, landPos, logs);
  } else {
    logs.push(`${itemName} は着地した`);
    // 着地時の効果（爆弾・フラッシュは着地でも発動）
    nextState = applyItemEffectOnLand(nextState, def, item.itemId, landPos, logs);
  }

  return {
    nextState,
    logs,
    path,
    landPos,
    thrownEffect: def?.effect,
    thrownRadius: def?.bombRadius ?? def?.radius ?? def?.flashRadius ?? def?.smokeRadius,
  };
}

/**
 * 武器スロットの武器を投げる。
 * @param state - 現在のゲーム状態
 * @param weaponIndex - player.weaponSlots のインデックス
 * @param direction - 投げる方向
 */
export function throwWeapon(
  state: GameState,
  weaponIndex: number,
  direction: Direction,
): ThrowResult {
  const weapon = state.player?.weaponSlots?.[weaponIndex];
  if (!weapon || !state.player || !state.map) {
    return { nextState: state, logs: ['投げる武器がない'], path: [] };
  }

  const logs: string[] = [];
  logs.push(`${weapon.name} を${directionLabel(direction)}に投げた！`);

  // 武器をスロットから除去（装備中なら装備解除）
  let nextState = removeWeaponFromSlot(state, weaponIndex);

  // 軌道計算
  const { landPos, hitEnemy, path } = calcThrowTrajectory(
    state.player.pos,
    direction,
    state.map.cells as Cell[][],
    state.enemies,
  );

  if (hitEnemy) {
    // 命中: ATKダメージ
    const dmg = Math.max(1, weapon.atk - (hitEnemy.def ?? 0));
    logs.push(`${hitEnemy.name ?? hitEnemy.enemyType} に${dmg}ダメージ！`);
    nextState = dealDamageToEnemy(nextState, hitEnemy.id, dmg);
    // 耐久度半減して足元に落とす
    const degradedWeapon: WeaponInstance = {
      ...weapon,
      durability: weapon.durability !== null ? Math.max(1, Math.floor(weapon.durability / 2)) : null,
    };
    const beforePlace = nextState;
    nextState = placeWeaponOnFloor(nextState, degradedWeapon, landPos, logs, weapon.name);
    if (nextState !== beforePlace) logs.push(`${weapon.name} は足元に落ちた（耐久度半減）`);
  } else {
    // 着地
    const degradedWeapon: WeaponInstance = {
      ...weapon,
      durability: weapon.durability !== null ? Math.max(1, Math.floor(weapon.durability / 2)) : null,
    };
    const beforePlace = nextState;
    nextState = placeWeaponOnFloor(nextState, degradedWeapon, landPos, logs, weapon.name);
    if (nextState !== beforePlace) logs.push(`${weapon.name} は着地した`);
  }

  return { nextState, logs, path };
}

/**
 * 盾スロットの盾を投げる。
 */
export function throwShield(
  state: GameState,
  shieldIndex: number,
  direction: Direction,
): ThrowResult {
  const shield = state.player?.shieldSlots?.[shieldIndex];
  if (!shield || !state.player || !state.map) {
    return { nextState: state, logs: ['投げる盾がない'], path: [] };
  }

  const logs: string[] = [];
  logs.push(`${shield.name} を${directionLabel(direction)}に投げた！`);

  // スロットから除去
  let nextState = removeShieldFromSlot(state, shieldIndex);

  // 軌道計算
  const { landPos, hitEnemy, path } = calcThrowTrajectory(
    state.player.pos,
    direction,
    state.map.cells as Cell[][],
    state.enemies,
  );

  // 盾の防御値をダメージに使用
  const baseDmg = Math.max(1, shield.def ?? 2);
  if (hitEnemy) {
    const dmg = Math.max(1, baseDmg - (hitEnemy.def ?? 0));
    logs.push(`${hitEnemy.name ?? hitEnemy.enemyType} に${dmg}ダメージ！`);
    nextState = dealDamageToEnemy(nextState, hitEnemy.id, dmg);
  }
  const beforeShield = nextState;
  nextState = dropShieldOnFloor(nextState, shield, landPos, logs, shield.name);
  if (nextState !== beforeShield) logs.push(`${shield.name} は落ちた`);

  return { nextState, logs, path };
}

/**
 * アーマースロットのアーマーを投げる。
 */
export function throwArmor(
  state: GameState,
  armorIndex: number,
  direction: Direction,
): ThrowResult {
  const armor = state.player?.armorSlots?.[armorIndex];
  if (!armor || !state.player || !state.map) {
    return { nextState: state, logs: ['投げるアーマーがない'], path: [] };
  }

  const logs: string[] = [];
  logs.push(`${armor.name} を${directionLabel(direction)}に投げた！`);

  // スロットから除去
  let nextState = removeArmorFromSlot(state, armorIndex);

  // 軌道計算
  const { landPos, hitEnemy, path } = calcThrowTrajectory(
    state.player.pos,
    direction,
    state.map.cells as Cell[][],
    state.enemies,
  );

  const baseDmg = Math.max(1, armor.def ?? 2);
  if (hitEnemy) {
    const dmg = Math.max(1, baseDmg - (hitEnemy.def ?? 0));
    logs.push(`${hitEnemy.name ?? hitEnemy.enemyType} に${dmg}ダメージ！`);
    nextState = dealDamageToEnemy(nextState, hitEnemy.id, dmg);
  }
  const beforeArmor = nextState;
  nextState = dropArmorOnFloor(nextState, armor, landPos, logs, armor.name);
  if (nextState !== beforeArmor) logs.push(`${armor.name} は落ちた`);

  return { nextState, logs, path };
}

// ---------------------------------------------------------------------------
// 公開 API: アイテムを置く
// ---------------------------------------------------------------------------

/**
 * アイテムポーチのアイテムをプレイヤーの現在地に置く。
 * 時限爆弾系は "使う" と同じ動作をする（呼び出し元で判断すること）。
 *
 * @returns { nextState, log, blocked } blocked=true の場合は置けない
 */
export function placeInventoryItem(
  state: GameState,
  itemIndex: number,
): { nextState: GameState; log: string; blocked: boolean } {
  const item = state.inventory.items[itemIndex];
  if (!item || !state.player || !state.map) {
    return { nextState: state, log: '置けない', blocked: true };
  }

  const pos = state.player.pos;
  const cell = (state.map.cells as Cell[][])[pos.y]?.[pos.x];
  if (!cell) return { nextState: state, log: '置けない', blocked: true };

  // 設置不可チェック
  if (!isPlaceable(cell)) {
    return { nextState: state, log: 'ここには置けない', blocked: true };
  }

  const def = getItemDef(item.itemId);
  const itemName: string = def?.name ?? item.itemId;

  // インベントリからアイテム除去
  let newItems: typeof state.inventory.items;
  if (item.quantity > 1) {
    newItems = state.inventory.items.map((it, i) =>
      i === itemIndex ? { ...it, quantity: it.quantity - 1 } : it
    );
  } else {
    newItems = state.inventory.items.filter((_, i) => i !== itemIndex);
  }

  // 炎マスに置く場合の特殊処理
  if (cell.tile === TILE_FIRE) {
    const effect: string = def?.effect ?? '';
    let nextState: GameState = { ...state, inventory: { ...state.inventory, items: newItems } };

    if (FIRE_TRIGGER_EFFECTS.has(effect)) {
      // 爆弾系・グレネード系: 即効果発動
      const logs: string[] = [`${itemName} が炎に触れて即発動！`];
      nextState = applyItemEffectOnLand(nextState, def, item.itemId, pos, logs);
      return { nextState, log: logs.join(' '), blocked: false };
    } else {
      // その他: 高確率で焼失、低確率で隣の非炎マスへ落ちる
      if (Math.random() < 0.8) {
        return { nextState, log: `${itemName} は炎で焼失した！`, blocked: false };
      } else {
        const cells = (state.map.cells as Cell[][]).map(row => [...row]) as Cell[][];
        const nearbyPos = findNearestNonFirePlaceablePos(cells, pos);
        if (nearbyPos) {
          cells[nearbyPos.y][nearbyPos.x] = { ...cells[nearbyPos.y][nearbyPos.x], tile: TILE_ITEM, itemId: item.itemId };
          nextState = { ...nextState, map: { ...state.map, cells } };
          return { nextState, log: `${itemName} は炎で弾かれ、隣のマスに落ちた`, blocked: false };
        }
        return { nextState, log: `${itemName} は炎で焼失した！`, blocked: false };
      }
    }
  }

  // マップにアイテム設置（通常）
  const cells = (state.map.cells as Cell[][]).map(row => [...row]) as Cell[][];
  cells[pos.y][pos.x] = { ...cell, tile: TILE_ITEM, itemId: item.itemId };

  const nextState: GameState = {
    ...state,
    inventory: { ...state.inventory, items: newItems },
    map: { ...state.map, cells },
  };

  return { nextState, log: `${itemName} を足元に置いた`, blocked: false };
}

/**
 * 武器スロットの武器をプレイヤーの現在地に置く。
 */
export function placeWeaponItem(
  state: GameState,
  weaponIndex: number,
): { nextState: GameState; log: string; blocked: boolean } {
  const weapon = state.player?.weaponSlots?.[weaponIndex];
  if (!weapon || !state.player || !state.map) {
    return { nextState: state, log: '置けない', blocked: true };
  }

  const pos = state.player.pos;
  const cell = (state.map.cells as Cell[][])[pos.y]?.[pos.x];
  if (!cell || !isPlaceable(cell)) {
    return { nextState: state, log: 'ここには置けない', blocked: true };
  }

  // 武器をスロットから除去
  const nextState = placeWeaponOnFloor(removeWeaponFromSlot(state, weaponIndex), weapon, pos);
  return { nextState, log: `${weapon.name} を足元に置いた`, blocked: false };
}

/**
 * 盾スロットの盾をプレイヤーの現在地に置く。
 */
export function placeShieldItem(
  state: GameState,
  shieldIndex: number,
): { nextState: GameState; log: string; blocked: boolean } {
  const shield = state.player?.shieldSlots?.[shieldIndex];
  if (!shield || !state.player || !state.map) {
    return { nextState: state, log: '置けない', blocked: true };
  }

  const pos = state.player.pos;
  const cell = (state.map.cells as Cell[][])[pos.y]?.[pos.x];
  if (!cell || !isPlaceable(cell)) {
    return { nextState: state, log: 'ここには置けない', blocked: true };
  }

  const nextState = dropShieldOnFloor(removeShieldFromSlot(state, shieldIndex), shield, pos);
  return { nextState, log: `${shield.name} を足元に置いた`, blocked: false };
}

/**
 * アーマースロットのアーマーをプレイヤーの現在地に置く。
 */
export function placeArmorItem(
  state: GameState,
  armorIndex: number,
): { nextState: GameState; log: string; blocked: boolean } {
  const armor = state.player?.armorSlots?.[armorIndex];
  if (!armor || !state.player || !state.map) {
    return { nextState: state, log: '置けない', blocked: true };
  }

  const pos = state.player.pos;
  const cell = (state.map.cells as Cell[][])[pos.y]?.[pos.x];
  if (!cell || !isPlaceable(cell)) {
    return { nextState: state, log: 'ここには置けない', blocked: true };
  }

  const nextState = dropArmorOnFloor(removeArmorFromSlot(state, armorIndex), armor, pos);
  return { nextState, log: `${armor.name} を足元に置いた`, blocked: false };
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

function directionLabel(dir: Direction): string {
  switch (dir) {
    case 'up': return '上';
    case 'down': return '下';
    case 'left': return '左';
    case 'right': return '右';
  }
}

/** 設置不可タイルセット（アイテム・武器・罠・ショップ・溶岩・石碑・壁） */
const IMPLACEABLE_TILES = new Set([
  TILE_WALL, TILE_CRACKED_WALL,
  TILE_ITEM, TILE_WEAPON,
  TILE_TRAP, TILE_SHOP, TILE_LAVA, TILE_HINT,
]);

/** 置く/着地可能タイルか判定（上記以外の通行可能タイルは全て可） */
function isPlaceable(cell: Cell): boolean {
  return !IMPLACEABLE_TILES.has(cell.tile as any);
}

/** 炎マスで即発動するアイテムエフェクト */
const FIRE_TRIGGER_EFFECTS = new Set([
  'place_bomb', 'throw_bomb', 'ice_bomb', 'stun_area', 'flash_grenade', 'stun_radius_2',
]);

/**
 * 炎マス以外の最も近い設置可能タイルを探す（設置元を除く）。
 * 炎に触れたアイテムが隣のマスへ落ちる際に使用。
 */
function findNearestNonFirePlaceablePos(cells: Cell[][], fromPos: Position, maxRadius: number = 4): Position | null {
  const mapHeight = cells.length;
  const mapWidth = cells[0]?.length ?? 0;
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = fromPos.x + dx;
        const ny = fromPos.y + dy;
        if (ny < 0 || ny >= mapHeight || nx < 0 || nx >= mapWidth) continue;
        const cell = cells[ny]?.[nx];
        if (cell && canPlaceItemOnCell(cell) && cell.tile !== TILE_FIRE) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

/** 敵にダメージを与えて新しい state を返す */
function dealDamageToEnemy(state: GameState, enemyId: number, damage: number): GameState {
  const newEnemies = state.enemies.map(e =>
    e.id === enemyId ? { ...e, hp: e.hp - damage } : e
  );
  return { ...state, enemies: newEnemies };
}

/** 敵に状態異常を付与する */
function applyStatusToEnemy(state: GameState, enemyId: number, effect: StatusEffect): GameState {
  const newEnemies = state.enemies.map(e => {
    if (e.id !== enemyId) return e;
    const existing = e.statusEffects ?? [];
    const withoutSame = existing.filter(s => s.type !== effect.type);
    return { ...e, statusEffects: [...withoutSame, effect] };
  });
  return { ...state, enemies: newEnemies };
}

/** 3×3範囲の全敵に状態異常を付与する */
function applyStatusInArea(
  state: GameState,
  center: Position,
  effect: StatusEffect,
): { nextState: GameState; count: number; trapLogs: string[] } {
  let count = 0;
  const blastTiles: Position[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      blastTiles.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  const newEnemies = state.enemies.map(e => {
    const dx = Math.abs(e.pos.x - center.x);
    const dy = Math.abs(e.pos.y - center.y);
    if (dx <= 1 && dy <= 1) {
      count++;
      const existing = e.statusEffects ?? [];
      const withoutSame = existing.filter(s => s.type !== effect.type);
      return { ...e, statusEffects: [...withoutSame, effect] };
    }
    return e;
  });
  const trapLogs: string[] = [];
  const newTraps = applyBlastToTraps(state.traps, blastTiles, trapLogs);
  return { nextState: { ...state, enemies: newEnemies, traps: newTraps }, count, trapLogs };
}

/** 武器をフロアに置く。設置不可なら周囲を探し、見つからなければ消滅ログを出す。 */
function placeWeaponOnFloor(
  state: GameState,
  weapon: WeaponInstance,
  pos: Position,
  logs?: string[],
  name?: string,
): GameState {
  if (!state.map) return state;
  const cells = state.map.cells.map(row => [...row]) as Cell[][];
  const placePos = findNearestPlaceablePos(cells, pos);
  if (!placePos) {
    if (logs && name) logs.push(`${name} は消えた`);
    return state;
  }
  const cell = cells[placePos.y][placePos.x];
  cells[placePos.y][placePos.x] = { ...cell, tile: TILE_WEAPON, weaponId: weapon.id };
  return { ...state, map: { ...state.map, cells } };
}

/** 盾をフロアに置く（TILE_WEAPON タイルとして id = shieldId）。設置不可なら周囲を探す。 */
function dropShieldOnFloor(
  state: GameState,
  shield: EquippedShield,
  pos: Position,
  logs?: string[],
  name?: string,
): GameState {
  if (!state.map) return state;
  const cells = state.map.cells.map(row => [...row]) as Cell[][];
  const placePos = findNearestPlaceablePos(cells, pos);
  if (!placePos) {
    if (logs && name) logs.push(`${name} は消えた`);
    return state;
  }
  const cell = cells[placePos.y][placePos.x];
  cells[placePos.y][placePos.x] = { ...cell, tile: TILE_WEAPON, weaponId: shield.shieldId };
  return { ...state, map: { ...state.map, cells } };
}

/** アーマーをフロアに置く。設置不可なら周囲を探し、見つからなければ消滅ログを出す。 */
function dropArmorOnFloor(
  state: GameState,
  armor: EquippedArmor,
  pos: Position,
  logs?: string[],
  name?: string,
): GameState {
  if (!state.map) return state;
  const cells = state.map.cells.map(row => [...row]) as Cell[][];
  const placePos = findNearestPlaceablePos(cells, pos);
  if (!placePos) {
    if (logs && name) logs.push(`${name} は消えた`);
    return state;
  }
  const cell = cells[placePos.y][placePos.x];
  cells[placePos.y][placePos.x] = { ...cell, tile: TILE_WEAPON, weaponId: armor.armorId };
  return { ...state, map: { ...state.map, cells } };
}

/** 武器スロットから武器を除去し、装備中なら解除する */
function removeWeaponFromSlot(state: GameState, weaponIndex: number): GameState {
  if (!state.player) return state;
  const weapon = state.player.weaponSlots?.[weaponIndex];
  if (!weapon) return state;

  const newWeaponSlots = (state.player.weaponSlots ?? []).filter((_, i) => i !== weaponIndex);
  const isEquipped = state.player.equippedWeapon?.instanceId
    ? state.player.equippedWeapon.instanceId === weapon.instanceId
    : state.player.equippedWeapon?.id === weapon.id;

  const newPlayer = {
    ...state.player,
    weaponSlots: newWeaponSlots,
    ...(isEquipped ? { equippedWeapon: null } : {}),
  };

  const newEquippedWeapons = state.inventory.equippedWeapons.filter(ew =>
    weapon.instanceId ? ew.instanceId !== weapon.instanceId : ew.weaponId !== weapon.id
  );

  return {
    ...state,
    player: newPlayer,
    inventory: { ...state.inventory, equippedWeapons: newEquippedWeapons },
  };
}

/** 盾スロットから盾を除去し、装備中なら解除する */
function removeShieldFromSlot(state: GameState, shieldIndex: number): GameState {
  if (!state.player) return state;
  const shield = state.player.shieldSlots?.[shieldIndex];
  if (!shield) return state;

  const newShieldSlots = (state.player.shieldSlots ?? []).filter((_, i) => i !== shieldIndex);
  const isEquipped = state.player.equippedShield?.instanceId
    ? state.player.equippedShield.instanceId === shield.instanceId
    : state.player.equippedShield?.shieldId === shield.shieldId;

  return {
    ...state,
    player: {
      ...state.player,
      shieldSlots: newShieldSlots,
      ...(isEquipped ? { equippedShield: null } : {}),
    },
    inventory: {
      ...state.inventory,
      equippedShields: (state.inventory.equippedShields ?? []).filter(es =>
        shield.instanceId ? es.instanceId !== shield.instanceId : es.shieldId !== shield.shieldId
      ),
    },
  };
}

/** アーマースロットからアーマーを除去し、装備中なら解除する */
function removeArmorFromSlot(state: GameState, armorIndex: number): GameState {
  if (!state.player) return state;
  const armor = state.player.armorSlots?.[armorIndex];
  if (!armor) return state;

  const newArmorSlots = (state.player.armorSlots ?? []).filter((_, i) => i !== armorIndex);
  const isEquipped = state.player.equippedArmor?.instanceId
    ? state.player.equippedArmor.instanceId === armor.instanceId
    : state.player.equippedArmor?.armorId === armor.armorId;

  // アーマー除去時は maxHpBonus 分を maxHp から引く
  let newPlayer = {
    ...state.player,
    armorSlots: newArmorSlots,
    ...(isEquipped ? { equippedArmor: null } : {}),
  };
  if (isEquipped && armor.maxHpBonus) {
    const newMaxHp = Math.max(1, newPlayer.maxHp - armor.maxHpBonus);
    const newHp = Math.min(newPlayer.hp, newMaxHp);
    newPlayer = { ...newPlayer, maxHp: newMaxHp, hp: newHp };
  }

  return {
    ...state,
    player: newPlayer,
    inventory: {
      ...state.inventory,
      equippedArmors: (state.inventory.equippedArmors ?? []).filter(ea =>
        armor.instanceId ? ea.instanceId !== armor.instanceId : ea.armorId !== armor.armorId
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// 投げ当たり効果適用
// ---------------------------------------------------------------------------

/**
 * 敵に命中したときのアイテム効果を適用する。
 * state からはすでにアイテムが消費済みであることを前提とする。
 */
function applyItemEffectOnEnemy(
  state: GameState,
  def: any,
  itemId: string,
  enemy: Enemy,
  landPos: Position,
  logs: string[],
): GameState {
  const effect: string = def.effect ?? '';
  const value: number = def.value ?? 0;
  const isBoss = enemy.isBoss ?? false;

  switch (effect) {
    // ── HP 回復系 ──
    case 'hp_restore':
    case 'hp_restore_full':
    case 'heal_over_time': {
      const healAmount = effect === 'hp_restore_full' ? enemy.maxHp : value;
      const actualHeal = Math.min(enemy.maxHp - enemy.hp, healAmount);
      const healed = state.enemies.map(e =>
        e.id === enemy.id ? { ...e, hp: Math.min(e.maxHp, e.hp + healAmount) } : e
      );
      logs.push(`${enemy.name ?? enemy.enemyType} のHPが${actualHeal}回復した！`);
      const degradedId = ITEM_DEGRADE_MAP[itemId];
      let nextState: GameState = { ...state, enemies: healed };
      if (degradedId) {
        const degradedName = getItemName(degradedId);
        nextState = dropItemOnFloor(nextState, degradedId, landPos, true, logs, degradedName);
        if (nextState !== state) logs.push(`${def.name} は ${degradedName} になって落ちた`);
      }
      return nextState;
    }

    // ── 強化コア系（敵レベルアップ） ──
    case 'weapon_upgrade_material': {
      const atkBonus = 3;
      const hpBonus = 10;
      const upgraded = state.enemies.map(e =>
        e.id === enemy.id ? {
          ...e,
          atk: e.atk + atkBonus,
          maxHp: e.maxHp + hpBonus,
          hp: e.hp + hpBonus,
          level: (e.level ?? 1) + 1,
        } : e
      );
      logs.push(`${enemy.name ?? enemy.enemyType} がパワーアップした！（ATK+${atkBonus}、HP+${hpBonus}）`);
      const degradedId = ITEM_DEGRADE_MAP[itemId];
      let nextState: GameState = { ...state, enemies: upgraded };
      if (degradedId) {
        nextState = dropItemOnFloor(nextState, degradedId, landPos, true, logs, getItemName(degradedId));
      }
      return nextState;
    }

    // ── 煙幕弾（追跡不能） ──
    case 'enemy_lose_tracking': {
      const stunEffect: StatusEffect = { type: 'stunned', remainingTurns: 3, sourceId: itemId };
      logs.push(`${enemy.name ?? enemy.enemyType} が煙幕に包まれ、3ターン追跡不能になった！`);
      return applyStatusToEnemy(state, enemy.id, stunEffect);
    }

    // ── ブーストエンジン系（一時スピードアップ + グレードダウン） ──
    case 'speed_up_permanent': {
      const turns = 4;
      const magnitude: number = def.value ?? 1;
      const speedEff: StatusEffect = { type: 'speed_up', remainingTurns: turns, magnitude, sourceId: itemId };
      logs.push(`${enemy.name ?? enemy.enemyType} の移動速度が${turns}ターン上がった！`);
      let nextState = applyStatusToEnemy(state, enemy.id, speedEff);
      const degradedId = ITEM_DEGRADE_MAP[itemId];
      if (degradedId) {
        const degradedName = getItemName(degradedId);
        nextState = dropItemOnFloor(nextState, degradedId, landPos, true, logs, degradedName);
        logs.push(`${def.name} は ${degradedName} になって落ちた`);
      } else {
        logs.push(`${def.name} は消えた`);
      }
      return nextState;
    }

    // ── EMP グレネード（3×3スタン） ──
    case 'stun_area': {
      const stunTurns = 3;
      const stunEff: StatusEffect = { type: 'stunned', remainingTurns: stunTurns, sourceId: itemId };
      const { nextState: stunned, count, trapLogs } = applyStatusInArea(state, landPos, stunEff);
      logs.push(`EMP爆発！ 周囲${count}体を${stunTurns}ターンスタン！`, ...trapLogs);
      return stunned;
    }

    // ── フラッシュグレネード（着地点スタン） ──
    case 'flash_grenade':
    case 'stun_radius_2': {
      const stunTurns: number = def.stunTurns ?? 2;
      const stunEff: StatusEffect = { type: 'stunned', remainingTurns: stunTurns, sourceId: itemId };
      const { nextState: stunned, count, trapLogs } = applyStatusInArea(state, landPos, stunEff);
      logs.push(`フラッシュ炸裂！ 周囲${count}体を${stunTurns}ターンスタン！`, ...trapLogs);
      return stunned;
    }

    // ── 加速ブースト（アイテムは必ず消える） ──
    case 'speed_up': {
      const turns: number = def.effectTurns ?? 4;
      const speedEff: StatusEffect = { type: 'speed_up', remainingTurns: turns, magnitude: 2, sourceId: itemId };
      logs.push(`${enemy.name ?? enemy.enemyType} の移動速度が上がった！（${turns}ターン）`);
      return applyStatusToEnemy(state, enemy.id, speedEff);
    }

    // ── 装甲プレート系（敵DEFアップ） ──
    case 'armor_up': {
      const defBonus: number = value ?? 2;
      const upgraded = state.enemies.map(e =>
        e.id === enemy.id ? { ...e, def: e.def + defBonus } : e
      );
      logs.push(`${enemy.name ?? enemy.enemyType} の装甲が強化された！（DEF+${defBonus}）`);
      const degradedId = ITEM_DEGRADE_MAP[itemId];
      let nextState: GameState = { ...state, enemies: upgraded };
      if (degradedId) {
        nextState = dropItemOnFloor(nextState, degradedId, landPos, true, logs, getItemName(degradedId));
      }
      return nextState;
    }

    // ── ワープ系 ──
    case 'return_to_start':
    case 'warp_down':
    case 'warp_up':
    case 'warp_random':
    case 'set_warp_point':
    case 'decoy': {
      // 敵を同一フロアのランダム位置にワープ
      const warpPos = findRandomFloorTile(state);
      if (warpPos) {
        const warped = state.enemies.map(e =>
          e.id === enemy.id ? { ...e, pos: warpPos } : e
        );
        logs.push(`${enemy.name ?? enemy.enemyType} がワープした！`);
        let nextState: GameState = { ...state, enemies: warped };
        if (Math.random() < 0.5) {
          nextState = dropItemOnFloor(nextState, itemId, landPos, true, logs, def.name);
        }
        return nextState;
      }
      logs.push(`${enemy.name ?? enemy.enemyType} にワープ！（場所なし）`);
      return state;
    }

    // ── 時限爆弾（着地点で即爆発） ──
    case 'place_bomb': {
      return detonateBombAtPos(state, def, landPos, logs);
    }

    // ── 爆弾（着地点で即爆発） ──
    case 'throw_bomb': {
      return detonateBombAtPos(state, def, landPos, logs);
    }

    // ── アイスボム（着地点で爆発+凍結） ──
    case 'ice_bomb': {
      return detonateIceBombAtPos(state, def, landPos, logs);
    }

    // ── 聖なるオイル ──
    case 'boss_damage_up': {
      const dmg = isBoss ? 20 : 8;
      logs.push(`${enemy.name ?? enemy.enemyType} に${dmg}ダメージ！`);
      let nextState = dealDamageToEnemy(state, enemy.id, dmg);
      if (Math.random() < 0.5) {
        nextState = dropItemOnFloor(nextState, itemId, landPos, true, logs, def.name);
      }
      return nextState;
    }

    // ── 希少回路（大ダメージ） ──
    case 'sell_only': {
      if (itemId === 'rare_circuit') {
        const bigDmg = Math.max(1, 40 - (enemy.def ?? 0));
        logs.push(`${enemy.name ?? enemy.enemyType} に希少回路の電撃で${bigDmg}大ダメージ！`);
        let nextState = dealDamageToEnemy(state, enemy.id, bigDmg);
        if (Math.random() < 0.5) {
          nextState = dropItemOnFloor(nextState, itemId, landPos, true, logs, def.name);
        }
        return nextState;
      }
      // その他 sell_only（廃金属など）→ 小ダメージ
      const smallDmg = Math.max(1, 5 - (enemy.def ?? 0));
      logs.push(`${enemy.name ?? enemy.enemyType} に${smallDmg}ダメージ！`);
      let nextState = dealDamageToEnemy(state, enemy.id, smallDmg);
      if (Math.random() < 0.5) {
        nextState = dropItemOnFloor(nextState, itemId, landPos, true, logs, def.name);
      }
      return nextState;
    }

    // ── デフォルト（非攻撃・非回復・非強化系）→ 小ダメージ ──
    default: {
      const smallDmg = Math.max(1, 5 - (enemy.def ?? 0));
      logs.push(`${enemy.name ?? enemy.enemyType} に${smallDmg}ダメージ！`);
      let nextState = dealDamageToEnemy(state, enemy.id, smallDmg);
      if (Math.random() < 0.5) {
        nextState = dropItemOnFloor(nextState, itemId, landPos, true, logs, def.name);
      }
      return nextState;
    }
  }
}

/**
 * 敵に命中しなかった場合の着地処理。
 * 爆弾・フラッシュは着地でも効果発動。
 */
function applyItemEffectOnLand(
  state: GameState,
  def: any,
  itemId: string,
  landPos: Position,
  logs: string[],
): GameState {
  const effect: string = def.effect ?? '';

  switch (effect) {
    case 'place_bomb':
      return detonateBombAtPos(state, def, landPos, logs);

    case 'throw_bomb':
      return detonateBombAtPos(state, def, landPos, logs);

    case 'ice_bomb':
      return detonateIceBombAtPos(state, def, landPos, logs);

    case 'stun_area': {
      const stunEff: StatusEffect = { type: 'stunned', remainingTurns: 3, sourceId: itemId };
      const { nextState: stunned, count, trapLogs } = applyStatusInArea(state, landPos, stunEff);
      if (count > 0) logs.push(`EMP爆発！ 周囲${count}体を3ターンスタン！`);
      logs.push(...trapLogs);
      return stunned;
    }

    // ── フラッシュグレネード系: 炎マスに着地した場合のみ即発動、それ以外は設置 ──
    case 'flash_grenade':
    case 'stun_radius_2': {
      const landCell = state.map?.cells[landPos.y]?.[landPos.x];
      if (landCell?.tile === TILE_FIRE) {
        const stunTurns: number = def.stunTurns ?? 2;
        const stunEff: StatusEffect = { type: 'stunned', remainingTurns: stunTurns, sourceId: itemId };
        const { nextState: stunned, count, trapLogs } = applyStatusInArea(state, landPos, stunEff);
        logs.push(`フラッシュ炸裂！ 周囲${count}体を${stunTurns}ターンスタン！`);
        logs.push(...trapLogs);
        return stunned;
      }
      return dropItemOnFloor(state, itemId, landPos, true, logs, def.name);
    }

    // ── speed_up_permanent（ブーストエンジン系）着地: グレードダウンして設置 ──
    case 'speed_up_permanent': {
      const degradedId = ITEM_DEGRADE_MAP[itemId];
      if (degradedId) {
        const degradedName = getItemName(degradedId);
        // 炎マス着地: 80%焼失
        const landCell = state.map?.cells[landPos.y]?.[landPos.x];
        if (landCell?.tile === TILE_FIRE) {
          if (Math.random() < 0.8) {
            logs.push(`${def.name} は炎で焼失した！`);
            return state;
          }
        }
        logs.push(`${def.name} は ${degradedName} になって落ちた`);
        return dropItemOnFloor(state, degradedId, landPos, true, logs, degradedName);
      }
      logs.push(`${def.name} は消えた`);
      return state;
    }

    default: {
      // 炎マスに着地した場合: 高確率で焼失、低確率で隣マスへ落ちる
      const landCell = state.map?.cells[landPos.y]?.[landPos.x];
      if (landCell?.tile === TILE_FIRE) {
        if (Math.random() < 0.8) {
          logs.push(`${def.name ?? itemId} は炎で焼失した！`);
          return state;
        } else {
          const cells = (state.map!.cells as Cell[][]).map(row => [...row]) as Cell[][];
          const nearbyPos = findNearestNonFirePlaceablePos(cells, landPos);
          if (nearbyPos) {
            cells[nearbyPos.y][nearbyPos.x] = { ...cells[nearbyPos.y][nearbyPos.x], tile: TILE_ITEM, itemId };
            logs.push(`${def.name ?? itemId} は炎で弾かれ、隣のマスに落ちた`);
            return { ...state, map: { ...state.map!, cells } };
          }
          logs.push(`${def.name ?? itemId} は炎で焼失した！`);
          return state;
        }
      }
      return dropItemOnFloor(state, itemId, landPos, true, logs, def.name);
    }
  }
}

/** 時限爆弾を着地点で即時起爆する */
function detonateBombAtPos(state: GameState, def: any, pos: Position, logs: string[]): GameState {
  const radius: number = def.bombRadius ?? 0;
  const damage: number = def.value ?? 30;

  // 爆発範囲
  const blastTiles: Position[] = [];
  if (radius === 0) {
    blastTiles.push(pos);
  } else {
    const range = radius <= 1 ? 1 : radius === 2 ? 1 : 2;
    const orthOnly = radius === 1;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (orthOnly && dx !== 0 && dy !== 0) continue;
        blastTiles.push({ x: pos.x + dx, y: pos.y + dy });
      }
    }
  }

  const newEnemies = state.enemies.map(e => {
    if (blastTiles.some(t => t.x === e.pos.x && t.y === e.pos.y)) {
      const dmg = Math.max(1, damage - (e.def ?? 0));
      return { ...e, hp: e.hp - dmg };
    }
    return e;
  });

  let newPlayer = state.player;
  if (newPlayer && blastTiles.some(t => t.x === newPlayer!.pos.x && t.y === newPlayer!.pos.y)) {
    const playerDmg = Math.max(1, Math.floor(damage * 0.5) - (newPlayer.def ?? 0));
    newPlayer = { ...newPlayer, hp: newPlayer.hp - playerDmg, hpEverDroppedBelowMax: true };
    logs.push(`爆弾の爆発がプレイヤーに${playerDmg}ダメージ！`);
  }

  const newTraps = applyBlastToTraps(state.traps, blastTiles, logs);
  logs.push(`爆弾が着地点で爆発！（ダメージ${damage}）`);

  // 爆発範囲内の壁を破壊（外縁は除外）
  let newMap = state.map;
  if (newMap) {
    const brokenWalls: Position[] = [];
    for (const bt of blastTiles) {
      if (bt.x <= 0 || bt.y <= 0 || bt.x >= newMap.width - 1 || bt.y >= newMap.height - 1) continue;
      const btCell = newMap.cells[bt.y]?.[bt.x];
      if (btCell && (btCell.tile === TILE_WALL || btCell.tile === TILE_CRACKED_WALL)) {
        brokenWalls.push(bt);
      }
    }
    if (brokenWalls.length > 0) {
      const brokenSet = new Set(brokenWalls.map(bt => `${bt.x},${bt.y}`));
      const newCells = newMap.cells.map((row, y) =>
        row.map((cell, x) => brokenSet.has(`${x},${y}`) ? { ...cell, tile: TILE_FLOOR } : cell),
      );
      newMap = { ...newMap, cells: newCells };
      logs.push(`爆発で${brokenWalls.length}マスの壁が崩れた！`);
    }
  }

  return {
    ...state,
    enemies: newEnemies,
    player: newPlayer ?? state.player,
    traps: newTraps,
    map: newMap,
    exploration: newMap !== state.map && state.exploration
      ? { ...state.exploration, currentFloor: newMap! }
      : state.exploration,
  };
}

/** アイスボムを着地点で即時起爆する（ダメージ＋凍結） */
function detonateIceBombAtPos(state: GameState, def: any, pos: Position, logs: string[]): GameState {
  const radius: number = def.bombRadius ?? 0;
  const damage: number = def.value ?? 20;
  const frozenTurns: number = def.frozenTurns ?? 1;

  // 爆発範囲（detonateBombAtPos と同一ロジック）
  const blastTiles: Position[] = [];
  if (radius === 0) {
    blastTiles.push(pos);
  } else {
    const range = radius <= 1 ? 1 : radius === 2 ? 1 : 2;
    const orthOnly = radius === 1;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (orthOnly && dx !== 0 && dy !== 0) continue;
        blastTiles.push({ x: pos.x + dx, y: pos.y + dy });
      }
    }
  }

  const frozenEffect: StatusEffect = { type: 'frozen', remainingTurns: frozenTurns, sourceId: def.id ?? 'ice_bomb' };

  const newEnemies = state.enemies.map(e => {
    if (!blastTiles.some(t => t.x === e.pos.x && t.y === e.pos.y)) return e;
    const dmg = Math.max(1, damage - (e.def ?? 0));
    const existing = e.statusEffects ?? [];
    const prevFrozen = existing.find(s => s.type === 'frozen');
    const newFrozen: StatusEffect = prevFrozen && prevFrozen.remainingTurns >= frozenTurns
      ? prevFrozen
      : frozenEffect;
    const withoutFrozen = existing.filter(s => s.type !== 'frozen');
    return { ...e, hp: e.hp - dmg, statusEffects: [...withoutFrozen, newFrozen] };
  });

  let newPlayer = state.player;
  if (newPlayer && blastTiles.some(t => t.x === newPlayer!.pos.x && t.y === newPlayer!.pos.y)) {
    const playerDmg = Math.max(1, Math.floor(damage * 0.5) - (newPlayer.def ?? 0));
    newPlayer = { ...newPlayer, hp: newPlayer.hp - playerDmg, hpEverDroppedBelowMax: true };
    logs.push(`アイスボムの爆発がプレイヤーに${playerDmg}ダメージ！`);
  }

  const newTraps = applyBlastToTraps(state.traps, blastTiles, logs);
  logs.push(`アイスボム爆発！（ダメージ${damage}、${frozenTurns}ターン凍結）`);
  return { ...state, enemies: newEnemies, player: newPlayer ?? state.player, traps: newTraps };
}

/** ランダムな床タイルを返す */
function findRandomFloorTile(state: GameState): Position | null {
  if (!state.map) return null;
  const floors: Position[] = [];
  (state.map.cells as Cell[][]).forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.tile === TILE_FLOOR) floors.push({ x, y });
    });
  });
  if (floors.length === 0) return null;
  return floors[Math.floor(Math.random() * floors.length)];
}

/** アイテムIDから表示名を返す */
function getItemName(itemId: string): string {
  return ALL_ITEMS.find(d => d.id === itemId)?.name ?? itemId;
}
