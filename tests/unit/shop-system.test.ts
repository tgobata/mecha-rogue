import { describe, it, expect } from 'vitest';
import {
  getShopInventory,
  buyItem,
  sellItem,
  repairWeapon,
} from '../../src/game/core/shop-system.js';
import { createInitialGameState } from '../../src/game/core/game-state.js';
import type { WeaponInstance } from '../../src/game/core/game-state.js';

describe('ショップシステム (shop-system)', () => {
  describe('getShopInventory', () => {
    it('武器とアイテムの在庫リストを返す', () => {
      const inventory = getShopInventory(1, () => 0.5); // 1階
      expect(Array.isArray(inventory)).toBe(true);
      expect(inventory.length).toBeGreaterThan(0);
      
      const hasWeapons = inventory.some((i: any) => i.type === 'weapon');
      const hasItems = inventory.some((i: any) => i.type === 'item');
      expect(hasWeapons).toBe(true);
      expect(hasItems).toBe(true);
      
      // 価格が設定されていること
      inventory.forEach((i: any) => {
        expect(i.buy).toBeGreaterThan(0);
        expect(i.sell).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('buyItem', () => {
    it('お金が足りない場合は state をそのまま返す', () => {
      const state = createInitialGameState();
      state.inventory.gold = 10; // 貧乏
      
      const result = buyItem(state, 'repair_kit_small', 'item');
      expect(result.inventory.gold).toBe(10);
      expect(result).toBe(state);
    });

    it('アイテムを購入するとお金が減り、インベントリに追加される', () => {
      const state = createInitialGameState();
      state.inventory.gold = 500;
      state.inventory.items = []; // 空にする
      
      // repair_kit_small (50G)
      const result = buyItem(state, 'repair_kit_small', 'item');
      
      expect(result.inventory.gold).toBe(450); // 500 - 50
      expect(result.inventory.items.some((i: any) => i.itemId === 'repair_kit_small')).toBe(true);
    });

    it('武器を購入するとお金が減り、インベントリの装備リストに追加される', () => {
      const state = createInitialGameState();
      state.inventory.gold = 1000;
      state.machine.weaponSlots = 2;
      state.player = {
        pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, atk: 10, def: 5, facing: 'down',
        weaponSlots: []
      };
      
      // blade_arm (200G)
      const result = buyItem(state, 'blade_arm', 'weapon');
      
      expect(result.inventory.gold).toBe(800); // 1000 - 200
      expect(result.player!.weaponSlots!.length).toBe(1);
      expect(result.player!.weaponSlots![0].id).toBe('blade_arm');
    });
  });

  describe('sellItem', () => {
    it('アイテムを売却するとお金が増え、インベントリから消える', () => {
      const state = createInitialGameState();
      state.inventory.gold = 100;
      state.inventory.items = [
        { itemId: 'repair_kit_small', quantity: 1, unidentified: false },
        { itemId: 'repair_kit_small', quantity: 1, unidentified: false }
      ];
      
      // repair_kit_small sell: 20
      const result = sellItem(state, 'repair_kit_small', 'item', 0);
      
      expect(result.inventory.gold).toBe(120); // 100 + 20
      expect(result.inventory.items.length).toBe(1); // 2個あったのが1個になる
    });

    it('武器を売却するとお金が増え、武器スロットから消える', () => {
      const state = createInitialGameState();
      state.inventory.gold = 100;
      const wp: WeaponInstance = {
        id: 'blade_arm', name: 'W', category: 'melee', atk: 10, range: 4,
        rangeType: 'single', durability: 50, maxDurability: 50, durabilityLoss: 1,
        rarity: 'common', energyCost: 2, special: null, rawRangeType: 'single'
      };
      state.player = {
        pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, atk: 10, def: 5, facing: 'down',
        weaponSlots: [wp]
      };
      
      // blade_arm sell: 90
      const result = sellItem(state, 'blade_arm', 'weapon', 0);
      
      expect(result.inventory.gold).toBe(190); // 100 + 90
      expect(result.player!.weaponSlots!.length).toBe(0);
    });
  });

  describe('repairWeapon', () => {
    it('耐久力が減っている武器なら修理可能でお金が減り耐久力が回復する', () => {
      const state = createInitialGameState();
      state.inventory.gold = 1000;
      const wp: WeaponInstance = {
        id: 'blade_arm', name: 'W', category: 'melee', atk: 10, range: 4,
        rangeType: 'single', durability: 20, maxDurability: 50, durabilityLoss: 1, // 30減っている
        rarity: 'common', energyCost: 2, special: null, rawRangeType: 'single'
      };
      state.player = {
        pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, atk: 10, def: 5, facing: 'down',
        weaponSlots: [wp]
      };
      
      // REPAIR_COST_PER_DURABILITY = 15 なので、30 * 15 = 450G かかるはず
      const result = repairWeapon(state, 0);
      
      expect(result.inventory.gold).toBe(1000 - 450);
      expect(result.player!.weaponSlots![0].durability).toBe(50);
    });

    it('お金が足りない場合は state をそのまま返す', () => {
      const state = createInitialGameState();
      state.inventory.gold = 10;
      const wp: WeaponInstance = {
        id: 'blade_arm', name: 'W', category: 'melee', atk: 10, range: 4,
        rangeType: 'single', durability: 20, maxDurability: 50, durabilityLoss: 1,
        rarity: 'common', energyCost: 2, special: null, rawRangeType: 'single'
      };
      state.player = {
        pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, atk: 10, def: 5, facing: 'down',
        weaponSlots: [wp]
      };
      
      const result = repairWeapon(state, 0);
      expect(result).toBe(state);
    });

    it('耐久力が最大の武器は修理しなくてよい（元のstateを返す）', () => {
      const state = createInitialGameState();
      state.inventory.gold = 1000;
      const wp: WeaponInstance = {
        id: 'blade_arm', name: 'W', category: 'melee', atk: 10, range: 4,
        rangeType: 'single', durability: 50, maxDurability: 50, durabilityLoss: 1,
        rarity: 'common', energyCost: 2, special: null, rawRangeType: 'single'
      };
      state.player = {
        pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, atk: 10, def: 5, facing: 'down',
        weaponSlots: [wp]
      };
      
      const result = repairWeapon(state, 0);
      expect(result).toBe(state);
    });
  });
});
