import { describe, it, expect } from 'vitest';
import {
  getLevelData,
  getExpToNextLevel,
  addExp,
} from '../../src/game/core/level-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import { MAX_PILOT_LEVEL } from '../../src/game/core/constants.js';

describe('レベルシステム (level-system)', () => {
  it('getLevelData(1) が正しく取得できる', () => {
    const data = getLevelData(1);
    expect(data.level).toBe(1);
    // レベル1の必要EXPは通常0だが、テーブル依存なので存在チェックのみ
    expect(data.hp_bonus).toBeDefined();
    expect(data.atk_bonus).toBeDefined();
    expect(data.def_bonus).toBeDefined();
  });

  it('getExpToNextLevel は次のレベルまでの残りを正しく計算する', () => {
    const state = createInitialGameState();
    state.pilot.level = 1;
    state.pilot.exp = 0;
    const requiredForLv2 = getLevelData(2).exp_required;
    
    expect(getExpToNextLevel(state)).toBe(requiredForLv2);

    state.pilot.exp = 5;
    expect(getExpToNextLevel(state)).toBe(requiredForLv2 - 5);
  });

  it('addExp で経験値が加算される（レベルアップしない範囲）', () => {
    const state = createInitialGameState();
    state.pilot.level = 1;
    state.pilot.exp = 0;
    
    const requiredForLv2 = getLevelData(2).exp_required;
    const expToAdd = requiredForLv2 - 1; // 一歩手前
    
    const result = addExp(state, expToAdd);
    
    expect(result.pilot.level).toBe(1);
    expect(result.pilot.exp).toBe(expToAdd);
    // HP等は元のまま
    expect(result.machine.maxHp).toBe(state.machine.maxHp);
  });

  it('addExp でレベルアップが発生し、ステータスが上昇する', () => {
    const state = createInitialGameState();
    state.pilot.level = 1;
    state.pilot.exp = 0;
    const initialMaxHp = state.machine.maxHp;
    const initialHp = state.machine.hp;
    const requiredForLv2 = getLevelData(2).exp_required;
    
    // レベル2になるまで経験値を与える
    const result = addExp(state, requiredForLv2 + 5);
    
    expect(result.pilot.level).toBe(2);
    expect(result.pilot.exp).toBe(requiredForLv2 + 5);
    
    const lv2Data = getLevelData(2);
    expect(result.machine.maxHp).toBe(initialMaxHp + lv2Data.hp_bonus);
    // レベルアップ時はHPが満タンに回復する（仕様によるが、通常HPも上昇分加算または回復）
    // turn-systemに任せるかlevel-systemで加算するか？ level-systemでは増分を加算する実装
    expect(result.machine.hp).toBe(initialHp + lv2Data.hp_bonus);
  });

  it('最大レベル(MAX_PILOT_LEVEL)を超えない', () => {
    const state = createInitialGameState();
    state.pilot.level = MAX_PILOT_LEVEL;
    state.pilot.exp = getLevelData(MAX_PILOT_LEVEL).exp_required;
    
    const result = addExp(state, 1000000);
    
    expect(result.pilot.level).toBe(MAX_PILOT_LEVEL);
    expect(result.pilot.exp).toBe(state.pilot.exp + 1000000); // 経験値自体は増え続ける
  });
});
