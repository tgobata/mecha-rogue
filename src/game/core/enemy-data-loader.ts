/**
 * @fileoverview 敵データローダー
 *
 * enemies.json から baseEnemyId とレベルで敵定義を検索するユーティリティ。
 * turn-system.ts のレベルアップ処理から呼び出す。
 */

import enemiesRaw from '../assets/data/enemies.json';

// ---------------------------------------------------------------------------
// JSON 型定義
// ---------------------------------------------------------------------------

/** enemies.json の1エントリを表す型 */
export interface EnemyJsonData {
  id: string;
  baseEnemyId: string;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  speed?: number;
  attackRange?: number;
  expReward: number;
  goldDrop: number;
  movementPattern: string;
  factionType?: 'neutral' | 'faction_a' | 'berserker';
  canAttackAllies?: boolean;
  appearsFrom: number;
  appearsUntil?: number;
  levelColor?: string;
  attackMissColor?: string;
  special?: string | null;
  equippedWeapon?: string | null;
  equippedArmor?: string | null;
  equippedShield?: string | null;
  equipDropChance?: number;
  description?: string;
}

const ENEMY_JSON_LIST = enemiesRaw as unknown as EnemyJsonData[];

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * baseEnemyId とレベルで enemies.json のエントリを検索する。
 *
 * @param baseEnemyId - ベース敵ID（例: "scout_drone"）
 * @param level - 検索するレベル（1〜5）
 * @returns 見つかった敵定義、または null
 */
export function findEnemyDataByBaseAndLevel(
  baseEnemyId: string | undefined,
  level: number,
): EnemyJsonData | null {
  if (!baseEnemyId) return null;
  return ENEMY_JSON_LIST.find(
    (e) => e.baseEnemyId === baseEnemyId && e.level === level,
  ) ?? null;
}

/**
 * レベルに対応する表示色を返す。
 *
 * @param level - 敵レベル（1〜5）
 * @returns HEX 文字列
 */
export function getLevelColor(level: number): string {
  const colors: Record<number, string> = {
    1: '#888888',
    2: '#44aa44',
    3: '#4444cc',
    4: '#aa4400',
    5: '#cc0000',
  };
  return colors[level] ?? '#888888';
}
