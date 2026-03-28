'use client';

/**
 * @fileoverview 武器パネルオーバーレイコンポーネント
 *
 * Canvas の上に absolute 配置で重ね、装備中武器スロットの内容を表示する。
 * キーボード（↑↓/Z/Enter/E/Escape）またはボタンクリックで操作する。
 */

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
const PANEL_WIDTH = 320;
/** パネル最大高さ (px) */
const PANEL_MAX_HEIGHT = 400;
/** z-index（HUD より上に表示） */
const PANEL_Z_INDEX = 20;
/** パネル背景色 */
const PANEL_BG = 'rgba(10, 10, 26, 0.96)';
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
  /** 武器破棄コールバック */
  onDropWeapon: (index: number) => void;
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
  /** 盾破棄コールバック */
  onDropShield?: (index: number) => void;
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
  /** アーマー破棄コールバック */
  onDropArmor?: (index: number) => void;
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
  onDropWeapon,
  shieldSlots = [],
  maxShieldSlots = 1,
  activeShield,
  onEquipShield,
  onUnequipShield,
  onDropShield,
  armorSlots = [],
  maxArmorSlots = 1,
  activeArmor,
  onEquipArmor,
  onUnequipArmor,
  onDropArmor,
}: WeaponPanelProps) {
  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: PANEL_Z_INDEX,
        pointerEvents: 'auto',
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: PANEL_WIDTH,
          maxHeight: PANEL_MAX_HEIGHT,
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

              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '6px 12px',
                    gap: 4,
                    backgroundColor: isSelected ? SELECTED_ROW_BG : 'transparent',
                    borderBottom: '1px solid rgba(68, 85, 102, 0.3)',
                    cursor: 'default',
                  }}
                >
                  {/* 上行: 選択インジケーター + 武器ID + ★ + レアリティ + [装備/捨てる]ボタン */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {/* 選択インジケーター */}
                    <span
                      style={{
                        width: 10,
                        color: '#55aaff',
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      {isSelected ? '▶' : ''}
                    </span>

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
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEquipWeapon(i);
                        }}
                        style={{
                          padding: '2px 8px',
                          fontSize: 11,
                          backgroundColor: isActive ? '#333322' : '#224433',
                          border: `1px solid ${isActive ? '#665533' : '#446644'}`,
                          borderRadius: 4,
                          color: isActive ? '#aa9955' : '#aaccaa',
                          cursor: 'pointer',
                        }}
                      >
                        {isActive ? '装備中' : '装備'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDropWeapon(i);
                        }}
                        style={{
                          padding: '2px 6px',
                          fontSize: 11,
                          backgroundColor: '#442222',
                          border: '1px solid #664444',
                          borderRadius: 4,
                          color: '#ccaaaa',
                          cursor: 'pointer',
                        }}
                      >
                        破棄
                      </button>
                    </div>
                  </div>

                  {/* ステータス行 */}
                  <div
                    style={{
                      fontSize: 11,
                      color: '#9aabb8',
                      paddingLeft: 18,
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
                      paddingLeft: 18,
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

                  {/* 説明文 (選択中のみ表示、スマホで折り返すように) */}
                  {isSelected && weaponDef?.description && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#99aabb',
                        lineHeight: 1.4,
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        paddingLeft: 18,
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
                const durRatio = shield.maxDurability > 0 ? Math.min(1, shield.durability / shield.maxDurability) : 1;
                const durWidth = Math.round(DURABILITY_BAR_MAX_WIDTH * durRatio);
                const durColor = durRatio > 0.5 ? '#44cc66' : durRatio > 0.25 ? '#ccaa22' : '#cc4422';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '6px 12px',
                      gap: 4,
                      backgroundColor: isActive ? 'rgba(34, 85, 136, 0.5)' : 'transparent',
                      borderBottom: '1px solid rgba(68, 85, 102, 0.3)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flexGrow: 1, fontSize: 13, color: isActive ? '#ffeeaa' : '#ccddee', fontWeight: isActive ? 'bold' : 'normal' }}>
                        {isActive ? '★ ' : ''}{shield.name}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {isActive ? (
                          <button
                            onClick={() => onUnequipShield?.()}
                            style={{ padding: '2px 8px', fontSize: 11, backgroundColor: '#333322', border: '1px solid #665533', borderRadius: 4, color: '#aa9955', cursor: 'pointer' }}
                          >
                            外す
                          </button>
                        ) : (
                          <button
                            onClick={() => onEquipShield?.(i)}
                            style={{ padding: '2px 8px', fontSize: 11, backgroundColor: '#224433', border: '1px solid #446644', borderRadius: 4, color: '#aaccaa', cursor: 'pointer' }}
                          >
                            装備
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onDropShield?.(i);
                          }}
                          style={{ padding: '2px 6px', fontSize: 11, backgroundColor: '#442222', border: '1px solid #664444', borderRadius: 4, color: '#ccaaaa', cursor: 'pointer' }}
                        >
                          破棄
                        </button>
                      </div>
                    </div>
                    {/* 盾ステータス行 */}
                    <div style={{ fontSize: 11, color: '#9aabb8', paddingLeft: 18, lineHeight: 1.4 }}>
                      {`DEF +${shield.def}`}
                      {(shield.blockChance ?? 0) > 0 && (
                        <span style={{ marginLeft: 6 }}>{`ブロック率:${Math.round((shield.blockChance ?? 0) * 100)}%`}</span>
                      )}
                      <span style={{ marginLeft: 6 }}>{`耐久:${shield.durability}/${shield.maxDurability}`}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 18 }}>
                      <span style={{ fontSize: 10, color: '#667788', flexShrink: 0 }}>耐久</span>
                      <div style={{ width: DURABILITY_BAR_MAX_WIDTH, height: 4, backgroundColor: '#223344', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: durWidth, height: '100%', backgroundColor: durColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#778899' }}>{shield.durability}</span>
                    </div>
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
                const durRatio = armor.maxDurability > 0 ? Math.min(1, armor.durability / armor.maxDurability) : 1;
                const durWidth = Math.round(DURABILITY_BAR_MAX_WIDTH * durRatio);
                const durColor = durRatio > 0.5 ? '#44cc66' : durRatio > 0.25 ? '#ccaa22' : '#cc4422';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '6px 12px',
                      gap: 4,
                      backgroundColor: isActive ? 'rgba(85, 34, 136, 0.5)' : 'transparent',
                      borderBottom: '1px solid rgba(68, 85, 102, 0.3)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flexGrow: 1, fontSize: 13, color: isActive ? '#ffeeaa' : '#ccddee', fontWeight: isActive ? 'bold' : 'normal' }}>
                        {isActive ? '★ ' : ''}{armor.name}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {isActive ? (
                          <button
                            onClick={() => onUnequipArmor?.()}
                            style={{ padding: '2px 8px', fontSize: 11, backgroundColor: '#333322', border: '1px solid #665533', borderRadius: 4, color: '#aa9955', cursor: 'pointer' }}
                          >
                            外す
                          </button>
                        ) : (
                          <button
                            onClick={() => onEquipArmor?.(i)}
                            style={{ padding: '2px 8px', fontSize: 11, backgroundColor: '#442244', border: '1px solid #664466', borderRadius: 4, color: '#ccaaee', cursor: 'pointer' }}
                          >
                            装備
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onDropArmor?.(i);
                          }}
                          style={{ padding: '2px 6px', fontSize: 11, backgroundColor: '#442222', border: '1px solid #664444', borderRadius: 4, color: '#ccaaaa', cursor: 'pointer' }}
                        >
                          破棄
                        </button>
                      </div>
                    </div>
                    {/* アーマーステータス行 */}
                    <div style={{ fontSize: 11, color: '#9aabb8', paddingLeft: 18, lineHeight: 1.4 }}>
                      {`DEF +${armor.def}`}
                      {(armor.maxHpBonus ?? 0) > 0 && (
                        <span style={{ marginLeft: 6 }}>{`MaxHP +${armor.maxHpBonus}`}</span>
                      )}
                      <span style={{ marginLeft: 6 }}>{`耐久:${armor.durability}/${armor.maxDurability}`}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 18 }}>
                      <span style={{ fontSize: 10, color: '#667788', flexShrink: 0 }}>耐久</span>
                      <div style={{ width: DURABILITY_BAR_MAX_WIDTH, height: 4, backgroundColor: '#223344', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: durWidth, height: '100%', backgroundColor: durColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#778899' }}>{armor.durability}</span>
                    </div>
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
