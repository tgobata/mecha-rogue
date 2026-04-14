/**
 * @fileoverview 道具システム
 *
 * tools-equipment.json からインスタンス生成、使用・装備の処理を担う。
 * 純粋関数のみ。副作用なし。
 */

import toolsRaw from '../assets/data/tools-equipment.json';
import itemsRaw from '../assets/data/items.json';
import type { ToolInstance, ToolCategory, StatusEffect } from './game-state';
import type { GameState } from './game-state';
import { updateVisibility } from './visibility';
import { VIEW_RADIUS } from './constants';

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

    case 'phase_through_wall': {
      // フェイズシフター: 次の移動で壁を1枚すり抜けられるチャージを付与
      const currentCharges = (state.player?.phaseThroughTurns ?? 0);
      return {
        ...state,
        player: state.player
          ? { ...state.player, phaseThroughTurns: currentCharges + 1 }
          : state.player,
      };
    }

    default:
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

/**
 * アイテムIDから効果の簡潔な数値付きサマリーを生成する。
 * items.json / tools-equipment.json 両方に対応。
 * 未鑑定・不明の場合は null を返す。
 */
export function getItemEffectSummary(itemId: string): string | null {
  const def: any =
    (ITEM_DEFS as any[]).find((d) => d.id === itemId) ??
    (TOOL_DEFS as any[]).find((d) => d.id === itemId);
  if (!def) return null;

  const v: number = def.value ?? 0;
  const eff: string = def.effect ?? '';

  const bombRange = (r: number): string => {
    if (r === 0) return '単体';
    if (r === 1) return '十字5マス';
    if (r === 2) return '3×3範囲';
    return '5×5範囲';
  };

  switch (eff) {
    // ── 回復 ───────────────────────────────────────────────────
    case 'hp_restore':      return `HP +${v}`;
    case 'hp_restore_full': return 'HP 全回復';
    case 'energy_restore':  return `EN +${v}`;
    case 'heal_over_time':  return `HP +${v}/ターン × ${def.healDuration ?? '?'}ターン（合計 ${v * (def.healDuration ?? 1)}）`;

    // ── 武器・装備修理 ─────────────────────────────────────────
    case 'weapon_durability_restore_full': return '装備武器 耐久全回復';
    case 'shield_durability_restore_full': return '装備盾 耐久全回復';
    case 'armor_durability_restore_full':  return '装備防具 耐久全回復';

    // ── 強化素材 ───────────────────────────────────────────────
    case 'weapon_upgrade_material': {
      const needed = def.tier === 1 ? 3 : def.tier === 2 ? 3 : '5 / 10';
      return `強化素材 Tier${def.tier ?? '?'}（必要数: ${needed}個）`;
    }

    // ── 探索 ───────────────────────────────────────────────────
    case 'reveal_floor':    return 'フロア地形を全開示';
    case 'reveal_enemies':  return '全敵の位置を開示';
    case 'identify_item':   return '未鑑定アイテム 1個を鑑定';

    // ── 移動・ワープ ───────────────────────────────────────────
    case 'return_to_start': return 'スタート地点へ即帰還';
    case 'set_warp_point':  return 'ワープ地点設置（1フロア限定）';
    case 'warp_down':       return '1階層下へ転送';
    case 'warp_up':         return '1階層上へ転送';
    case 'warp_random':     return '現フロアのランダム位置へ転送';

    // ── 戦闘補助 ──────────────────────────────────────────────
    case 'speed_up':
      return def.passive
        ? `移動速度 +${v}（常時）`
        : `速度 +${v} / ${def.duration ?? '?'}ターン`;
    case 'damage_nullify':      return `ダメージを${v}回 無効化`;
    case 'boss_damage_up':      return `ボスへのダメージ ×${v} / ${def.duration ?? '?'}ターン`;
    case 'enemy_lose_tracking': return `敵の追跡を無効化 / ${v}ターン`;
    case 'stun_area':           return `3×3範囲の敵を${v}ターン行動不能`;
    case 'stun_radius_2':       return `周囲${def.radius ?? 2}マスの敵を${v}ターン行動不能`;
    case 'decoy':               return `デコイ展開 ${def.duration ?? v}ターン（敵の注意を誘導）`;
    case 'decoy_ball':
      return `命中した敵を身代わり状態 ${def.stunTurns ?? 3}ターン（他の敵がその敵をプレイヤーと見なして攻撃）＋微量ダメージ ${v}。外れたら着地点に置かれる。「使う」は隣接敵に同命中率で発動`;
    case 'confusion_ball':
      return `命中した敵を混乱状態 ${def.stunTurns ?? 3}ターン（敵味方問わずランダムに攻撃）＋微量ダメージ ${v}。外れたら着地点に置かれる。「使う」は隣接敵に同命中率で発動`;

    // ── 爆弾・投擲 ────────────────────────────────────────────
    case 'place_bomb':
      return `${def.bombDelay ?? 2}ターン後爆発 / ${bombRange(def.bombRadius ?? 0)} / ダメージ ${v}`;
    case 'throw_bomb':
      return `投擲即爆発 / ${bombRange(def.bombRadius ?? 0)} / ダメージ ${v}`;
    case 'ice_bomb':
      return `投擲爆発 / ${bombRange(def.bombRadius ?? 0)} / ダメージ ${v} + ${def.frozenTurns ?? 1}ターン凍結`;
    case 'flash_grenade':
      return `周囲${def.flashRadius ?? 1}マスの敵を${def.stunTurns ?? 1}ターン行動不能`;

    // ── 機体強化（永続消費） ───────────────────────────────────
    case 'armor_up':           return `装甲 +${v}（永続）`;
    case 'speed_up_permanent': return `移動速度 +${v}（永続）`;
    case 'weapon_slot_up':     return '武器スロット +1（永続）';
    case 'tool_slot_up':       return '道具スロット +1（永続）';
    case 'armor_slot_up':      return 'アーマースロット +1（永続）';
    case 'shield_slot_up':     return 'シールドスロット +1（永続）';
    case 'pouch_capacity_up':  return `アイテムポーチ容量 +${v}（永続）`;
    case 'energy_max_up':      return `最大EN +${v}（永続）`;
    case 'max_hp_up':          return `最大HP +${v}（永続）`;
    case 'warehouse_expansion':return '倉庫スロット拡張';

    // ── 売却専用素材 ──────────────────────────────────────────
    case 'sell_only':          return `売却専用 / 売値 ${def.sellPrice ?? v}G`;

    // ── 未鑑定 ────────────────────────────────────────────────
    case 'unknown': return null;

    // ── 道具スロット装備（tools-equipment.json） ──────────────
    case 'view_radius_up':            return `視界半径 +${v}（装備中常時）`;
    case 'enemy_radar':               return '視界外の敵をミニマップに表示（装備中常時）';
    case 'trap_visible':              return '隠し罠を可視化（装備中常時）';
    case 'damage_reduce_percent':     return `全被ダメージ -${v}%（装備中常時）`;
    case 'lava_immune':               return '溶岩ダメージを無効化（装備中常時）';
    case 'ice_slide_immune':          return '氷面の滑りを無効化（装備中常時）';
    case 'magnetic_tile_immune':      return '磁場タイルの効果を無効化（装備中常時）';
    case 'critical_rate_up':          return `クリティカル率 +${v}%（装備中常時）`;
    case 'double_action_on_atk':      return `攻撃後 ${Math.round(v * 100)}%の確率で追加行動（装備中常時）`;
    case 'all_weapon_atk_up_percent': return `全武器の攻撃力 +${v}%（装備中常時）`;
    case 'energy_regen_per_turn':     return `EN +${v}/ターン（装備中常時）`;
    case 'auto_collect_radius':       return `${v}タイル以内のアイテムを自動収集（装備中常時）`;
    case 'exp_gain_up_percent':       return `EXP獲得量 +${v}%（装備中常時）`;
    case 'hp_regen_per_turn':         return `HP +${v}/ターン（装備中常時）`;
    case 'damage_nullify_periodic':   return `${def.cooldownTurns ?? 3}ターンに1回 ダメージを1回無効（装備中常時）`;
    case 'atk_x2_at_low_hp':         return `HP ${Math.round((def.hpThreshold ?? 0.2) * 100)}%以下で攻撃力 ×${v}（装備中常時）`;
    case 'phase_through_wall':        return `${def.cooldownTurns ?? 3}ターンに1回 壁をすり抜けて移動（装備中常時）`;

    default: return null;
  }
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
    case 'armor_slot_up': {
      const newSlots = Math.min(3, machine.armorSlots + def.value);
      nextState = { ...nextState, machine: { ...machine, armorSlots: newSlots } };
      return { nextState, log: `${itemName} を適用した（アーマースロット +${def.value}）` };
    }
    case 'shield_slot_up': {
      const newSlots = Math.min(3, machine.shieldSlots + def.value);
      nextState = { ...nextState, machine: { ...machine, shieldSlots: newSlots } };
      return { nextState, log: `${itemName} を適用した（シールドスロット +${def.value}）` };
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

    case 'shield_durability_restore_full': {
      const targetShield = player?.shieldSlots?.[0] ?? null;
      if (!targetShield) {
        return { nextState: state, log: `${itemName}: 盾を所持していません` };
      }
      const repairedShield = { ...targetShield, durability: targetShield.maxDurability };
      const newShieldSlots = player?.shieldSlots?.map((s) =>
        s.instanceId && s.instanceId === targetShield.instanceId ? repairedShield : s,
      ) ?? [];
      const newEquippedShields = (nextState.inventory.equippedShields ?? []).map((es) =>
        es.instanceId && es.instanceId === targetShield.instanceId
          ? { ...es, durability: targetShield.maxDurability }
          : es,
      );
      nextState = {
        ...nextState,
        inventory: { ...nextState.inventory, equippedShields: newEquippedShields },
        player: player ? { ...player, shieldSlots: newShieldSlots } : player,
      };
      return { nextState, log: `${itemName} を使用した（${targetShield.name} の耐久度を全回復）` };
    }

    case 'armor_durability_restore_full': {
      const targetArmor = player?.armorSlots?.[0] ?? null;
      if (!targetArmor) {
        return { nextState: state, log: `${itemName}: 防具を所持していません` };
      }
      const repairedArmor = { ...targetArmor, durability: targetArmor.maxDurability };
      const newArmorSlots = player?.armorSlots?.map((a) =>
        a.instanceId && a.instanceId === targetArmor.instanceId ? repairedArmor : a,
      ) ?? [];
      const newEquippedArmors = (nextState.inventory.equippedArmors ?? []).map((ea) =>
        ea.instanceId && ea.instanceId === targetArmor.instanceId
          ? { ...ea, durability: targetArmor.maxDurability }
          : ea,
      );
      nextState = {
        ...nextState,
        inventory: { ...nextState.inventory, equippedArmors: newEquippedArmors },
        player: player ? { ...player, armorSlots: newArmorSlots } : player,
      };
      return { nextState, log: `${itemName} を使用した（${targetArmor.name} の耐久度を全回復）` };
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
    case 'reveal_floor': {
      if (nextState.map) {
        const revealedCells = nextState.map.cells.map((row) =>
          row.map((cell) => ({ ...cell, isVisible: true, isExplored: true })),
        );
        nextState = { ...nextState, map: { ...nextState.map, cells: revealedCells } };
      }
      return { nextState, log: `${itemName} を使用した（フロアマップを解析）` };
    }

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
    case 'stun_area': {
      if (!player) break;
      const areaRadius = (def as any).radius ?? 1;
      const areaTurns = def.value;
      const areaEffect: StatusEffect = { type: 'stunned', remainingTurns: areaTurns, sourceId: def.id };
      let areaCount = 0;
      const empEnemies = nextState.enemies.map((e) => {
        if (e.hp <= 0) return e;
        if (Math.max(Math.abs(e.pos.x - player.pos.x), Math.abs(e.pos.y - player.pos.y)) <= areaRadius) {
          areaCount++;
          const effects = [...(e.statusEffects ?? []).filter((s) => s.type !== 'stunned'), areaEffect];
          return { ...e, statusEffects: effects };
        }
        return e;
      });
      nextState = { ...nextState, enemies: empEnemies };
      return {
        nextState,
        log: areaCount > 0
          ? `${itemName} を使用した（EMP爆発！ ${areaCount}体を${areaTurns}ターンスタン）`
          : `${itemName} を使用した（周囲に敵なし）`,
      };
    }
    case 'stun_radius_2': {
      if (!player) break;
      const flashRadius = (def as any).radius ?? 2;
      const flashTurns = def.value;
      const flashEffect: StatusEffect = { type: 'stunned', remainingTurns: flashTurns, sourceId: def.id };
      let flashCount = 0;
      const flashEnemies = nextState.enemies.map((e) => {
        if (e.hp <= 0) return e;
        const dist = Math.max(Math.abs(e.pos.x - player.pos.x), Math.abs(e.pos.y - player.pos.y));
        if (dist <= flashRadius) {
          flashCount++;
          const effects = [...(e.statusEffects ?? []).filter((s) => s.type !== 'stunned'), flashEffect];
          return { ...e, statusEffects: effects };
        }
        return e;
      });
      nextState = { ...nextState, enemies: flashEnemies };
      return {
        nextState,
        log: flashCount > 0
          ? `${itemName} を使用した（閃光炸裂！ ${flashCount}体を${flashTurns}ターンスタン）`
          : `${itemName} を使用した（周囲に敵なし）`,
      };
    }
    case 'speed_up': {
      const boostDuration = (def as any).duration ?? 5;
      const boostVal = def.value;
      // 移動速度を一時的に増加（上限5）し、残りターンを記録
      const newSpeed = Math.min(5, machine.moveSpeed + boostVal);
      nextState = {
        ...nextState,
        machine: { ...machine, moveSpeed: newSpeed },
        player: player ? { ...player, speedBoostTurns: (player.speedBoostTurns ?? 0) + boostDuration } : player,
      };
      return { nextState, log: `${itemName} を使用した（移動速度 +${boostVal}、${boostDuration}ターン）` };
    }
    case 'damage_nullify': {
      const charges = def.value;
      nextState = {
        ...nextState,
        player: player ? { ...player, nullifyCharges: (player.nullifyCharges ?? 0) + charges } : player,
      };
      return { nextState, log: `${itemName} を使用した（次の${charges}回のダメージを無効化）` };
    }
    case 'boss_damage_up': {
      const boostTurns = (def as any).duration ?? 5;
      const boostMult = def.value;
      nextState = {
        ...nextState,
        player: player
          ? { ...player, bossBoostTurns: (player.bossBoostTurns ?? 0) + boostTurns, bossBoostMult: boostMult }
          : player,
      };
      return { nextState, log: `${itemName} を使用した（ボスへのダメージ ×${boostMult}、${boostTurns}ターン）` };
    }

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

    // ── スタート帰還 ──
    case 'return_to_start': {
      if (!player || !nextState.map) break;
      const startPos = nextState.map.startPos;
      const updatedMap = updateVisibility(nextState.map, startPos, VIEW_RADIUS);
      nextState = {
        ...nextState,
        map: updatedMap,
        player: { ...player, pos: startPos, animState: 'move' as const },
        exploration: nextState.exploration
          ? { ...nextState.exploration, playerPos: startPos, currentFloor: updatedMap }
          : nextState.exploration,
      };
      return { nextState, log: `${itemName} を起動した（スタート地点へ帰還）` };
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
    case 'set_warp_point': {
      if (!player) break;
      const savedPos = { ...player.pos };
      nextState = { ...nextState, warpPoint: savedPos };
      return { nextState, log: `${itemName} を設置した（座標 ${savedPos.x},${savedPos.y} にビーコン設置）` };
    }
    case 'decoy':
      return { nextState, log: `${itemName} を使用した（デコイ展開）` };

    // ── 身代わりボール: 隣接するランダムな敵へ投げ命中率で効果発動 ──
    case 'decoy_ball':
    case 'confusion_ball': {
      if (!player) break;
      const adjacentEnemies = (nextState.enemies ?? []).filter(e =>
        e.hp > 0 &&
        Math.abs(e.pos.x - player.pos.x) + Math.abs(e.pos.y - player.pos.y) === 1
      );
      if (adjacentEnemies.length === 0) {
        return { nextState, log: `${itemName} を使おうとしたが、隣に敵がいない。アイテムは消えた。` };
      }
      const target = adjacentEnemies[Math.floor(Math.random() * adjacentEnemies.length)];
      const hitChance = 0.88 + Math.random() * (0.96 - 0.88);
      if (Math.random() >= hitChance) {
        return { nextState, log: `${itemName} を使ったが命中しなかった。アイテムは消えた。` };
      }
      const turns: number = (def as any).stunTurns ?? 3;
      const dmg = Math.max(1, ((def as any).value ?? 3) - (target.def ?? 0));
      const effType = def.effect === 'decoy_ball' ? 'decoy' : 'confused';
      const effLabel = effType === 'decoy' ? '身代わり' : '混乱';
      const newEnemies = nextState.enemies.map(e => {
        if (e.id !== target.id) return e;
        const damagedHp = Math.max(0, e.hp - dmg);
        const eff: StatusEffect = { type: effType as any, remainingTurns: turns, sourceId: def.id };
        const effects = [...(e.statusEffects ?? []).filter(s => s.type !== effType), eff];
        return { ...e, hp: damagedHp, statusEffects: effects };
      });
      nextState = { ...nextState, enemies: newEnemies };
      return { nextState, log: `${target.name ?? target.enemyType} に${dmg}ダメージ！${effLabel}状態（${turns}ターン）！` };
    }

    case 'reveal_enemies': {
      // 生存している全敵の立っているセルを可視化（マップ上でも確認可能に）
      if (nextState.map) {
        const revCells = nextState.map.cells.map((row) => row.map((c) => ({ ...c })));
        let count = 0;
        for (const e of nextState.enemies) {
          if (e.hp <= 0) continue;
          const cell = revCells[e.pos.y]?.[e.pos.x];
          if (cell && !cell.isVisible) {
            revCells[e.pos.y][e.pos.x] = { ...cell, isVisible: true, isExplored: true };
            count++;
          }
        }
        nextState = { ...nextState, map: { ...nextState.map, cells: revCells } };
        const msg = count > 0
          ? `${itemName} を使用した（${nextState.enemies.filter(e => e.hp > 0).length}体の敵を探知）`
          : `${itemName} を使用した（周囲に隠れた敵はいない）`;
        return { nextState, log: msg };
      }
      return { nextState, log: `${itemName} を使用した（敵探知）` };
    }

    default:
      break;
  }

  return { nextState, log: `${itemName} を使用した` };
}
