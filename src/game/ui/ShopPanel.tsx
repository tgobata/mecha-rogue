'use client';

/**
 * @fileoverview ショップパネルコンポーネント
 *
 * phase が 'shop' のときに GameCanvas 上にオーバーレイ表示する。
 * 在庫の表示と購入処理、持ち物の売却処理を行う。
 */

import { useState, useRef, useEffect } from 'react';
import type { ShopItem } from '../core/shop-system';
import type { WeaponInstance, InventoryItem, EquippedShield, EquippedArmor } from '../core/game-state';
import { getSortedItems } from '../core/inventory-utils';
import { getItemEffectSummary } from '../core/tool-system';
import itemsRaw from '../assets/data/items.json';
import toolsRaw from '../assets/data/tools-equipment.json';
import weaponsRaw from '../assets/data/weapons.json';
import SHOP_PRICES from '../assets/data/shop-prices.json';

const ALL_DATA = [
  ...(itemsRaw as any[]),
  ...(toolsRaw as any[]),
  ...(weaponsRaw as any[])
];

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 'min(400px, 92vw)';
const PANEL_MAX_HEIGHT = 'min(780px, 88vh)';
const PANEL_Z_INDEX = 25;
const PANEL_BG = 'rgba(20, 15, 30, 0.98)';
const PANEL_BORDER = '2px solid #aa8844';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ShopPanelProps {
  /** ショップの在庫リスト */
  shopInventory: ShopItem[];
  /** プレイヤーの所持金 */
  gold: number;
  /** ポーチのソート順（インベントリパネルと揃える） */
  sortKey: 'default' | 'name' | 'category';
  /** プレイヤーの所持アイテム */
  playerItems: InventoryItem[];
  /** プレイヤーの所持武器 */
  playerWeapons: WeaponInstance[];
  /** プレイヤーの所持盾 */
  playerShields?: EquippedShield[];
  /** プレイヤーの所持防具 */
  playerArmors?: EquippedArmor[];
  /** 購入ボタン押下時のコールバック */
  onBuy: (item: ShopItem) => void;
  /** 売却ボタン押下時のコールバック */
  onSell: (itemId: string, itemType: 'weapon' | 'item' | 'shield' | 'armor', index: number) => void;
  /** 閉じるボタン押下時のコールバック */
  onClose: () => void;
  /** 直前の売買メッセージ（battleLog の末尾エントリ） */
  lastMessage?: string;
}

// ---------------------------------------------------------------------------
// 名前フォーマッタ
// ---------------------------------------------------------------------------
function getDisplayName(id: string): string {
  const found = ALL_DATA.find(d => d.id === id);
  return found ? found.name : id;
}

// ---------------------------------------------------------------------------
// ShopPanel コンポーネント
// ---------------------------------------------------------------------------

export default function ShopPanel({
  shopInventory,
  gold,
  sortKey,
  playerItems,
  playerWeapons,
  playerShields = [],
  playerArmors = [],
  onBuy,
  onSell,
  onClose,
  lastMessage,
}: ShopPanelProps) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  /** 売却モードで展開中のアイテムキー */
  const [sellExpandedKey, setSellExpandedKey] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const prices = SHOP_PRICES as any;

  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-buy-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: PANEL_Z_INDEX,
        pointerEvents: 'auto',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: PANEL_WIDTH,
          maxHeight: PANEL_MAX_HEIGHT,
          height: PANEL_MAX_HEIGHT,
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'monospace',
          color: '#eeddbb',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.9)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 閉じるボタン (右上) ── */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '50%',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            zIndex: 10,
          }}
        >
          ×
        </button>
        {/* ── ヘッダー ── */}
        <div
          style={{
            padding: '12px',
            borderBottom: '1px solid #665533',
            backgroundColor: 'rgba(40, 30, 50, 0.9)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: '#ffcc66' }}>
              🛒 {mode === 'buy' ? 'ショップ在庫' : '持ち物を売る'}
            </span>
            <span style={{ fontSize: 14, color: '#ffdd22' }}>
              {gold} G
            </span>
          </div>
          
          {/* モード切替タブ */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => { setMode('buy'); setSelectedIndex(0); }}
              style={{
                flex: 1,
                padding: '10px',
                background: mode === 'buy' ? '#aa8844' : '#332244',
                border: 'none',
                borderRadius: 6,
                color: mode === 'buy' ? '#fff' : '#8877aa',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 'bold'
              }}
            >
              買う
            </button>
            <button
              onClick={() => { setMode('sell'); setSelectedIndex(0); }}
              style={{
                flex: 1,
                padding: '10px',
                background: mode === 'sell' ? '#aa8844' : '#332244',
                border: 'none',
                borderRadius: 6,
                color: mode === 'sell' ? '#fff' : '#8877aa',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 'bold'
              }}
            >
              売る
            </button>
          </div>
        </div>

        {/* ── 内容リスト ── */}
        <div ref={listRef} style={{ padding: '8px', flex: 1, overflowY: 'auto' }}>
          {mode === 'buy' ? (
            shopInventory.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#888' }}>品揃えなし</div>
            ) : (
              shopInventory.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const stock = item.stock ?? 1;
                const soldOut = stock <= 0;
                const canAfford = !soldOut && gold >= item.buy;
                const canBuy = canAfford;
                const itemDef = ALL_DATA.find(d => d.id === item.id);
                return (
                  <div
                    key={`buy-${idx}`}
                    data-buy-index={idx}
                    onClick={() => setSelectedIndex(prev => prev === idx ? -1 : idx)}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      padding: '8px 12px', marginBottom: 4, borderRadius: 4,
                      backgroundColor: soldOut
                        ? 'rgba(30, 30, 30, 0.5)'
                        : isSelected ? 'rgba(100, 80, 50, 0.8)' : 'rgba(0, 0, 0, 0.3)',
                      border: isSelected && !soldOut ? '1px solid #dcb56e' : '1px solid transparent',
                      cursor: 'pointer',
                      opacity: soldOut ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: 'bold', color: soldOut ? '#666' : undefined }}>
                          {getDisplayName(item.id)}
                        </span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: '#aaa' }}>
                            {item.type === 'item' ? 'パーツ'
                              : itemDef?.category === 'armor' ? '防具'
                              : itemDef?.category === 'shield' ? '盾'
                              : '武器'}
                          </span>
                          {item.type === 'item' && (
                            <span style={{ fontSize: 10, color: soldOut ? '#ff6644' : '#88ccaa' }}>
                              {soldOut ? '売切' : `残り ${stock}`}
                            </span>
                          )}
                          {item.type === 'weapon' && soldOut && (
                            <span style={{ fontSize: 10, color: '#ff6644' }}>売切</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: soldOut ? '#555' : canAfford ? '#ffff88' : '#ff4444' }}>{item.buy} G</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (canBuy) onBuy(item); }}
                          disabled={!canBuy}
                          style={{ padding: '8px 14px', backgroundColor: canBuy ? '#44aa44' : '#333', borderRadius: 6, color: canBuy ? '#fff' : '#666', cursor: canBuy ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 'bold', minWidth: 60 }}
                        >{soldOut ? '売切' : '購入'}</button>
                      </div>
                    </div>
                    {/* 説明文 (タップ選択時に表示) */}
                    {isSelected && itemDef && (
                      <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(180,140,60,0.3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {(() => {
                          const summary = getItemEffectSummary(itemDef.id);
                          return (
                            <>
                              {summary && <span style={{ color: '#66ffcc', fontWeight: 'bold' }}>▷ {summary}</span>}
                              {itemDef.description && <span style={{ color: '#ccbbaa', whiteSpace: 'normal', wordBreak: 'break-word' }}>{itemDef.description}</span>}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )
              })
            )
          ) : (
            /* 売却モード */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* 武器リスト */}
              {playerWeapons.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#aa8844', marginBottom: 4, fontWeight: 'bold' }}>武器</div>
                  {playerWeapons.map((w, idx) => {
                    const sellPrice = prices.weapons[w.id]?.sell ?? 0;
                    const weaponDef = ALL_DATA.find(d => d.id === w.id);
                    const sellKey = `weapon-${idx}`;
                    const isExpanded = sellExpandedKey === sellKey;
                    return (
                      <div
                        key={`sell-w-${idx}`}
                        onClick={() => setSellExpandedKey(prev => prev === sellKey ? null : sellKey)}
                        style={{ display: 'flex', flexDirection: 'column', padding: '6px 8px', backgroundColor: isExpanded ? 'rgba(60,40,20,0.5)' : 'rgba(0,0,0,0.2)', marginBottom: 2, borderRadius: 4, cursor: 'pointer', border: isExpanded ? '1px solid #aa8844' : '1px solid transparent' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12 }}>{w.name}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#ffdd22' }}>{sellPrice} G</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onSell(w.id, 'weapon', idx); }}
                              style={{ padding: '8px 14px', backgroundColor: '#883333', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', minWidth: 60 }}
                            >売る</button>
                          </div>
                        </div>
                        {isExpanded && weaponDef?.description && (
                          <div style={{ fontSize: 11, color: '#ccbbaa', lineHeight: 1.5, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(180,140,60,0.3)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {weaponDef.description}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* アイテムリスト */}
              {playerItems.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#44aa88', marginBottom: 4, fontWeight: 'bold' }}>アイテム</div>
                  {getSortedItems(playerItems, sortKey).map((entry) => {
                    const { item: it, originalIndex } = entry;
                    const sellPrice = prices.items[it.itemId]?.sell ?? 0;
                    const itemDef = ALL_DATA.find(d => d.id === it.itemId);
                    const sellKey = `item-${originalIndex}`;
                    const isExpanded = sellExpandedKey === sellKey;
                    return (
                      <div
                        key={`sell-i-${originalIndex}`}
                        onClick={() => setSellExpandedKey(prev => prev === sellKey ? null : sellKey)}
                        style={{ display: 'flex', flexDirection: 'column', padding: '6px 8px', backgroundColor: isExpanded ? 'rgba(20,50,30,0.5)' : 'rgba(0,0,0,0.2)', marginBottom: 2, borderRadius: 4, cursor: 'pointer', border: isExpanded ? '1px solid #44aa88' : '1px solid transparent' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12 }}>{getDisplayName(it.itemId)}{it.quantity > 1 ? ` × ${it.quantity}` : ''}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#ffdd22' }}>{sellPrice} G</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onSell(it.itemId, 'item', originalIndex); }}
                              style={{ padding: '8px 14px', backgroundColor: '#883333', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', minWidth: 60 }}
                            >売る</button>
                          </div>
                        </div>
                        {isExpanded && itemDef && (
                          <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(60,180,120,0.3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {(() => {
                              const summary = getItemEffectSummary(itemDef.id);
                              return (
                                <>
                                  {summary && <span style={{ color: '#66ffcc', fontWeight: 'bold' }}>▷ {summary}</span>}
                                  {itemDef.description && <span style={{ color: '#ccbbaa', whiteSpace: 'normal', wordBreak: 'break-word' }}>{itemDef.description}</span>}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* 盾リスト */}
              {playerShields.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#88bbdd', marginBottom: 4, fontWeight: 'bold' }}>盾</div>
                  {playerShields.map((sh, idx) => {
                    const sellPrice = prices.weapons[sh.shieldId]?.sell ?? 0;
                    const shieldDef = ALL_DATA.find(d => d.id === sh.shieldId);
                    const sellKey = `shield-${idx}`;
                    const isExpanded = sellExpandedKey === sellKey;
                    return (
                      <div
                        key={`sell-sh-${idx}`}
                        onClick={() => setSellExpandedKey(prev => prev === sellKey ? null : sellKey)}
                        style={{ display: 'flex', flexDirection: 'column', padding: '6px 8px', backgroundColor: isExpanded ? 'rgba(20,40,60,0.5)' : 'rgba(0,0,0,0.2)', marginBottom: 2, borderRadius: 4, cursor: 'pointer', border: isExpanded ? '1px solid #88bbdd' : '1px solid transparent' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12 }}>{sh.name}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#ffdd22' }}>{sellPrice} G</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onSell(sh.shieldId, 'shield', idx); }}
                              style={{ padding: '8px 14px', backgroundColor: '#883333', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', minWidth: 60 }}
                            >売る</button>
                          </div>
                        </div>
                        {isExpanded && shieldDef?.description && (
                          <div style={{ fontSize: 11, color: '#ccbbaa', lineHeight: 1.5, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(60,120,180,0.3)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {shieldDef.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 防具リスト */}
              {playerArmors.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#cc88ff', marginBottom: 4, fontWeight: 'bold' }}>防具</div>
                  {playerArmors.map((ar, idx) => {
                    const sellPrice = prices.weapons[ar.armorId]?.sell ?? 0;
                    const armorDef = ALL_DATA.find(d => d.id === ar.armorId);
                    const sellKey = `armor-${idx}`;
                    const isExpanded = sellExpandedKey === sellKey;
                    return (
                      <div
                        key={`sell-ar-${idx}`}
                        onClick={() => setSellExpandedKey(prev => prev === sellKey ? null : sellKey)}
                        style={{ display: 'flex', flexDirection: 'column', padding: '6px 8px', backgroundColor: isExpanded ? 'rgba(50,20,60,0.5)' : 'rgba(0,0,0,0.2)', marginBottom: 2, borderRadius: 4, cursor: 'pointer', border: isExpanded ? '1px solid #cc88ff' : '1px solid transparent' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12 }}>{ar.name}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#ffdd22' }}>{sellPrice} G</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onSell(ar.armorId, 'armor', idx); }}
                              style={{ padding: '8px 14px', backgroundColor: '#883333', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', minWidth: 60 }}
                            >売る</button>
                          </div>
                        </div>
                        {isExpanded && armorDef?.description && (
                          <div style={{ fontSize: 11, color: '#ccbbaa', lineHeight: 1.5, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(120,60,180,0.3)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {armorDef.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {playerItems.length === 0 && playerWeapons.length === 0 && playerShields.length === 0 && playerArmors.length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', color: '#888' }}>売れるものがありません</div>
              )}
            </div>
          )}
        </div>
        
        <div style={{ padding: '10px 12px', borderTop: '1px solid #665533', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          {lastMessage && (
            <div style={{
              width: '100%',
              padding: '4px 10px',
              backgroundColor: 'rgba(255, 220, 100, 0.12)',
              border: '1px solid rgba(200, 160, 60, 0.4)',
              borderRadius: 4,
              fontSize: 11,
              color: '#ffdd88',
              textAlign: 'center',
            }}>
              {lastMessage}
            </div>
          )}
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px 16px',
              backgroundColor: '#445566',
              border: '1px solid #667788',
              borderRadius: 6,
              color: '#fff',
              fontSize: 15,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            ショップを閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
