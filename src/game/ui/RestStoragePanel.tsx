'use client';

/**
 * @fileoverview 休憩所フロアの倉庫パネルコンポーネント
 *
 * 休憩所フロアで TILE_STORAGE を踏んだときに表示される。
 * BaseScreen の StorageOverlay と同等の機能を提供する。
 */

import { useState, useMemo } from 'react';
import type { GameState } from '../core/game-state';
import { playSE } from '../systems/audio';
import { depositItem, withdrawItem } from '../core/storage-system';
import itemsRaw from '../assets/data/items.json';
import toolsRaw from '../assets/data/tools-equipment.json';
import weaponsRaw from '../assets/data/weapons.json';

const ALL_ITEMS = [...(itemsRaw as any[]), ...(toolsRaw as any[])];
const ALL_WEAPONS = weaponsRaw as any[];

interface RestStoragePanelProps {
  gameState: GameState;
  onUpdateState: (next: GameState) => void;
  onClose: () => void;
}

export default function RestStoragePanel({ gameState, onUpdateState, onClose }: RestStoragePanelProps) {
  const storage = gameState.storage;
  const storedGold = gameState.storedGold;
  const carriedGold = gameState.inventory.gold;

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [goldError, setGoldError] = useState('');
  const [tab, setTab] = useState<'inventory' | 'storage'>('inventory');
  const [sortKey, setSortKey] = useState<'default' | 'name' | 'type'>('default');
  /** 閉じる前の確認ダイアログ表示フラグ */
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  /** タップで展開したアイテムキー */
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const getItemName = (itemId: string) => ALL_ITEMS.find((d) => d.id === itemId)?.name ?? itemId;
  const getWeaponName = (weaponId: string) => ALL_WEAPONS.find((d) => d.id === weaponId)?.name ?? weaponId;

  const sortedStorage = useMemo(() => {
    const items = storage.map((item, originalIndex) => ({ item, originalIndex }));
    if (sortKey === 'name') {
      items.sort((a, b) => {
        const nameA = a.item.type === 'weapon' ? getWeaponName(a.item.id) : getItemName(a.item.id);
        const nameB = b.item.type === 'weapon' ? getWeaponName(b.item.id) : getItemName(b.item.id);
        return nameA.localeCompare(nameB, 'ja');
      });
    } else if (sortKey === 'type') {
      items.sort((a, b) => a.item.type.localeCompare(b.item.type));
    }
    return items;
  }, [storage, sortKey]);

  const sortedInventoryWeapons = useMemo(() => {
    const ws = gameState.inventory.equippedWeapons.map((w, i) => ({ w, i }));
    if (sortKey === 'name') {
      ws.sort((a, b) => getWeaponName(a.w.weaponId).localeCompare(getWeaponName(b.w.weaponId), 'ja'));
    }
    return ws;
  }, [gameState.inventory.equippedWeapons, sortKey]);

  const sortedInventoryItems = useMemo(() => {
    const its = gameState.inventory.items.map((it, i) => ({ it, i }));
    if (sortKey === 'name') {
      its.sort((a, b) => {
        if ((a.it as any).unidentified && (b.it as any).unidentified) return 0;
        if ((a.it as any).unidentified) return 1;
        if ((b.it as any).unidentified) return -1;
        return getItemName(a.it.itemId).localeCompare(getItemName(b.it.itemId), 'ja');
      });
    }
    return its;
  }, [gameState.inventory.items, sortKey]);

  const handleDepositItemClick = (type: 'weapon' | 'item', index: number, id: string) => {
    const nextState = depositItem(gameState, id, type, index);
    if (nextState !== gameState) {
      playSE('ui_select');
      onUpdateState(nextState);
    } else {
      playSE('ui_cancel');
    }
  };

  const handleWithdrawItemClick = (storageIndex: number) => {
    const nextState = withdrawItem(gameState, storageIndex);
    if (nextState !== gameState) {
      playSE('ui_select');
      onUpdateState(nextState);
    } else {
      playSE('ui_cancel');
    }
  };

  const handleDeposit = () => {
    const amount = parseInt(depositAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setGoldError('正の整数を入力してください');
      return;
    }
    if (amount > carriedGold) {
      setGoldError(`所持金が足りません（所持: ${carriedGold.toLocaleString()} G）`);
      return;
    }
    onUpdateState({
      ...gameState,
      inventory: { ...gameState.inventory, gold: carriedGold - amount },
      storedGold: storedGold + amount,
    });
    setDepositAmount('');
    setGoldError('');
  };

  const handleWithdraw = () => {
    const amount = parseInt(withdrawAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setGoldError('正の整数を入力してください');
      return;
    }
    if (amount > storedGold) {
      setGoldError(`倉庫の金が足りません（倉庫: ${storedGold.toLocaleString()} G）`);
      return;
    }
    onUpdateState({
      ...gameState,
      inventory: { ...gameState.inventory, gold: carriedGold + amount },
      storedGold: storedGold - amount,
    });
    setWithdrawAmount('');
    setGoldError('');
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(5, 5, 20, 0.97)',
        border: '1px solid #6a4a2a',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 14px',
        zIndex: 30,
        fontFamily: 'monospace',
      }}
    >
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#ddbb88', fontWeight: 'bold', fontSize: 15 }}>拠点倉庫（休憩所）</span>
        <button
          onClick={() => setShowCloseConfirm(true)}
          style={{
            background: 'none',
            border: '1px solid #6a4a2a',
            borderRadius: 4,
            color: '#aaaacc',
            padding: '2px 10px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          閉じる
        </button>
      </div>

      {/* 区切り */}
      <div style={{ height: 1, backgroundColor: '#6a4a2a', marginBottom: 8 }} />

      {/* ゴールド預け入れ/引き出し */}
      <div
        style={{
          backgroundColor: 'rgba(50, 30, 10, 0.6)',
          border: '1px solid #6a4a2a',
          borderRadius: 6,
          padding: '6px 10px',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ color: '#ddbb88', fontWeight: 'bold', fontSize: 12 }}>ゴールド</span>
          <span style={{ fontSize: 11, color: '#aaaacc' }}>
            所持: <strong style={{ color: '#ffcc44' }}>{carriedGold.toLocaleString()} G</strong>
            　倉庫: <strong style={{ color: '#ffdd88' }}>{storedGold.toLocaleString()} G</strong>
          </span>
        </div>

        {/* 預け入れ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <input
            type="number"
            min={1}
            max={carriedGold}
            value={depositAmount}
            onChange={(e) => { setDepositAmount(e.target.value); setGoldError(''); }}
            placeholder="預け入れ額"
            style={{
              flex: 1,
              background: 'rgba(10,20,40,0.8)',
              border: '1px solid #6a4a2a',
              borderRadius: 4,
              color: '#ccddee',
              padding: '3px 6px',
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          />
          <button
            onClick={handleDeposit}
            style={{
              background: 'rgba(80,50,20,0.6)',
              border: '1px solid #bb8844',
              borderRadius: 4,
              color: '#ddbb88',
              padding: '3px 10px',
              cursor: 'pointer',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            預ける
          </button>
        </div>

        {/* 引き出し */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="number"
            min={1}
            max={storedGold}
            value={withdrawAmount}
            onChange={(e) => { setWithdrawAmount(e.target.value); setGoldError(''); }}
            placeholder="引き出し額"
            style={{
              flex: 1,
              background: 'rgba(10,20,40,0.8)',
              border: '1px solid #6a4a2a',
              borderRadius: 4,
              color: '#ccddee',
              padding: '3px 6px',
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          />
          <button
            onClick={handleWithdraw}
            style={{
              background: 'rgba(40,80,20,0.6)',
              border: '1px solid #44aa44',
              borderRadius: 4,
              color: '#88ee88',
              padding: '3px 10px',
              cursor: 'pointer',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            引き出す
          </button>
        </div>

        {goldError && (
          <div style={{ color: '#ff8888', fontSize: 11, marginTop: 4 }}>{goldError}</div>
        )}
      </div>

      {/* アイテム管理タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <button
          onClick={() => setTab('inventory')}
          style={{
            flex: 1, padding: '5px',
            background: tab === 'inventory' ? '#5a3a1a' : 'rgba(20, 20, 40, 0.8)',
            color: tab === 'inventory' ? '#fff' : '#aa8866',
            border: '1px solid #6a4a2a', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}
        >
          所持品から預ける
        </button>
        <button
          onClick={() => setTab('storage')}
          style={{
            flex: 1, padding: '5px',
            background: tab === 'storage' ? '#5a3a1a' : 'rgba(20, 20, 40, 0.8)',
            color: tab === 'storage' ? '#fff' : '#aa8866',
            border: '1px solid #6a4a2a', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}
        >
          倉庫から引き出す
        </button>
      </div>

      {/* ソートボタン */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {(['default', 'name', 'type'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            style={{
              padding: '2px 6px', fontSize: 10,
              background: sortKey === key ? '#4a2a0a' : 'rgba(10,20,40,0.6)',
              color: sortKey === key ? '#ddbb88' : '#776655',
              border: `1px solid ${sortKey === key ? '#6a4a2a' : '#443322'}`,
              borderRadius: 4, cursor: 'pointer',
            }}
          >
            {key === 'default' ? '標準' : key === 'name' ? '名前順' : '種類順'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 180, overflowY: 'auto', border: '1px solid #6a4a2a', borderRadius: 4, padding: 8, background: 'rgba(0,0,0,0.3)' }}>
        {tab === 'inventory' && (
          <>
            <div style={{ color: '#ddbb88', fontSize: 12, marginBottom: 4 }}>【 武器 】</div>
            {sortedInventoryWeapons.map(({ w, i }) => {
              const key = `inv-w-${i}`;
              const isExpanded = expandedKey === key;
              const weaponDef = ALL_WEAPONS.find(d => d.id === w.weaponId);
              return (
                <div
                  key={key}
                  onClick={() => setExpandedKey(prev => prev === key ? null : key)}
                  style={{ display: 'flex', flexDirection: 'column', marginBottom: 4, fontSize: 12, color: '#ccddee', cursor: 'pointer', padding: '8px 6px', minHeight: 38, borderRadius: 4, backgroundColor: isExpanded ? 'rgba(80,50,20,0.4)' : 'rgba(255,255,255,0.03)', border: isExpanded ? '1px solid #6a4a2a' : '1px solid rgba(106,74,42,0.3)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{getWeaponName(w.weaponId)}</span>
                    <button onClick={(e) => { e.stopPropagation(); handleDepositItemClick('weapon', i, w.weaponId); }} style={{ background: '#4a3a2a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>預ける</button>
                  </div>
                  {isExpanded && weaponDef?.description && (
                    <div style={{ fontSize: 10, color: '#ccbbaa', lineHeight: 1.4, marginTop: 3, paddingTop: 3, borderTop: '1px solid rgba(106,74,42,0.4)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      {weaponDef.description}
                    </div>
                  )}
                </div>
              );
            })}
            {gameState.inventory.equippedWeapons.length === 0 && <div style={{ fontSize: 11, color: '#665544', marginBottom: 8 }}>なし</div>}

            <div style={{ color: '#ddbb88', fontSize: 12, marginBottom: 4, marginTop: 8 }}>【 アイテム 】</div>
            {sortedInventoryItems.map(({ it, i }) => {
              const key = `inv-i-${i}`;
              const isExpanded = expandedKey === key;
              const unidentified = (it as any).unidentified;
              const itemDef = !unidentified ? ALL_ITEMS.find(d => d.id === it.itemId) : null;
              return (
                <div
                  key={key}
                  onClick={() => setExpandedKey(prev => prev === key ? null : key)}
                  style={{ display: 'flex', flexDirection: 'column', marginBottom: 4, fontSize: 12, color: '#ccddee', cursor: 'pointer', padding: '8px 6px', minHeight: 38, borderRadius: 4, backgroundColor: isExpanded ? 'rgba(80,50,20,0.4)' : 'rgba(255,255,255,0.03)', border: isExpanded ? '1px solid #6a4a2a' : '1px solid rgba(106,74,42,0.3)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{unidentified ? '？？？' : getItemName(it.itemId)} ×{it.quantity}</span>
                    <button onClick={(e) => { e.stopPropagation(); handleDepositItemClick('item', i, it.itemId); }} style={{ background: '#4a3a2a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>預ける</button>
                  </div>
                  {isExpanded && (
                    <div style={{ fontSize: 10, color: '#ccbbaa', lineHeight: 1.4, marginTop: 3, paddingTop: 3, borderTop: '1px solid rgba(106,74,42,0.4)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      {unidentified ? '未鑑定のアイテム。識別スコープで正体を明かせる。' : (itemDef?.description ?? '説明がありません。')}
                    </div>
                  )}
                </div>
              );
            })}
            {gameState.inventory.items.length === 0 && <div style={{ fontSize: 11, color: '#665544' }}>なし</div>}
          </>
        )}
        {tab === 'storage' && (
          <>
            {storage.length === 0 ? (
              <div style={{ color: '#665544', textAlign: 'center', marginTop: 16, fontSize: 12 }}>空っぽです</div>
            ) : (
              sortedStorage.map(({ item, originalIndex }) => {
                const displayName = item.type === 'weapon' ? getWeaponName(item.id) : getItemName(item.id);
                const key = `store-${originalIndex}`;
                const isExpanded = expandedKey === key;
                const def = item.type === 'weapon'
                  ? ALL_WEAPONS.find(d => d.id === item.id)
                  : ALL_ITEMS.find(d => d.id === item.id);
                return (
                  <div
                    key={key}
                    onClick={() => setExpandedKey(prev => prev === key ? null : key)}
                    style={{ display: 'flex', flexDirection: 'column', marginBottom: 4, fontSize: 12, color: '#ccddee', cursor: 'pointer', padding: '8px 6px', minHeight: 38, borderRadius: 4, backgroundColor: isExpanded ? 'rgba(80,50,20,0.4)' : 'rgba(255,255,255,0.03)', border: isExpanded ? '1px solid #6a4a2a' : '1px solid rgba(106,74,42,0.3)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{displayName} <span style={{ color: '#887766', fontSize: 10 }}>({item.type === 'weapon' ? '武器' : 'アイテム'})</span></span>
                      <button onClick={(e) => { e.stopPropagation(); handleWithdrawItemClick(originalIndex); }} style={{ background: '#4a3a2a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>引き出す</button>
                    </div>
                    {isExpanded && def?.description && (
                      <div style={{ fontSize: 10, color: '#ccbbaa', lineHeight: 1.4, marginTop: 3, paddingTop: 3, borderTop: '1px solid rgba(106,74,42,0.4)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {def.description}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* フッター */}
      <div style={{ marginTop: 6, color: '#665544', fontSize: 10, textAlign: 'center' }}>
        倉庫の金とアイテムはゲームオーバー後も失われません
      </div>

      {/* 閉じる前確認ダイアログ */}
      {showCloseConfirm && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: 'rgba(20, 12, 5, 0.99)',
              border: '1px solid #8a5a2a',
              borderRadius: 8,
              padding: '20px 24px',
              maxWidth: 280,
              textAlign: 'center',
              fontFamily: 'monospace',
            }}
          >
            <p style={{ color: '#ff9944', fontWeight: 'bold', fontSize: 13, marginBottom: 8 }}>
              倉庫を閉じますか？
            </p>
            <p style={{ color: '#ccbbaa', fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
              閉じると、このマスは<br />
              <span style={{ color: '#ff6633', fontWeight: 'bold' }}>消滅します。</span><br />
              再アクセスはできません。
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => { playSE('ui_select'); onClose(); }}
                style={{
                  background: '#7a2a1a',
                  border: '1px solid #aa4a3a',
                  borderRadius: 4,
                  color: '#ffddcc',
                  padding: '6px 16px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              >
                閉じる
              </button>
              <button
                onClick={() => setShowCloseConfirm(false)}
                style={{
                  background: '#333',
                  border: '1px solid #555',
                  borderRadius: 4,
                  color: '#aaa',
                  padding: '6px 16px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
