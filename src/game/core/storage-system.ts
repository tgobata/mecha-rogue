/**
 * @fileoverview 倉庫システム
 *
 * プレイヤーがフロアをまたいで物品を保管できる倉庫を管理する。
 * アイテムの預け入れ・引き出しを純粋関数として提供する。
 *
 * 設計原則:
 * - 純粋関数。引数の GameState を直接変更せず、必ず新しいオブジェクトを返す。
 * - React 非依存。
 * - マジックナンバー禁止（constants.ts の定数を使う）。
 */

import type { GameState, StorageItem, WeaponInstance } from './game-state';
import { STORAGE_MAX_CAPACITY } from './constants';
import { getInventoryCapacity } from './turn-system';

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * インベントリのアイテムを倉庫に預ける。
 * 倉庫が満杯の場合は state を変更せずそのまま返す。
 *
 * - item の場合: inventory.items[index] から1個取り出して storage に追加する
 * - weapon の場合: player.weaponSlots[index] から取り出して storage に追加する
 *
 * @param state - 預け入れ前の GameState
 * @param itemId - 預けるアイテムのID
 * @param itemType - アイテム種別
 * @param index - inventory.items（item の場合）または player.weaponSlots（weapon の場合）のインデックス
 * @returns 預け入れ後の新しい GameState（倉庫満杯の場合は変更なし）
 */
export function depositItem(
  state: GameState,
  itemId: string,
  itemType: 'weapon' | 'item',
  index: number,
): GameState {
  if (state.storage.length >= STORAGE_MAX_CAPACITY) return state;

  if (itemType === 'weapon') {
    const weapons = state.inventory.equippedWeapons;
    if (index < 0 || index >= weapons.length) return state;

    const weapon = weapons[index];
    const newWeapons = weapons.filter((_, i) => i !== index);

    // We can just store the EquippedWeapon in `instance` for StorageItem, or we cast.
    // We'll store it as any to satisfy type but we know it's EquippedWeapon
    const storageEntry: StorageItem = {
      id: itemId,
      type: 'weapon',
      instance: weapon as any,
    };

    return {
      ...state,
      storage: [...state.storage, storageEntry],
      inventory: { ...state.inventory, equippedWeapons: newWeapons },
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

    const storageEntry: StorageItem = {
      id: itemId,
      type: 'item',
    };

    return {
      ...state,
      storage: [...state.storage, storageEntry],
      inventory: { ...state.inventory, items: newItems },
    };
  }
}

/**
 * 倉庫からアイテムを引き出してインベントリに移す。
 * インベントリが満杯の場合は state を変更せずそのまま返す。
 *
 * @param state - 引き出し前の GameState
 * @param storageIndex - state.storage のインデックス
 * @returns 引き出し後の新しい GameState（インベントリ満杯の場合は変更なし）
 */
export function withdrawItem(state: GameState, storageIndex: number): GameState {
  if (storageIndex < 0 || storageIndex >= state.storage.length) return state;

  const entry = state.storage[storageIndex];
  const newStorage = state.storage.filter((_, i) => i !== storageIndex);

  if (entry.type === 'weapon') {
    const instance = entry.instance as any; // originally EquippedWeapon
    const currentWeapons = state.inventory.equippedWeapons;
    const maxWeapons = getInventoryCapacity(state.pilot.level);

    if (currentWeapons.length >= maxWeapons) return state;

    return {
      ...state,
      storage: newStorage,
      inventory: {
        ...state.inventory,
        equippedWeapons: [...currentWeapons, instance],
      },
    };
  } else {
    const currentCount = state.inventory.items.length;
    const maxItems = state.machine.itemPouch;
    if (currentCount >= maxItems) return state;

    const existingIdx = state.inventory.items.findIndex(
      (it) => it.itemId === entry.id && !it.unidentified,
    );
    let newItems;
    if (existingIdx >= 0) {
      newItems = state.inventory.items.map((it, i) =>
        i === existingIdx ? { ...it, quantity: it.quantity + 1 } : it,
      );
    } else {
      newItems = [
        ...state.inventory.items,
        { itemId: entry.id, quantity: 1, unidentified: false },
      ];
    }

    return {
      ...state,
      storage: newStorage,
      inventory: { ...state.inventory, items: newItems },
    };
  }
}

/**
 * 倉庫の現在の内容を返す（参照コピー）。
 * 表示用途に使う。
 *
 * @param state - 現在の GameState
 * @returns 倉庫内アイテムの配列
 */
export function getStorageContents(state: GameState): StorageItem[] {
  return [...state.storage];
}
