/**
 * @fileoverview 状態異常システム
 *
 * エンティティに付与された状態異常の毎ターン処理と、
 * 武器の special フィールドから状態異常を生成するロジックを担う。
 * 純粋関数のみ。副作用なし。
 */

import type { StatusEffect, StatusEffectType, WeaponInstance } from './game-state';
import type { Player, Enemy } from './game-state';
import type { GameState } from './game-state';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** エンティティ共通のインターフェース（プレイヤー or 敵） */
type EntityWithStatus = (Player | Enemy) & { statusEffects?: StatusEffect[] };

/** applyStatusEffects の戻り値 */
export interface StatusEffectResult<T extends EntityWithStatus> {
  entity: T;
  logs: string[];
  /** ターン中に発生したダメージ（状態異常ダメージ） */
  damageDealt: number;
}

// ---------------------------------------------------------------------------
// 状態異常ダメージ取得
// ---------------------------------------------------------------------------

/**
 * oiled（オイル）が付与されている場合に乗算倍率を返す。
 * oiled がなければ 1.0。
 */
function getOilMultiplier(effects: StatusEffect[]): number {
  return effects.some((e) => e.type === 'oiled') ? 1.5 : 1.0;
}

// ---------------------------------------------------------------------------
// 状態異常の毎ターン処理
// ---------------------------------------------------------------------------

/**
 * エンティティの状態異常を1ターン分処理する。
 * - burning / shocked: ダメージを与える
 * - regen: HP回復
 * - shielded / frozen / stunned / oiled: ターン数を減らす
 *
 * @param entity - 処理対象のエンティティ（Player または Enemy）
 * @param _state - GameState（将来の拡張用。現状は未使用）
 * @returns 更新後エンティティ・ログ・ダメージ量
 */
export function applyStatusEffects<T extends EntityWithStatus>(
  entity: T,
  _state: GameState,
): StatusEffectResult<T> {
  const effects = entity.statusEffects ?? [];
  if (effects.length === 0) {
    return { entity, logs: [], damageDealt: 0 };
  }

  const logs: string[] = [];
  let totalDamage = 0;
  let currentHp = entity.hp;
  const oilMult = getOilMultiplier(effects);

  const updatedEffects: StatusEffect[] = [];

  for (const effect of effects) {
    const newRemaining = effect.remainingTurns - 1;

    switch (effect.type) {
      case 'burning': {
        const dmg = Math.max(1, Math.round((effect.magnitude ?? 3) * oilMult));
        currentHp -= dmg;
        totalDamage += dmg;
        logs.push(`[炎上] ${dmg} ダメージ`);
        if (newRemaining > 0) {
          updatedEffects.push({ ...effect, remainingTurns: newRemaining });
        }
        break;
      }

      case 'shocked': {
        const dmg = Math.max(0, Math.round((effect.magnitude ?? 2) * oilMult));
        currentHp -= dmg;
        totalDamage += dmg;
        if (dmg > 0) logs.push(`[感電] ${dmg} ダメージ`);
        if (newRemaining > 0) {
          updatedEffects.push({ ...effect, remainingTurns: newRemaining });
        }
        break;
      }

      case 'regen': {
        const heal = effect.magnitude ?? 2;
        currentHp = Math.min(entity.maxHp, currentHp + heal);
        logs.push(`[修復] HP +${heal}`);
        if (newRemaining > 0) {
          updatedEffects.push({ ...effect, remainingTurns: newRemaining });
        }
        break;
      }

      case 'frozen':
      case 'stunned':
      case 'oiled':
      case 'shielded': {
        if (newRemaining > 0) {
          updatedEffects.push({ ...effect, remainingTurns: newRemaining });
        } else {
          const label: Record<StatusEffectType, string> = {
            frozen: '凍結',
            stunned: 'スタン',
            oiled: 'オイル',
            shielded: 'シールド',
            burning: '炎上',
            shocked: '感電',
            regen: '修復',
            attack_up: '攻撃力強化',
            speed_up: '速度強化',
          };
          logs.push(`[${label[effect.type]}] 解除`);
        }
        break;
      }
    }
  }

  const updatedEntity: T = {
    ...entity,
    hp: currentHp,
    statusEffects: updatedEffects,
  };

  return { entity: updatedEntity, logs, damageDealt: totalDamage };
}

// ---------------------------------------------------------------------------
// 行動可否チェック
// ---------------------------------------------------------------------------

/**
 * エンティティが行動できるか判定する。
 * frozen または stunned が付与されていれば行動不可。
 *
 * @param entity - 判定対象
 * @returns 行動可能なら true
 */
export function canAct(entity: EntityWithStatus): boolean {
  const effects = entity.statusEffects ?? [];
  return !effects.some((e) => e.type === 'frozen' || e.type === 'stunned');
}

/**
 * shocked（感電）によるターンスキップ判定。
 * shocked 付与中は1ターンおきにスキップ（remainingTurns の偶奇で判定）。
 *
 * @param entity - 判定対象
 * @returns この行動をスキップすべきなら true
 */
export function isShockedSkip(entity: EntityWithStatus): boolean {
  const effects = entity.statusEffects ?? [];
  const shocked = effects.find((e) => e.type === 'shocked');
  if (!shocked) return false;
  // 偶数ターン残りのときにスキップ
  return shocked.remainingTurns % 2 === 0;
}

// ---------------------------------------------------------------------------
// ダメージ時のシールド処理
// ---------------------------------------------------------------------------

/**
 * shielded が付与されている場合にダメージを吸収する。
 * シールド量以下のダメージは 0 になる。
 *
 * @param entity - 対象エンティティ
 * @param rawDamage - 元のダメージ量
 * @returns { finalDamage, updatedEntity }
 */
export function absorbWithShield<T extends EntityWithStatus>(
  entity: T,
  rawDamage: number,
): { finalDamage: number; updatedEntity: T } {
  const effects = entity.statusEffects ?? [];
  const shieldIdx = effects.findIndex((e) => e.type === 'shielded');

  if (shieldIdx < 0) {
    return { finalDamage: rawDamage, updatedEntity: entity };
  }

  const shield = effects[shieldIdx];
  const shieldAmount = shield.magnitude ?? rawDamage;
  const absorbed = Math.min(shieldAmount, rawDamage);
  const finalDamage = rawDamage - absorbed;

  // シールドを消費（全吸収したら除去）
  const newEffects = effects
    .map((e, i) =>
      i === shieldIdx ? { ...e, magnitude: (e.magnitude ?? 0) - absorbed } : e,
    )
    .filter((e) => e.type !== 'shielded' || (e.magnitude ?? 0) > 0);

  return {
    finalDamage,
    updatedEntity: { ...entity, statusEffects: newEffects },
  };
}

// ---------------------------------------------------------------------------
// 武器 special → 状態異常生成
// ---------------------------------------------------------------------------

/**
 * 武器の special フィールドから命中時に付与する StatusEffect を生成する。
 *
 * @param weapon - 使用武器
 * @returns 付与する StatusEffect（なければ null）
 */
export function applyWeaponSpecial(
  weapon: WeaponInstance,
): StatusEffect | null {
  if (!weapon.special) return null;

  switch (weapon.special) {
    case 'freeze_on_hit':
    case 'freeze_3turns':
      return { type: 'frozen', remainingTurns: 3, sourceId: weapon.id };

    case 'stun_3tiles_2turns':
      return { type: 'stunned', remainingTurns: 2, sourceId: weapon.id };

    case 'water_shock':
      return { type: 'shocked', remainingTurns: 2, magnitude: 2, sourceId: weapon.id };

    case 'armor_corrode':
      // 装甲侵食は shocked で近似（将来専用ステータスに変更可能）
      return { type: 'shocked', remainingTurns: 3, magnitude: 2, sourceId: weapon.id };

    case 'drain_30pct':
    case 'double_shot':
    case 'wall_break':
    case 'armor_pierce':
    case 'critical_x2':
    case 'splash_1':
    case 'splash_2':
    case 'splash_3x3':
    case 'knockback_2':
    case 'pull_5tiles':
    case 'placed_3turn_3x3':
    case 'enrage_at_half_hp':
    case 'split_on_death':
    case 'pack_howl':
    case 'ranged_attack':
    case 'buff_allies':
    case 'reflect_ranged':
    case 'revive':
    case 'skip_player_turn':
    case 'nanite_leech':
    case 'phase_through_walls':
    case 'item_disguise':
    case 'stealth_ambush':
    case 'directional_armor':
    case 'lay_mines':
    case 'heal_allies':
    case 'front_damage_halved':
    case 'warp_to_player':
    case 'lob_grenade':
    case 'long_range_cannon':
    case 'tri_direction_attack':
    case 'explode_on_adjacent':
      // これらは他のシステムで処理する特殊効果
      return null;

    default:
      return null;
  }
}

/**
 * 状態異常をエンティティに付与する。
 * 同じ種別が既に付与されている場合は remainingTurns を上書きする（上書きの方が長い場合のみ）。
 *
 * @param entity - 付与対象
 * @param effect - 付与する状態異常
 * @returns 更新後エンティティ
 */
export function addStatusEffect<T extends EntityWithStatus>(
  entity: T,
  effect: StatusEffect,
): T {
  const effects = entity.statusEffects ?? [];
  const existingIdx = effects.findIndex((e) => e.type === effect.type);

  let newEffects: StatusEffect[];
  if (existingIdx >= 0) {
    // 既存の効果の remainingTurns が短ければ上書き
    const existing = effects[existingIdx];
    if (effect.remainingTurns > existing.remainingTurns) {
      newEffects = effects.map((e, i) => (i === existingIdx ? effect : e));
    } else {
      newEffects = effects;
    }
  } else {
    newEffects = [...effects, effect];
  }

  return { ...entity, statusEffects: newEffects };
}
