/**
 * @fileoverview 修理屋システム
 *
 * 修理屋で武器・盾・防具を修理・強化する純粋関数を提供する。
 *
 * 制限:
 *  - 各装備につき修理は1回のみ（repairedAtShop フラグで管理）
 *  - 各装備につき強化は1回のみ（upgradedAtShop フラグで管理）
 *
 * 修理オプション（25% / 50% / 全回復）+ 確率的な特殊イベント:
 *  5%  : 失敗 — 耐久値が修理予定量の半分だけ逆に減少（下限 1）
 * 60%  : 成功 — 通常通りに修理
 * 25%  : 好調 — 修理量 + 10% ボーナス
 * 10%  : 最高 — 修理量 + maxDurability+5 ボーナス
 *
 * 強化オプション（ATK+2 / MaxDUR+10 / DEF+1）:
 *  費用 = maxDurability × 12 ゴールド（耐久なし武器は atk × 25）
 */

import type { GameState, WeaponInstance, EquippedShield, EquippedArmor } from './game-state';
import { REPAIR_COST_PER_DURABILITY } from './constants';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 修理オプション */
export type RepairOption = '25' | '50' | '100';

/** 強化オプション */
export type UpgradeOption = 'atk' | 'dur';

/** 修理/強化結果 */
export interface RepairResult {
  state: GameState;
  message: string;
}

/** 修理オプションの費用・回復量情報 */
export interface RepairOptionInfo {
  option: RepairOption;
  label: string;
  healAmount: number;
  cost: number;
  /** 無効理由: 'repaired'=修理済み, 'nodur'=耐久なし, 'full'=満タン, 'gold'=所持金不足, null=有効 */
  disabledReason: 'repaired' | 'nodur' | 'full' | 'gold' | null;
}

/** 強化オプションの情報 */
export interface UpgradeOptionInfo {
  option: UpgradeOption;
  label: string;
  description: string;
  cost: number;
  disabledReason: 'upgraded' | 'gold' | null;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function targetHeal(maxDur: number, option: RepairOption): number {
  if (option === '25') return Math.ceil(maxDur * 0.25);
  if (option === '50') return Math.ceil(maxDur * 0.50);
  return maxDur;
}

function upgradeCost(weapon: WeaponInstance): number {
  if (weapon.maxDurability !== null) {
    return weapon.maxDurability * 12;
  }
  return weapon.atk * 25;
}

function upgradeEquipCost(maxDurability: number): number {
  return maxDurability * 12;
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * 修理オプション情報を返す。
 */
export function getRepairOptions(weapon: WeaponInstance, gold: number): RepairOptionInfo[] {
  const options: RepairOption[] = ['25', '50', '100'];
  const maxDur = weapon.maxDurability;
  const curDur = weapon.durability;

  if (weapon.repairedAtShop) {
    return options.map((opt) => ({
      option: opt,
      label: opt === '25' ? '25%修理' : opt === '50' ? '50%修理' : '全回復',
      healAmount: 0,
      cost: 0,
      disabledReason: 'repaired' as const,
    }));
  }

  if (maxDur === null || curDur === null) {
    return options.map((opt) => ({
      option: opt,
      label: opt === '25' ? '25%修理' : opt === '50' ? '50%修理' : '全回復',
      healAmount: 0,
      cost: 0,
      disabledReason: 'nodur' as const,
    }));
  }

  const lost = maxDur - curDur;

  return options.map((opt) => {
    const heal = Math.min(targetHeal(maxDur, opt), lost);
    const cost = heal * REPAIR_COST_PER_DURABILITY;
    let disabledReason: RepairOptionInfo['disabledReason'] = null;
    if (lost <= 0) disabledReason = 'full';
    else if (gold < cost) disabledReason = 'gold';
    return {
      option: opt,
      label: opt === '25' ? '25%修理' : opt === '50' ? '50%修理' : '全回復',
      healAmount: heal,
      cost,
      disabledReason,
    };
  });
}

/**
 * 強化オプション情報を返す。
 */
export function getUpgradeOptions(weapon: WeaponInstance, gold: number): UpgradeOptionInfo[] {
  const cost = upgradeCost(weapon);
  const alreadyUpgraded = !!weapon.upgradedAtShop;
  return [
    {
      option: 'atk' as const,
      label: '攻撃強化',
      description: 'ATK +2',
      cost,
      disabledReason: alreadyUpgraded ? 'upgraded' : gold < cost ? 'gold' : null,
    },
    {
      option: 'dur' as const,
      label: '耐久強化',
      description: weapon.maxDurability !== null ? 'MaxDUR +10' : '（耐久なし武器は不可）',
      cost,
      disabledReason: alreadyUpgraded
        ? 'upgraded'
        : weapon.maxDurability === null
          ? 'upgraded' // 耐久なし武器は耐久強化不可（upgraded を流用して無効化）
          : gold < cost
            ? 'gold'
            : null,
    },
  ];
}

/**
 * 武器を修理する（確率的な特殊イベント付き、1回限り）。
 */
export function repairWeaponWithEvent(
  state: GameState,
  weaponIndex: number,
  option: RepairOption,
): RepairResult {
  const slots = state.player?.weaponSlots ?? [];
  if (weaponIndex < 0 || weaponIndex >= slots.length) {
    return { state, message: '修理対象が見つかりません。' };
  }

  const weapon = slots[weaponIndex];

  if (weapon.repairedAtShop) {
    return { state, message: `${weapon.name} はすでに修理済みです。` };
  }
  if (weapon.durability === null || weapon.maxDurability === null) {
    return { state, message: `${weapon.name} は耐久値がないため修理不要です。` };
  }

  const lost = weapon.maxDurability - weapon.durability;
  if (lost <= 0) {
    return { state, message: `${weapon.name} は既に最大耐久値です。` };
  }

  const baseHeal = Math.min(targetHeal(weapon.maxDurability, option), lost);
  const cost = baseHeal * REPAIR_COST_PER_DURABILITY;

  if (state.inventory.gold < cost) {
    return { state, message: 'ゴールドが足りません。' };
  }

  const newGold = state.inventory.gold - cost;

  // 確率イベント
  const roll = Math.random();
  let finalDur = weapon.durability;
  let newAtk = weapon.atk;
  let newMaxDur = weapon.maxDurability;
  let message: string;

  if (roll < 0.05) {
    const penalty = Math.max(1, Math.floor(baseHeal / 2));
    finalDur = Math.max(1, weapon.durability - penalty);
    message = `⚠ 修理失敗！${weapon.name} の耐久値が ${penalty} 低下してしまった…`;
  } else if (roll < 0.65) {
    finalDur = Math.min(weapon.maxDurability, weapon.durability + baseHeal);
    message = `✓ ${weapon.name} を修理した。（耐久 +${baseHeal}）`;
  } else if (roll < 0.90) {
    const bonus = Math.max(1, Math.floor(baseHeal * 0.10));
    finalDur = Math.min(weapon.maxDurability, weapon.durability + baseHeal + bonus);
    message = `★ ${weapon.name} の修理が好調！（耐久 +${baseHeal + bonus}）`;
  } else {
    finalDur = Math.min(weapon.maxDurability, weapon.durability + baseHeal);
    if (Math.random() < 0.5) {
      newAtk = weapon.atk + 1;
      message = `✦ 最高の仕上がり！${weapon.name} の攻撃力が 1 上昇！（耐久 +${baseHeal}、ATK +1）`;
    } else {
      newMaxDur = weapon.maxDurability + 5;
      finalDur = Math.min(newMaxDur, finalDur + 5);
      message = `✦ 最高の仕上がり！${weapon.name} の最大耐久値が 5 上昇！（耐久 +${baseHeal + 5}、MaxDUR +5）`;
    }
  }

  const repairedWeapon: WeaponInstance = {
    ...weapon,
    durability: finalDur,
    atk: newAtk,
    maxDurability: newMaxDur,
    repairedAtShop: true, // 1回限りフラグ
  };
  const newSlots = slots.map((w, i) => (i === weaponIndex ? repairedWeapon : w));

  const newEquipped = state.inventory.equippedWeapons.map((ew) => {
    if (ew.instanceId && weapon.instanceId && ew.instanceId === weapon.instanceId) {
      return { ...ew, durability: finalDur };
    }
    return ew;
  });

  return {
    state: {
      ...state,
      inventory: { ...state.inventory, gold: newGold, equippedWeapons: newEquipped },
      player: state.player ? { ...state.player, weaponSlots: newSlots } : state.player,
    },
    message,
  };
}

/**
 * 武器を強化する（1回限り）。
 */
export function upgradeWeapon(
  state: GameState,
  weaponIndex: number,
  option: UpgradeOption,
): RepairResult {
  const slots = state.player?.weaponSlots ?? [];
  if (weaponIndex < 0 || weaponIndex >= slots.length) {
    return { state, message: '強化対象が見つかりません。' };
  }

  const weapon = slots[weaponIndex];

  if (weapon.upgradedAtShop) {
    return { state, message: `${weapon.name} はすでに強化済みです。` };
  }
  if (option === 'dur' && weapon.maxDurability === null) {
    return { state, message: `${weapon.name} は耐久値がないため耐久強化できません。` };
  }

  const cost = upgradeCost(weapon);
  if (state.inventory.gold < cost) {
    return { state, message: 'ゴールドが足りません。' };
  }

  let upgradedWeapon: WeaponInstance;
  let message: string;

  if (option === 'atk') {
    upgradedWeapon = { ...weapon, atk: weapon.atk + 2, upgradedAtShop: true };
    message = `⚙ ${weapon.name} を強化！ATK が +2 上昇した。`;
  } else {
    const newMaxDur = (weapon.maxDurability ?? 0) + 10;
    upgradedWeapon = {
      ...weapon,
      maxDurability: newMaxDur,
      durability: Math.min((weapon.durability ?? 0) + 10, newMaxDur),
      upgradedAtShop: true,
    };
    message = `⚙ ${weapon.name} を強化！最大耐久値が +10 上昇した。`;
  }

  const newSlots = slots.map((w, i) => (i === weaponIndex ? upgradedWeapon : w));

  return {
    state: {
      ...state,
      inventory: { ...state.inventory, gold: state.inventory.gold - cost },
      player: state.player ? { ...state.player, weaponSlots: newSlots } : state.player,
    },
    message,
  };
}

// ---------------------------------------------------------------------------
// 盾 修理 / 強化
// ---------------------------------------------------------------------------

/** 盾の修理オプション情報を返す */
export function getRepairOptionsForShield(shield: EquippedShield, gold: number): RepairOptionInfo[] {
  const options: RepairOption[] = ['25', '50', '100'];
  const maxDur = shield.maxDurability;
  const curDur = shield.durability;

  if (shield.repairedAtShop) {
    return options.map((opt) => ({
      option: opt,
      label: opt === '25' ? '25%修理' : opt === '50' ? '50%修理' : '全回復',
      healAmount: 0,
      cost: 0,
      disabledReason: 'repaired' as const,
    }));
  }

  const lost = maxDur - curDur;
  return options.map((opt) => {
    const heal = Math.min(targetHeal(maxDur, opt), lost);
    const cost = heal * REPAIR_COST_PER_DURABILITY;
    let disabledReason: RepairOptionInfo['disabledReason'] = null;
    if (lost <= 0) disabledReason = 'full';
    else if (gold < cost) disabledReason = 'gold';
    return {
      option: opt,
      label: opt === '25' ? '25%修理' : opt === '50' ? '50%修理' : '全回復',
      healAmount: heal,
      cost,
      disabledReason,
    };
  });
}

/** 盾の強化オプション情報を返す */
export function getUpgradeOptionsForShield(shield: EquippedShield, gold: number): UpgradeOptionInfo[] {
  const cost = upgradeEquipCost(shield.maxDurability);
  const alreadyUpgraded = !!shield.upgradedAtShop;
  return [
    {
      option: 'atk' as const,
      label: '防御強化',
      description: 'DEF +1',
      cost,
      disabledReason: alreadyUpgraded ? 'upgraded' : gold < cost ? 'gold' : null,
    },
    {
      option: 'dur' as const,
      label: '耐久強化',
      description: 'MaxDUR +10',
      cost,
      disabledReason: alreadyUpgraded ? 'upgraded' : gold < cost ? 'gold' : null,
    },
  ];
}

/** 盾を修理する（確率イベント付き、1回限り） */
export function repairShieldWithEvent(
  state: GameState,
  shieldIndex: number,
  option: RepairOption,
): RepairResult {
  const slots = state.player?.shieldSlots ?? [];
  if (shieldIndex < 0 || shieldIndex >= slots.length) {
    return { state, message: '修理対象が見つかりません。' };
  }
  const shield = slots[shieldIndex];
  if (shield.repairedAtShop) {
    return { state, message: `${shield.name} はすでに修理済みです。` };
  }
  const lost = shield.maxDurability - shield.durability;
  if (lost <= 0) {
    return { state, message: `${shield.name} は既に最大耐久値です。` };
  }
  const baseHeal = Math.min(targetHeal(shield.maxDurability, option), lost);
  const cost = baseHeal * REPAIR_COST_PER_DURABILITY;
  if (state.inventory.gold < cost) {
    return { state, message: 'ゴールドが足りません。' };
  }
  const newGold = state.inventory.gold - cost;
  const roll = Math.random();
  let finalDur = shield.durability;
  let newMaxDur = shield.maxDurability;
  let message: string;

  if (roll < 0.05) {
    const penalty = Math.max(1, Math.floor(baseHeal / 2));
    finalDur = Math.max(1, shield.durability - penalty);
    message = `⚠ 修理失敗！${shield.name} の耐久値が ${penalty} 低下してしまった…`;
  } else if (roll < 0.65) {
    finalDur = Math.min(shield.maxDurability, shield.durability + baseHeal);
    message = `✓ ${shield.name} を修理した。（耐久 +${baseHeal}）`;
  } else if (roll < 0.90) {
    const bonus = Math.max(1, Math.floor(baseHeal * 0.10));
    finalDur = Math.min(shield.maxDurability, shield.durability + baseHeal + bonus);
    message = `★ ${shield.name} の修理が好調！（耐久 +${baseHeal + bonus}）`;
  } else {
    newMaxDur = shield.maxDurability + 5;
    finalDur = Math.min(newMaxDur, shield.durability + baseHeal + 5);
    message = `✦ 最高の仕上がり！${shield.name} の最大耐久値が 5 上昇！（耐久 +${baseHeal + 5}、MaxDUR +5）`;
  }

  const repairedShield: EquippedShield = {
    ...shield,
    durability: finalDur,
    maxDurability: newMaxDur,
    repairedAtShop: true,
  };
  const newShieldSlots = slots.map((s, i) => (i === shieldIndex ? repairedShield : s));
  const newEquippedShields = (state.inventory.equippedShields ?? []).map((es) =>
    es.instanceId && shield.instanceId && es.instanceId === shield.instanceId
      ? { ...es, durability: finalDur, maxDurability: newMaxDur }
      : es,
  );

  return {
    state: {
      ...state,
      inventory: { ...state.inventory, gold: newGold, equippedShields: newEquippedShields },
      player: state.player ? { ...state.player, shieldSlots: newShieldSlots } : state.player,
    },
    message,
  };
}

/** 盾を強化する（1回限り） */
export function upgradeShield(
  state: GameState,
  shieldIndex: number,
  option: UpgradeOption,
): RepairResult {
  const slots = state.player?.shieldSlots ?? [];
  if (shieldIndex < 0 || shieldIndex >= slots.length) {
    return { state, message: '強化対象が見つかりません。' };
  }
  const shield = slots[shieldIndex];
  if (shield.upgradedAtShop) {
    return { state, message: `${shield.name} はすでに強化済みです。` };
  }
  const cost = upgradeEquipCost(shield.maxDurability);
  if (state.inventory.gold < cost) {
    return { state, message: 'ゴールドが足りません。' };
  }

  let upgradedShield: EquippedShield;
  let message: string;

  if (option === 'atk') {
    upgradedShield = { ...shield, def: shield.def + 1, upgradedAtShop: true };
    message = `⚙ ${shield.name} を強化！DEF が +1 上昇した。`;
  } else {
    const newMaxDur = shield.maxDurability + 10;
    upgradedShield = {
      ...shield,
      maxDurability: newMaxDur,
      durability: Math.min(shield.durability + 10, newMaxDur),
      upgradedAtShop: true,
    };
    message = `⚙ ${shield.name} を強化！最大耐久値が +10 上昇した。`;
  }

  const newShieldSlots = slots.map((s, i) => (i === shieldIndex ? upgradedShield : s));

  return {
    state: {
      ...state,
      inventory: { ...state.inventory, gold: state.inventory.gold - cost },
      player: state.player ? { ...state.player, shieldSlots: newShieldSlots } : state.player,
    },
    message,
  };
}

// ---------------------------------------------------------------------------
// 防具 修理 / 強化
// ---------------------------------------------------------------------------

/** 防具の修理オプション情報を返す */
export function getRepairOptionsForArmor(armor: EquippedArmor, gold: number): RepairOptionInfo[] {
  const options: RepairOption[] = ['25', '50', '100'];
  const maxDur = armor.maxDurability;
  const curDur = armor.durability;

  if (armor.repairedAtShop) {
    return options.map((opt) => ({
      option: opt,
      label: opt === '25' ? '25%修理' : opt === '50' ? '50%修理' : '全回復',
      healAmount: 0,
      cost: 0,
      disabledReason: 'repaired' as const,
    }));
  }

  const lost = maxDur - curDur;
  return options.map((opt) => {
    const heal = Math.min(targetHeal(maxDur, opt), lost);
    const cost = heal * REPAIR_COST_PER_DURABILITY;
    let disabledReason: RepairOptionInfo['disabledReason'] = null;
    if (lost <= 0) disabledReason = 'full';
    else if (gold < cost) disabledReason = 'gold';
    return {
      option: opt,
      label: opt === '25' ? '25%修理' : opt === '50' ? '50%修理' : '全回復',
      healAmount: heal,
      cost,
      disabledReason,
    };
  });
}

/** 防具の強化オプション情報を返す */
export function getUpgradeOptionsForArmor(armor: EquippedArmor, gold: number): UpgradeOptionInfo[] {
  const cost = upgradeEquipCost(armor.maxDurability);
  const alreadyUpgraded = !!armor.upgradedAtShop;
  return [
    {
      option: 'atk' as const,
      label: '防御強化',
      description: 'DEF +1',
      cost,
      disabledReason: alreadyUpgraded ? 'upgraded' : gold < cost ? 'gold' : null,
    },
    {
      option: 'dur' as const,
      label: '耐久強化',
      description: 'MaxDUR +10',
      cost,
      disabledReason: alreadyUpgraded ? 'upgraded' : gold < cost ? 'gold' : null,
    },
  ];
}

/** 防具を修理する（確率イベント付き、1回限り） */
export function repairArmorWithEvent(
  state: GameState,
  armorIndex: number,
  option: RepairOption,
): RepairResult {
  const slots = state.player?.armorSlots ?? [];
  if (armorIndex < 0 || armorIndex >= slots.length) {
    return { state, message: '修理対象が見つかりません。' };
  }
  const armor = slots[armorIndex];
  if (armor.repairedAtShop) {
    return { state, message: `${armor.name} はすでに修理済みです。` };
  }
  const lost = armor.maxDurability - armor.durability;
  if (lost <= 0) {
    return { state, message: `${armor.name} は既に最大耐久値です。` };
  }
  const baseHeal = Math.min(targetHeal(armor.maxDurability, option), lost);
  const cost = baseHeal * REPAIR_COST_PER_DURABILITY;
  if (state.inventory.gold < cost) {
    return { state, message: 'ゴールドが足りません。' };
  }
  const newGold = state.inventory.gold - cost;
  const roll = Math.random();
  let finalDur = armor.durability;
  let newMaxDur = armor.maxDurability;
  let message: string;

  if (roll < 0.05) {
    const penalty = Math.max(1, Math.floor(baseHeal / 2));
    finalDur = Math.max(1, armor.durability - penalty);
    message = `⚠ 修理失敗！${armor.name} の耐久値が ${penalty} 低下してしまった…`;
  } else if (roll < 0.65) {
    finalDur = Math.min(armor.maxDurability, armor.durability + baseHeal);
    message = `✓ ${armor.name} を修理した。（耐久 +${baseHeal}）`;
  } else if (roll < 0.90) {
    const bonus = Math.max(1, Math.floor(baseHeal * 0.10));
    finalDur = Math.min(armor.maxDurability, armor.durability + baseHeal + bonus);
    message = `★ ${armor.name} の修理が好調！（耐久 +${baseHeal + bonus}）`;
  } else {
    newMaxDur = armor.maxDurability + 5;
    finalDur = Math.min(newMaxDur, armor.durability + baseHeal + 5);
    message = `✦ 最高の仕上がり！${armor.name} の最大耐久値が 5 上昇！（耐久 +${baseHeal + 5}、MaxDUR +5）`;
  }

  const repairedArmor: EquippedArmor = {
    ...armor,
    durability: finalDur,
    maxDurability: newMaxDur,
    repairedAtShop: true,
  };
  const newArmorSlots = slots.map((a, i) => (i === armorIndex ? repairedArmor : a));
  const newEquippedArmors = (state.inventory.equippedArmors ?? []).map((ea) =>
    ea.instanceId && armor.instanceId && ea.instanceId === armor.instanceId
      ? { ...ea, durability: finalDur, maxDurability: newMaxDur }
      : ea,
  );

  return {
    state: {
      ...state,
      inventory: { ...state.inventory, gold: newGold, equippedArmors: newEquippedArmors },
      player: state.player ? { ...state.player, armorSlots: newArmorSlots } : state.player,
    },
    message,
  };
}

/** 防具を強化する（1回限り） */
export function upgradeArmor(
  state: GameState,
  armorIndex: number,
  option: UpgradeOption,
): RepairResult {
  const slots = state.player?.armorSlots ?? [];
  if (armorIndex < 0 || armorIndex >= slots.length) {
    return { state, message: '強化対象が見つかりません。' };
  }
  const armor = slots[armorIndex];
  if (armor.upgradedAtShop) {
    return { state, message: `${armor.name} はすでに強化済みです。` };
  }
  const cost = upgradeEquipCost(armor.maxDurability);
  if (state.inventory.gold < cost) {
    return { state, message: 'ゴールドが足りません。' };
  }

  let upgradedArmor: EquippedArmor;
  let message: string;

  if (option === 'atk') {
    upgradedArmor = { ...armor, def: armor.def + 1, upgradedAtShop: true };
    message = `⚙ ${armor.name} を強化！DEF が +1 上昇した。`;
  } else {
    const newMaxDur = armor.maxDurability + 10;
    upgradedArmor = {
      ...armor,
      maxDurability: newMaxDur,
      durability: Math.min(armor.durability + 10, newMaxDur),
      upgradedAtShop: true,
    };
    message = `⚙ ${armor.name} を強化！最大耐久値が +10 上昇した。`;
  }

  const newArmorSlots = slots.map((a, i) => (i === armorIndex ? upgradedArmor : a));

  return {
    state: {
      ...state,
      inventory: { ...state.inventory, gold: state.inventory.gold - cost },
      player: state.player ? { ...state.player, armorSlots: newArmorSlots } : state.player,
    },
    message,
  };
}
