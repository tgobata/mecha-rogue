/**
 * @fileoverview スキルシステム
 *
 * プレイヤーのスキル習得・アクティブスキル使用・パッシブスキル適用・
 * クールダウン管理を純粋関数として提供する。
 *
 * 設計原則:
 * - 純粋関数。引数の GameState を直接変更せず、必ず新しいオブジェクトを返す。
 * - React 非依存。
 * - マジックナンバー禁止（constants.ts の定数を使う）。
 */

import type { GameState, SkillId, SkillInstance } from './game-state';
import {
  SKILL_POWER_STRIKE_COOLDOWN,
  SKILL_BARRIER_COOLDOWN,
  SKILL_OVERCHARGE_COOLDOWN,
  SKILL_BARRIER_DEF_BONUS,
  SKILL_REGEN_AMOUNT,
  SKILL_TOUGH_DAMAGE_REDUCTION,
  SKILL_TOUGH_MIN_DAMAGE,
  SKILL_OVERCHARGE_RANGE,
  SKILL_POWER_STRIKE_MULTIPLIER,
  // ティア閾値
  SKILL_BARRIER_UPGRADE_LEVELS,
  SKILL_POWER_STRIKE_UPGRADE_LEVELS,
  SKILL_REGEN_UPGRADE_LEVELS,
  SKILL_OVERCHARGE_UPGRADE_LEVELS,
  SKILL_TOUGH_UPGRADE_LEVELS,
  SKILL_SCAVENGER_UPGRADE_LEVELS,
  // ティア別パラメータ
  SKILL_BARRIER_DEF_BONUS_TIERS,
  SKILL_BARRIER_DURATION_TIERS,
  SKILL_BARRIER_COOLDOWN_TIERS,
  SKILL_POWER_STRIKE_MULTIPLIER_TIERS,
  SKILL_POWER_STRIKE_COOLDOWN_TIERS,
  SKILL_REGEN_AMOUNT_TIERS,
  SKILL_OVERCHARGE_RANGE_TIERS,
  SKILL_OVERCHARGE_DMG_MULTIPLIER_TIERS,
  SKILL_OVERCHARGE_COOLDOWN_TIERS,
  SKILL_TOUGH_DAMAGE_REDUCTION_TIERS,
  SKILL_SCAVENGER_DROP_BONUS_TIERS,
} from './constants';

// ---------------------------------------------------------------------------
// スキル定義
// ---------------------------------------------------------------------------

/**
 * スキルの静的定義情報。
 */
export interface Skill {
  /** スキルID */
  id: SkillId;
  /** 表示名 */
  name: string;
  /** 説明文（ティア0の基本値） */
  description: string;
  /** アクティブ or パッシブ */
  type: 'active' | 'passive';
  /** 習得可能になるレベル */
  unlockLevel: number;
  /** クールダウン（アクティブのみ。パッシブは undefined） */
  cooldown?: number;
}

/**
 * 全スキルの静的定義テーブル。
 * description・cooldown はティア0（基本）の値。実際の効果は getSkillTier を参照。
 */
const SKILL_DEFINITIONS: Skill[] = [
  {
    id: 'power_strike',
    name: 'パワーストライク',
    description: `ATK×${SKILL_POWER_STRIKE_MULTIPLIER} の一撃を繰り出す（CD${SKILL_POWER_STRIKE_COOLDOWN}ターン）`,
    type: 'active',
    unlockLevel: 3,
    cooldown: SKILL_POWER_STRIKE_COOLDOWN,
  },
  {
    id: 'barrier',
    name: 'バリア',
    description: `1ターン DEF+${SKILL_BARRIER_DEF_BONUS}（CD${SKILL_BARRIER_COOLDOWN}ターン）`,
    type: 'active',
    unlockLevel: 2,
    cooldown: SKILL_BARRIER_COOLDOWN,
  },
  {
    id: 'overcharge',
    name: 'オーバーチャージ',
    description: `前方${SKILL_OVERCHARGE_RANGE}マスを攻撃（CD${SKILL_OVERCHARGE_COOLDOWN}ターン）`,
    type: 'active',
    unlockLevel: 5,
    cooldown: SKILL_OVERCHARGE_COOLDOWN,
  },
  {
    id: 'passive_regen',
    name: 'リジェネ',
    description: `毎ターン HP+${SKILL_REGEN_AMOUNT} 回復する`,
    type: 'passive',
    unlockLevel: 4,
  },
  {
    id: 'passive_tough',
    name: 'タフネス',
    description: `受けるダメージを ${SKILL_TOUGH_DAMAGE_REDUCTION} 軽減する（最低${SKILL_TOUGH_MIN_DAMAGE}）`,
    type: 'passive',
    unlockLevel: 6,
  },
  {
    id: 'passive_scavenger',
    name: 'スカベンジャー',
    description: 'アイテムドロップ率 +20%',
    type: 'passive',
    unlockLevel: 8,
  },
];

// ---------------------------------------------------------------------------
// スキルアップグレードマップ（skillId → ティア到達Lv配列）
// ---------------------------------------------------------------------------

const SKILL_UPGRADE_LEVEL_MAP: Partial<Record<SkillId, readonly [number, number]>> = {
  barrier: SKILL_BARRIER_UPGRADE_LEVELS,
  power_strike: SKILL_POWER_STRIKE_UPGRADE_LEVELS,
  passive_regen: SKILL_REGEN_UPGRADE_LEVELS,
  overcharge: SKILL_OVERCHARGE_UPGRADE_LEVELS,
  passive_tough: SKILL_TOUGH_UPGRADE_LEVELS,
  passive_scavenger: SKILL_SCAVENGER_UPGRADE_LEVELS,
};

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * パイロットレベルに応じたスキルのティア（0〜2）を返す。
 * - ティア0: 習得直後（基本）
 * - ティア1: 第一強化（upgrade_levels[0] 到達）
 * - ティア2: 第二強化（upgrade_levels[1] 到達）
 *
 * @param skillId - スキルID
 * @param pilotLevel - 現在のパイロットレベル
 * @returns 0 | 1 | 2
 */
export function getSkillTier(skillId: SkillId, pilotLevel: number): 0 | 1 | 2 {
  const levels = SKILL_UPGRADE_LEVEL_MAP[skillId];
  if (!levels) return 0;
  if (pilotLevel >= levels[1]) return 2;
  if (pilotLevel >= levels[0]) return 1;
  return 0;
}

/**
 * 指定ティアのスキル説明文を返す。
 * スキル詳細 UI 等でティアに応じた現在値を表示するために使用する。
 *
 * @param skillId - スキルID
 * @param tier - ティア（0〜2）
 * @returns 説明文
 */
export function getSkillDescription(skillId: SkillId, tier: 0 | 1 | 2): string {
  switch (skillId) {
    case 'barrier': {
      const def = SKILL_BARRIER_DEF_BONUS_TIERS[tier];
      const dur = SKILL_BARRIER_DURATION_TIERS[tier];
      const cd  = SKILL_BARRIER_COOLDOWN_TIERS[tier];
      return `${dur}ターン DEF+${def}（CD${cd}ターン）`;
    }
    case 'power_strike': {
      const mult = SKILL_POWER_STRIKE_MULTIPLIER_TIERS[tier];
      const cd   = SKILL_POWER_STRIKE_COOLDOWN_TIERS[tier];
      return `ATK×${mult} の一撃を繰り出す（CD${cd}ターン）`;
    }
    case 'passive_regen': {
      const amt = SKILL_REGEN_AMOUNT_TIERS[tier];
      return `毎ターン HP+${amt} 回復する`;
    }
    case 'overcharge': {
      const range = SKILL_OVERCHARGE_RANGE_TIERS[tier];
      const mult  = SKILL_OVERCHARGE_DMG_MULTIPLIER_TIERS[tier];
      const cd    = SKILL_OVERCHARGE_COOLDOWN_TIERS[tier];
      const multStr = mult === 1 ? '' : `・ATK×${mult}`;
      return `前方${range}マスを攻撃${multStr}（CD${cd}ターン）`;
    }
    case 'passive_tough': {
      const red = SKILL_TOUGH_DAMAGE_REDUCTION_TIERS[tier];
      return `受けるダメージを ${red} 軽減する（最低${SKILL_TOUGH_MIN_DAMAGE}）`;
    }
    case 'passive_scavenger': {
      const bonus = Math.round(SKILL_SCAVENGER_DROP_BONUS_TIERS[tier] * 100);
      return `アイテムドロップ率 +${bonus}%`;
    }
    default:
      return getSkillDefinition(skillId)?.description ?? '';
  }
}

/**
 * 指定レベルで習得可能なスキルの一覧を返す。
 * unlockLevel <= level のスキルのみを返す。
 *
 * @param level - プレイヤーの現在レベル
 * @returns 習得可能なスキルの配列
 */
export function getAvailableSkills(level: number): Skill[] {
  return SKILL_DEFINITIONS.filter((s) => s.unlockLevel <= level);
}

/**
 * 指定スキルIDの Skill 定義を返す。
 * 定義が存在しない場合は undefined を返す。
 *
 * @param skillId - スキルID
 * @returns Skill 定義、または undefined
 */
export function getSkillDefinition(skillId: SkillId): Skill | undefined {
  return SKILL_DEFINITIONS.find((s) => s.id === skillId);
}

/**
 * スキルを習得する。
 * 既に習得済みの場合は state を変更せずそのまま返す。
 * unlockLevel に達していない場合も変更しない。
 *
 * @param state - 習得前の GameState
 * @param skillId - 習得するスキルID
 * @returns 習得後の新しい GameState
 */
export function learnSkill(state: GameState, skillId: SkillId): GameState {
  const def = getSkillDefinition(skillId);
  if (!def) return state;

  if (state.pilot.level < def.unlockLevel) return state;

  const alreadyLearned = state.skills.some((s) => s.id === skillId);
  if (alreadyLearned) return state;

  const newSkillInstance: SkillInstance = {
    id: skillId,
    cooldownRemaining: 0,
  };

  return {
    ...state,
    skills: [...state.skills, newSkillInstance],
  };
}

/**
 * アクティブスキルを使用する。
 * クールダウン中・未習得・パッシブスキルの場合は state を変更せずそのまま返す。
 *
 * 効果（ティアにより強化）:
 * - power_strike : player.atk を一時的に ATK×倍率 にする（倍率はティアで増加）
 * - barrier      : statusEffects に 'shielded' 状態を付与（DEF/持続/CDはティアで強化）
 * - overcharge   : battleLog に「overcharge 発動」ログを追加する
 *                  （ダメージ倍率・範囲はティアで強化。実処理は turn-system 側）
 *
 * @param state - 使用前の GameState
 * @param skillId - 使用するスキルID
 * @returns 使用後の新しい GameState
 */
export function useActiveSkill(state: GameState, skillId: SkillId): GameState {
  const def = getSkillDefinition(skillId);
  if (!def || def.type !== 'active') return state;

  const skillIdx = state.skills.findIndex((s) => s.id === skillId);
  if (skillIdx < 0) return state;

  const skillInst = state.skills[skillIdx];
  if (skillInst.cooldownRemaining > 0) return state;

  // パイロットレベルからティアを決定し、ティア別CDをセット
  const tier = getSkillTier(skillId, state.pilot.level);
  const actualCooldown = (() => {
    switch (skillId) {
      case 'barrier':      return SKILL_BARRIER_COOLDOWN_TIERS[tier];
      case 'power_strike': return SKILL_POWER_STRIKE_COOLDOWN_TIERS[tier];
      case 'overcharge':   return SKILL_OVERCHARGE_COOLDOWN_TIERS[tier];
      default:             return def.cooldown ?? 0;
    }
  })();

  const updatedSkills = state.skills.map((s, i) =>
    i === skillIdx ? { ...s, cooldownRemaining: actualCooldown } : s,
  );

  let newState: GameState = { ...state, skills: updatedSkills };

  switch (skillId) {
    case 'power_strike': {
      if (newState.player) {
        const multiplier = SKILL_POWER_STRIKE_MULTIPLIER_TIERS[tier];
        const boostedAtk = Math.round(newState.player.atk * multiplier);
        newState = {
          ...newState,
          player: { ...newState.player, atk: boostedAtk },
          battleLog: [
            ...(newState.battleLog ?? []),
            `パワーストライク発動！ATK ${newState.player.atk} → ${boostedAtk}`,
          ],
        };
      }
      break;
    }

    case 'barrier': {
      if (newState.player) {
        const defBonus  = SKILL_BARRIER_DEF_BONUS_TIERS[tier];
        const duration  = SKILL_BARRIER_DURATION_TIERS[tier];
        const currentEffects = newState.player.statusEffects ?? [];
        const filtered = currentEffects.filter((e) => e.type !== 'shielded');
        const barrierEffect = {
          type: 'shielded' as const,
          remainingTurns: duration,
          magnitude: defBonus,
        };
        newState = {
          ...newState,
          player: {
            ...newState.player,
            statusEffects: [...filtered, barrierEffect],
          },
          battleLog: [
            ...(newState.battleLog ?? []),
            `バリア発動！${duration}ターン DEF+${defBonus}`,
          ],
        };
      }
      break;
    }

    case 'overcharge': {
      const range = SKILL_OVERCHARGE_RANGE_TIERS[tier];
      const dmgMult = SKILL_OVERCHARGE_DMG_MULTIPLIER_TIERS[tier];
      const multStr = dmgMult === 1 ? '' : `（ATK×${dmgMult}）`;
      newState = {
        ...newState,
        battleLog: [
          ...(newState.battleLog ?? []),
          `オーバーチャージ発動！前方${range}マスを攻撃${multStr}`,
        ],
      };
      break;
    }

    default:
      break;
  }

  return newState;
}

/**
 * 毎ターン末にアクティブスキルのクールダウンを 1 減らす。
 * クールダウンが 0 の場合は変化なし（負にならない）。
 *
 * @param state - ターン処理後の GameState
 * @returns クールダウン更新後の新しい GameState
 */
export function tickSkillCooldowns(state: GameState): GameState {
  const updatedSkills = state.skills.map((s) => ({
    ...s,
    cooldownRemaining: Math.max(0, s.cooldownRemaining - 1),
  }));

  return { ...state, skills: updatedSkills };
}

/**
 * パッシブスキルの効果をプレイヤーに適用する。
 * ターン開始時などに呼び出す。
 *
 * 適用効果:
 * - passive_regen    : player.hp を ティア別回復量 回復する（maxHp を上限とする）
 * - passive_tough    : 効果はダメージ計算時に参照するため、ここでは何もしない
 * - passive_scavenger: ドロップ率への影響はドロップシステム側で参照するため、ここでは何もしない
 *
 * @param state - パッシブ適用前の GameState
 * @returns パッシブ適用後の新しい GameState
 */
export function applyPassiveSkills(state: GameState): GameState {
  const hasRegen = state.skills.some((s) => s.id === 'passive_regen');

  if (!hasRegen || !state.player) return state;

  const tier = getSkillTier('passive_regen', state.pilot.level);
  const regenAmount = SKILL_REGEN_AMOUNT_TIERS[tier];

  const newHp = Math.min(state.player.maxHp, state.player.hp + regenAmount);
  const newMachineHp = Math.min(state.machine.maxHp, state.machine.hp + regenAmount);

  return {
    ...state,
    player: { ...state.player, hp: newHp },
    machine: { ...state.machine, hp: newMachineHp },
  };
}

/**
 * passive_tough が習得済みかどうかを返す。
 * ダメージ計算時に呼び出してダメージを軽減する。
 *
 * @param state - 現在の GameState
 * @returns passive_tough が有効なら true
 */
export function hasToughPassive(state: GameState): boolean {
  return state.skills.some((s) => s.id === 'passive_tough');
}

/**
 * passive_tough のティア別ダメージ軽減量を返す。
 * 習得していない場合は 0 を返す。
 *
 * @param state - 現在の GameState
 * @returns ダメージ軽減量（0 = 無効）
 */
export function getToughDamageReduction(state: GameState): number {
  if (!hasToughPassive(state)) return 0;
  const tier = getSkillTier('passive_tough', state.pilot.level);
  return SKILL_TOUGH_DAMAGE_REDUCTION_TIERS[tier];
}

/**
 * passive_scavenger が習得済みかどうかを返す。
 * ドロップ計算時に呼び出してドロップ率ボーナスを適用する。
 *
 * @param state - 現在の GameState
 * @returns passive_scavenger が有効なら true
 */
export function hasScavengerPassive(state: GameState): boolean {
  return state.skills.some((s) => s.id === 'passive_scavenger');
}

/**
 * passive_scavenger のティア別ドロップ率ボーナスを返す（0〜1）。
 * 習得していない場合は 0 を返す。
 *
 * @param state - 現在の GameState
 * @returns ドロップ率ボーナス（0 = 無効）
 */
export function getScavengerDropBonus(state: GameState): number {
  if (!hasScavengerPassive(state)) return 0;
  const tier = getSkillTier('passive_scavenger', state.pilot.level);
  return SKILL_SCAVENGER_DROP_BONUS_TIERS[tier];
}
