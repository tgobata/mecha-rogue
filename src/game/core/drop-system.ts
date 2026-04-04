/**
 * @fileoverview アイテムドロップシステム
 *
 * 敵撃破時のドロップ判定を行う純粋関数群。
 * drop-tables.json と enemies.json を静的インポートで参照する。
 *
 * drop-tables.json のフォーマット:
 * - enemy_drops: 敵IDごとのドロップ候補（weight・floor_min でフィルタ）
 * - floor_bonus: フロア番号に比例するドロップ率ボーナス係数
 */

import dropTablesRaw from '../assets/data/drop-tables.json';
import enemiesRaw from '../assets/data/enemies.json';
import itemsRaw from '../assets/data/items.json';
import weaponsRaw from '../assets/data/weapons.json';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** ドロップ結果の1エントリ */
export interface DropResult {
  type: 'weapon' | 'item' | 'tool' | 'gold';
  /** アイテム/武器/道具のID（gold の場合は undefined） */
  id?: string;
  /** gold の量、またはアイテムスタック数 */
  amount?: number;
}

// ---------------------------------------------------------------------------
// JSON 型定義
// ---------------------------------------------------------------------------

interface EnemyDropEntry {
  item_id: string;
  type: string;
  weight: number;
  floor_min: number;
}

interface EnemyDropData {
  exp: number;
  gold: { min: number; max: number };
  drops: EnemyDropEntry[];
}

interface EnemyDef {
  id: string;
  goldDrop: number;
  [key: string]: unknown;
}

interface DropTablesData {
  version: string;
  enemy_drops: Record<string, EnemyDropData>;
  floor_bonus: { description: string; formula: string };
}

const DROP_TABLES = dropTablesRaw as unknown as DropTablesData;
const ENEMY_DEFS = enemiesRaw as unknown as EnemyDef[];

interface ItemDef {
  id: string;
  appearsFrom: number;
  dropWeight: number;
  weight: number; // weightedPick 用エイリアス（dropWeight と同値）
}
const ITEM_DEFS: ItemDef[] = (itemsRaw as unknown as { id: string; appearsFrom: number; dropWeight: number }[]).map(
  (i) => ({ ...i, weight: i.dropWeight }),
);

interface WeaponDef {
  id: string;
  appearsFrom: number;
  atk: number;
  weight: number;
}
const WEAPON_DEFS_FOR_DROP = weaponsRaw as unknown as WeaponDef[];

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 重み付きランダム選択。
 * @param items - { weight } を持つ要素の配列
 * @param rng - 0〜1 の乱数関数
 * @returns 選択された要素、または null（空配列）
 */
function weightedPick<T extends { weight: number }>(
  items: T[],
  rng: () => number,
): T | null {
  const total = items.reduce((acc, it) => acc + it.weight, 0);
  if (total <= 0 || items.length === 0) return null;

  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * フロアボーナス係数を返す。
 * floor_bonus.formula に基づき計算する（1.0 + floor_number * 0.05）。
 *
 * @param floorNumber - 現在の階層番号
 * @returns ドロップ率ボーナス係数
 */
function getFloorBonus(floorNumber: number): number {
  return 1.0 + floorNumber * 0.05;
}

// ---------------------------------------------------------------------------
// メイン: rollDrops
// ---------------------------------------------------------------------------

/**
 * 敵撃破時のドロップを判定して返す。
 * drop-tables.json の enemy_drops テーブルを参照する。
 *
 * 1. ゴールドドロップ: 敵定義の goldDrop を基準に ±20% の乱数変動を加える。
 *    drop-tables に gold の min/max がある場合はそれを優先する。
 * 2. アイテムドロップ: ベースドロップ率 60% × フロアボーナスで判定する。
 *    floor_min <= floorNumber の候補を重み付き抽選する。
 *
 * @param enemyId - 撃破した敵のID（enemies.json の id と対応）
 * @param floorNumber - 現在の階層番号
 * @param rng - 再現性のある 0〜1 乱数関数
 * @returns ドロップ結果の配列（空の場合もある）
 */
export function rollDrops(
  enemyId: string,
  floorNumber: number,
  rng: () => number,
): DropResult[] {
  const results: DropResult[] = [];

  // ── ゴールドドロップ ─────────────────────────────────────────────────
  // enemies.json の goldDrop を基準に ±20% の乱数変動を加える
  const enemyDef = ENEMY_DEFS.find((e) => e.id === enemyId);
  const dropData = DROP_TABLES.enemy_drops[enemyId];
  if (enemyDef && enemyDef.goldDrop > 0) {
    const variance = 1 + (rng() * 0.4 - 0.2);
    const goldAmount = Math.max(1, Math.round(enemyDef.goldDrop * variance));
    results.push({ type: 'gold', amount: goldAmount });
  } else if (dropData) {
    // enemies.json に goldDrop がない場合は drop-tables の min/max を使う
    const goldMin = dropData.gold.min;
    const goldMax = dropData.gold.max;
    const goldAmount = goldMin + Math.floor(rng() * (goldMax - goldMin + 1));
    results.push({ type: 'gold', amount: goldAmount });
  }

  // ── アイテムドロップ判定 ──────────────────────────────────────────────
  // ベースドロップ率 60% にフロアボーナスを乗じる（上限1.0）
  const baseDropRate = 0.6;
  const floorBonus = getFloorBonus(floorNumber);
  const effectiveDropRate = Math.min(1.0, baseDropRate * floorBonus);

  if (rng() >= effectiveDropRate) return results;

  // drop-tables.json にドロップ候補がある場合
  if (dropData && dropData.drops.length > 0) {
    // floorNumber >= floor_min のエントリのみ候補とする
    const eligible = dropData.drops.filter(
      (entry) => floorNumber >= entry.floor_min,
    );
    if (eligible.length === 0) return results;

    const picked = weightedPick(eligible, rng);
    if (picked) {
      results.push({
        type: picked.type as 'weapon' | 'item' | 'tool',
        id: picked.item_id,
        amount: 1,
      });
    }
  }

  return results;
}

/**
 * 階層番号ベースのゴールドドロップ（フロア配置ゴールドタイル用）。
 * フロア番号が高いほど多くのゴールドを得られる。
 *
 * 計算式: min = floor * 2 + 1, max = floor * 3 + 3
 * - floor 1: 3〜6
 * - floor 5: 11〜18
 * - floor 31: 63〜96
 * - floor 35: 71〜108
 *
 * @param floorNumber - 現在の階層番号
 * @param rng - 乱数関数
 * @returns ゴールド量
 */
export function rollFloorGold(floorNumber: number, rng: () => number): number {
  const minGold = floorNumber * 2 + 1;
  const maxGold = floorNumber * 3 + 3;
  return minGold + Math.floor(rng() * (maxGold - minGold + 1));
}

/**
 * フロアに落ちているアイテムのIDをランダムに選んで返す。
 * items.json の appearsFrom <= floorNumber のアイテムを dropWeight で重み付き抽選する。
 * 下階層ほど出現アイテムの種類が増え（appearsFrom が高いものも候補に入る）、
 * 全体的に強力なアイテムの出現率が上がる。
 *
 * @param floorNumber - 現在の階層番号
 * @param rng - 0〜1 の乱数関数
 * @returns アイテムID、または候補がなければ null
 */
export function rollFloorItem(floorNumber: number, rng: () => number): string | null {
  const eligible = ITEM_DEFS.filter(
    (item) => item.appearsFrom <= floorNumber && item.dropWeight > 0,
  );
  if (eligible.length === 0) return null;
  const picked = weightedPick(eligible, rng);
  return picked?.id ?? null;
}

/**
 * フロアに落ちている武器のIDをランダムに選んで返す。
 * weapons.json の appearsFrom <= floorNumber の武器から抽選する。
 * 下階層ほど強力な武器（高ATK）が候補に加わる。
 * machine_punch（appearsFrom=0、初期装備）は候補から除外する。
 *
 * @param floorNumber - 現在の階層番号
 * @param rng - 0〜1 の乱数関数
 * @returns 武器ID、または候補がなければ null
 */
export function rollFloorWeapon(floorNumber: number, rng: () => number): string | null {
  // 初期装備（machine_punch、weight=0）を除き、appearsFrom <= floorNumber の武器を候補にする
  // weapons.json の weight フィールドで重み付き抽選（防具・盾は weight が高く設定されている）
  const eligible = WEAPON_DEFS_FOR_DROP.filter(
    (w) => w.appearsFrom > 0 && w.appearsFrom <= floorNumber && (w.weight ?? 0) > 0,
  );
  if (eligible.length === 0) return null;
  const picked = weightedPick(eligible, rng);
  return picked?.id ?? null;
}
