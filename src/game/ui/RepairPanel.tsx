'use client';

/**
 * @fileoverview 修理屋パネルコンポーネント
 *
 * TILE_REPAIR を踏んだときに表示される。
 * 修理タブ: 25%/50%/全回復の修理（各装備1回限り、確率イベントあり）
 * 強化タブ: ATK+2/DEF+1 または MaxDUR+10（各装備1回限り）
 * 対象: 武器 / 盾 / 防具
 */

import { useState } from 'react';
import type { GameState, WeaponInstance, EquippedShield, EquippedArmor } from '../core/game-state';
import { playSE } from '../systems/audio';
import {
  getRepairOptions,
  getUpgradeOptions,
  repairWeaponWithEvent,
  upgradeWeapon,
  getRepairOptionsForShield,
  getUpgradeOptionsForShield,
  repairShieldWithEvent,
  upgradeShield,
  getRepairOptionsForArmor,
  getUpgradeOptionsForArmor,
  repairArmorWithEvent,
  upgradeArmor,
  type RepairOption,
  type UpgradeOption,
} from '../core/repair-system';

type PanelTab = 'repair' | 'upgrade';
type EquipCategory = 'weapon' | 'shield' | 'armor';

interface RepairPanelProps {
  gameState: GameState;
  onUpdateState: (next: GameState) => void;
  onClose: () => void;
}

export default function RepairPanel({ gameState, onUpdateState, onClose }: RepairPanelProps) {
  const weapons = gameState.player?.weaponSlots ?? [];
  const shields = gameState.player?.shieldSlots ?? [];
  const armors = gameState.player?.armorSlots ?? [];
  const gold = gameState.inventory.gold;

  const [tab, setTab] = useState<PanelTab>('repair');
  const [category, setCategory] = useState<EquipCategory>('weapon');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lastMessage, setLastMessage] = useState<string>('');

  const selectedWeapon: WeaponInstance | null =
    category === 'weapon' && selectedIndex !== null ? (weapons[selectedIndex] ?? null) : null;
  const selectedShield: EquippedShield | null =
    category === 'shield' && selectedIndex !== null ? (shields[selectedIndex] ?? null) : null;
  const selectedArmor: EquippedArmor | null =
    category === 'armor' && selectedIndex !== null ? (armors[selectedIndex] ?? null) : null;

  const repairOptions = selectedWeapon
    ? getRepairOptions(selectedWeapon, gold)
    : selectedShield
      ? getRepairOptionsForShield(selectedShield, gold)
      : selectedArmor
        ? getRepairOptionsForArmor(selectedArmor, gold)
        : [];

  const upgradeOptions = selectedWeapon
    ? getUpgradeOptions(selectedWeapon, gold)
    : selectedShield
      ? getUpgradeOptionsForShield(selectedShield, gold)
      : selectedArmor
        ? getUpgradeOptionsForArmor(selectedArmor, gold)
        : [];

  const handleRepair = (option: RepairOption) => {
    if (selectedIndex === null) return;
    let result;
    if (category === 'weapon') result = repairWeaponWithEvent(gameState, selectedIndex, option);
    else if (category === 'shield') result = repairShieldWithEvent(gameState, selectedIndex, option);
    else result = repairArmorWithEvent(gameState, selectedIndex, option);
    if (result.state !== gameState) playSE('ui_select');
    else playSE('ui_cancel');
    onUpdateState(result.state);
    setLastMessage(result.message);
  };

  const handleUpgrade = (option: UpgradeOption) => {
    if (selectedIndex === null) return;
    let result;
    if (category === 'weapon') result = upgradeWeapon(gameState, selectedIndex, option);
    else if (category === 'shield') result = upgradeShield(gameState, selectedIndex, option);
    else result = upgradeArmor(gameState, selectedIndex, option);
    if (result.state !== gameState) playSE('ui_select');
    else playSE('ui_cancel');
    onUpdateState(result.state);
    setLastMessage(result.message);
  };

  const changeCategory = (c: EquipCategory) => {
    setCategory(c);
    setSelectedIndex(null);
    setLastMessage('');
  };

  const durBar = (cur: number, max: number) => {
    const pct = Math.max(0, Math.min(1, cur / max));
    const color = pct > 0.5 ? '#44cc44' : pct > 0.25 ? '#ffaa22' : '#ff4444';
    return (
      <div style={{ width: '100%', height: 4, background: '#222', borderRadius: 2, marginTop: 2 }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
    );
  };

  const disabledLabel = (reason: string | null) => {
    if (!reason) return null;
    const map: Record<string, string> = {
      repaired: '修理済',
      upgraded: '強化済',
      nodur: '耐久なし',
      full: '満タン',
      gold: 'G不足',
    };
    return map[reason] ?? reason;
  };

  const categoryLabel: Record<EquipCategory, string> = {
    weapon: `⚔ 武器 (${weapons.length})`,
    shield: `🛡 盾 (${shields.length})`,
    armor: `🔩 防具 (${armors.length})`,
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        pointerEvents: 'auto',
      }}
    >
    <div
      style={{
        width: 'min(420px, 92vw)',
        maxHeight: 'min(680px, 88vh)',
        height: 'min(680px, 88vh)',
        backgroundColor: 'rgba(3, 15, 20, 0.97)',
        border: '1px solid #22aacc',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 16px',
        fontFamily: 'monospace',
        overflowY: 'auto',
      }}
    >
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#55eeff', fontWeight: 'bold', fontSize: 14 }}>⚙ 修理屋</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#ffcc44', fontSize: 12 }}>所持金: <strong>{gold.toLocaleString()} G</strong></span>
          <button
            onClick={onClose}
            style={{ background: 'rgba(30,50,70,0.8)', border: '1px solid #22aacc', borderRadius: 6, color: '#aaaacc', padding: '8px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}
          >
            閉じる
          </button>
        </div>
      </div>

      {/* 装備カテゴリ選択 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['weapon', 'shield', 'armor'] as EquipCategory[]).map((c) => (
          <button
            key={c}
            onClick={() => changeCategory(c)}
            style={{
              flex: 1, padding: '8px 4px', fontSize: 13, fontFamily: 'monospace',
              background: category === c ? 'rgba(20, 80, 110, 0.9)' : 'rgba(10, 25, 35, 0.5)',
              border: `1px solid ${category === c ? '#33bbdd' : '#1a3344'}`,
              borderRadius: 6, cursor: 'pointer',
              color: category === c ? '#99ddee' : '#334455',
              fontWeight: category === c ? 'bold' : 'normal',
            }}
          >
            {categoryLabel[c]}
          </button>
        ))}
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['repair', 'upgrade'] as PanelTab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setLastMessage(''); }}
            style={{
              flex: 1, padding: '10px', fontSize: 15, fontFamily: 'monospace',
              background: tab === t ? 'rgba(20, 100, 130, 0.8)' : 'rgba(10, 30, 40, 0.5)',
              border: `1px solid ${tab === t ? '#44bbdd' : '#223344'}`,
              borderRadius: 6, cursor: 'pointer',
              color: tab === t ? '#aadeee' : '#446677',
              fontWeight: tab === t ? 'bold' : 'normal',
            }}
          >
            {t === 'repair' ? '🔧 修理' : '⬆ 強化'}
          </button>
        ))}
      </div>

      <div style={{ height: 1, backgroundColor: '#22aacc', marginBottom: 8 }} />

      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
        {/* 左: 装備リスト */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ color: '#88ddee', fontSize: 11, marginBottom: 4, fontWeight: 'bold' }}>
            {category === 'weapon' ? '武器スロット' : category === 'shield' ? '盾スロット' : '防具スロット'}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {category === 'weapon' && weapons.length === 0 && (
              <div style={{ color: '#556677', fontSize: 12 }}>武器がありません</div>
            )}
            {category === 'shield' && shields.length === 0 && (
              <div style={{ color: '#556677', fontSize: 12 }}>盾がありません</div>
            )}
            {category === 'armor' && armors.length === 0 && (
              <div style={{ color: '#556677', fontSize: 12 }}>防具がありません</div>
            )}

            {category === 'weapon' && weapons.map((w, i) => {
              const hasDur = w.durability !== null && w.maxDurability !== null;
              const isSelected = selectedIndex === i;
              return (
                <button key={i} onClick={() => { setSelectedIndex(i); setLastMessage(''); }}
                  style={{
                    textAlign: 'left',
                    background: isSelected ? 'rgba(30, 100, 120, 0.7)' : 'rgba(10, 30, 40, 0.6)',
                    border: `1px solid ${isSelected ? '#55eeff' : '#223344'}`,
                    borderRadius: 4, padding: '5px 7px', cursor: 'pointer', color: '#ccddee',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isSelected ? 'bold' : 'normal' }}>{w.name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: '#8899aa' }}>ATK:{w.atk}</span>
                    {hasDur && <span style={{ fontSize: 10, color: '#8899aa' }}>耐久:{w.durability}/{w.maxDurability}</span>}
                    {w.repairedAtShop && <span style={{ fontSize: 9, color: '#55aacc', background: 'rgba(0,80,100,0.4)', borderRadius: 2, padding: '0 3px' }}>修理済</span>}
                    {w.upgradedAtShop && <span style={{ fontSize: 9, color: '#aacc44', background: 'rgba(40,80,0,0.4)', borderRadius: 2, padding: '0 3px' }}>強化済</span>}
                  </div>
                  {hasDur && durBar(w.durability!, w.maxDurability!)}
                </button>
              );
            })}

            {category === 'shield' && shields.map((s, i) => {
              const isSelected = selectedIndex === i;
              return (
                <button key={i} onClick={() => { setSelectedIndex(i); setLastMessage(''); }}
                  style={{
                    textAlign: 'left',
                    background: isSelected ? 'rgba(30, 100, 120, 0.7)' : 'rgba(10, 30, 40, 0.6)',
                    border: `1px solid ${isSelected ? '#55eeff' : '#223344'}`,
                    borderRadius: 4, padding: '5px 7px', cursor: 'pointer', color: '#ccddee',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isSelected ? 'bold' : 'normal' }}>{s.name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: '#8899aa' }}>DEF:{s.def}</span>
                    <span style={{ fontSize: 10, color: '#8899aa' }}>耐久:{s.durability}/{s.maxDurability}</span>
                    {s.repairedAtShop && <span style={{ fontSize: 9, color: '#55aacc', background: 'rgba(0,80,100,0.4)', borderRadius: 2, padding: '0 3px' }}>修理済</span>}
                    {s.upgradedAtShop && <span style={{ fontSize: 9, color: '#aacc44', background: 'rgba(40,80,0,0.4)', borderRadius: 2, padding: '0 3px' }}>強化済</span>}
                  </div>
                  {durBar(s.durability, s.maxDurability)}
                </button>
              );
            })}

            {category === 'armor' && armors.map((a, i) => {
              const isSelected = selectedIndex === i;
              return (
                <button key={i} onClick={() => { setSelectedIndex(i); setLastMessage(''); }}
                  style={{
                    textAlign: 'left',
                    background: isSelected ? 'rgba(30, 100, 120, 0.7)' : 'rgba(10, 30, 40, 0.6)',
                    border: `1px solid ${isSelected ? '#55eeff' : '#223344'}`,
                    borderRadius: 4, padding: '5px 7px', cursor: 'pointer', color: '#ccddee',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isSelected ? 'bold' : 'normal' }}>{a.name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: '#8899aa' }}>DEF:{a.def}</span>
                    <span style={{ fontSize: 10, color: '#8899aa' }}>耐久:{a.durability}/{a.maxDurability}</span>
                    {a.repairedAtShop && <span style={{ fontSize: 9, color: '#55aacc', background: 'rgba(0,80,100,0.4)', borderRadius: 2, padding: '0 3px' }}>修理済</span>}
                    {a.upgradedAtShop && <span style={{ fontSize: 9, color: '#aacc44', background: 'rgba(40,80,0,0.4)', borderRadius: 2, padding: '0 3px' }}>強化済</span>}
                  </div>
                  {durBar(a.durability, a.maxDurability)}
                </button>
              );
            })}
          </div>
        </div>

        {/* 右: 操作メニュー */}
        <div style={{ width: 200, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ color: '#88ddee', fontSize: 11, marginBottom: 4, fontWeight: 'bold' }}>
            {tab === 'repair' ? '修理メニュー' : '強化メニュー'}
          </div>

          {(selectedWeapon === null && selectedShield === null && selectedArmor === null) ? (
            <div style={{ color: '#445566', fontSize: 12, marginTop: 8 }}>← 装備を選択</div>
          ) : tab === 'repair' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {repairOptions.map((info) => {
                const disabled = info.disabledReason !== null;
                const label = disabledLabel(info.disabledReason);
                return (
                  <button
                    key={info.option}
                    onClick={() => !disabled && handleRepair(info.option)}
                    disabled={disabled}
                    style={{
                      background: disabled ? 'rgba(15, 25, 35, 0.5)' : 'rgba(20, 80, 100, 0.7)',
                      border: `1px solid ${disabled ? '#1a2a3a' : '#44aacc'}`,
                      borderRadius: 6, padding: '12px 10px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      color: disabled ? '#334455' : '#aadeee',
                      fontSize: 14, textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 'bold' }}>{info.label}</span>
                      {label && <span style={{ fontSize: 11, color: '#ff8866' }}>{label}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: disabled ? '#223344' : '#88bbcc', marginTop: 2 }}>
                      +{info.healAmount} 耐久
                    </div>
                    <div style={{ fontSize: 13, color: disabled ? '#223344' : '#ffcc44', marginTop: 3, fontWeight: 'bold' }}>
                      {info.cost.toLocaleString()} G
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {upgradeOptions.map((info) => {
                const disabled = info.disabledReason !== null;
                const label = disabledLabel(info.disabledReason);
                return (
                  <button
                    key={info.option}
                    onClick={() => !disabled && handleUpgrade(info.option)}
                    disabled={disabled}
                    style={{
                      background: disabled ? 'rgba(15, 25, 35, 0.5)' : 'rgba(20, 60, 20, 0.7)',
                      border: `1px solid ${disabled ? '#1a2a3a' : '#44aa66'}`,
                      borderRadius: 6, padding: '12px 10px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      color: disabled ? '#334455' : '#aaeebb',
                      fontSize: 14, textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 'bold' }}>{info.label}</span>
                      {label && <span style={{ fontSize: 11, color: '#ff8866' }}>{label}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: disabled ? '#223344' : '#88ccaa', marginTop: 2 }}>
                      {info.description}
                    </div>
                    <div style={{ fontSize: 13, color: disabled ? '#223344' : '#ffcc44', marginTop: 3, fontWeight: 'bold' }}>
                      {info.cost.toLocaleString()} G
                    </div>
                  </button>
                );
              })}
              <div style={{ marginTop: 6, padding: '5px 6px', background: 'rgba(10,20,10,0.5)', borderRadius: 4, border: '1px solid #1a3a1a', fontSize: 10, color: '#4a7a4a' }}>
                各装備1回のみ
              </div>
            </div>
          )}

          {/* 凡例 */}
          <div style={{ marginTop: 8, padding: '5px 7px', background: 'rgba(10,20,30,0.5)', borderRadius: 4, border: '1px solid #113344', fontSize: 10, color: '#445566' }}>
            修理・強化とも<br />各装備1回限り
          </div>
        </div>
      </div>

      {/* メッセージ欄 */}
      {lastMessage && (
        <div
          style={{
            marginTop: 8, padding: '7px 10px',
            background: 'rgba(10, 30, 50, 0.8)',
            border: '1px solid #2a6a8a', borderRadius: 4,
            color: lastMessage.startsWith('⚠') ? '#ff8888'
              : lastMessage.startsWith('✦') ? '#ffdd44'
              : lastMessage.startsWith('★') ? '#88eebb'
              : lastMessage.startsWith('⚙') ? '#aaffcc'
              : '#aaddee',
            fontSize: 12, lineHeight: 1.5,
          }}
        >
          {lastMessage}
        </div>
      )}
    </div>
    </div>
  );
}
