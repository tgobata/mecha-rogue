/**
 * @fileoverview マシン強化システム
 *
 * インベントリ内のアップグレードコアを消費してマシンのステータスを強化する。
 * 利用可能な強化オプションの照会と適用を純粋関数として提供する。
 *
 * 設計原則:
 * - 純粋関数。引数の GameState を直接変更せず、必ず新しいオブジェクトを返す。
 * - React 非依存。
 * - マジックナンバー禁止（constants.ts の定数を使う）。
 */

import type { GameState } from './game-state';
import { ALL_UPGRADE_OPTIONS } from './constants';

// ---------------------------------------------------------------------------
// 公開型定義
// ---------------------------------------------------------------------------

/** 強化の種別 */
export type UpgradeType = 'atk' | 'def' | 'hp' | 'maxHp' | 'moveSpeed' | 'spike_tires' | 'heat_resist' | 'magnet_shield';

/**
 * マシン強化の1オプションを表す。
 * ALL_UPGRADE_OPTIONS（constants.ts）から読み込む。
 */
export interface UpgradeOption {
  /** 強化オプションの固有ID */
  id: string;
  /** 強化の種別 */
  type: UpgradeType;
  /** プレイヤー向けの説明文 */
  description: string;
  /** 消費する素材アイテムのID */
  requiredItemId: string;
  /** 消費する素材の必要個数 */
  requiredCount: number;
  /** 1回あたりの効果量（ATK +2 なら 2） */
  effect: number;
  /** このオプションを適用できる最大累積回数 */
  maxTimes: number;
}

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * インベントリ内の指定アイテムの合計個数を返す。
 *
 * @param state - 現在の GameState
 * @param itemId - カウントするアイテムのID
 * @returns 合計個数
 */
function getItemCount(state: GameState, itemId: string): number {
  return state.inventory.items
    .filter((it) => it.itemId === itemId && !it.unidentified)
    .reduce((acc, it) => acc + it.quantity, 0);
}

/**
 * インベントリから指定アイテムを n 個消費した新しい items 配列を返す。
 * 合計個数が不足している場合は null を返す。
 *
 * @param state - 現在の GameState
 * @param itemId - 消費するアイテムのID
 * @param count - 消費する個数
 * @returns 消費後の items 配列、または null（個数不足）
 */
function consumeItems(
  state: GameState,
  itemId: string,
  count: number,
): GameState['inventory']['items'] | null {
  let remaining = count;
  const newItems = [];

  for (const item of state.inventory.items) {
    if (item.itemId === itemId && !item.unidentified && remaining > 0) {
      const consume = Math.min(item.quantity, remaining);
      remaining -= consume;
      if (item.quantity - consume > 0) {
        newItems.push({ ...item, quantity: item.quantity - consume });
      }
      // quantity が 0 になったエントリは追加しない（削除扱い）
    } else {
      newItems.push(item);
    }
  }

  return remaining === 0 ? newItems : null;
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * 現在の GameState で実行可能な強化オプションの一覧を返す。
 * 以下の条件をすべて満たすオプションのみを返す:
 * 1. upgradeCount[id] < maxTimes（最大回数未達）
 * 2. インベントリに requiredItemId が requiredCount 個以上ある
 *
 * @param state - 現在の GameState
 * @returns 実行可能な UpgradeOption の配列
 */
export function getAvailableUpgrades(state: GameState): UpgradeOption[] {
  return (ALL_UPGRADE_OPTIONS as unknown as UpgradeOption[]).filter((opt) => {
    const appliedCount = state.upgradeCount[opt.id] ?? 0;
    if (appliedCount >= opt.maxTimes) return false;

    const itemCount = getItemCount(state, opt.requiredItemId);
    return itemCount >= opt.requiredCount;
  });
}

/**
 * 指定の強化オプションを適用する。
 * 素材を消費してマシンのステータスを更新し、upgradeCount を増やす。
 * 条件を満たさない場合は state を変更せずそのまま返す。
 *
 * 強化効果:
 * - 'atk'     : player.atk を増加する
 * - 'def'     : player.def と machine.armor を増加する
 * - 'maxHp'   : player.maxHp と machine.maxHp を増加する（現HPも増加）
 * - 'hp'      : player.hp と machine.hp を増加する（maxHp を超えない）
 * - 'moveSpeed': machine.moveSpeed を増加する
 *
 * @param state - 強化前の GameState
 * @param upgradeId - 適用する強化オプションのID
 * @returns 強化後の新しい GameState
 */
export function applyUpgrade(state: GameState, upgradeId: string): GameState {
  const opt = (ALL_UPGRADE_OPTIONS as unknown as UpgradeOption[]).find(
    (o) => o.id === upgradeId,
  );
  if (!opt) return state;

  const appliedCount = state.upgradeCount[upgradeId] ?? 0;
  if (appliedCount >= opt.maxTimes) return state;

  const itemCount = getItemCount(state, opt.requiredItemId);
  if (itemCount < opt.requiredCount) return state;

  const newItems = consumeItems(state, opt.requiredItemId, opt.requiredCount);
  if (!newItems) return state;

  const newUpgradeCount = {
    ...state.upgradeCount,
    [upgradeId]: appliedCount + 1,
  };

  const newInventory = { ...state.inventory, items: newItems };

  // ステータス更新
  let newMachine = { ...state.machine };
  let newPlayer = state.player ? { ...state.player } : null;

  switch (opt.type) {
    case 'atk': {
      if (newPlayer) {
        newPlayer = { ...newPlayer, atk: newPlayer.atk + opt.effect };
      }
      break;
    }
    case 'def': {
      newMachine = { ...newMachine, armor: newMachine.armor + opt.effect };
      if (newPlayer) {
        newPlayer = { ...newPlayer, def: newPlayer.def + opt.effect };
      }
      break;
    }
    case 'maxHp': {
      newMachine = {
        ...newMachine,
        maxHp: newMachine.maxHp + opt.effect,
        hp: newMachine.hp + opt.effect,
      };
      if (newPlayer) {
        newPlayer = {
          ...newPlayer,
          maxHp: newPlayer.maxHp + opt.effect,
          hp: newPlayer.hp + opt.effect,
        };
      }
      break;
    }
    case 'hp': {
      const newHp = Math.min(newMachine.maxHp, newMachine.hp + opt.effect);
      newMachine = { ...newMachine, hp: newHp };
      if (newPlayer) {
        newPlayer = {
          ...newPlayer,
          hp: Math.min(newPlayer.maxHp, newPlayer.hp + opt.effect),
        };
      }
      break;
    }
    case 'moveSpeed': {
      newMachine = { ...newMachine, moveSpeed: newMachine.moveSpeed + opt.effect };
      break;
    }
    case 'spike_tires':
    case 'heat_resist':
    case 'magnet_shield': {
      // フラグ型アップグレード: upgradeCount への記録のみ（ステータス変更なし）
      // turn-system が upgradeCount を参照して効果を適用する
      break;
    }
  }

  return {
    ...state,
    machine: newMachine,
    player: newPlayer,
    inventory: newInventory,
    upgradeCount: newUpgradeCount,
  };
}
