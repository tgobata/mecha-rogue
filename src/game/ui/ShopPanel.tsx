'use client';

/**
 * @fileoverview ショップパネルコンポーネント
 *
 * phase が 'shop' のときに GameCanvas 上にオーバーレイ表示する。
 * 在庫の表示と購入処理、持ち物の売却処理を行う。
 */

import { useState } from 'react';
import type { ShopItem } from '../core/shop-system';
import type { WeaponInstance, InventoryItem } from '../core/game-state';
import { getSortedItems } from '../core/inventory-utils';
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

const PANEL_WIDTH = 340;
const PANEL_MAX_HEIGHT = 480;
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
  /** 購入ボタン押下時のコールバック */
  onBuy: (item: ShopItem) => void;
  /** 売却ボタン押下時のコールバック */
  onSell: (itemId: string, itemType: 'weapon' | 'item', index: number) => void;
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
  onBuy,
  onSell,
  onClose,
  lastMessage,
}: ShopPanelProps) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const prices = SHOP_PRICES as any;

  return (
    <div
      style={{
        position: 'absolute',
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
                padding: '4px',
                background: mode === 'buy' ? '#aa8844' : '#332244',
                border: 'none',
                borderRadius: 4,
                color: mode === 'buy' ? '#fff' : '#8877aa',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 'bold'
              }}
            >
              買う
            </button>
            <button
              onClick={() => { setMode('sell'); setSelectedIndex(0); }}
              style={{
                flex: 1,
                padding: '4px',
                background: mode === 'sell' ? '#aa8844' : '#332244',
                border: 'none',
                borderRadius: 4,
                color: mode === 'sell' ? '#fff' : '#8877aa',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 'bold'
              }}
            >
              売る
            </button>
          </div>
        </div>

        {/* ── 内容リスト ── */}
        <div style={{ padding: '8px', flex: 1, overflowY: 'auto' }}>
          {mode === 'buy' ? (
            shopInventory.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#888' }}>品揃えなし</div>
            ) : (
              shopInventory.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const canAfford = gold >= item.buy;
                return (
                  <div
                    key={`buy-${idx}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', marginBottom: 4, borderRadius: 4,
                      backgroundColor: isSelected ? 'rgba(100, 80, 50, 0.8)' : 'rgba(0, 0, 0, 0.3)',
                      border: isSelected ? '1px solid #dcb56e' : '1px solid transparent',
                      cursor: 'default',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 'bold' }}>{getDisplayName(item.id)}</span>
                      <span style={{ fontSize: 10, color: '#aaa' }}>{item.type === 'weapon' ? '武器' : 'パーツ'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: canAfford ? '#ffff88' : '#ff4444' }}>{item.buy} G</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (canAfford) onBuy(item); }}
                        style={{ padding: '4px 8px', backgroundColor: canAfford ? '#44aa44' : '#444', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 11 }}
                      >購入</button>
                    </div>
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
                    return (
                      <div key={`sell-w-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: 'rgba(0,0,0,0.2)', marginBottom: 2, borderRadius: 4 }}>
                        <span style={{ fontSize: 12 }}>{w.name}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#ffdd22' }}>{sellPrice} G</span>
                          <button
                            onClick={() => onSell(w.id, 'weapon', idx)}
                            style={{ padding: '2px 6px', backgroundColor: '#883333', borderRadius: 4, color: '#fff', fontSize: 10, cursor: 'pointer' }}
                          >売る</button>
                        </div>
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
                    return (
                      <div key={`sell-i-${originalIndex}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: 'rgba(0,0,0,0.2)', marginBottom: 2, borderRadius: 4 }}>
                        <span style={{ fontSize: 12 }}>{getDisplayName(it.itemId)}{it.quantity > 1 ? ` x${it.quantity}` : ''}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#ffdd22' }}>{sellPrice} G</span>
                          <button
                            onClick={() => onSell(it.itemId, 'item', originalIndex)}
                            style={{ padding: '2px 6px', backgroundColor: '#883333', borderRadius: 4, color: '#fff', fontSize: 10, cursor: 'pointer' }}
                          >売る</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {playerItems.length === 0 && playerWeapons.length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', color: '#888' }}>売れるものがありません</div>
              )}
            </div>
          )}
        </div>
        
        <div style={{ padding: '8px', borderTop: '1px solid #665533', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          {lastMessage && (
            <div style={{
              width: '100%',
              padding: '5px 10px',
              backgroundColor: 'rgba(255, 220, 100, 0.12)',
              border: '1px solid rgba(200, 160, 60, 0.4)',
              borderRadius: 4,
              fontSize: 12,
              color: '#ffdd88',
              textAlign: 'center',
            }}>
              {lastMessage}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#998877' }}>
            {mode === 'buy' ? '退出すると在庫は更新されます' : '売却価格は購入価格の約45-50%です'}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '4px 16px',
              backgroundColor: '#445566',
              border: '1px solid #667788',
              borderRadius: 4,
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer',
              marginTop: 4
            }}
          >
            ショップを閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
