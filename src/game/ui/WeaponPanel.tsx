'use client';

/**
 * @fileoverview 武器パネルオーバーレイコンポーネント
 *
 * Canvas の上に absolute 配置で重ね、装備中武器スロットの内容を表示する。
 * キーボード（↑↓/Z/Enter/E/Escape）またはボタンクリックで操作する。
 */

import { useState, useRef, useEffect } from 'react';
import type { WeaponInstance, EquippedShield, EquippedArmor } from '../core/game-state';
import weaponsRaw from '../assets/data/weapons.json';

const WEAPON_DEFS = weaponsRaw as any[];

// ---------------------------------------------------------------------------
// 攻撃パターン表示名マッピング
// ---------------------------------------------------------------------------

/** attackPattern → 日本語表示名 */
const ATTACK_PATTERN_LABEL: Record<string, string> = {
  pierce: '「貫通」',
  spread3: '「扇形3方向」',
  cross: '「十字」',
  all8: '「全8方向」',
  bidirectional: '「前後2方向」',
  line: '「直線」',
};

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** パネル幅 (px) */
const PANEL_WIDTH = 380;
/** パネル最大高さ (px) */
const PANEL_MAX_HEIGHT = 400;
/** z-index（HUD より上に表示） */
const PANEL_Z_INDEX = 20;
/** パネル背景色 */
const PANEL_BG = 'rgba(10, 10, 26, 0.82)';
/** パネルボーダー色 */
const PANEL_BORDER = '1px solid #445566';
/** 選択行ハイライト色 */
const SELECTED_ROW_BG = 'rgba(34, 85, 136, 0.5)';
/** 耐久度バーの最大幅 (px) */
const DURABILITY_BAR_MAX_WIDTH = 80;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface WeaponPanelProps {
  /** 武器リスト (player.weaponSlots) */
  weaponSlots: WeaponInstance[];
  /** インベントリ最大容量 */
  maxCapacity: number;
  /** 現在アクティブな武器インスタンス（player.equippedWeapon） */
  activeWeapon: WeaponInstance | null | undefined;
  /** 選択中武器インデックス */
  selectedIndex: number;
  /** パネルを閉じるコールバック */
  onClose: () => void;
  /** 武器装備コールバック */
  onEquipWeapon: (index: number) => void;
  /** 武器外すコールバック */
  onUnequipWeapon?: () => void;
  /** 武器消去コールバック */
  onDropWeapon: (index: number) => void;
  /** 武器を置くコールバック */
  onPlaceWeapon?: (index: number) => void;
  /** 武器を投げるコールバック */
  onThrowWeapon?: (index: number) => void;
  /** 所持盾リスト (player.shieldSlots) */
  shieldSlots?: EquippedShield[];
  /** 盾スロット最大数 */
  maxShieldSlots?: number;
  /** 現在装備中の盾 */
  activeShield?: EquippedShield | null;
  /** 盾装備コールバック */
  onEquipShield?: (index: number) => void;
  /** 盾外すコールバック */
  onUnequipShield?: () => void;
  /** 盾消去コールバック */
  onDropShield?: (index: number) => void;
  /** 盾を置くコールバック */
  onPlaceShield?: (index: number) => void;
  /** 盾を投げるコールバック */
  onThrowShield?: (index: number) => void;
  /** 所持アーマーリスト (player.armorSlots) */
  armorSlots?: EquippedArmor[];
  /** アーマースロット最大数 */
  maxArmorSlots?: number;
  /** 現在装備中のアーマー */
  activeArmor?: EquippedArmor | null;
  /** アーマー装備コールバック */
  onEquipArmor?: (index: number) => void;
  /** アーマー外すコールバック */
  onUnequipArmor?: () => void;
  /** アーマー消去コールバック */
  onDropArmor?: (index: number) => void;
  /** アーマーを置くコールバック */
  onPlaceArmor?: (index: number) => void;
  /** アーマーを投げるコールバック */
  onThrowArmor?: (index: number) => void;
}

// ---------------------------------------------------------------------------
// レアリティ表示色マップ
// ---------------------------------------------------------------------------

/** レアリティに対応する表示色 */
const RARITY_COLOR: Record<string, string> = {
  common: '#aaaaaa',
  uncommon: '#55cc55',
  rare: '#5599ff',
  epic: '#cc55ff',
  legendary: '#ffcc22',
};

/** レアリティに対応する表示ラベル */
const RARITY_LABEL: Record<string, string> = {
  common: 'C',
  uncommon: 'U',
  rare: 'R',
  epic: 'E',
  legendary: 'L',
};

// ---------------------------------------------------------------------------
// WeaponPanel コンポーネント
// ---------------------------------------------------------------------------

/**
 * 武器パネルオーバーレイ。
 * Canvas ラッパー内の absolute 配置で中央に表示する。
 */
export default function WeaponPanel({
  weaponSlots,
  activeWeapon,
  maxCapacity,
  selectedIndex,
  onClose,
  onEquipWeapon,
  onUnequipWeapon,
  onDropWeapon,
  onPlaceWeapon,
  onThrowWeapon,
  shieldSlots = [],
  maxShieldSlots = 1,
  activeShield,
  onEquipShield,
  onUnequipShield,
  onDropShield,
  onPlaceShield,
  onThrowShield,
  armorSlots = [],
  maxArmorSlots = 1,
  activeArmor,
  onEquipArmor,
  onUnequipArmor,
  onDropArmor,
  onPlaceArmor,
  onThrowArmor,
}: WeaponPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /** タップで展開した武器インデックス */
  const [tapWeaponIdx, setTapWeaponIdx] = useState<number | null>(null);
  /** タップで展開した盾インデックス */
  const [tapShieldIdx, setTapShieldIdx] = useState<number | null>(null);
  /** タップで展開したアーマーインデックス */
  const [tapArmorIdx, setTapArmorIdx] = useState<number | null>(null);

  useEffect(() => {
    if (tapWeaponIdx === null || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-weapon-index="${tapWeaponIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [tapWeaponIdx]);

  useEffect(() => {
    if (selectedIndex == null || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-weapon-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  useEffect(() => {
    if (tapShieldIdx === null || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-shield-index="${tapShieldIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [tapShieldIdx]);

  useEffect(() => {
    if (tapArmorIdx === null || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-armor-index="${tapArmorIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [tapArmorIdx]);

  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 4,
        zIndex: PANEL_Z_INDEX,
        pointerEvents: 'auto',
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: PANEL_WIDTH,
          maxWidth: '100%',
          maxHeight: 'min(400px, calc(100% - 8px))',
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'monospace',
          color: '#ccddee',
          position: 'relative',
        }}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderBottom: '1px solid #334455',
            backgroundColor: 'rgba(20, 20, 40, 0.9)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 'bold' }}>
            ⚔ 武器装備 ({weaponSlots.length}/{maxCapacity})
          </span>
        </div>

        {/* ── 武器リスト ── */}
        <div
          ref={scrollRef}
          style={{
            overflowY: 'auto',
            flexGrow: 1,
          }}
        >
          {weaponSlots.length === 0 ? (
            <div
              style={{
                padding: '20px 12px',
                textAlign: 'center',
                color: '#667788',
                fontSize: 13,
              }}
            >
              武器なし（素手攻撃）
            </div>
          ) : (
            weaponSlots.map((weapon, i) => {
              const isSelected = i === selectedIndex;
              const isActive = activeWeapon?.id === weapon.id;
              const rarityColor = RARITY_COLOR[weapon.rarity] ?? '#aaaaaa';
              const rarityLabel = RARITY_LABEL[weapon.rarity] ?? weapon.rarity;

              // 耐久度バーの幅を計算
              const maxDur = weapon.maxDurability ?? 100;
              const curDur = weapon.durability ?? maxDur;
              const durabilityRatio = maxDur > 0 ? Math.min(1, curDur / maxDur) : 1;
              const durabilityBarWidth = Math.round(
                DURABILITY_BAR_MAX_WIDTH * durabilityRatio,
              );
              // 耐久度に応じてバー色を変える
              const durabilityBarColor =
                durabilityRatio > 0.5
                  ? '#44cc66'
                  : durabilityRatio > 0.25
                  ? '#ccaa22'
                  : '#cc4422';
                  
              const weaponDef = WEAPON_DEFS.find(d => d.id === weapon.id);
              const attackPattern: string = (weaponDef as any)?.attackPattern ?? 'single';
              const attackRange: number = (weaponDef as any)?.attackRange ?? weapon.range ?? 1;
              const weaponAtk: number = (weaponDef as any)?.atk ?? weapon.atk ?? 0;
              const weaponLevel: number = (weapon as any).weaponLevel ?? 1;
              const patternLabel = ATTACK_PATTERN_LABEL[attackPattern];

              const isExpanded = isSelected || tapWeaponIdx === i;
              return (
                <div
                  key={i}
                  data-weapon-index={i}
                  onPointerDown={() => setTapWeaponIdx(prev => prev === i ? null : i)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '6px 4px 6px 0',
                    gap: 4,
                    backgroundColor: isExpanded ? SELECTED_ROW_BG : 'transparent',
                    borderBottom: '1px solid rgba(68, 85, 102, 0.3)',
                    borderLeft: isExpanded ? '3px solid #55aaff' : '3px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  {/* 上行: 武器ID + ★ + レアリティ + [装備/捨てる]ボタン */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      paddingLeft: 8,
                    }}
                  >
                    {/* 現在装備中の ★ マーク */}
                    {isActive && (
                      <span
                        style={{
                          fontSize: 12,
                          color: '#ffcc22',
                          flexShrink: 0,
                        }}
                      >
                        ★
                      </span>
                    )}

                    {/* 武器名 */}
                    <span
                      style={{
                        flexGrow: 1,
                        fontSize: 13,
                        color: (weapon.durability !== null && weapon.durability !== undefined && weapon.durability <= 0)
                          ? '#ff4444'
                          : isActive ? '#ffeeaa' : '#ccddee',
                        fontWeight: isActive ? 'bold' : 'normal',
                      }}
                    >
                      {weapon.name}
                      {(weapon.durability !== null && weapon.durability !== undefined && weapon.durability <= 0) && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: '#ff6666' }}>[破損]</span>
                      )}
                    </span>

                    {/* レアリティ */}
                    <span
                      style={{
                        fontSize: 11,
                        color: rarityColor,
                        border: `1px solid ${rarityColor}`,
                        borderRadius: 3,
                        padding: '1px 4px',
                        flexShrink: 0,
                      }}
                    >
                      {rarityLabel}
                    </span>

                    {/* ボタン群 */}
                    <div style={{ display: 'flex', gap: 3 }}>
                      {isActive ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onUnequipWeapon?.(); }}
                          style={{
                            padding: '5px 10px',
                            fontSize: 13,
                            backgroundColor: '#333322',
                            border: '1px solid #665533',
                            borderRadius: 4,
                            color: '#aa9955',
                            cursor: 'pointer',
                          }}
                        >
                          外す
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); onEquipWeapon(i); }}
                          style={{
                            padding: '5px 10px',
                            fontSize: 13,
                            backgroundColor: '#224433',
                            border: '1px solid #446644',
                            borderRadius: 4,
                            color: '#aaccaa',
                            cursor: 'pointer',
                          }}
                        >
                          装備
                        </button>
                      )}
                      {onPlaceWeapon && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onPlaceWeapon(i); }}
                          style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#224433', border: '1px solid #446655', borderRadius: 4, color: '#aaddbb', cursor: 'pointer' }}
                        >
                          置
                        </button>
                      )}
                      {onThrowWeapon && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onThrowWeapon(i); }}
                          style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#443322', border: '1px solid #665544', borderRadius: 4, color: '#ffcc88', cursor: 'pointer' }}
                        >
                          投
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDropWeapon(i);
                        }}
                        style={{
                          padding: '2px 5px',
                          fontSize: 11,
                          backgroundColor: '#442222',
                          border: '1px solid #664444',
                          borderRadius: 4,
                          color: '#ccaaaa',
                          cursor: 'pointer',
                        }}
                      >
                        消
                      </button>
                    </div>
                  </div>

                  {/* ステータス行 */}
                  <div
                    style={{
                      fontSize: 11,
                      color: '#9aabb8',
                      paddingLeft: 8,
                      lineHeight: 1.4,
                    }}
                  >
                    {`Lv.${weaponLevel}  ATK +${weaponAtk}  射程:${attackRange}  耐久:${weapon.durability ?? '∞'}/${weapon.maxDurability ?? '∞'}`}
                    {attackPattern !== 'single' && patternLabel && (
                      <span style={{ marginLeft: 6, color: '#aaccdd' }}>
                        {`範囲:${patternLabel}`}
                      </span>
                    )}
                  </div>

                  {/* 下行: 耐久度バー */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      paddingLeft: 8,
                    }}
                  >
                    <span style={{ fontSize: 10, color: '#667788', flexShrink: 0 }}>
                      耐久
                    </span>
                    <div
                      style={{
                        width: DURABILITY_BAR_MAX_WIDTH,
                        height: 4,
                        backgroundColor: '#223344',
                        borderRadius: 2,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: durabilityBarWidth,
                          height: '100%',
                          backgroundColor: durabilityBarColor,
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, color: '#778899' }}>
                      {weapon.durability}
                    </span>
                  </div>

                  {/* 説明文 (選択中またはタップ展開時に表示) */}
                  {isExpanded && weaponDef?.description && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#99aabb',
                        lineHeight: 1.4,
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        paddingLeft: 8,
                      }}
                    >
                      {weaponDef.description}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── 盾スロットセクション ── */}
        {(shieldSlots.length > 0 || maxShieldSlots > 0) && (
          <>
            <div
              style={{
                padding: '4px 12px',
                borderTop: '1px solid #334455',
                backgroundColor: 'rgba(20, 30, 50, 0.9)',
                fontSize: 12,
                color: '#88bbdd',
                fontWeight: 'bold',
                flexShrink: 0,
              }}
            >
              盾スロット ({shieldSlots.length}/{maxShieldSlots})
            </div>
            {shieldSlots.length === 0 ? (
              <div
                style={{
                  padding: '8px 12px',
                  color: '#667788',
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                盾なし
              </div>
            ) : (
              shieldSlots.map((shield, i) => {
                const isActive = activeShield?.shieldId === shield.shieldId;
                const isShieldExpanded = tapShieldIdx === i;
                const durRatio = shield.maxDurability > 0 ? Math.min(1, shield.durability / shield.maxDurability) : 1;
                const durWidth = Math.round(DURABILITY_BAR_MAX_WIDTH * durRatio);
                const durColor = durRatio > 0.5 ? '#44cc66' : durRatio > 0.25 ? '#ccaa22' : '#cc4422';
                const shieldDef = WEAPON_DEFS.find(d => d.id === shield.shieldId);
                return (
                  <div
                    key={i}
                    data-shield-index={i}
                    onPointerDown={() => setTapShieldIdx(prev => prev === i ? null : i)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '6px 12px',
                      gap: 4,
                      backgroundColor: isShieldExpanded ? 'rgba(34, 85, 136, 0.5)' : isActive ? 'rgba(34, 85, 136, 0.3)' : 'transparent',
                      borderBottom: '1px solid rgba(68, 85, 102, 0.3)',
                      borderLeft: isShieldExpanded ? '3px solid #55aaff' : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flexGrow: 1, fontSize: 13, color: isActive ? '#ffeeaa' : '#ccddee', fontWeight: isActive ? 'bold' : 'normal' }}>
                        {isActive ? '★ ' : ''}{shield.name}
                      </span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {isActive ? (
                          <button
                            onClick={() => onUnequipShield?.()}
                            style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#333322', border: '1px solid #665533', borderRadius: 4, color: '#aa9955', cursor: 'pointer' }}
                          >
                            外す
                          </button>
                        ) : (
                          <button
                            onClick={() => onEquipShield?.(i)}
                            style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#224433', border: '1px solid #446644', borderRadius: 4, color: '#aaccaa', cursor: 'pointer' }}
                          >
                            装備
                          </button>
                        )}
                        {onPlaceShield && (
                          <button
                            onClick={() => onPlaceShield(i)}
                            style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#224433', border: '1px solid #446655', borderRadius: 4, color: '#aaddbb', cursor: 'pointer' }}
                          >
                            置
                          </button>
                        )}
                        {onThrowShield && (
                          <button
                            onClick={() => onThrowShield(i)}
                            style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#443322', border: '1px solid #665544', borderRadius: 4, color: '#ffcc88', cursor: 'pointer' }}
                          >
                            投
                          </button>
                        )}
                        <button
                          onClick={() => { onDropShield?.(i); }}
                          style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#442222', border: '1px solid #664444', borderRadius: 4, color: '#ccaaaa', cursor: 'pointer' }}
                        >
                          消
                        </button>
                      </div>
                    </div>
                    {/* 盾ステータス行 */}
                    <div style={{ fontSize: 11, color: '#9aabb8', paddingLeft: 8, lineHeight: 1.4 }}>
                      {`DEF +${shield.def}`}
                      {(shield.blockChance ?? 0) > 0 && (
                        <span style={{ marginLeft: 6 }}>{`ブロック率:${Math.round((shield.blockChance ?? 0) * 100)}%`}</span>
                      )}
                      <span style={{ marginLeft: 6 }}>{`耐久:${shield.durability}/${shield.maxDurability}`}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
                      <span style={{ fontSize: 10, color: '#667788', flexShrink: 0 }}>耐久</span>
                      <div style={{ width: DURABILITY_BAR_MAX_WIDTH, height: 4, backgroundColor: '#223344', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: durWidth, height: '100%', backgroundColor: durColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#778899' }}>{shield.durability}</span>
                    </div>
                    {/* 盾説明文 (タップ展開時) */}
                    {isShieldExpanded && shieldDef?.description && (
                      <div style={{ fontSize: 11, color: '#99aabb', lineHeight: 1.4, whiteSpace: 'normal', wordBreak: 'break-word', paddingLeft: 8 }}>
                        {shieldDef.description}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ── アーマースロットセクション ── */}
        {(armorSlots.length > 0 || maxArmorSlots > 0) && (
          <>
            <div
              style={{
                padding: '4px 12px',
                borderTop: '1px solid #334455',
                backgroundColor: 'rgba(30, 20, 50, 0.9)',
                fontSize: 12,
                color: '#bb88dd',
                fontWeight: 'bold',
                flexShrink: 0,
              }}
            >
              アーマースロット ({armorSlots.length}/{maxArmorSlots})
            </div>
            {armorSlots.length === 0 ? (
              <div
                style={{
                  padding: '8px 12px',
                  color: '#667788',
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                アーマーなし
              </div>
            ) : (
              armorSlots.map((armor, i) => {
                const isActive = activeArmor?.armorId === armor.armorId;
                const isArmorExpanded = tapArmorIdx === i;
                const durRatio = armor.maxDurability > 0 ? Math.min(1, armor.durability / armor.maxDurability) : 1;
                const durWidth = Math.round(DURABILITY_BAR_MAX_WIDTH * durRatio);
                const durColor = durRatio > 0.5 ? '#44cc66' : durRatio > 0.25 ? '#ccaa22' : '#cc4422';
                const armorDef = WEAPON_DEFS.find(d => d.id === armor.armorId);
                return (
                  <div
                    key={i}
                    data-armor-index={i}
                    onPointerDown={() => setTapArmorIdx(prev => prev === i ? null : i)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '6px 12px',
                      gap: 4,
                      backgroundColor: isArmorExpanded ? 'rgba(85, 34, 136, 0.5)' : isActive ? 'rgba(85, 34, 136, 0.3)' : 'transparent',
                      borderBottom: '1px solid rgba(68, 85, 102, 0.3)',
                      borderLeft: isArmorExpanded ? '3px solid #cc88ff' : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flexGrow: 1, fontSize: 13, color: isActive ? '#ffeeaa' : '#ccddee', fontWeight: isActive ? 'bold' : 'normal' }}>
                        {isActive ? '★ ' : ''}{armor.name}
                      </span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {isActive ? (
                          <button
                            onClick={() => onUnequipArmor?.()}
                            style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#333322', border: '1px solid #665533', borderRadius: 4, color: '#aa9955', cursor: 'pointer' }}
                          >
                            外す
                          </button>
                        ) : (
                          <button
                            onClick={() => onEquipArmor?.(i)}
                            style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#442244', border: '1px solid #664466', borderRadius: 4, color: '#ccaaee', cursor: 'pointer' }}
                          >
                            装備
                          </button>
                        )}
                        {onPlaceArmor && (
                          <button
                            onClick={() => onPlaceArmor(i)}
                            style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#224433', border: '1px solid #446655', borderRadius: 4, color: '#aaddbb', cursor: 'pointer' }}
                          >
                            置
                          </button>
                        )}
                        {onThrowArmor && (
                          <button
                            onClick={() => onThrowArmor(i)}
                            style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#443322', border: '1px solid #665544', borderRadius: 4, color: '#ffcc88', cursor: 'pointer' }}
                          >
                            投
                          </button>
                        )}
                        <button
                          onClick={() => { onDropArmor?.(i); }}
                          style={{ padding: '5px 10px', fontSize: 13, backgroundColor: '#442222', border: '1px solid #664444', borderRadius: 4, color: '#ccaaaa', cursor: 'pointer' }}
                        >
                          消
                        </button>
                      </div>
                    </div>
                    {/* アーマーステータス行 */}
                    <div style={{ fontSize: 11, color: '#9aabb8', paddingLeft: 8, lineHeight: 1.4 }}>
                      {`DEF +${armor.def}`}
                      {(armor.maxHpBonus ?? 0) > 0 && (
                        <span style={{ marginLeft: 6 }}>{`MaxHP +${armor.maxHpBonus}`}</span>
                      )}
                      <span style={{ marginLeft: 6 }}>{`耐久:${armor.durability}/${armor.maxDurability}`}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
                      <span style={{ fontSize: 10, color: '#667788', flexShrink: 0 }}>耐久</span>
                      <div style={{ width: DURABILITY_BAR_MAX_WIDTH, height: 4, backgroundColor: '#223344', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: durWidth, height: '100%', backgroundColor: durColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#778899' }}>{armor.durability}</span>
                    </div>
                    {/* アーマー説明文 (タップ展開時) */}
                    {isArmorExpanded && armorDef?.description && (
                      <div style={{ fontSize: 11, color: '#99aabb', lineHeight: 1.4, whiteSpace: 'normal', wordBreak: 'break-word', paddingLeft: 8 }}>
                        {armorDef.description}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ── フッター ── */}
        <div
          style={{
            padding: '6px 12px',
            borderTop: '1px solid #334455',
            backgroundColor: 'rgba(10, 10, 26, 0.8)',
            fontSize: 11,
            color: '#667788',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          [↑↓] 選択　[Z/Enter] 装備　[Esc/E] 閉じる
        </div>

        {/* 閉じるボタン（タッチ向け） */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            background: 'none',
            border: 'none',
            color: '#778899',
            fontSize: 18,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 0,
          }}
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
    </div>
  );
}
