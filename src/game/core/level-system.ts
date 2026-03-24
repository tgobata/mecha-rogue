/**
 * @fileoverview レベルシステム
 *
 * EXP の加算、レベルアップ判定、ステータスボーナス適用を純粋関数として提供する。
 * exp-table.json を静的 import で読み込み、レベルアップテーブルを参照する。
 *
 * 設計原則:
 * - 純粋関数。引数の GameState を直接変更せず、必ず新しいオブジェクトを返す。
 * - React 非依存。
 * - マジックナンバー禁止（constants.ts の定数を使う）。
 */

import expTableRaw from '../assets/data/exp-table.json';
import type { GameState } from './game-state';
import { MAX_PILOT_LEVEL } from './constants';

// ---------------------------------------------------------------------------
// exp-table.json の型定義
// ---------------------------------------------------------------------------

interface ExpTableData {
  version: string;
  levels: LevelData[];
}

/**
 * exp-table.json の1レベルエントリを表す。
 */
export interface LevelData {
  /** レベル番号（1始まり） */
  level: number;
  /** このレベルに到達するために必要な累積経験値 */
  exp_required: number;
  /** レベルアップ時の HP ボーナス */
  hp_bonus: number;
  /** レベルアップ時の ATK ボーナス */
  atk_bonus: number;
  /** レベルアップ時の DEF ボーナス */
  def_bonus: number;
}

const EXP_TABLE_DATA = expTableRaw as unknown as ExpTableData;
const LEVEL_TABLE: LevelData[] = EXP_TABLE_DATA.levels;

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 指定の累積 EXP が対応するレベルを返す。
 * MAX_PILOT_LEVEL を上限とする。
 *
 * @param totalExp - 累積経験値
 * @returns 対応するレベル番号
 */
function expToLevel(totalExp: number): number {
  let level = 1;
  for (const entry of LEVEL_TABLE) {
    if (entry.exp_required <= totalExp) {
      level = entry.level;
    } else {
      break;
    }
  }
  return Math.min(level, MAX_PILOT_LEVEL);
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * 指定レベルの LevelData を返す。
 * 範囲外のレベルの場合は先頭または末尾のエントリを返す。
 *
 * @param level - レベル番号（1始まり）
 * @returns 対応する LevelData
 */
export function getLevelData(level: number): LevelData {
  const clamped = Math.max(1, Math.min(level, LEVEL_TABLE.length));
  return LEVEL_TABLE[clamped - 1];
}

/**
 * 次のレベルアップまでに必要な残り EXP を返す。
 * 最大レベルに達している場合は 0 を返す。
 *
 * @param state - 現在の GameState
 * @returns 次レベルまでの残り経験値
 */
export function getExpToNextLevel(state: GameState): number {
  const currentLevel = state.pilot.level;
  if (currentLevel >= MAX_PILOT_LEVEL) return 0;

  const nextLevelData = getLevelData(currentLevel + 1);
  return Math.max(0, nextLevelData.exp_required - state.pilot.exp);
}

/**
 * EXP を加算し、複数レベル連続のレベルアップに対応する。
 * レベルアップが発生した場合は battleLog に「Lv.X → HP+N ATK+N DEF+N」を追記する。
 * ステータスボーナス（HP・ATK・DEF）をプレイヤーとマシンに反映する。
 *
 * @param state - EXP 加算前の GameState
 * @param expAmount - 加算する経験値量
 * @returns 更新後の新しい GameState
 */
export function addExp(state: GameState, expAmount: number): GameState {
  if (expAmount <= 0) return state;

  const newTotalExp = state.pilot.exp + expAmount;
  const oldLevel = state.pilot.level;

  // 最大レベルチェック
  if (oldLevel >= MAX_PILOT_LEVEL) {
    return {
      ...state,
      pilot: { ...state.pilot, exp: newTotalExp },
    };
  }

  const newLevel = expToLevel(newTotalExp);
  const levelUps = newLevel - oldLevel;

  if (levelUps <= 0) {
    // レベルアップなし: EXP のみ更新
    return {
      ...state,
      pilot: { ...state.pilot, exp: newTotalExp },
    };
  }

  // 連続レベルアップ: 各レベルのボーナスを合計する
  let totalHpBonus = 0;
  let totalAtkBonus = 0;
  let totalDefBonus = 0;

  for (let lv = oldLevel + 1; lv <= newLevel; lv++) {
    const data = getLevelData(lv);
    totalHpBonus += data.hp_bonus;
    totalAtkBonus += data.atk_bonus;
    totalDefBonus += data.def_bonus;
  }

  // パイロットステータス更新
  const newPilot = {
    ...state.pilot,
    level: newLevel,
    exp: newTotalExp,
    expToNextLevel:
      newLevel < MAX_PILOT_LEVEL
        ? getLevelData(newLevel + 1).exp_required
        : getLevelData(newLevel).exp_required,
    skillPoints: state.pilot.skillPoints + levelUps * 2,
  };

  // マシンステータス更新（HP ボーナスを反映）
  const newMachine = {
    ...state.machine,
    maxHp: state.machine.maxHp + totalHpBonus,
    hp: state.machine.hp + totalHpBonus,
    armor: state.machine.armor + totalDefBonus,
  };

  // プレイヤーランタイム更新
  const newPlayer = state.player
    ? {
        ...state.player,
        maxHp: state.player.maxHp + totalHpBonus,
        hp: state.player.hp + totalHpBonus,
        atk: state.player.atk + totalAtkBonus,
        def: state.player.def + totalDefBonus,
      }
    : state.player;

  // バトルログ追記
  const logEntry =
    `Lv.${oldLevel} → Lv.${newLevel} HP+${totalHpBonus} ATK+${totalAtkBonus} DEF+${totalDefBonus}`;
  const newBattleLog = [...(state.battleLog ?? []), logEntry];

  return {
    ...state,
    pilot: newPilot,
    machine: newMachine,
    player: newPlayer,
    battleLog: newBattleLog,
  };
}
