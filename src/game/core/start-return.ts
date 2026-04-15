/**
 * @fileoverview スタート帰還処理
 *
 * マシンHP 0 時のスタート帰還ロジック（GDD 3.5）。
 * ペナルティを適用してフロア1に帰還した新しい GameState を返す。
 *
 * 純粋関数。引数の state を直接変更せず、必ず新しいオブジェクトを返す。
 * React 非依存。
 */

import type { GameState, Player } from './game-state';
import { INITIAL_FACING } from './game-state';
import { INITIAL_PLAYER_ATK, INITIAL_PLAYER_DEF, MAX_PILOT_LEVEL } from './constants';
import { generateFloor } from './maze-generator';
import { getLevelData } from './level-system';

// ---------------------------------------------------------------------------
// スタート帰還ペナルティ定数（GDD 3.5）
// ---------------------------------------------------------------------------

/** 帰還時に失う所持金の割合 */
const GOLD_LOSS_RATE = 0.5;

/** アイテム消滅割合の最小値（30%） */
const ITEM_LOSS_MIN = 0.3;

/** アイテム消滅割合の最大値（50%） */
const ITEM_LOSS_MAX = 0.5;

/** 帰還後のフロア番号 */
const RETURN_FLOOR = 1;

// ---------------------------------------------------------------------------
// シード付き簡易 PRNG（テスタビリティのため）
// ---------------------------------------------------------------------------

/**
 * 線形合同法による簡易シード付き疑似乱数生成器。
 * 0 以上 1 未満の浮動小数点数を返す関数を返す。
 *
 * @param seed - 初期シード値
 * @returns 乱数生成関数
 */
function createPrng(seed: number): () => number {
  let s = seed >>> 0; // 符号なし32ビット整数に正規化
  return () => {
    // Park-Miller LCG
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// applyStartReturn
// ---------------------------------------------------------------------------

/** イージーモード: アイテム・装備の消滅確率（2/5 を失う → 3/5 が残る） */
const EASY_LOSS_RATE = 2 / 5;

/**
 * イージーモード時のゲームオーバー帰還処理。
 *
 * ペナルティ:
 * - パイロット Lv を ceil(Lv × 3/5) に削減（最小1）、EXP は 0 にリセット
 * - マシン現在 HP を ceil(maxHp × 3/5) に削減（maxHp は変化なし）
 * - 所持アイテム・装備をランダムに 2/5 消滅（各 60% 確率で残す）
 * - 生き残った装備の耐久度は全回復
 * - スキルはそのまま維持
 * - 所持金・倉庫・マシン強化・実績など他のデータは変化なし
 *
 * @param state - ゲームオーバー直前の GameState
 * @param seed - ランダム消滅に使うシード値（省略時は Date.now()）
 * @returns ペナルティ適用後の新しい GameState（phase は呼び出し元で設定すること）
 */
export function applyEasyReturn(state: GameState, seed?: number): GameState {
  const rng = createPrng(seed ?? Date.now());

  // ── パイロットレベル: 2/5 削減（3/5 残す） ──────────────────────────────────
  const newLevel = Math.max(1, Math.ceil(state.pilot.level * (1 - EASY_LOSS_RATE)));
  const newExpToNextLevel =
    newLevel < MAX_PILOT_LEVEL
      ? getLevelData(newLevel + 1).exp_required
      : getLevelData(newLevel).exp_required;

  const newPilot = {
    ...state.pilot,
    level: newLevel,
    exp: 0,
    expToNextLevel: newExpToNextLevel,
    // skillPoints・allocatedSkills はそのまま維持（スキルはそのまま）
  };

  // ── マシン HP: 2/5 削減（maxHp の 3/5 を現在 HP として設定） ─────────────
  const newHp = Math.ceil(state.machine.maxHp * (1 - EASY_LOSS_RATE));
  const newMachine = {
    ...state.machine,
    hp: newHp,
  };

  // ── アイテム・装備: ランダムに 2/5 消滅（各 60% 確率で残す） ────────────────
  const survivingItems = state.inventory.items.filter(() => rng() >= EASY_LOSS_RATE);

  // 武器: 生き残ったものの耐久度を maxDurability に全回復
  // player.weaponSlots（WeaponInstance）から maxDurability を逆引きする
  const weaponSlots = state.player?.weaponSlots ?? [];
  const survivingWeapons = state.inventory.equippedWeapons
    .filter(() => rng() >= EASY_LOSS_RATE)
    .map((ew) => {
      const wi = weaponSlots.find((w) => w.instanceId === ew.instanceId);
      const maxDur = wi?.maxDurability;
      return maxDur !== null && maxDur !== undefined
        ? { ...ew, durability: maxDur }
        : ew;
    });

  // 盾: 生き残ったものの耐久度を maxDurability に全回復
  const survivingShields = state.inventory.equippedShields
    .filter(() => rng() >= EASY_LOSS_RATE)
    .map((es) => ({ ...es, durability: es.maxDurability }));

  // アーマー: 生き残ったものの耐久度を maxDurability に全回復
  const survivingArmors = state.inventory.equippedArmors
    .filter(() => rng() >= EASY_LOSS_RATE)
    .map((ea) => ({ ...ea, durability: ea.maxDurability }));

  // 道具: 消滅判定のみ（耐久度なし）
  const survivingTools = state.inventory.equippedTools.filter(() => rng() >= EASY_LOSS_RATE);

  const newInventory = {
    ...state.inventory,
    items: survivingItems,
    equippedWeapons: survivingWeapons,
    equippedShields: survivingShields,
    equippedArmors: survivingArmors,
    equippedTools: survivingTools,
  };

  return {
    ...state,
    pilot: newPilot,
    machine: newMachine,
    inventory: newInventory,
    // skills はそのまま維持（...state で引き継ぎ済み）
  };
}

/**
 * マシンHP 0 時のスタート帰還処理（ノーマルモード）。
 * GDD 3.5 のペナルティを適用し、フロア1の新しい GameState を返す。
 *
 * ペナルティ:
 * - 所持金 50% 失う
 * - 所持アイテム（ポーチ内）をランダムで 30〜50% 消滅
 * - 装備中の武器を全て消滅
 * - 装備中の道具を全て消滅
 * - マシン強化（appliedParts）は維持
 * - パイロットLv・スキルは維持
 * - マシンHP を最大値まで回復
 *
 * @param state - 帰還前の GameState
 * @param seed - ランダム消滅に使うシード値（省略時は Date.now()）
 * @returns 帰還後の新しい GameState
 */
export function applyStartReturn(state: GameState, seed?: number): GameState {
  const rng = createPrng(seed ?? Date.now());

  // ── 所持金ペナルティ ────────────────────────────────────────────────────
  // floor() で切り捨て（50% 失う = 半分以下になる）
  const newGold = Math.floor(state.inventory.gold * (1 - GOLD_LOSS_RATE));

  // ── アイテム消滅ペナルティ ──────────────────────────────────────────────
  // 消滅率をシード付き乱数で決定（30〜50% の範囲）
  const lossRate = ITEM_LOSS_MIN + rng() * (ITEM_LOSS_MAX - ITEM_LOSS_MIN);

  // 各アイテムを独立した確率で消滅させる（均等消滅）
  const survivingItems = state.inventory.items.filter(() => rng() >= lossRate);

  // ── 装備消滅ペナルティ ──────────────────────────────────────────────────
  // 装備中の武器・道具は全て消滅
  const newInventory = {
    ...state.inventory,
    gold: newGold,
    items: survivingItems,
    equippedWeapons: [],
    equippedTools: [],
  };

  // ── フロア1を生成 ────────────────────────────────────────────────────────
  const floorSeed = seed !== undefined ? seed + 1 : Date.now() + 1;
  const newMap = generateFloor(RETURN_FLOOR, floorSeed);

  // ── プレイヤーを回復・配置 ───────────────────────────────────────────────
  const newPlayer: Player = {
    pos: newMap.startPos,
    hp: state.machine.maxHp,
    maxHp: state.machine.maxHp,
    atk: state.player?.atk ?? INITIAL_PLAYER_ATK,
    def: state.player?.def ?? INITIAL_PLAYER_DEF,
    facing: INITIAL_FACING,
  };

  // ── マシンHP回復 ─────────────────────────────────────────────────────────
  const newMachine = {
    ...state.machine,
    hp: state.machine.maxHp,
  };

  // ── パイロットレベルをリセット ─────────────────────────────────────────────
  const newPilot = {
    ...state.pilot,
    level: 1,
    exp: 0,
    skillPoints: 0,
  };

  // ── 敵はスポーンしない（import 循環回避。呼び出し元が必要なら別途生成する） ─
  // turn-system.ts が applyStartReturn を呼んだ直後に spawnEnemiesFromMap を
  // 実行してセットするため、ここでは空配列を返す。

  return {
    ...state,
    phase: 'exploring',
    pilot: newPilot,
    machine: newMachine,
    inventory: newInventory,
    exploration: {
      currentFloor: newMap,
      playerPos: newMap.startPos,
      floorNumber: RETURN_FLOOR,
      turn: state.exploration?.turn ?? 0,
    },
    player: newPlayer,
    enemies: [],
    map: newMap,
    floor: RETURN_FLOOR,
  };
}
