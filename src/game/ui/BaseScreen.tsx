'use client';

/**
 * @fileoverview 拠点画面（ベース）コンポーネント
 *
 * ダンジョンに入る前の拠点を表示する。
 * - 倉庫: storage に預けたアイテムの確認・出し入れ、金の預け入れ/引き出し
 * - 迷宮入口: ダンジョン探索開始
 * ゲームオーバー時も本画面に戻る。
 */

import { useState, useEffect, useMemo } from 'react';
import type { GameState, StorageItem } from '../core/game-state';
import { playBGM, playSE, setMuted, getMuted } from '../systems/audio';
import { depositItem, withdrawItem } from '../core/storage-system';
import itemsRaw from '../assets/data/items.json';
import toolsRaw from '../assets/data/tools-equipment.json';
import weaponsRaw from '../assets/data/weapons.json';

const ALL_ITEMS = [...(itemsRaw as any[]), ...(toolsRaw as any[])];
const ALL_WEAPONS = weaponsRaw as any[];

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------


interface BaseScreenProps {
  /** 現在のゲーム状態 */
  gameState: GameState;
  /**
   * 直前の探索でゲームオーバーになった階層番号。
   * null = 初めての来訪、またはゲームオーバー以外で戻ってきた場合。
   */
  deathFloor: number | null;
  /** 迷宮入口ボタンが押されたときのコールバック（開始階層番号を渡す） */
  onEnterDungeon: (floorNumber: number) => void;
  /** ゲーム状態を更新するコールバック（倉庫操作用） */
  onUpdateState?: (state: GameState) => void;
  /** セーブして終了（タイトルへ戻る）コールバック */
  onSaveAndExit?: () => void;
  /** セーブせずにタイトルへ戻るコールバック */
  onReturnToTitle?: () => void;
}

// ---------------------------------------------------------------------------
// 倉庫オーバーレイコンポーネント
// ---------------------------------------------------------------------------

function StorageOverlay({
  gameState,
  onClose,
  onUpdateState,
}: {
  gameState: GameState;
  onClose: () => void;
  onUpdateState?: (state: GameState) => void;
}) {
  const storage = gameState.storage;
  const storedGold = gameState.storedGold;
  const carriedGold = gameState.inventory.gold;

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [goldError, setGoldError] = useState('');
  const [tab, setTab] = useState<'inventory' | 'storage'>('inventory');
  const [sortKey, setSortKey] = useState<'default' | 'name' | 'type'>('default');

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
        if (a.it.unidentified && b.it.unidentified) return 0;
        if (a.it.unidentified) return 1;
        if (b.it.unidentified) return -1;
        return getItemName(a.it.itemId).localeCompare(getItemName(b.it.itemId), 'ja');
      });
    }
    return its;
  }, [gameState.inventory.items, sortKey]);

  const handleDepositItemClick = (type: 'weapon' | 'item', index: number, id: string) => {
    if (!onUpdateState) return;
    const nextState = depositItem(gameState, id, type, index);
    if (nextState !== gameState) {
      playSE('ui_select');
      onUpdateState(nextState);
    } else {
      playSE('ui_cancel');
    }
  };

  const handleWithdrawItemClick = (storageIndex: number) => {
    if (!onUpdateState) return;
    const nextState = withdrawItem(gameState, storageIndex);
    if (nextState !== gameState) {
      playSE('ui_select');
      onUpdateState(nextState);
    } else {
      playSE('ui_cancel');
    }
  };

  const handleDeposit = () => {
    if (!onUpdateState) return;
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
    if (!onUpdateState) return;
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
        backgroundColor: 'rgba(5, 5, 20, 0.95)',
        border: '1px solid #445566',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 20px',
        zIndex: 30,
        fontFamily: 'monospace',
      }}
    >
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#88ccff', fontWeight: 'bold', fontSize: 15 }}>📦 倉庫</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #445566',
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
      <div style={{ height: 1, backgroundColor: '#334455', marginBottom: 12 }} />

      {/* ゴールド預け入れ/引き出し */}
      <div
        style={{
          backgroundColor: 'rgba(20, 40, 70, 0.6)',
          border: '1px solid #2a5580',
          borderRadius: 6,
          padding: '10px 12px',
          marginBottom: 12,
        }}
      >
        <div style={{ color: '#88ccff', fontWeight: 'bold', fontSize: 13, marginBottom: 8 }}>💰 ゴールド管理</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#aaaacc', marginBottom: 10 }}>
          <span>所持金: <strong style={{ color: '#ffcc44' }}>{carriedGold.toLocaleString()} G</strong></span>
          <span>倉庫: <strong style={{ color: '#ffdd88' }}>{storedGold.toLocaleString()} G</strong></span>
        </div>

        {/* 預け入れ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
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
              border: '1px solid #334455',
              borderRadius: 4,
              color: '#ccddee',
              padding: '4px 8px',
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          />
          <button
            onClick={handleDeposit}
            disabled={!onUpdateState}
            style={{
              background: 'rgba(20,60,120,0.6)',
              border: '1px solid #4488cc',
              borderRadius: 4,
              color: '#88ccff',
              padding: '4px 12px',
              cursor: onUpdateState ? 'pointer' : 'not-allowed',
              fontSize: 12,
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
              border: '1px solid #334455',
              borderRadius: 4,
              color: '#ccddee',
              padding: '4px 8px',
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          />
          <button
            onClick={handleWithdraw}
            disabled={!onUpdateState}
            style={{
              background: 'rgba(40,80,20,0.6)',
              border: '1px solid #44aa44',
              borderRadius: 4,
              color: '#88ee88',
              padding: '4px 12px',
              cursor: onUpdateState ? 'pointer' : 'not-allowed',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            引き出す
          </button>
        </div>

        {goldError && (
          <div style={{ color: '#ff8888', fontSize: 11, marginTop: 6 }}>{goldError}</div>
        )}
      </div>

      {/* アイテム管理タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <button
          onClick={() => setTab('inventory')}
          style={{
            flex: 1, padding: '6px',
            background: tab === 'inventory' ? '#2a5580' : 'rgba(20, 20, 40, 0.8)',
            color: tab === 'inventory' ? '#fff' : '#88aacc',
            border: '1px solid #445566', borderRadius: 4, cursor: 'pointer', fontSize: 12
          }}
        >
          所持品から預ける
        </button>
        <button
          onClick={() => setTab('storage')}
          style={{
            flex: 1, padding: '6px',
            background: tab === 'storage' ? '#2a5580' : 'rgba(20, 20, 40, 0.8)',
            color: tab === 'storage' ? '#fff' : '#88aacc',
            border: '1px solid #445566', borderRadius: 4, cursor: 'pointer', fontSize: 12
          }}
        >
          倉庫から引き出す
        </button>
      </div>

      {/* ソートボタン */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['default', 'name', 'type'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            style={{
              padding: '2px 8px', fontSize: 11,
              background: sortKey === key ? '#1a4466' : 'rgba(10,20,40,0.6)',
              color: sortKey === key ? '#88ccff' : '#556677',
              border: `1px solid ${sortKey === key ? '#335577' : '#223344'}`,
              borderRadius: 4, cursor: 'pointer',
            }}
          >
            {key === 'default' ? '標準' : key === 'name' ? '名前順' : '種類順'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #334455', borderRadius: 4, padding: 8, background: 'rgba(0,0,0,0.3)' }}>
        {tab === 'inventory' && (
          <>
            <div style={{ color: '#88ccff', fontSize: 12, marginBottom: 4 }}>【 武器 】</div>
            {sortedInventoryWeapons.map(({ w, i }) => (
              <div key={`inv-w-${i}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: '#ccddee' }}>
                <span>{getWeaponName(w.weaponId)}</span>
                <button onClick={() => handleDepositItemClick('weapon', i, w.weaponId)} style={{ background: '#334455', color: '#fff', border:'none', borderRadius:4, padding:'2px 8px', cursor:'pointer' }}>預ける</button>
              </div>
            ))}
            {gameState.inventory.equippedWeapons.length === 0 && <div style={{ fontSize: 11, color: '#556677', marginBottom: 8 }}>なし</div>}

            <div style={{ color: '#88ccff', fontSize: 12, marginBottom: 4, marginTop: 8 }}>【 アイテム 】</div>
            {sortedInventoryItems.map(({ it, i }) => (
              <div key={`inv-i-${i}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: '#ccddee' }}>
                <span>{it.unidentified ? '？？？' : getItemName(it.itemId)} ×{it.quantity}</span>
                <button onClick={() => handleDepositItemClick('item', i, it.itemId)} style={{ background: '#334455', color: '#fff', border:'none', borderRadius:4, padding:'2px 8px', cursor:'pointer' }}>預ける</button>
              </div>
            ))}
            {gameState.inventory.items.length === 0 && <div style={{ fontSize: 11, color: '#556677' }}>なし</div>}
          </>
        )}
        {tab === 'storage' && (
          <>
            {storage.length === 0 ? (
              <div style={{ color: '#556677', textAlign: 'center', marginTop: 16, fontSize: 12 }}>空っぽです</div>
            ) : (
              sortedStorage.map(({ item, originalIndex }) => {
                const displayName = item.type === 'weapon' ? getWeaponName(item.id) : getItemName(item.id);
                return (
                  <div key={`store-${originalIndex}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: '#ccddee' }}>
                    <span>{displayName} <span style={{color:'#667788', fontSize:10}}>({item.type === 'weapon' ? '武器' : 'アイテム'})</span></span>
                    <button onClick={() => handleWithdrawItemClick(originalIndex)} style={{ background: '#334455', color: '#fff', border:'none', borderRadius:4, padding:'2px 8px', cursor:'pointer' }}>引き出す</button>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* フッター */}
      <div style={{ marginTop: 12, color: '#445566', fontSize: 11, textAlign: 'center' }}>
        倉庫の金とアイテムはゲームオーバー後も失われません
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 出発階ロック解除計算
// ---------------------------------------------------------------------------

/**
 * 最高到達階（＝主人公レベル）から選択可能な最大出発階を返す。
 *
 * - レベル 1   : 1F のみ（選択不可）
 * - レベル 2〜4: そのままレベル数の階まで
 * - レベル 5〜9: 5F まで
 * - レベル 10〜14: 10F まで
 * - レベル 15〜19: 15F まで
 * - 以降、5F 刻みで解放
 */
function getMaxStartFloor(level: number): number {
  if (level <= 1) return 1;
  if (level <= 4) return level;
  return Math.floor(level / 5) * 5;
}

// ---------------------------------------------------------------------------
// BaseScreen コンポーネント
// ---------------------------------------------------------------------------

/**
 * 拠点画面。タイトル→ゲームスタート後、またはゲームオーバー後に表示される。
 */
export default function BaseScreen({ gameState, deathFloor, onEnterDungeon, onUpdateState, onSaveAndExit, onReturnToTitle }: BaseScreenProps) {
  const [showStorage, setShowStorage] = useState(false);
  /** タイトルに戻る確認ダイアログの表示フラグ */
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  /** 出発階選択オーバーレイの表示フラグ */
  const [showFloorSelect, setShowFloorSelect] = useState(false);
  const [isMuted, setIsMuted] = useState(() => getMuted());

  useEffect(() => {
    if (showStorage) {
      playBGM('shop');
    } else {
      // It will replay 'base' BGM when closing the shop.
      // This is to ensure the music state is consistent.
      playBGM('title');
    }
  }, [showStorage]);

  const gold = gameState.inventory.gold;
  const storedGold = gameState.storedGold;
  const pilotLevel = gameState.pilot.level;
  /** パイロットレベルから解放されている最大出発階 */
  const maxStartFloor = getMaxStartFloor(pilotLevel);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#07070f',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'monospace',
        overflow: 'hidden',
        zIndex: 10,
      }}
    >
      {/* 背景グリッド（装飾） */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(30,60,100,0.08) 1px, transparent 1px), ' +
            'linear-gradient(90deg, rgba(30,60,100,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }}
      />

      {/* ── ヘッダー ── */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 20px',
          borderBottom: '1px solid #223344',
          flexShrink: 0,
        }}
      >
        <div>
          <span style={{ color: '#ffee88', fontWeight: 'bold', fontSize: 16 }}>⚙ メカローグ本部</span>
        </div>
        <div style={{ display: 'flex', gap: 16, color: '#aaaacc', fontSize: 12, alignItems: 'center' }}>
          <span>Lv.<strong style={{ color: '#88ddff' }}>{pilotLevel}</strong></span>
          <span>所持金 <strong style={{ color: '#ffcc44' }}>{gold.toLocaleString()}</strong> G</span>
          {storedGold > 0 && (
            <span>倉庫金 <strong style={{ color: '#ffdd88' }}>{storedGold.toLocaleString()}</strong> G</span>
          )}
          <button
            onClick={() => {
              const next = !getMuted();
              setMuted(next);
              setIsMuted(next);
            }}
            title={isMuted ? 'サウンドON' : 'サウンドOFF'}
            style={{
              background: 'none',
              border: '1px solid #334455',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: '2px 6px',
              opacity: isMuted ? 0.5 : 1,
              color: isMuted ? '#888' : '#ffdd88',
            }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {/* ── ゲームオーバーメッセージ ── */}
      {deathFloor !== null && (
        <div
          style={{
            position: 'relative',
            backgroundColor: 'rgba(80,10,10,0.7)',
            borderBottom: '1px solid #661111',
            padding: '8px 20px',
            color: '#ff8888',
            fontSize: 13,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          マシンが大破した — B{deathFloor}F で敗退。所持金が半減し、全アイテム・武器を失った。
        </div>
      )}

      {/* ── メインエリア ── */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: '20px 24px',
          minHeight: 0,
        }}
      >
        {/* 倉庫パネル */}
        <div
          onClick={() => setShowStorage(true)}
          style={{
            flex: 1,
            height: '100%',
            maxHeight: 260,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            backgroundColor: 'rgba(10,30,60,0.7)',
            border: '1px solid #2a5580',
            borderRadius: 10,
            cursor: 'pointer',
            transition: 'background-color 0.15s, border-color 0.15s',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(20,50,100,0.85)';
            (e.currentTarget as HTMLDivElement).style.borderColor = '#4488cc';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(10,30,60,0.7)';
            (e.currentTarget as HTMLDivElement).style.borderColor = '#2a5580';
          }}
          role="button"
          aria-label="倉庫を開く"
        >
          <div style={{ fontSize: 36 }}>📦</div>
          <div style={{ color: '#88ccff', fontWeight: 'bold', fontSize: 16 }}>倉庫</div>
          <div style={{ color: '#556677', fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
            アイテム・ゴールドを<br />預け入れ・引き出す
          </div>
          {storedGold > 0 && (
            <div style={{ color: '#ffdd88', fontSize: 11 }}>
              💰 {storedGold.toLocaleString()} G 預け中
            </div>
          )}
          <div
            style={{
              marginTop: 8,
              padding: '5px 18px',
              backgroundColor: 'rgba(30,80,150,0.5)',
              border: '1px solid #4488cc',
              borderRadius: 4,
              color: '#88ccff',
              fontSize: 13,
            }}
          >
            開く
          </div>
        </div>

        {/* 迷宮入口パネル */}
        <div
          onClick={() => {
            playSE('ui_select');
            if (maxStartFloor >= 2) {
              setShowFloorSelect(true);
            } else {
              onEnterDungeon(1);
            }
          }}
          style={{
            flex: 1,
            height: '100%',
            maxHeight: 260,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            backgroundColor: 'rgba(40,15,10,0.7)',
            border: '1px solid #663322',
            borderRadius: 10,
            cursor: 'pointer',
            transition: 'background-color 0.15s, border-color 0.15s',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(80,25,10,0.85)';
            (e.currentTarget as HTMLDivElement).style.borderColor = '#cc5522';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(40,15,10,0.7)';
            (e.currentTarget as HTMLDivElement).style.borderColor = '#663322';
          }}
          role="button"
          aria-label="迷宮へ出発"
        >
          <div style={{ fontSize: 36 }}>⚔</div>
          <div style={{ color: '#ffaa44', fontWeight: 'bold', fontSize: 16 }}>迷宮入口</div>
          <div style={{ color: '#664433', fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
            深淵なる迷宮へ<br />冒険へ出発する
          </div>
          {maxStartFloor >= 2 && (
            <div style={{ color: '#cc8844', fontSize: 11, textAlign: 'center' }}>
              B1F〜B{maxStartFloor}F から選択可
            </div>
          )}
          <div
            style={{
              marginTop: 8,
              padding: '5px 18px',
              backgroundColor: 'rgba(120,40,10,0.5)',
              border: '1px solid #cc5522',
              borderRadius: 4,
              color: '#ffaa44',
              fontSize: 13,
              fontWeight: 'bold',
            }}
          >
            出発
          </div>
        </div>

        {/* 倉庫オーバーレイ */}
        {showStorage && (
          <StorageOverlay
            gameState={gameState}
            onClose={() => setShowStorage(false)}
            onUpdateState={onUpdateState}
          />
        )}

        {/* 出発階選択オーバーレイ */}
        {showFloorSelect && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(5, 5, 20, 0.97)',
              border: '1px solid #445566',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              padding: '16px 20px',
              zIndex: 30,
              fontFamily: 'monospace',
            }}
          >
            {/* ヘッダー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#ffaa44', fontWeight: 'bold', fontSize: 15 }}>⚔ 出発階を選択</span>
              <button
                onClick={() => { playSE('ui_cancel'); setShowFloorSelect(false); }}
                style={{
                  background: 'none',
                  border: '1px solid #445566',
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

            <div style={{ height: 1, backgroundColor: '#334455', marginBottom: 12 }} />

            <div style={{ color: '#888899', fontSize: 12, marginBottom: 12 }}>
              B1F〜B{maxStartFloor}F のいずれかから探索を開始できます。
            </div>

            {/* フロアボタングリッド */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 8,
                alignContent: 'start',
              }}
            >
              {Array.from({ length: maxStartFloor }, (_, i) => i + 1).map((f) => {
                const isBossFloor = f % 5 === 0;
                return (
                  <button
                    key={f}
                    onClick={() => {
                      playSE('ui_select');
                      setShowFloorSelect(false);
                      onEnterDungeon(f);
                    }}
                    style={{
                      padding: '8px 4px',
                      backgroundColor: isBossFloor ? 'rgba(80,20,10,0.7)' : 'rgba(20,40,70,0.6)',
                      border: `1px solid ${isBossFloor ? '#cc4422' : '#2a5580'}`,
                      borderRadius: 6,
                      color: isBossFloor ? '#ff8844' : '#88ccff',
                      fontSize: 13,
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      fontWeight: isBossFloor ? 'bold' : 'normal',
                      transition: 'background-color 0.1s, border-color 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        isBossFloor ? 'rgba(120,30,10,0.9)' : 'rgba(30,60,110,0.9)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        isBossFloor ? '#ff6633' : '#4488cc';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        isBossFloor ? 'rgba(80,20,10,0.7)' : 'rgba(20,40,70,0.6)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        isBossFloor ? '#cc4422' : '#2a5580';
                    }}
                  >
                    B{f}F{isBossFloor ? ' 👑' : ''}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 12, color: '#445566', fontSize: 11, textAlign: 'center' }}>
              ボス階（5の倍数）から始める場合、ボスはリセットされます
            </div>
          </div>
        )}
      </div>

      {/* ── フッター ── */}
      <div
        style={{
          position: 'relative',
          borderTop: '1px solid #223344',
          padding: '8px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span style={{ color: '#334455', fontSize: 11 }}>
          倉庫の金とアイテムはゲームオーバー後も失われません
        </span>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {onSaveAndExit && (
            <button
              onClick={() => { playSE('ui_select'); onSaveAndExit(); }}
              style={{
                background: 'rgba(20,60,30,0.7)',
                border: '1px solid #336633',
                borderRadius: 4,
                color: '#88ee88',
                padding: '5px 14px',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(30,90,40,0.9)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(20,60,30,0.7)';
              }}
            >
              セーブして終了
            </button>
          )}
          {onReturnToTitle && (
            <button
              onClick={() => { playSE('ui_select'); setShowReturnDialog(true); }}
              style={{
                background: 'rgba(40,20,10,0.7)',
                border: '1px solid #664422',
                borderRadius: 4,
                color: '#cc8844',
                padding: '5px 14px',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(70,30,10,0.9)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(40,20,10,0.7)';
              }}
            >
              タイトルに戻る
            </button>
          )}
        </div>
      </div>

      {/* ── タイトルに戻る確認ダイアログ ── */}
      {showReturnDialog && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => { playSE('ui_cancel'); setShowReturnDialog(false); }}
        >
          <div
            style={{
              backgroundColor: 'rgba(8,12,28,0.98)',
              border: '1px solid #445566',
              borderRadius: 10,
              padding: '28px 32px',
              minWidth: 300,
              maxWidth: 400,
              fontFamily: 'monospace',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ color: '#88ccff', fontWeight: 'bold', fontSize: 15, textAlign: 'center' }}>
              タイトルに戻る
            </div>
            <div style={{ height: 1, backgroundColor: '#334455' }} />

            <button
              onClick={() => {
                playSE('ui_select');
                setShowReturnDialog(false);
                onSaveAndExit?.();
              }}
              style={{
                background: 'rgba(20,60,30,0.7)',
                border: '1px solid #336633',
                borderRadius: 6,
                color: '#88ee88',
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'monospace',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(30,90,40,0.9)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(20,60,30,0.7)';
              }}
            >
              セーブしてタイトルへ戻る
            </button>

            <div>
              <button
                onClick={() => {
                  playSE('ui_select');
                  setShowReturnDialog(false);
                  onReturnToTitle?.();
                }}
                style={{
                  width: '100%',
                  background: 'rgba(60,15,10,0.7)',
                  border: '1px solid #882222',
                  borderRadius: 6,
                  color: '#ff8866',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(100,20,10,0.9)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(60,15,10,0.7)';
                }}
              >
                セーブせずに戻る
              </button>
              <div style={{ color: '#cc4422', fontSize: 11, marginTop: 4, paddingLeft: 4 }}>
                保存されていない変更は失われます
              </div>
            </div>

            <button
              onClick={() => { playSE('ui_cancel'); setShowReturnDialog(false); }}
              style={{
                background: 'none',
                border: '1px solid #445566',
                borderRadius: 6,
                color: '#aaaacc',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#6688aa';
                (e.currentTarget as HTMLButtonElement).style.color = '#cce0ff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#445566';
                (e.currentTarget as HTMLButtonElement).style.color = '#aaaacc';
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
