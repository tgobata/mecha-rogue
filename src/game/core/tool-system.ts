/**
 * @fileoverview 道具システム
 *
 * tools-equipment.json からインスタンス生成、使用・装備の処理を担う。
 * 純粋関数のみ。副作用なし。
 */

import toolsRaw from '../assets/data/tools-equipment.json';
import itemsRaw from '../assets/data/items.json';
import type { ToolInstance, ToolCategory } from './game-state';
import type { GameState } from './game-state';

// ---------------------------------------------------------------------------
// items.json の型定義（useInventoryItem で使用）
// ---------------------------------------------------------------------------

interface ItemDef {
  id: string;
  name: string;
  category: string;
  effect: string;
  value: number;
  description?: string;
  [key: string]: unknown;
}

const ITEM_DEFS: ItemDef[] = itemsRaw as unknown as ItemDef[];

// ---------------------------------------------------------------------------
// tools-equipment.json の型定義
// ---------------------------------------------------------------------------

interface ToolDef {
  id: string;
  name: string;
  category: string;
  effect: string;
  value: number;
  appearsFrom: number;
  shopPrice: number;
  dropWeight: number;
  passive: boolean;
  description: string;
  cooldownTurns?: number;
  hpThreshold?: number;
}

const TOOL_DEFS: ToolDef[] = toolsRaw as unknown as ToolDef[];

// ---------------------------------------------------------------------------
// インスタンス生成
// ---------------------------------------------------------------------------

/**
 * tools-equipment.json の id から ToolInstance を生成する。
 * passive=true → 装備型（charges=-1）、passive=false → 使い捨て型（charges=1）
 *
 * @param id - 道具ID（tools-equipment.json の id フィールド）
 * @returns ToolInstance
 * @throws 該当IDが存在しない場合
 */
export function createToolInstance(id: string): ToolInstance {
  const def = TOOL_DEFS.find((d) => d.id === id);
  if (!def) {
    throw new Error(`[tool-system] 道具ID '${id}' が tools-equipment.json に存在しません`);
  }

  const isEquipType = def.passive;
  return {
    id: def.id,
    name: def.name,
    category: def.category as ToolCategory,
    isEquipType,
    isEquipped: false,
    charges: isEquipType ? -1 : 1,
    effect: def.effect,
  };
}

// ---------------------------------------------------------------------------
// 使用処理
// ---------------------------------------------------------------------------

/**
 * 道具を使用する。
 *
 * - 装備型: equippedTools への追加/削除（toggle）
 * - 使い捨て型: charges-- → 0 になったら toolInventory から削除
 *
 * @param state - 現在の GameState
 * @param toolId - 使用する道具ID
 * @returns 更新後の GameState（元の state は変更しない）
 */
export function useTool(state: GameState, toolId: string): GameState {
  const player = state.player;
  if (!player) return state;

  const equippedTools = player.equippedTools ?? [];
  const toolInventory = player.toolInventory ?? [];
  const maxToolSlots = state.machine.toolSlots;

  // 装備型かどうかを定義から確認
  const def = TOOL_DEFS.find((d) => d.id === toolId);
  if (!def) return state;

  if (def.passive) {
    // 装備型: toggle
    const alreadyEquipped = equippedTools.some((t) => t.id === toolId);
    let newEquippedTools: ToolInstance[];

    if (alreadyEquipped) {
      // 取り外し
      newEquippedTools = equippedTools.map((t) =>
        t.id === toolId ? { ...t, isEquipped: false } : t,
      ).filter((t) => t.id !== toolId);
    } else {
      // 装着（スロット上限チェック）
      if (equippedTools.length >= maxToolSlots) return state;
      const tool = createToolInstance(toolId);
      newEquippedTools = [...equippedTools, { ...tool, isEquipped: true }];
    }

    return {
      ...state,
      player: { ...player, equippedTools: newEquippedTools },
    };
  } else {
    // 使い捨て型: toolInventory から使用
    const toolIndex = toolInventory.findIndex((t) => t.id === toolId);
    if (toolIndex < 0) return state;

    const tool = toolInventory[toolIndex];
    const newCharges = tool.charges - 1;

    let newInventory: ToolInstance[];
    if (newCharges <= 0) {
      newInventory = toolInventory.filter((_, i) => i !== toolIndex);
    } else {
      newInventory = toolInventory.map((t, i) =>
        i === toolIndex ? { ...t, charges: newCharges } : t,
      );
    }

    // 効果の適用（effect フィールドで switch 分岐）
    const updatedState = applyToolEffect(
      { ...state, player: { ...player, toolInventory: newInventory } },
      tool,
    );
    return updatedState;
  }
}

/**
 * 使い捨て道具の効果を GameState に適用する。
 * 副作用なし。新しい GameState を返す。
 *
 * @param state - 適用前の GameState
 * @param tool - 使用した道具
 * @returns 効果適用後の GameState
 */
function applyToolEffect(state: GameState, tool: ToolInstance): GameState {
  const player = state.player!;

  switch (tool.effect) {
    case 'hp_restore':
    case 'hp_restore_full': {
      // アイテムデータの value は items.json 側なので、ここでは定義から引く
      // tools-equipment.json 側には hp_restore 系道具はないが、将来拡張のために実装
      const def = TOOL_DEFS.find((d) => d.id === tool.id);
      const restoreAmount = tool.effect === 'hp_restore_full'
        ? player.maxHp
        : (def?.value ?? 0);
      const newHp = Math.min(player.maxHp, player.hp + restoreAmount);
      return {
        ...state,
        player: { ...player, hp: newHp },
        machine: { ...state.machine, hp: newHp },
      };
    }

    case 'energy_restore': {
      const def = TOOL_DEFS.find((d) => d.id === tool.id);
      const amount = def?.value ?? 0;
      const newEnergy = Math.min(state.machine.maxEnergy, state.machine.energy + amount);
      return { ...state, machine: { ...state.machine, energy: newEnergy } };
    }

    case 'phase_through_wall':
      // フェイズシフター: 移動システムが参照するフラグを立てる（将来実装）
      return state;

    default:
      // 未実装効果は何もしない
      return state;
  }
}

// ---------------------------------------------------------------------------
// 全道具定義の取得
// ---------------------------------------------------------------------------

/** tools-equipment.json の全定義を返す */
export function getAllToolDefs(): ToolDef[] {
  return TOOL_DEFS;
}

// ---------------------------------------------------------------------------
// インベントリアイテム（items.json）の名前取得
// ---------------------------------------------------------------------------

/** items.json のアイテムID から日本語名を返す。見つからなければ id をそのまま返す */
export function getItemName(itemId: string): string {
  return ITEM_DEFS.find((d) => d.id === itemId)?.name ?? itemId;
}

// ---------------------------------------------------------------------------
// インベントリアイテム使用（items.json 系 InventoryItem を消費して効果を適用）
// ---------------------------------------------------------------------------

/**
 * `state.inventory.items[itemIndex]` のアイテムを使用して効果を適用する。
 *
 * - アイテムが見つからない場合はそのままの state を返す
 * - quantity が 1 の場合は配列から削除、2 以上の場合は quantity--
 * - 効果適用後の GameState と日本語ログ文字列を返す
 *
 * @param state - 現在の GameState
 * @param itemIndex - state.inventory.items のインデックス
 * @returns { nextState, log }
 */
export function useInventoryItem(
  state: GameState,
  itemIndex: number,
  identifyTargetIndex?: number,
): { nextState: GameState; log: string } {
  const item = state.inventory.items[itemIndex];
  if (!item) return { nextState: state, log: 'アイテムが見つかりません' };

  const def = ITEM_DEFS.find((d) => d.id === item.itemId);
  if (!def) return { nextState: state, log: `${item.itemId} は不明なアイテムです` };

  const itemName = def.name;

  // 使用不可カテゴリ（売却専用・未鑑定・倉庫拡張チケット）
  const nonUsableEffects = ['sell_only', 'unknown', 'warehouse_expansion'];
  if (nonUsableEffects.includes(def.effect)) {
    return { nextState: state, log: `${itemName} はここでは使えません` };
  }

  // アイテムを消費（quantity -= 1、0 になったら除去）
  const newItems = item.quantity <= 1
    ? state.inventory.items.filter((_, i) => i !== itemIndex)
    : state.inventory.items.map((it, i) =>
        i === itemIndex ? { ...it, quantity: it.quantity - 1 } : it,
      );

  let nextState: GameState = {
    ...state,
    inventory: { ...state.inventory, items: newItems },
  };

  const player = nextState.player;
  const machine = nextState.machine;

  switch (def.effect) {
    // ── HP 回復 ──
    case 'hp_restore': {
      if (!player) break;
      const newHp = Math.min(player.maxHp, player.hp + def.value);
      nextState = {
        ...nextState,
        player: { ...player, hp: newHp },
        machine: { ...machine, hp: newHp },
      };
      return { nextState, log: `${itemName} を使用した（HP +${newHp - player.hp}）` };
    }
    case 'hp_restore_full': {
      if (!player) break;
      const healed = player.maxHp - player.hp;
      nextState = {
        ...nextState,
        player: { ...player, hp: player.maxHp },
        machine: { ...machine, hp: player.maxHp },
      };
      return { nextState, log: `${itemName} を使用した（HP +${healed}、全回復）` };
    }

    // ── エネルギー回復 ──
    case 'energy_restore': {
      const newEnergy = Math.min(machine.maxEnergy, machine.energy + def.value);
      nextState = { ...nextState, machine: { ...machine, energy: newEnergy } };
      return { nextState, log: `${itemName} を使用した（EN +${newEnergy - machine.energy}）` };
    }

    // ── 機体強化（永続） ──
    case 'armor_up': {
      nextState = { ...nextState, machine: { ...machine, armor: machine.armor + def.value } };
      return { nextState, log: `${itemName} を適用した（装甲 +${def.value}）` };
    }
    case 'max_hp_up': {
      const newMaxHp = machine.maxHp + def.value;
      const newHp = player ? Math.min(newMaxHp, player.hp + def.value) : newMaxHp;
      nextState = {
        ...nextState,
        machine: { ...machine, maxHp: newMaxHp },
        ...(player ? { player: { ...player, maxHp: newMaxHp, hp: newHp } } : {}),
      };
      return { nextState, log: `${itemName} を適用した（最大HP +${def.value}）` };
    }
    case 'speed_up_permanent': {
      const newSpeed = Math.min(5, machine.moveSpeed + def.value);
      nextState = { ...nextState, machine: { ...machine, moveSpeed: newSpeed } };
      return { nextState, log: `${itemName} を適用した（移動速度 +${def.value}）` };
    }
    case 'weapon_slot_up': {
      const newSlots = Math.min(5, machine.weaponSlots + def.value);
      nextState = { ...nextState, machine: { ...machine, weaponSlots: newSlots } };
      return { nextState, log: `${itemName} を適用した（武器スロット +${def.value}）` };
    }
    case 'tool_slot_up': {
      const newToolSlots = Math.min(8, machine.toolSlots + def.value);
      nextState = { ...nextState, machine: { ...machine, toolSlots: newToolSlots } };
      return { nextState, log: `${itemName} を適用した（道具スロット +${def.value}）` };
    }
    case 'pouch_capacity_up': {
      nextState = { ...nextState, machine: { ...machine, itemPouch: machine.itemPouch + def.value } };
      return { nextState, log: `${itemName} を適用した（ポーチ容量 +${def.value}）` };
    }
    case 'energy_max_up': {
      nextState = { ...nextState, machine: { ...machine, maxEnergy: machine.maxEnergy + def.value } };
      return { nextState, log: `${itemName} を適用した（最大EN +${def.value}）` };
    }

    // ── 武器修理 ──
    case 'weapon_durability_restore_full': {
      // 装備中の武器を回復（equippedWeapon と weaponSlots[0] の両方を同期）
      const targetWeapon = player?.equippedWeapon ?? player?.weaponSlots?.[0] ?? null;
      if (!targetWeapon || targetWeapon.durability === null) break;
      const repairedWeapon = { ...targetWeapon, durability: targetWeapon.maxDurability };
      const newWeaponSlots = player?.weaponSlots?.map((w) =>
        w.id === targetWeapon.id ? repairedWeapon : w,
      ) ?? [];
      // inventory.equippedWeapons も同期
      const newEquippedWeapons = nextState.inventory.equippedWeapons.map((ew) =>
        ew.weaponId === targetWeapon.id
          ? { ...ew, durability: targetWeapon.maxDurability ?? ew.durability }
          : ew,
      );
      nextState = {
        ...nextState,
        inventory: { ...nextState.inventory, equippedWeapons: newEquippedWeapons },
        player: player
          ? {
              ...player,
              equippedWeapon:
                player.equippedWeapon?.id === targetWeapon.id ? repairedWeapon : player.equippedWeapon,
              weaponSlots: newWeaponSlots,
            }
          : player,
      };
      return { nextState, log: `${itemName} を使用した（${targetWeapon.name} の耐久度を全回復）` };
    }

    // ── 武器強化素材（強化コアI/II/III） ──
    case 'weapon_upgrade_material': {
      // 装備中 or スロット先頭の武器を強化対象とする
      const upgradeTarget = player?.equippedWeapon ?? player?.weaponSlots?.[0] ?? null;
      if (!upgradeTarget) {
        return { nextState: state, log: `${itemName}: 強化できる武器がありません` };
      }
      // tier に応じた強化量（tier=1: atk+5 / tier=2: atk+10 / tier=3: atk+20）
      const tier = (def as ItemDef & { tier?: number }).tier ?? 1;
      const atkBonus = tier === 1 ? 5 : tier === 2 ? 10 : 20;
      const upgradedWeapon = { ...upgradeTarget, atk: upgradeTarget.atk + atkBonus };
      const newWeaponSlotsUpg = player?.weaponSlots?.map((w) =>
        w.id === upgradeTarget.id ? upgradedWeapon : w,
      ) ?? [];
      // inventory.equippedWeapons のレベルも更新（weaponLevel+1 を上限5で適用）
      const newEquippedWeaponsUpg = nextState.inventory.equippedWeapons.map((ew) =>
        ew.weaponId === upgradeTarget.id
          ? { ...ew, weaponLevel: Math.min(5, ew.weaponLevel + 1) }
          : ew,
      );
      nextState = {
        ...nextState,
        inventory: { ...nextState.inventory, equippedWeapons: newEquippedWeaponsUpg },
        player: player
          ? {
              ...player,
              equippedWeapon:
                player.equippedWeapon?.id === upgradeTarget.id ? upgradedWeapon : player.equippedWeapon,
              weaponSlots: newWeaponSlotsUpg,
            }
          : player,
      };
      return { nextState, log: `${itemName} を使用した（${upgradeTarget.name} ATK +${atkBonus}）` };
    }

    // ── フロア探索 ──
    case 'reveal_floor':
      // マップ全開示は turn-system 側で visibility 処理が必要なため、ここでは消費のみ
      return { nextState, log: `${itemName} を使用した（フロアマップを解析）` };

    // ── 戦闘系（効果は簡易実装：消費して使用ログのみ） ──
    case 'enemy_lose_tracking': {
      // 透明ボス（phantom）を5ターン可視化
      const revealTurns = 5;
      const newEnemies = nextState.enemies.map(e => {
        if (e.bossState?.isInvisible !== undefined) {
          return { ...e, bossState: { ...e.bossState, revealedTurns: revealTurns } };
        }
        return e;
      });
      nextState = { ...nextState, enemies: newEnemies };
      const phantomExists = newEnemies.some(e => e.enemyType === 'phantom');
      const logMsg = phantomExists
        ? `${itemName} を使用した（透明なボスを${revealTurns}ターン可視化！）`
        : `${itemName} を使用した（煙幕展開、敵の追跡を妨害）`;
      return { nextState, log: logMsg };
    }
    case 'stun_area':
      return { nextState, log: `${itemName} を使用した（EMP爆発）` };
    case 'stun_radius_2':
      return { nextState, log: `${itemName} を使用した（フラッシュ炸裂）` };
    case 'speed_up':
      return { nextState, log: `${itemName} を使用した（加速ブースト）` };
    case 'damage_nullify':
      return { nextState, log: `${itemName} を使用した（バリア展開）` };
    case 'boss_damage_up':
      return { nextState, log: `${itemName} を使用した（ボス対策強化）` };

    // ── 時限爆弾設置 ──
    case 'place_bomb': {
      if (!state.player) break;
      const bombDelay = (def as ItemDef & { bombDelay?: number }).bombDelay ?? 2;
      const bombRadius = (def as ItemDef & { bombRadius?: number }).bombRadius ?? 0;
      const newBombId = Date.now() + Math.floor(Math.random() * 1000);
      const newBomb: import('./game-state').PlacedBomb = {
        id: newBombId,
        pos: { ...state.player.pos },
        turnsLeft: bombDelay,
        radius: bombRadius,
        damage: def.value,
      };
      const currentBombs = (nextState.placedBombs ?? []);
      nextState = { ...nextState, placedBombs: [...currentBombs, newBomb] };
      return { nextState, log: `${itemName} を設置した（${bombDelay}ターン後に爆発）` };
    }

    // ── フラッシュグレネード ──
    case 'flash_grenade': {
      if (!state.player) break;
      const flashRadius = (def as ItemDef & { flashRadius?: number }).flashRadius ?? 2;
      const stunTurnsCount = (def as ItemDef & { stunTurns?: number }).stunTurns ?? 2;
      const playerPos = state.player.pos;
      const stunEffect: import('./game-state').StatusEffect = {
        type: 'stunned',
        remainingTurns: stunTurnsCount,
        sourceId: def.id,
      };
      let stunCount = 0;
      const newEnemies = nextState.enemies.map((e) => {
        const dx = Math.abs(e.pos.x - playerPos.x);
        const dy = Math.abs(e.pos.y - playerPos.y);
        const dist = Math.max(dx, dy); // Chebyshev distance
        if (dist <= flashRadius) {
          stunCount++;
          const existing = e.statusEffects ?? [];
          const withoutStun = existing.filter((s) => s.type !== 'stunned');
          return { ...e, statusEffects: [...withoutStun, stunEffect] };
        }
        return e;
      });
      nextState = { ...nextState, enemies: newEnemies };
      const logMsg = stunCount > 0
        ? `${itemName} を使用した（${stunCount}体をスタン）`
        : `${itemName} を使用した（周囲に敵なし）`;
      return { nextState, log: logMsg };
    }

    // ── 修理ナノボット（HoT） ──
    case 'heal_over_time': {
      if (!state.player) break;
      const healDuration = (def as ItemDef & { healDuration?: number }).healDuration ?? 5;
      const healAmt = def.value;
      // 既存のHoTより強ければ上書き、弱ければ現状維持
      const currentTurnsLeft = nextState.player?.healTurnsLeft ?? 0;
      const currentHealAmt = nextState.player?.healPerTurn ?? 0;
      if (healAmt > currentHealAmt || healDuration > currentTurnsLeft) {
        nextState = {
          ...nextState,
          player: nextState.player
            ? { ...nextState.player, healPerTurn: healAmt, healTurnsLeft: healDuration }
            : nextState.player,
        };
      }
      return { nextState, log: `${itemName} を投入した（${healDuration}ターン間 +${healAmt}HP/ターン）` };
    }

    // ── ワープ系（GameCanvas.tsx で専用処理） ──
    case 'warp_down':
      return { nextState, log: `${itemName} を起動した（下階転送）` };
    case 'warp_up':
      return { nextState, log: `${itemName} を起動した（上階転送）` };
    case 'warp_random':
      return { nextState, log: `${itemName} を起動した（ランダムワープ）` };

    // ── 特殊 ──
    case 'identify_item': {
      const target = identifyTargetIndex !== undefined
        ? identifyTargetIndex
        : nextState.inventory.items.findIndex((it) => it.unidentified);
      if (target >= 0 && nextState.inventory.items[target]?.unidentified) {
        const identified = nextState.inventory.items[target];
        const targetDef = ITEM_DEFS.find((d) => d.id === identified.itemId);
        const revealItems = (targetDef as {revealItems?: string[]})?.revealItems;
        if (revealItems && revealItems.length > 0) {
          // Randomly pick a revealed item
          const revealedId = revealItems[Math.floor(Math.random() * revealItems.length)];
          const realName = getItemName(revealedId);
          const newItemsWithId = nextState.inventory.items.map((it, i) =>
            i === target ? { ...it, itemId: revealedId, unidentified: false } : it,
          );
          nextState = { ...nextState, inventory: { ...nextState.inventory, items: newItemsWithId } };
          return { nextState, log: `${itemName} を使用した（正体は ${realName} だった！）` };
        } else {
          // fallback: just mark as identified
          const realName = getItemName(identified.itemId);
          const newItemsWithId = nextState.inventory.items.map((it, i) =>
            i === target ? { ...it, unidentified: false } : it,
          );
          nextState = { ...nextState, inventory: { ...nextState.inventory, items: newItemsWithId } };
          return { nextState, log: `${itemName} を使用した（${realName} を鑑定）` };
        }
      }
      return { nextState, log: `${itemName} を使用したが、鑑定できるアイテムがない` };
    }
    case 'set_warp_point':
      return { nextState, log: `${itemName} を使用した（ワープポイント設定）` };
    case 'decoy':
      return { nextState, log: `${itemName} を使用した（デコイ展開）` };
    case 'reveal_enemies':
      return { nextState, log: `${itemName} を使用した（敵探知）` };

    default:
      break;
  }

  return { nextState, log: `${itemName} を使用した` };
}
