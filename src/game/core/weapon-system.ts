/**
 * @fileoverview 武器システム
 *
 * weapons.json からインスタンス生成、攻撃範囲計算、耐久度管理を担う。
 * 純粋関数のみ。副作用なし。
 */

import weaponsRaw from '../assets/data/weapons.json';
import type { WeaponInstance, WeaponCategory, WeaponRarity, RangeType } from './game-state';
import type { Position } from './types';
import type { Floor } from './types';
import { getTileAt, isWalkable } from './floorUtils';

// ---------------------------------------------------------------------------
// weapons.json の型定義
// ---------------------------------------------------------------------------

interface WeaponDef {
  id: string;
  name: string;
  category: string;
  atk: number;
  range: number;
  rangeType: string;
  /** 攻撃射程（1=隣接、2=2マス先、3=3マス先）。省略時は range と同値 */
  attackRange?: number;
  /** 攻撃パターン。省略時は rawRangeType から推論 */
  attackPattern?: AttackPattern | string;
  durability: number | null;
  durabilityLoss: number;
  appearsFrom: number;
  weight?: number;
  energyCost: number;
  special: string | null;
  description: string;
}

/**
 * 武器の攻撃パターン。
 * - single        : 正面 attackRange マス以内の最初の敵（デフォルト）
 * - pierce        : 正面直線上の全敵を貫通
 * - spread3       : 前方3方向（正面＋斜め前左右）それぞれ attackRange マス以内の敵
 * - cross         : 上下左右4方向それぞれ attackRange マス以内の敵
 * - all8          : 8方向それぞれ attackRange マス以内の敵
 * - bidirectional : 前後2方向（向きの正面と背面）それぞれ1マスの敵
 */
export type AttackPattern = 'single' | 'pierce' | 'spread3' | 'cross' | 'all8' | 'bidirectional';

const WEAPON_DEFS: WeaponDef[] = weaponsRaw as unknown as WeaponDef[];

// ---------------------------------------------------------------------------
// rangeType の正規化
// ---------------------------------------------------------------------------

/**
 * weapons.json の rawRangeType 文字列を汎用 RangeType に変換する。
 * - adjacent / bidirectional / tri_front / omnidirectional / cross_N / all8_N → 'single'
 * - line_N / line_all_pierce / line_N_pierce → 'line'
 * - spread / splash / homing → 'splash'
 */
function normalizeRangeType(raw: string): RangeType {
  if (raw.startsWith('line')) return 'line';
  if (raw === 'spread_3x2' || raw === 'spread_3x1' || raw.startsWith('homing') || raw === 'any_visible') return 'splash';
  return 'single';
}

// ---------------------------------------------------------------------------
// インスタンス生成
// ---------------------------------------------------------------------------

/**
 * weapons.json の id から WeaponInstance を生成する。
 * 耐久度は maxDurability と同値で初期化する。
 *
 * @param id - 武器ID（weapons.json の id フィールド）
 * @param rarity - レアリティ（省略時は 'common'）
 * @returns WeaponInstance
 * @throws 該当IDが存在しない場合
 */
export function createWeaponInstance(
  id: string,
  rarity: WeaponRarity = 'common',
): WeaponInstance {
  const def = WEAPON_DEFS.find((d) => d.id === id);
  if (!def) {
    throw new Error(`[weapon-system] 武器ID '${id}' が weapons.json に存在しません`);
  }

  return {
    id: def.id,
    instanceId: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    name: def.name,
    category: def.category as WeaponCategory,
    atk: def.atk,
    range: def.range,
    rangeType: normalizeRangeType(def.rangeType),
    rawRangeType: def.rangeType,
    durability: def.durability,
    maxDurability: def.durability,
    durabilityLoss: def.durabilityLoss,
    rarity,
    energyCost: def.energyCost,
    special: def.special,
  };
}

// ---------------------------------------------------------------------------
// 耐久度処理
// ---------------------------------------------------------------------------

/**
 * 武器を1回使用した後の耐久度を計算して返す。
 * durability が null（壊れない武器）の場合はそのまま返す。
 *
 * @param weapon - 使用した武器
 * @returns 耐久度更新後の WeaponInstance（元のオブジェクトは変更しない）
 */
export function consumeDurability(weapon: WeaponInstance): WeaponInstance {
  if (weapon.durability === null) return weapon;
  return {
    ...weapon,
    durability: Math.max(0, weapon.durability - weapon.durabilityLoss),
  };
}

/**
 * 武器が破壊されているか判定する。
 * durability が null（壊れない）の場合は false を返す。
 *
 * @param weapon - 判定する武器
 * @returns 耐久度 0 以下なら true
 */
export function isBroken(weapon: WeaponInstance): boolean {
  return weapon.durability !== null && weapon.durability <= 0;
}

// ---------------------------------------------------------------------------
// 攻撃範囲計算（内部ヘルパー）
// ---------------------------------------------------------------------------

/** 方向オフセット */
const DIR_DELTA: Record<string, { dx: number; dy: number }> = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx: 1,  dy:  0 },
};

/** 全8方向オフセット */
const ALL8_DELTAS: Array<{ dx: number; dy: number }> = [
  { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy:  0 },                    { dx: 1, dy:  0 },
  { dx: -1, dy:  1 }, { dx: 0, dy:  1 }, { dx: 1, dy:  1 },
];

/** 上下左右4方向オフセット */
const CROSS4_DELTAS: Array<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 },
  { dx: 0, dy:  1 },
  { dx: -1, dy: 0 },
  { dx: 1,  dy: 0 },
];

/**
 * 向きから逆方向を返す。
 */
function opposite(dir: string): string {
  switch (dir) {
    case 'up':    return 'down';
    case 'down':  return 'up';
    case 'left':  return 'right';
    case 'right': return 'left';
    default:      return dir;
  }
}

/**
 * 向きから「前方斜め」方向2つを返す。
 */
function diagonalFront(dir: string): Array<{ dx: number; dy: number }> {
  switch (dir) {
    case 'up':    return [{ dx: -1, dy: -1 }, { dx: 1, dy: -1 }];
    case 'down':  return [{ dx: -1, dy:  1 }, { dx: 1, dy:  1 }];
    case 'left':  return [{ dx: -1, dy: -1 }, { dx: -1, dy: 1 }];
    case 'right': return [{ dx:  1, dy: -1 }, { dx:  1, dy: 1 }];
    default:      return [];
  }
}

/**
 * 1方向について attackRange マスまでの座標リストを返す。
 * floor が指定された場合、壁で射線が遮断される（pierce=true なら貫通）。
 *
 * @param origin - 攻撃者座標
 * @param delta - 方向オフセット
 * @param maxRange - 最大射程
 * @param floor - マップ（null の場合は壁チェックなし）
 * @param pierce - 貫通フラグ
 * @returns 座標リスト
 */
function raycast(
  origin: Position,
  delta: { dx: number; dy: number },
  maxRange: number,
  floor: Floor | null,
  pierce: boolean,
): Position[] {
  const targets: Position[] = [];
  const steps = Math.min(maxRange, 99);
  let cur: Position = { x: origin.x + delta.dx, y: origin.y + delta.dy };

  for (let i = 0; i < steps; i++) {
    targets.push({ ...cur });

    if (floor) {
      const tile = getTileAt(floor, cur);
      if (!isWalkable(tile) && !pierce) break;
    }

    cur = { x: cur.x + delta.dx, y: cur.y + delta.dy };
  }

  return targets;
}

// ---------------------------------------------------------------------------
// weapons.json の attackPattern / rangeType から実際の攻撃対象座標を解決する
// ---------------------------------------------------------------------------

/**
 * weapons.json の rangeType 文字列から attackPattern を推論する。
 * weapons.json に attackPattern フィールドがある場合は不要だが、
 * rawRangeType のみで処理が必要な場面（互換性）のために保持する。
 */
function inferAttackPattern(rawType: string): AttackPattern {
  if (rawType.includes('pierce') || rawType.includes('all')) return 'pierce';
  if (rawType === 'omnidirectional' || rawType.startsWith('all8')) return 'all8';
  if (rawType === 'cross_1' || rawType.startsWith('cross')) return 'cross';
  if (rawType === 'spread_3x2' || rawType === 'spread_3x1') return 'spread3';
  if (rawType === 'tri_front') return 'spread3';
  if (rawType === 'bidirectional') return 'single'; // 前後2方向は特殊処理で維持
  return 'single';
}

/**
 * attackPattern と attackRange から攻撃対象座標リストを生成する。
 *
 * @param origin - 攻撃者座標
 * @param facing - 攻撃者の向き
 * @param pattern - 攻撃パターン
 * @param attackRange - 攻撃射程
 * @param floor - マップ（null の場合は壁チェックなし）
 * @param pierce - 貫通フラグ（pattern='pierce' の場合は自動 true）
 * @returns 攻撃対象となりうる座標リスト
 */
function resolveByPattern(
  origin: Position,
  facing: string,
  pattern: AttackPattern,
  attackRange: number,
  floor: Floor | null,
  pierce: boolean,
): Position[] {
  const d = DIR_DELTA[facing] ?? { dx: 0, dy: 1 };

  switch (pattern) {
    case 'single':
      return raycast(origin, d, attackRange, floor, pierce);

    case 'pierce':
      return raycast(origin, d, attackRange, floor, true);

    case 'spread3': {
      const diags = diagonalFront(facing);
      const dirs = [d, ...diags];
      return dirs.flatMap((dir) => raycast(origin, dir, attackRange, floor, pierce));
    }

    case 'cross':
      return CROSS4_DELTAS.flatMap((dir) => raycast(origin, dir, attackRange, floor, pierce));

    case 'all8':
      return ALL8_DELTAS.flatMap((dir) => raycast(origin, dir, attackRange, floor, pierce));

    case 'bidirectional': {
      const od = DIR_DELTA[opposite(facing)] ?? { dx: 0, dy: -1 };
      return [
        { x: origin.x + d.dx,  y: origin.y + d.dy  },
        { x: origin.x + od.dx, y: origin.y + od.dy },
      ];
    }

    default:
      return raycast(origin, d, attackRange, floor, pierce);
  }
}

// ---------------------------------------------------------------------------
// 公開 API: 攻撃範囲計算
// ---------------------------------------------------------------------------

/**
 * 武器の攻撃範囲にいる座標リストを返す。
 * floor は射線判定に使う（nullの場合は無制限貫通とみなす）。
 *
 * 処理優先順：
 * 1. weapons.json に attackPattern フィールドがあればそれを使用
 * 2. なければ rawRangeType から旧ロジックで処理（後方互換）
 *
 * @param attackerPos - 攻撃者の座標
 * @param facing - 攻撃者の向き
 * @param weapon - 使用武器（null の場合は素手: adjacent range=1）
 * @param floor - マップ（null の場合は壁チェックなし）
 * @returns 攻撃対象となりうる座標リスト
 */
export function getAttackTargetPositions(
  attackerPos: Position,
  facing: string,
  weapon: WeaponInstance | null,
  floor: Floor | null,
): Position[] {
  // 素手は正面1マス
  if (!weapon) {
    const d = DIR_DELTA[facing] ?? { dx: 0, dy: 1 };
    return [{ x: attackerPos.x + d.dx, y: attackerPos.y + d.dy }];
  }

  const rawType = weapon.rawRangeType;
  const range = weapon.range;
  const d = DIR_DELTA[facing] ?? { dx: 0, dy: 1 };

  // weapons.json の def から attackPattern / attackRange を取得する
  const def = WEAPON_DEFS.find((wd) => wd.id === weapon.id);
  if (def?.attackPattern) {
    const pattern = def.attackPattern as AttackPattern;
    const attackRange = def.attackRange ?? range;
    const pierce = pattern === 'pierce' || rawType.includes('pierce');
    return resolveByPattern(attackerPos, facing, pattern, attackRange, floor, pierce);
  }

  // ─── 後方互換: attackPattern なし → rawRangeType で処理 ─────────────

  // ─── adjacent（正面1タイル） ───────────────────────────────────────────
  if (rawType === 'adjacent') {
    return [{ x: attackerPos.x + d.dx, y: attackerPos.y + d.dy }];
  }

  // ─── bidirectional（前後2方向） ────────────────────────────────────────
  if (rawType === 'bidirectional') {
    const od = DIR_DELTA[opposite(facing)] ?? { dx: 0, dy: -1 };
    return [
      { x: attackerPos.x + d.dx,  y: attackerPos.y + d.dy  },
      { x: attackerPos.x + od.dx, y: attackerPos.y + od.dy },
    ];
  }

  // ─── tri_front（前方3方向） ────────────────────────────────────────────
  if (rawType === 'tri_front') {
    const diags = diagonalFront(facing);
    return [
      { x: attackerPos.x + d.dx, y: attackerPos.y + d.dy },
      ...diags.map((dd) => ({ x: attackerPos.x + dd.dx, y: attackerPos.y + dd.dy })),
    ];
  }

  // ─── omnidirectional（周囲8方向） ─────────────────────────────────────
  if (rawType === 'omnidirectional') {
    return ALL8_DELTAS.map((dd) => ({ x: attackerPos.x + dd.dx, y: attackerPos.y + dd.dy }));
  }

  // ─── cross_N（上下左右4方向 × N タイル）──────────────────────────────
  if (rawType.startsWith('cross')) {
    const n = parseInt(rawType.split('_')[1] ?? '1', 10) || 1;
    return CROSS4_DELTAS.flatMap((dir) => raycast(attackerPos, dir, n, floor, false));
  }

  // ─── all8_N（8方向 × N タイル）────────────────────────────────────────
  if (rawType.startsWith('all8')) {
    const n = parseInt(rawType.split('_')[1] ?? '1', 10) || 1;
    return ALL8_DELTAS.flatMap((dir) => raycast(attackerPos, dir, n, floor, false));
  }

  // ─── line_N / line_N_pierce / line_all_pierce ─────────────────────────
  if (rawType.startsWith('line')) {
    const pierce = rawType.includes('pierce') || rawType.includes('all');
    const targets: Position[] = [];
    let cur: Position = { x: attackerPos.x + d.dx, y: attackerPos.y + d.dy };
    let steps = 0;
    const maxSteps = range >= 99 ? 99 : range;

    while (steps < maxSteps) {
      steps++;
      targets.push({ ...cur });

      // 壁チェック: 貫通しない場合は壁で止まる
      if (floor) {
        const tile = getTileAt(floor, cur);
        if (!isWalkable(tile) && !pierce) break;
      }

      cur = { x: cur.x + d.dx, y: cur.y + d.dy };
    }
    return targets;
  }

  // ─── spread_3x2（前方3方向 × 2タイル）─────────────────────────────────
  if (rawType === 'spread_3x2') {
    const dirs = [d, ...diagonalFront(facing)];
    const targets: Position[] = [];
    for (const dir of dirs) {
      for (let i = 1; i <= 2; i++) {
        targets.push({
          x: attackerPos.x + dir.dx * i,
          y: attackerPos.y + dir.dy * i,
        });
      }
    }
    return targets;
  }

  // ─── spread_3x1（前方3方向 × 1タイル）─────────────────────────────────
  if (rawType === 'spread_3x1') {
    const dirs = [d, ...diagonalFront(facing)];
    return dirs.map((dir) => ({ x: attackerPos.x + dir.dx, y: attackerPos.y + dir.dy }));
  }

  // ─── homing / any_visible / placed（簡易実装: 正面 range タイル） ──────
  // ホーミングや任意指定は詳細ロジックを別途実装。ここでは前方直線で近似。
  {
    const targets: Position[] = [];
    for (let i = 1; i <= Math.min(range, 99); i++) {
      targets.push({ x: attackerPos.x + d.dx * i, y: attackerPos.y + d.dy * i });
    }
    return targets;
  }
}

// ---------------------------------------------------------------------------
// 全武器定義の取得（ドロップシステム等から参照）
// ---------------------------------------------------------------------------

/** weapons.json の全定義を返す */
export function getAllWeaponDefs(): WeaponDef[] {
  return WEAPON_DEFS;
}

/**
 * 武器定義から attackPattern を取得する。
 * フィールドがない場合は rawRangeType から推論する。
 *
 * @param weaponId - 武器ID
 * @returns AttackPattern
 */
export function getWeaponAttackPattern(weaponId: string): AttackPattern {
  const def = WEAPON_DEFS.find((d) => d.id === weaponId);
  if (!def) return 'single';
  if (def.attackPattern) return def.attackPattern as AttackPattern;
  return inferAttackPattern(def.rangeType);
}
