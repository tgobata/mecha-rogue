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
  /** 説明文 */
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
// 公開 API
// ---------------------------------------------------------------------------

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
 * 効果:
 * - power_strike : player.atk を一時的に ATK×2 倍にする（battleLog に記録）
 * - barrier      : statusEffects に 'shielded' 状態を付与する
 * - overcharge   : battleLog に「overcharge 発動」ログを追加する
 *                  （実際の範囲攻撃ダメージは turn-system 側で battleLog を参照して処理する想定）
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

  // クールダウンをセット
  const updatedSkills = state.skills.map((s, i) =>
    i === skillIdx ? { ...s, cooldownRemaining: def.cooldown ?? 0 } : s,
  );

  let newState: GameState = { ...state, skills: updatedSkills };

  switch (skillId) {
    case 'power_strike': {
      if (newState.player) {
        const boostedAtk = newState.player.atk * SKILL_POWER_STRIKE_MULTIPLIER;
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
        const currentEffects = newState.player.statusEffects ?? [];
        // 既存の shielded 効果を上書きする
        const filtered = currentEffects.filter((e) => e.type !== 'shielded');
        const barrierEffect = {
          type: 'shielded' as const,
          remainingTurns: 1,
          magnitude: SKILL_BARRIER_DEF_BONUS,
        };
        newState = {
          ...newState,
          player: {
            ...newState.player,
            statusEffects: [...filtered, barrierEffect],
          },
          battleLog: [
            ...(newState.battleLog ?? []),
            `バリア発動！1ターン DEF+${SKILL_BARRIER_DEF_BONUS}`,
          ],
        };
      }
      break;
    }

    case 'overcharge': {
      // 範囲攻撃トリガー: battleLog に記録して turn-system 側で処理する想定
      newState = {
        ...newState,
        battleLog: [
          ...(newState.battleLog ?? []),
          `オーバーチャージ発動！前方${SKILL_OVERCHARGE_RANGE}マスを攻撃`,
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
 * - passive_regen    : player.hp を SKILL_REGEN_AMOUNT 回復する（maxHp を上限とする）
 * - passive_tough    : 効果はダメージ計算時に参照するため、ここでは何もしない
 * - passive_scavenger: ドロップ率への影響はドロップシステム側で参照するため、ここでは何もしない
 *
 * @param state - パッシブ適用前の GameState
 * @returns パッシブ適用後の新しい GameState
 */
export function applyPassiveSkills(state: GameState): GameState {
  const hasRegen = state.skills.some((s) => s.id === 'passive_regen');

  if (!hasRegen || !state.player) return state;

  const newHp = Math.min(
    state.player.maxHp,
    state.player.hp + SKILL_REGEN_AMOUNT,
  );

  const newMachineHp = Math.min(state.machine.maxHp, state.machine.hp + SKILL_REGEN_AMOUNT);

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
 * passive_scavenger が習得済みかどうかを返す。
 * ドロップ計算時に呼び出してドロップ率ボーナスを適用する。
 *
 * @param state - 現在の GameState
 * @returns passive_scavenger が有効なら true
 */
export function hasScavengerPassive(state: GameState): boolean {
  return state.skills.some((s) => s.id === 'passive_scavenger');
}
