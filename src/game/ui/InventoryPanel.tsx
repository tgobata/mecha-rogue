'use client';

/**
 * @fileoverview インベントリパネルオーバーレイコンポーネント
 *
 * Canvas の上に absolute 配置で重ね、アイテムポーチの内容を表示する。
 * キーボード（↑↓/Z/Enter/I/Escape）またはボタンクリックで操作する。
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import type { Inventory } from '../core/game-state';
import itemsRaw from '../assets/data/items.json';
import toolsRaw from '../assets/data/tools-equipment.json';
import { getSortedItems } from '../core/inventory-utils';

const ALL_ITEMS = [...(itemsRaw as any[]), ...(toolsRaw as any[])];

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

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface InventoryPanelProps {
  /** インベントリ（game-state の Inventory） */
  inventory: Inventory;
  /** インベントリ最大容量 */
  maxCapacity: number;
  /** 選択中アイテムインデックス */
  selectedIndex: number;
  /** パネルを閉じるコールバック */
  onClose: () => void;
  /** アイテム使用コールバック */
  onUseItem: (index: number) => void;
  /** アイテムを消去するコールバック */
  onDropItem: (index: number) => void;
  /** アイテムを置くコールバック */
  onPlaceItem?: (index: number) => void;
  /** アイテムを投げるコールバック（方向選択後に呼ばれる） */
  onThrowItem?: (index: number) => void;
  /** 識別スコープを持っているか */
  hasIdentifyScope?: boolean;
  /** アイテム鑑定コールバック */
  onIdentifyItem?: (index: number) => void;
  /** ソートキー変更コールバック */
  onSortChange: (key: 'default' | 'name' | 'category') => void;
}

// ---------------------------------------------------------------------------
// InventoryPanel コンポーネント
// ---------------------------------------------------------------------------

/**
 * インベントリパネルオーバーレイ。
 * Canvas ラッパー内の absolute 配置で中央に表示する。
 */
export default function InventoryPanel({
  inventory,
  maxCapacity,
  selectedIndex,
  onClose,
  onUseItem,
  onDropItem,
  onPlaceItem,
  onThrowItem,
  hasIdentifyScope = false,
  onIdentifyItem,
  onSortChange,
}: InventoryPanelProps) {
  const { items, gold } = inventory;

  const scrollRef = useRef<HTMLDivElement>(null);
  const sortKey = inventory.sortKey;
  /** タップで展開したアイテムのインデックス（スマホ操作用） */
  const [tapExpandedIdx, setTapExpandedIdx] = useState<number | null>(null);

  const sortedItems = useMemo(() => {
    return getSortedItems(items, sortKey);
  }, [items, sortKey]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  useEffect(() => {
    if (tapExpandedIdx === null || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-index="${tapExpandedIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [tapExpandedIdx]);

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
        }}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: '1px solid #334455',
            backgroundColor: 'rgba(20, 20, 40, 0.9)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 'bold' }}>
            🎒 アイテム ({items.length}/{maxCapacity})
          </span>
          <span style={{ fontSize: 13, color: '#ffcc44' }}>
            G {gold}
          </span>
        </div>

        {/* ── ソートボタン ── */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '4px 12px',
            borderBottom: '1px solid #223344',
            backgroundColor: 'rgba(10, 10, 26, 0.7)',
            flexShrink: 0,
          }}
        >
          {(['name', 'category'] as const).map((key) => (
            <button
              key={key}
              onPointerDown={() => onSortChange(key)}
              style={{
                padding: '1px 7px', fontSize: 10,
                background: sortKey === key ? '#1a4466' : 'rgba(10,20,40,0.6)',
                color: sortKey === key ? '#88ccff' : '#556677',
                border: `1px solid ${sortKey === key ? '#335577' : '#223344'}`,
                borderRadius: 3, cursor: 'pointer',
              }}
            >
              {key === 'name' ? '名前順' : 'カテゴリ順'}
            </button>
          ))}
        </div>

        {/* ── アイテムリスト ── */}
        <div
          ref={scrollRef}
          style={{
            overflowY: 'auto',
            flexGrow: 1,
          }}
        >
          {items.length === 0 ? (
            <div
              style={{
                padding: '20px 12px',
                textAlign: 'center',
                color: '#667788',
                fontSize: 13,
              }}
            >
              アイテムなし
            </div>
          ) : (
            sortedItems.map(({ item, originalIndex }, i) => {
              const isSelected = i === selectedIndex;

              const isExpanded = isSelected || tapExpandedIdx === i;
              return (
                <div
                  key={originalIndex}
                  data-index={i}
                  onPointerDown={() => setTapExpandedIdx(prev => prev === i ? null : i)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '6px 4px 6px 0',
                    gap: 8,
                    backgroundColor: isExpanded ? SELECTED_ROW_BG : 'transparent',
                    borderBottom: '1px solid rgba(68, 85, 102, 0.3)',
                    borderLeft: isExpanded ? '3px solid #55aaff' : '3px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
                  {/* アイテム名 */}
                  <span
                    style={{
                      flexGrow: 1,
                      fontSize: 13,
                      color: item.unidentified ? '#99aaaa' : '#ccddee',
                    }}
                  >
                    {item.unidentified
                      ? '？？？のパーツ'
                      : (ALL_ITEMS.find(d => d.id === item.itemId)?.name ?? item.itemId)}
                  </span>

                  {/* 個数 */}
                  {item.quantity > 1 && (
                    <span style={{ fontSize: 12, color: '#99bbcc' }}>
                      × {item.quantity}
                    </span>
                  )}

                  {/* [使う] ボタン */}
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onUseItem(originalIndex);
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: 14,
                      backgroundColor: '#224466',
                      border: '1px solid #446688',
                      borderRadius: 4,
                      color: '#aaccee',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    使
                  </button>

                  {/* [置く] ボタン */}
                  {onPlaceItem && (
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onPlaceItem(originalIndex);
                      }}
                      style={{
                        padding: '6px 12px',
                        fontSize: 14,
                        backgroundColor: '#224433',
                        border: '1px solid #446655',
                        borderRadius: 4,
                        color: '#aaddbb',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      置
                    </button>
                  )}

                  {/* [投げる] ボタン */}
                  {onThrowItem && (
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onThrowItem(originalIndex);
                      }}
                      style={{
                        padding: '6px 12px',
                        fontSize: 14,
                        backgroundColor: '#443322',
                        border: '1px solid #665544',
                        borderRadius: 4,
                        color: '#ffcc88',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      投
                    </button>
                  )}

                  {/* [鑑定] ボタン（未鑑定 & スコープ所持時のみ） */}
                  {item.unidentified && hasIdentifyScope && (
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onIdentifyItem?.(originalIndex);
                      }}
                      style={{
                        padding: '6px 12px',
                        fontSize: 14,
                        backgroundColor: '#224422',
                        border: '1px solid #448844',
                        borderRadius: 4,
                        color: '#aaeebb',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      鑑定
                    </button>
                  )}

                  {/* [消] ボタン */}
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onDropItem(originalIndex);
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: 14,
                      backgroundColor: '#442222',
                      border: '1px solid #664444',
                      borderRadius: 4,
                      color: '#eeaaaa',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    消
                  </button>
                  </div>

                  {/* 説明文 (選択中またはタップ展開時に表示、スマホで折り返すように) */}
                  {isExpanded && (
                    <div
                      style={{
                        fontSize: 11,
                        color: item.unidentified ? '#778899' : '#99aabb',
                        lineHeight: 1.4,
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        paddingLeft: 8,
                      }}
                    >
                      {item.unidentified
                        ? '未鑑定のアイテム。識別スコープで正体を明かせる。'
                        : (ALL_ITEMS.find(d => d.id === item.itemId)?.description ?? '説明がありません。')
                      }
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

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
          [↑↓] 選択　[Z/Enter] 使う　[Esc/I] 閉じる
        </div>

        {/* 閉じるボタン（タッチ向け） */}
        <button
          onPointerDown={onClose}
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
