/**
 * @fileoverview ショップシステム
 *
 * ショップ在庫の生成・購入・売却・武器修理を純粋関数として提供する。
 * shop-prices.json を静的 import で読み込み、価格テーブルを参照する。
 *
 * 設計原則:
 * - 純粋関数。引数の GameState を直接変更せず、必ず新しいオブジェクトを返す。
 * - React 非依存。
 * - マジックナンバー禁止（constants.ts の定数を使う）。
 */

import shopPricesRaw from '../assets/data/shop-prices.json';
import weaponsRaw from '../assets/data/weapons.json';
import type { GameState, WeaponInstance, WeaponCategory, WeaponRarity, RangeType, EquippedWeapon } from './game-state';
import {
  SHOP_WEAPON_MIN,
  SHOP_WEAPON_MAX,
  SHOP_ITEM_MIN,
  SHOP_ITEM_MAX,
  REPAIR_COST_PER_DURABILITY,
} from './constants';

// ---------------------------------------------------------------------------
// shop-prices.json の型定義
// ---------------------------------------------------------------------------

interface ShopPriceEntry {
  buy: number;
  sell: number;
}

interface ShopPricesData {
  version: string;
  weapons: Record<string, ShopPriceEntry>;
  items: Record<string, ShopPriceEntry>;
  repair: { cost_per_durability: number };
}

const SHOP_PRICES = shopPricesRaw as unknown as ShopPricesData;

// ---------------------------------------------------------------------------
// weapons.json の型定義（在庫生成のための最小限の情報）
// ---------------------------------------------------------------------------

interface WeaponDef {
  id: string;
  name: string;
  category: string;
  atk: number;
  range: number;
  rangeType: string;
  durability: number | null;
  durabilityLoss: number;
  appearsFrom: number;
  energyCost: number;
  special: string | null;
}

const WEAPON_DEFS: WeaponDef[] = weaponsRaw as unknown as WeaponDef[];

// ---------------------------------------------------------------------------
// 公開型定義
// ---------------------------------------------------------------------------

/**
 * ショップの在庫1点を表す。
 * buy / sell はプレイヤーが支払う/受け取るゴールド量。
 */
export interface ShopItem {
  /** アイテムまたは武器のID */
  id: string;
  /** 種別 */
  type: 'weapon' | 'item';
  /** 購入価格（プレイヤーが支払うゴールド） */
  buy: number;
  /** 売却価格（プレイヤーが受け取るゴールド） */
  sell: number;
  /** 残り在庫数（武器は常に1、アイテムは1〜3。0 = 売り切れ） */
  stock: number;
}

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * RangeType 文字列を正規化する。
 * weapon-system.ts と同じロジックを局所的に複製する（循環依存防止）。
 */
function normalizeRangeType(raw: string): RangeType {
  if (raw.startsWith('line')) return 'line';
  if (raw === 'spread_3x2' || raw.startsWith('homing') || raw === 'any_visible') return 'splash';
  return 'single';
}

/**
 * 武器の買い値からレアリティを推定する。
 * weapons.json にレアリティフィールドがないため価格テーブルで代替する。
 */
function rarityFromBuyPrice(buy: number): WeaponRarity {
  if (buy >= 2000) return 'legendary';
  if (buy >= 500)  return 'rare';
  if (buy >= 200)  return 'uncommon';
  return 'common';
}

/**
 * WeaponDef から WeaponInstance を生成する。
 * ショップ購入時に使用する。
 */
function createWeaponInstance(def: WeaponDef): WeaponInstance {
  const priceEntry = SHOP_PRICES.weapons[def.id];
  const buyPrice = priceEntry?.buy ?? 0;
  return {
    id: def.id,
    name: def.name,
    category: def.category as WeaponCategory,
    atk: def.atk,
    range: def.range,
    rangeType: normalizeRangeType(def.rangeType),
    durability: def.durability,
    maxDurability: def.durability,
    durabilityLoss: def.durabilityLoss,
    rarity: rarityFromBuyPrice(buyPrice),
    energyCost: def.energyCost,
    special: def.special,
    rawRangeType: def.rangeType,
  };
}

/**
 * shop-prices.json に登録されている武器IDの一覧を返す。
 */
function getAllWeaponIds(): string[] {
  return Object.keys(SHOP_PRICES.weapons).filter(
    (id) => SHOP_PRICES.weapons[id].buy > 0,
  );
}

/**
 * shop-prices.json に登録されているアイテムIDの一覧を返す。
 */
function getAllItemIds(): string[] {
  return Object.keys(SHOP_PRICES.items).filter(
    (id) => SHOP_PRICES.items[id].buy > 0,
  );
}

/**
 * 配列からランダムに n 件をシャッフル選択する（重複なし）。
 *
 * @param arr - 選択元の配列
 * @param n - 選択する件数
 * @param rng - 乱数生成関数（0〜1）
 * @returns ランダムに選ばれた要素のスライス
 */
function sampleWithoutReplacement<T>(arr: T[], n: number, rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

/**
 * フロア番号に応じた武器絞り込み。
 * appearsFrom <= floorNumber の武器のみをショップ候補とする。
 */
function getAvailableWeaponIds(floorNumber: number): string[] {
  const allWeaponIds = getAllWeaponIds();
  return allWeaponIds.filter((id) => {
    const def = WEAPON_DEFS.find((w) => w.id === id);
    return def ? def.appearsFrom <= floorNumber : true;
  });
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * フロア番号に応じてランダムなショップ在庫を生成する。
 * 武器は 3〜5 点、アイテムは 3〜4 点をランダムに選択する。
 *
 * @param floorNumber - 現在のフロア番号（難易度に応じた在庫フィルタリングに使用）
 * @param rng - 乱数生成関数（0〜1）。テスト時は差し替え可能
 * @returns ショップ在庫のアイテムリスト
 */
export function getShopInventory(floorNumber: number, rng: () => number): ShopItem[] {
  // 武器の点数: SHOP_WEAPON_MIN〜SHOP_WEAPON_MAX のランダム
  const weaponCount =
    SHOP_WEAPON_MIN + Math.floor(rng() * (SHOP_WEAPON_MAX - SHOP_WEAPON_MIN + 1));
  // アイテムの点数: SHOP_ITEM_MIN〜SHOP_ITEM_MAX のランダム
  const itemCount =
    SHOP_ITEM_MIN + Math.floor(rng() * (SHOP_ITEM_MAX - SHOP_ITEM_MIN + 1));

  const availableWeaponIds = getAvailableWeaponIds(floorNumber);
  const allItemIds = getAllItemIds();

  const selectedWeaponIds = sampleWithoutReplacement(availableWeaponIds, weaponCount, rng);
  const selectedItemIds = sampleWithoutReplacement(allItemIds, itemCount, rng);

  const weaponItems: ShopItem[] = selectedWeaponIds.map((id) => {
    const priceEntry = SHOP_PRICES.weapons[id];
    return {
      id,
      type: 'weapon' as const,
      buy: priceEntry?.buy ?? 0,
      sell: priceEntry?.sell ?? 0,
      stock: 1, // 武器は常に在庫1
    };
  });

  const itemItems: ShopItem[] = selectedItemIds.map((id) => {
    const priceEntry = SHOP_PRICES.items[id];
    // アイテムの在庫は 1〜3 のランダム
    const stock = 1 + Math.floor(rng() * 3);
    return {
      id,
      type: 'item' as const,
      buy: priceEntry?.buy ?? 0,
      sell: priceEntry?.sell ?? 0,
      stock,
    };
  });

  return [...weaponItems, ...itemItems];
}

/**
 * ショップでアイテムを購入する。
 * 所持金が不足している場合は state を変更せずそのまま返す。
 *
 * - weapon の場合: player.weaponSlots に WeaponInstance を追加する
 * - item の場合: inventory.items に InventoryItem を追加する
 *
 * @param state - 購入前の GameState
 * @param itemId - 購入するアイテムのID
 * @param itemType - アイテム種別
 * @returns 購入後の新しい GameState（所持金不足の場合は変更なし）
 */
export function buyItem(
  state: GameState,
  itemId: string,
  itemType: 'weapon' | 'item',
): GameState {
  const priceTable =
    itemType === 'weapon' ? SHOP_PRICES.weapons : SHOP_PRICES.items;
  const priceEntry = priceTable[itemId];
  if (!priceEntry) return state;

  // 在庫チェック（stock が 0 以下なら購入不可）
  const currentShopInventory = state.exploration?.shopInventory ?? [];
  const shopItemIdx = currentShopInventory.findIndex(
    (si) => si.id === itemId && si.type === itemType,
  );
  const currentStock = shopItemIdx >= 0
    ? (currentShopInventory[shopItemIdx].stock ?? 1)
    : 1; // shopInventory がない（旧データ互換）場合は購入可とする
  if (currentStock <= 0) return state;

  const cost = priceEntry.buy;
  if (state.inventory.gold < cost) return state;

  const newGold = state.inventory.gold - cost;

  // shopInventory の在庫を 1 減らす
  const newShopInventory = shopItemIdx >= 0
    ? currentShopInventory.map((si, i) =>
        i === shopItemIdx ? { ...si, stock: Math.max(0, si.stock - 1) } : si,
      )
    : currentShopInventory;

  // shopInventories（座標キー別の永続在庫）も同期する
  const currentShopKey = state.exploration?.currentShopKey;
  const newShopInventories =
    currentShopKey && state.exploration?.shopInventories
      ? { ...state.exploration.shopInventories, [currentShopKey]: newShopInventory }
      : state.exploration?.shopInventories;

  if (itemType === 'weapon') {
    const def = WEAPON_DEFS.find((w) => w.id === itemId);
    if (!def) return state;

    const instance = createWeaponInstance(def);
    const currentSlots = state.player?.weaponSlots ?? [];
    const maxSlots = state.machine.weaponSlots;

    if (currentSlots.length >= maxSlots) {
      // スロット満杯の場合は購入しない
      return state;
    }

    const newWeaponSlots = [...currentSlots, instance];
    // inventory.equippedWeapons（セーブ用）も同期して更新する
    const newEquippedWeapon: EquippedWeapon = {
      instanceId: instance.instanceId,
      weaponId: instance.id,
      durability: instance.durability ?? 999,
      weaponLevel: 1,
      rarity: 'C',
    };
    const explorationWithStock = state.exploration
      ? { ...state.exploration, shopInventory: newShopInventory, shopInventories: newShopInventories }
      : state.exploration;
    return {
      ...state,
      exploration: explorationWithStock,
      inventory: {
        ...state.inventory,
        gold: newGold,
        equippedWeapons: [...state.inventory.equippedWeapons, newEquippedWeapon],
      },
      player: state.player
        ? { ...state.player, weaponSlots: newWeaponSlots }
        : state.player,
    };
  } else {
    // アイテム購入: inventory.items に追加（スタック対応）
    const existingIdx = state.inventory.items.findIndex(
      (it) => it.itemId === itemId && !it.unidentified,
    );
    let newItems;
    if (existingIdx >= 0) {
      newItems = state.inventory.items.map((it, idx) =>
        idx === existingIdx ? { ...it, quantity: it.quantity + 1 } : it,
      );
    } else {
      const currentCount = state.inventory.items.reduce(
        (acc, it) => acc + it.quantity,
        0,
      );
      if (currentCount >= state.machine.itemPouch) {
        // ポーチ満杯の場合は購入しない
        return state;
      }
      newItems = [
        ...state.inventory.items,
        { itemId, quantity: 1, unidentified: false },
      ];
    }

    const explorationWithStock = state.exploration
      ? { ...state.exploration, shopInventory: newShopInventory, shopInventories: newShopInventories }
      : state.exploration;
    return {
      ...state,
      exploration: explorationWithStock,
      inventory: { ...state.inventory, gold: newGold, items: newItems },
    };
  }
}

/**
 * インベントリのアイテムをショップに売却する。
 * アイテムを削除して gold を加算する。
 *
 * @param state - 売却前の GameState
 * @param itemId - 売却するアイテムのID
 * @param itemType - アイテム種別
 * @param index - inventory.items（item の場合）または player.weaponSlots（weapon の場合）のインデックス
 * @returns 売却後の新しい GameState
 */
export function sellItem(
  state: GameState,
  itemId: string,
  itemType: 'weapon' | 'item' | 'shield' | 'armor',
  index: number,
): GameState {
  const priceTable = SHOP_PRICES.weapons as Record<string, { buy: number; sell: number }>;
  const priceEntry = itemType === 'item'
    ? (SHOP_PRICES.items as Record<string, { buy: number; sell: number }>)[itemId]
    : priceTable[itemId];
  const sellPrice = priceEntry?.sell ?? 0;

  if (itemType === 'shield') {
    const slots = state.player?.shieldSlots ?? [];
    if (index < 0 || index >= slots.length) return state;
    const sold = slots[index];
    const newSlots = slots.filter((_, i) => i !== index);
    const isEquipped = state.player?.equippedShield &&
      (sold.instanceId
        ? state.player.equippedShield.instanceId === sold.instanceId
        : state.player.equippedShield.shieldId === sold.shieldId);
    return {
      ...state,
      inventory: { ...state.inventory, gold: state.inventory.gold + sellPrice },
      player: state.player
        ? { ...state.player, shieldSlots: newSlots, equippedShield: isEquipped ? null : state.player.equippedShield }
        : state.player,
    };
  }

  if (itemType === 'armor') {
    const slots = state.player?.armorSlots ?? [];
    if (index < 0 || index >= slots.length) return state;
    const sold = slots[index];
    const newSlots = slots.filter((_, i) => i !== index);
    const isEquipped = state.player?.equippedArmor &&
      (sold.instanceId
        ? state.player.equippedArmor.instanceId === sold.instanceId
        : state.player.equippedArmor.armorId === sold.armorId);
    return {
      ...state,
      inventory: { ...state.inventory, gold: state.inventory.gold + sellPrice },
      player: state.player
        ? { ...state.player, armorSlots: newSlots, equippedArmor: isEquipped ? null : state.player.equippedArmor }
        : state.player,
    };
  }

  if (itemType === 'weapon') {
    const slots = state.player?.weaponSlots ?? [];
    if (index < 0 || index >= slots.length) return state;

    const newSlots = slots.filter((_, i) => i !== index);
    // inventory.equippedWeapons（セーブ用）も同期して削除する
    const newEquippedWeapons = state.inventory.equippedWeapons.filter((_, i) => i !== index);
    return {
      ...state,
      inventory: {
        ...state.inventory,
        gold: state.inventory.gold + sellPrice,
        equippedWeapons: newEquippedWeapons,
      },
      player: state.player
        ? { ...state.player, weaponSlots: newSlots }
        : state.player,
    };
  } else {
    const items = state.inventory.items;
    if (index < 0 || index >= items.length) return state;

    const target = items[index];
    let newItems;
    if (target.quantity > 1) {
      newItems = items.map((it, i) =>
        i === index ? { ...it, quantity: it.quantity - 1 } : it,
      );
    } else {
      newItems = items.filter((_, i) => i !== index);
    }

    return {
      ...state,
      inventory: {
        ...state.inventory,
        gold: state.inventory.gold + sellPrice,
        items: newItems,
      },
    };
  }
}

/**
 * 武器スロットの指定インデックスの武器を修理する。
 * 耐久度を maxDurability まで回復し、費用を gold から差し引く。
 * 所持金不足の場合は state を変更せずそのまま返す。
 *
 * @param state - 修理前の GameState
 * @param weaponIndex - player.weaponSlots のインデックス
 * @returns 修理後の新しい GameState（所持金不足の場合は変更なし）
 */
export function repairWeapon(state: GameState, weaponIndex: number): GameState {
  const slots = state.player?.weaponSlots ?? [];
  if (weaponIndex < 0 || weaponIndex >= slots.length) return state;

  const weapon = slots[weaponIndex];
  if (weapon.durability === null || weapon.maxDurability === null) {
    // 耐久なし武器は修理不要
    return state;
  }

  const lost = weapon.maxDurability - weapon.durability;
  if (lost <= 0) return state;

  const cost = lost * REPAIR_COST_PER_DURABILITY;
  if (state.inventory.gold < cost) return state;

  const repairedWeapon: WeaponInstance = {
    ...weapon,
    durability: weapon.maxDurability,
  };
  const newSlots = slots.map((w, i) => (i === weaponIndex ? repairedWeapon : w));

  return {
    ...state,
    inventory: { ...state.inventory, gold: state.inventory.gold - cost },
    player: state.player
      ? { ...state.player, weaponSlots: newSlots }
      : state.player,
  };
}
