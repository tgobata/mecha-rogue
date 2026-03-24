import { GameState } from '../core/game-state';
import achievementsData from '../assets/data/achievements.json';

/** achievements.json の1エントリを表す型 */
interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

/** 定義済み実績のID一覧（型安全な参照用） */
const ACHIEVEMENT_DEFS: AchievementDef[] = achievementsData as AchievementDef[];
export { ACHIEVEMENT_DEFS };

/**
 * 獲得条件をチェックし、新しく獲得した実績IDのリストを返す。
 * state.achievements にまだ含まれていない実績だけを返す（重複なし）。
 */
export function checkAchievements(state: GameState): string[] {
  const newlyUnlocked: string[] = [];
  const unlocked = state.achievements ?? [];
  const bossesDefeated = state.bossesDefeated ?? [];

  /** ヘルパー: まだ獲得していなければ候補に追加 */
  function unlock(id: string): void {
    if (!unlocked.includes(id) && !newlyUnlocked.includes(id)) {
      newlyUnlocked.push(id);
    }
  }

  // ── 進行系 ──────────────────────────────────────────────────────────────

  // First Steps: Floor 2 に到達
  if (state.floor >= 2) unlock('first_steps');

  // Survivor: Floor 10 に到達
  if (state.floor >= 10) unlock('survivor');

  // ── 資産系 ──────────────────────────────────────────────────────────────

  // Resourceful: 1000 Gold 所持
  if (state.inventory.gold >= 1000) unlock('wealthy');

  // ── ボス撃破系 ──────────────────────────────────────────────────────────

  // Bug Squasher: バグスウォームを撃破（floor 2 ボス）
  if (bossesDefeated.includes('bug_swarm')) unlock('boss_slayer_1');

  // Mecha Master: ファイナルボスを撃破（floor 50 ボス）
  if (bossesDefeated.includes('final_boss')) unlock('boss_slayer_13');

  // ── コレクター系 ─────────────────────────────────────────────────────────

  // Arsenal: 全武器スロットをレジェンダリー武器で埋める
  const weaponSlotCount = state.machine.weaponSlots;
  const playerWeapons = state.player?.weaponSlots ?? [];
  if (
    playerWeapons.length >= weaponSlotCount &&
    weaponSlotCount > 0 &&
    playerWeapons.every((w) => w.rarity === 'legendary')
  ) {
    unlock('collector');
  }

  return newlyUnlocked;
}
