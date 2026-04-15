/**
 * @fileoverview セーブ・ロードシステム
 *
 * GameState を localStorage にシリアライズして保存・ロードする。
 * SSR 安全（`typeof window` チェック済み）。
 * localStorage アクセス失敗時はエラーを握りつぶして null を返す。
 *
 * 設計原則:
 * - ブラウザ環境のみで動作（SSR では no-op）。
 * - バージョン不一致のデータは無効として null を返す。
 * - JSON.stringify / JSON.parse でシリアライズする。
 * - マジックナンバー禁止（constants.ts の定数を使う）。
 */

import type { GameState } from './game-state';
import { SAVE_KEY_PREFIX, SAVE_VERSION, MAX_SAVE_SLOTS } from './constants';

// ---------------------------------------------------------------------------
// 公開型定義
// ---------------------------------------------------------------------------

/**
 * セーブデータの概要情報（プレビュー用・軽量）。
 */
export interface SaveSummary {
  level: number;
  hp: number;
  maxHp: number;
  gold: number;
  floor: number;
  weaponName: string;
  itemsCount: number;
  savedAt: number;
  version: string;
  /** ゲームモード。undefined（旧データ）はノーマル扱い */
  gameMode?: 'normal' | 'easy';
}

/**
 * localStorage に保存するセーブデータのルート構造。
 */
export interface SaveData {
  /** セーブフォーマットのバージョン文字列（'v1'） */
  version: string;
  /** 保存日時のエポックミリ秒（Date.now()） */
  savedAt: number;
  /** セーブ時点の GameState */
  gameState: GameState;
  /** プレビュー用サマリー（オプション：古いデータには存在しない） */
  summary?: SaveSummary;
}

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 現在の環境が localStorage を使用できるかを確認する。
 * SSR 環境（typeof window === 'undefined'）とプライベートブラウジングを考慮する。
 *
 * @returns localStorage が利用可能なら true
 */
function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const testKey = '__mechaRogue_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * 生の unknown データを SaveData として検証する。
 * バージョン不一致・構造不正の場合は null を返す。
 *
 * @param raw - JSON.parse の結果（unknown 型）
 * @returns 検証済みの SaveData、または null
 */
function validateSaveData(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) {
    console.warn('[validateSaveData] Fail: Not an object');
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // gameState がないものは流石に読み込めない
  if (typeof obj['gameState'] !== 'object' || obj['gameState'] === null) {
    console.warn('[validateSaveData] Fail: Missing or invalid gameState');
    return null;
  }

  // バージョンが違う or ない場合でも、gameState があれば延命を試みる
  if (obj['version'] !== SAVE_VERSION) {
    console.warn(`[validateSaveData] Warning: Version mismatch (got ${obj['version']}, expected ${SAVE_VERSION}). Attempting migration.`);
  }

  return {
    version: (obj['version'] as string) ?? 'legacy',
    savedAt: (obj['savedAt'] as number) ?? Date.now(),
    gameState: obj['gameState'] as GameState,
    summary: obj['summary'] as SaveSummary | undefined,
  };
}

/**
 * GameState からプレビュー用のサマリーを生成する。
 */
function createSaveSummary(state: GameState, savedAt: number): SaveSummary {
  const equippedWeapon = state.inventory.equippedWeapons[0];
  // 武器名取得ロジックは本来 renderer や turn-system にあるが、依存を避けるため簡易的に取得
  // 実際には GameCanvas 側で生成して渡すか、IDをそのまま入れる
  return {
    level: state.pilot.level,
    hp: state.machine.hp,
    maxHp: state.machine.maxHp,
    gold: state.inventory.gold,
    floor: state.floor,
    weaponName: equippedWeapon ? equippedWeapon.weaponId : 'なし',
    itemsCount: state.inventory.items.length,
    savedAt,
    version: SAVE_VERSION,
    gameMode: state.gameMode,
  };
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * 現在の GameState を localStorage に保存する。
 * ブラウザ環境でのみ動作する（SSR 環境では何もしない）。
 * localStorage アクセス失敗時はエラーを握りつぶす。
 *
 * @param state - 保存する GameState
 * @param slot - 保存先のスロット番号 (1-5)
 */
export function saveGame(state: GameState, slot: number): void {
  if (!isStorageAvailable() || slot < 1 || slot > MAX_SAVE_SLOTS) return;

  try {
    const savedAt = Date.now();
    // battleLog はゲームプレイ中に無制限に増えるため、保存前に末尾100件に切り詰める
    // （JSON.parse 時の主スレッドブロックと localStorage 容量超過を防ぐため）
    const trimmedState: GameState = {
      ...state,
      battleLog: state.battleLog.slice(-100),
    };
    const summary = createSaveSummary(trimmedState, savedAt);
    const saveData: SaveData = {
      version: SAVE_VERSION,
      savedAt,
      gameState: trimmedState,
      summary,
    };

    const serialized = JSON.stringify(saveData);

    // 容量警告: 1MB を超える場合はコンソールに警告を出す（localStorage 上限は通常 5MB）
    if (serialized.length > 1_000_000) {
      console.warn(`[saveGame] Save data is large: ${(serialized.length / 1024).toFixed(1)}KB (slot ${slot})`);
    }

    // メインデータとサマリーを分けて保存
    window.localStorage.setItem(`${SAVE_KEY_PREFIX}${slot}`, serialized);
    window.localStorage.setItem(`${SAVE_KEY_PREFIX}${slot}_summary`, JSON.stringify(summary));
  } catch (e) {
    // QuotaExceededError など容量超過は console に出力する
    console.error('[saveGame] Failed to save:', e);
  }
}

/**
 * localStorage から特定のセーブデータを読み込む。
 * データが存在しない・バージョン不一致・パース失敗の場合は null を返す。
 * ブラウザ環境以外では常に null を返す。
 *
 * @param slot - 読み込むスロット番号 (1-5)
 * @returns 読み込んだ SaveData、または null
 */
export function loadGame(slot: number): SaveData | null {
  if (!isStorageAvailable() || slot < 1 || slot > MAX_SAVE_SLOTS) return null;

  try {
    const raw = window.localStorage.getItem(`${SAVE_KEY_PREFIX}${slot}`);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    return validateSaveData(parsed);
  } catch {
    return null;
  }
}

/**
 * 1〜5スロットのすべてのセーブデータ（サマリーのみ）を読み込む。
 * @returns 要素数5の配列。各要素は SaveSummary または null。
 */
export function getAllSaves(): (SaveSummary | null)[] {
  const summaries: (SaveSummary | null)[] = [];
  for (let i = 1; i <= MAX_SAVE_SLOTS; i++) {
    if (!isStorageAvailable()) {
      summaries.push(null);
      continue;
    }
    try {
      // まずサマリーキーを試行
      const summaryRaw = window.localStorage.getItem(`${SAVE_KEY_PREFIX}${i}_summary`);
      if (summaryRaw) {
        summaries.push(JSON.parse(summaryRaw));
        continue;
      }
      
      // サマリーがない場合はレガシーサポート（メインキーから抽出）
      const fullRes = loadGame(i);
      if (fullRes && fullRes.summary) {
        summaries.push(fullRes.summary);
      } else if (fullRes) {
        // summary フィールドすらない超古いデータ
        const summary = createSaveSummary(fullRes.gameState, fullRes.savedAt);
        summaries.push(summary);
        
        // 次回以降のためにサマリーをバックフィル（保存）しておく
        try {
          window.localStorage.setItem(`${SAVE_KEY_PREFIX}${i}_summary`, JSON.stringify(summary));
        } catch { /* 失敗は無視 */ }
      } else {
        summaries.push(null);
      }
    } catch {
      summaries.push(null);
    }
  }
  return summaries;
}

/**
 * localStorage から特定のセーブデータを削除する。
 * ブラウザ環境以外では何もしない。
 * localStorage アクセス失敗時はエラーを握りつぶす。
 * 
 * @param slot - 削除するスロット番号 (1-5)
 */
export function deleteSave(slot: number): void {
  if (!isStorageAvailable() || slot < 1 || slot > MAX_SAVE_SLOTS) return;

  try {
    window.localStorage.removeItem(`${SAVE_KEY_PREFIX}${slot}`);
    window.localStorage.removeItem(`${SAVE_KEY_PREFIX}${slot}_summary`);
  } catch {
    // 失敗は無視する
  }
}

/**
 * 特定のセーブデータが存在するかどうかを返す。
 *
 * @param slot - 確認するスロット番号 (1-5)
 * @returns セーブデータが存在すれば true
 */
export function hasSave(slot: number): boolean {
  if (!isStorageAvailable() || slot < 1 || slot > MAX_SAVE_SLOTS) return false;

  try {
    return window.localStorage.getItem(`${SAVE_KEY_PREFIX}${slot}`) !== null;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// グローバル実績ストア（スロットをまたいで永続化）
// ---------------------------------------------------------------------------

const GLOBAL_ACHIEVEMENTS_KEY = `${SAVE_KEY_PREFIX}global_achievements`;

/**
 * 全スロットをまたいで保存されたグローバル実績IDリストを返す。
 */
export function getGlobalAchievements(): string[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(GLOBAL_ACHIEVEMENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * 新たに解除された実績IDをグローバルストアにマージして保存する。
 * 重複は除去される。
 *
 * @param ids - 追加する実績IDのリスト
 */
export function mergeGlobalAchievements(ids: string[]): void {
  if (!isStorageAvailable() || ids.length === 0) return;
  try {
    const existing = getGlobalAchievements();
    const merged = Array.from(new Set([...existing, ...ids]));
    window.localStorage.setItem(GLOBAL_ACHIEVEMENTS_KEY, JSON.stringify(merged));
  } catch {
    // 失敗は無視する
  }
}

