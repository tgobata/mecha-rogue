"use client";

/**
 * @fileoverview バトル専用画面コンポーネント
 *
 * 探索中に隣接敵がいるとき、キャンバス表示の代わりにこのコンポーネントを表示する。
 * レイアウト:
 *   上部: 敵スプライト大表示 + 敵ステータス
 *   中部: バトルログ
 *   下部: アクションボタン（攻撃方向・スキル・アイテム・装備・待機）
 *
 * バトルロジック・ターン処理は turn-system.ts が担当するため、
 * このコンポーネントは表示と入力のみを担当する。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { GameState, Enemy, Player } from "../core/game-state";
import type { PlayerAction } from "../core/turn-system";
import type { UIAction } from "../systems/input";
import type { SkillSlot } from "./VirtualController";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface BattleScreenProps {
  /** 現在のゲーム状態（player, enemies, floor 等） */
  gameState: GameState;
  /** バトルログ行配列（最新が末尾） */
  battleLog: string[];
  /** PlayerAction 発火コールバック */
  onAction: (action: PlayerAction) => void;
  /** UIAction 発火コールバック */
  onUIAction: (action: UIAction) => void;
  /** スキル使用コールバック（スロットインデックスを渡す） */
  onSkillUse: (slotIndex: number) => void;
  /** アクティブスキルのスロット情報 */
  skillSlots: SkillSlot[];
  /** 足元にアイテム/装備があるか */
  hasFloorItem: boolean;
}

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

const FACING_DELTA: Record<string, { dx: number; dy: number }> = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 },
};

/** プレイヤーに隣接している（HP > 0）敵リストを返す */
function getAdjacentEnemies(gameState: GameState): Enemy[] {
  const { player, enemies } = gameState;
  if (!player) return [];
  return enemies.filter((e) => {
    if (e.hp <= 0) return false;
    const dx = Math.abs(e.pos.x - player.pos.x);
    const dy = Math.abs(e.pos.y - player.pos.y);
    return dx + dy === 1;
  });
}

/**
 * プレイヤーが向いている方向の敵（優先）、いなければ最初の隣接敵を返す。
 * 隣接敵が0なら null。
 */
export function getBattleTargetEnemy(gameState: GameState): Enemy | null {
  const adjacent = getAdjacentEnemies(gameState);
  if (adjacent.length === 0) return null;
  const player = gameState.player;
  if (!player) return adjacent[0];
  const delta = FACING_DELTA[player.facing] ?? { dx: 0, dy: 1 };
  const frontX = player.pos.x + delta.dx;
  const frontY = player.pos.y + delta.dy;
  return adjacent.find((e) => e.pos.x === frontX && e.pos.y === frontY) ?? adjacent[0];
}

/** プレイヤーが戦闘中か（隣接敵あり）を返す */
export function isInBattle(gameState: GameState): boolean {
  return getAdjacentEnemies(gameState).length > 0;
}

// ---------------------------------------------------------------------------
// ログカラー
// ---------------------------------------------------------------------------

const LOG_COLORS: Record<string, string> = {
  damage:  '#ff8888',
  recv:    '#ffaa66',
  kill:    '#ffdd44',
  floor:   '#88ddff',
  item:    '#88ff88',
  warn:    '#ff5555',
  system:  '#ff4444',
  default: '#cccccc',
};

function getLogType(l: string): string {
  if (l.includes('[警告]') || l.includes('壊れた')) return 'warn';
  if (l.includes('ダメージを受けた')) return 'recv';
  if (l.includes('ダメージ') || l.includes('を攻撃して')) return 'damage';
  if (l.includes('倒した') || l.includes('撃破')) return 'kill';
  if (l.includes('降りた') || l.includes('潜入') || l.includes('フロア')) return 'floor';
  if (l.includes('使用') || l.includes('取得') || l.includes('拾') || l.includes('捨てた') || l.includes('鑑定')) return 'item';
  if (l.includes('大破') || l.includes('帰還') || l.includes('OVER')) return 'system';
  return 'default';
}

// ---------------------------------------------------------------------------
// EnemySpriteDisplay: 敵スプライト大表示サブコンポーネント
// ---------------------------------------------------------------------------
// PlayerStatusBar: プレイヤーステータス表示サブコンポーネント
// ---------------------------------------------------------------------------

interface PlayerStatusBarProps {
  player: Player;
  inventory: GameState['inventory'];
  pilotLevel: number;
  gold: number;
}

function PlayerStatusBar({ player, inventory, pilotLevel, gold }: PlayerStatusBarProps) {
  const hpPct = Math.max(0, Math.min(1, player.hp / Math.max(1, player.maxHp)));
  const hpColor =
    hpPct > 0.5  ? '#44dd44' :
    hpPct > 0.25 ? '#ffcc00' : '#ff4444';

  const weapon     = player.equippedWeapon;
  const shield     = player.equippedShield;
  const armor      = player.equippedArmor;
  const itemCount  = inventory.items.length;
  const itemMax    = inventory.items.length; // 表示用カウント（上限は MachineStats 側）

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 10px',
        backgroundColor: 'rgba(0,0,0,0.82)',
        borderBottom: '1px solid #2a2a3a',
        fontFamily: 'monospace',
        fontSize: 11,
        flexShrink: 0,
      }}
    >
      {/* 上段: HP バー + Lv + Gold */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Lv */}
        <span style={{ color: '#aaaaff', fontWeight: 'bold', whiteSpace: 'nowrap', fontSize: 10 }}>
          Lv{pilotLevel}
        </span>

        {/* HP ラベル */}
        <span style={{ color: '#88bbff', whiteSpace: 'nowrap' }}>HP</span>

        {/* HP バー */}
        <div
          style={{
            flex: 1,
            height: 10,
            backgroundColor: '#1a1a1a',
            borderRadius: 5,
            overflow: 'hidden',
            border: '1px solid #333',
          }}
        >
          <div
            style={{
              width: `${hpPct * 100}%`,
              height: '100%',
              backgroundColor: hpColor,
              transition: 'width 0.15s ease-out, background-color 0.15s',
            }}
          />
        </div>

        {/* HP 数値 */}
        <span style={{ color: hpColor, whiteSpace: 'nowrap', fontWeight: 'bold', minWidth: 56, textAlign: 'right' }}>
          {player.hp}/{player.maxHp}
        </span>

        {/* 所持金 */}
        <span style={{ color: '#ffdd44', whiteSpace: 'nowrap', marginLeft: 4 }}>
          ¥{gold}
        </span>
      </div>

      {/* 下段: ATK / DEF / 装備 / アイテム数 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* ATK */}
        <span style={{ color: '#ff8888' }}>
          ATK <span style={{ color: '#ffcccc', fontWeight: 'bold' }}>{player.atk}</span>
        </span>
        {/* DEF */}
        <span style={{ color: '#88ccff' }}>
          DEF <span style={{ color: '#cceeFF', fontWeight: 'bold' }}>{player.def}</span>
        </span>

        {/* 装備武器 */}
        <span style={{ color: '#ffaa44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
          ⚔ {weapon ? weapon.name : '素手'}
          {weapon?.durability !== undefined && (
            <span style={{ color: '#888', fontSize: 9 }}> ({weapon.durability})</span>
          )}
        </span>

        {/* 盾 */}
        {shield && (
          <span style={{ color: '#88ddff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
            🛡 {shield.name}
          </span>
        )}

        {/* アーマー */}
        {armor && (
          <span style={{ color: '#aaffaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
            🔩 {armor.name}
          </span>
        )}

        {/* アイテム数 */}
        <span style={{ color: '#888888', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          🎒 {itemCount}個
        </span>
      </div>

      {/* 状態異常 */}
      {player.statusEffects && player.statusEffects.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {player.statusEffects.map((eff, i) => (
            <span
              key={i}
              style={{
                backgroundColor: 'rgba(255,100,0,0.2)',
                border: '1px solid #cc6600',
                borderRadius: 3,
                padding: '1px 5px',
                fontSize: 10,
                color: '#ffaa44',
              }}
            >
              {eff.type}
              {eff.remainingTurns > 0 && ` (${eff.remainingTurns})`}
            </span>
          ))}
        </div>
      )}

      {/* 特殊バフ表示 */}
      {(player.nullifyCharges || player.speedBoostTurns || player.bossBoostTurns || player.healTurnsLeft) ? (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {!!player.nullifyCharges && (
            <span style={{ color: '#88ffff', fontSize: 10 }}>🛡バリア×{player.nullifyCharges}</span>
          )}
          {!!player.speedBoostTurns && (
            <span style={{ color: '#ffff44', fontSize: 10 }}>⚡加速({player.speedBoostTurns})</span>
          )}
          {!!player.bossBoostTurns && (
            <span style={{ color: '#ffaa00', fontSize: 10 }}>✨聖油({player.bossBoostTurns})</span>
          )}
          {!!player.healTurnsLeft && (
            <span style={{ color: '#44ff88', fontSize: 10 }}>💊回復({player.healTurnsLeft})</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface EnemySpriteDisplayProps {
  enemy: Enemy;
  size?: number;
}

/** scout_drone_lv2 → scout_drone のようにレベルサフィックスを除去 */
function toBaseType(enemyType: string): string {
  return enemyType.replace(/_lv\d+$/, '');
}

function EnemySpriteDisplay({ enemy, size = 256 }: EnemySpriteDisplayProps) {
  const { enemyType } = enemy;
  const baseType = toBaseType(enemyType);

  // フォールバック順:
  //   1. SD生成スプライト (exact)  /sprites/enemies/battle/{enemyType}.png
  //   2. SD生成スプライト (base)   /sprites/enemies/battle/{baseType}.png
  //   3. 既存ドット絵              /sprites/enemies/{enemyType}_dir_down_idle_0.png
  const urls = [
    `/sprites/enemies/battle/${enemyType}.png`,
    ...(baseType !== enemyType ? [`/sprites/enemies/battle/${baseType}.png`] : []),
    `/sprites/enemies/${enemyType}_dir_down_idle_0.png`,
  ];

  const [urlIndex, setUrlIndex] = useState(0);

  // enemyType が変わったらリセット
  useEffect(() => {
    setUrlIndex(0);
  }, [enemyType]);

  const src     = urls[urlIndex] ?? urls[urls.length - 1];
  const isPixel = urlIndex >= urls.length - 1;

  const handleError = () => {
    setUrlIndex((i) => Math.min(i + 1, urls.length - 1));
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* 発光エフェクト（ボス） */}
      {enemy.isBoss && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            boxShadow: '0 0 40px 20px rgba(255,100,0,0.35)',
            pointerEvents: 'none',
          }}
        />
      )}
      <img
        src={src}
        alt={enemy.name ?? enemyType}
        onError={handleError}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          imageRendering: isPixel ? 'pixelated' : 'auto',
        }}
        draggable={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EnemyStatusBar: 敵名 + HP バーサブコンポーネント
// ---------------------------------------------------------------------------

interface EnemyStatusBarProps {
  enemy: Enemy;
}

function EnemyStatusBar({ enemy }: EnemyStatusBarProps) {
  const hpPct = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
  const hpColor = hpPct > 0.5 ? '#44dd44' : hpPct > 0.25 ? '#ffaa22' : '#ff4444';
  const displayName = enemy.name ?? enemy.enemyType;

  return (
    <div style={{ width: '100%', maxWidth: 360, fontFamily: 'monospace' }}>
      {/* 名前行 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        {enemy.isBoss && (
          <span style={{ color: '#ff8844', fontWeight: 'bold', fontSize: 11 }}>BOSS</span>
        )}
        <span style={{ color: '#eeeeee', fontWeight: 'bold', fontSize: 15 }}>
          {displayName}
        </span>
        {enemy.level && enemy.level > 1 && (
          <span style={{ color: enemy.levelColor ?? '#aaaaff', fontSize: 11 }}>
            Lv{enemy.level}
          </span>
        )}
      </div>

      {/* HP バー */}
      <div
        style={{
          width: '100%',
          height: 10,
          backgroundColor: '#222222',
          borderRadius: 5,
          overflow: 'hidden',
          border: '1px solid #444',
        }}
      >
        <div
          style={{
            width: `${hpPct * 100}%`,
            height: '100%',
            backgroundColor: hpColor,
            transition: 'width 0.2s ease-out, background-color 0.2s',
          }}
        />
      </div>

      {/* HP 数値 */}
      <div style={{ fontSize: 11, color: '#aaaaaa', marginTop: 2, textAlign: 'right' }}>
        {enemy.hp} / {enemy.maxHp}
      </div>

      {/* 状態異常バッジ */}
      {enemy.statusEffects && enemy.statusEffects.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          {enemy.statusEffects.map((eff, i) => (
            <span
              key={i}
              style={{
                backgroundColor: 'rgba(255,180,0,0.2)',
                border: '1px solid #cc8800',
                borderRadius: 3,
                padding: '1px 5px',
                fontSize: 10,
                color: '#ffcc44',
              }}
            >
              {eff.type}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BattleLog: バトルログパネルサブコンポーネント
// ---------------------------------------------------------------------------

const BATTLE_LOG_DISPLAY = 8;

function BattleLog({ battleLog }: { battleLog: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!scrollRef.current || isUserScrollingRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [battleLog]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
    if (!atBottom) {
      isUserScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 3000);
    } else {
      isUserScrollingRef.current = false;
    }
  };

  const displayed = battleLog.slice(-BATTLE_LOG_DISPLAY);
  const lastIdx = displayed.length - 1;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        flex: '1 1 auto',
        minHeight: 72,
        maxHeight: 120,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '6px 10px',
        backgroundColor: 'rgba(0,0,0,0.75)',
        borderTop: '1px solid #333',
        borderBottom: '1px solid #333',
        fontFamily: 'monospace',
        fontSize: 12,
        scrollbarWidth: 'thin',
        scrollbarColor: '#334455 transparent',
      }}
    >
      {displayed.map((line, i) => (
        <p
          key={`${battleLog.length - displayed.length + i}`}
          style={{
            color: LOG_COLORS[getLogType(line)],
            opacity:
              i === lastIdx     ? 1.0  :
              i === lastIdx - 1 ? 0.88 :
              i === lastIdx - 2 ? 0.75 : 0.6,
            margin: '1px 0',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActionButtons: 攻撃/スキル/アイテム/装備ボタンサブコンポーネント
// ---------------------------------------------------------------------------

interface ActionButtonsProps {
  onAction: (action: PlayerAction) => void;
  onUIAction: (action: UIAction) => void;
  onSkillUse: (slotIndex: number) => void;
  skillSlots: SkillSlot[];
  hasFloorItem: boolean;
  /** ターゲット敵に向かう攻撃アクション（向きを自動決定） */
  attackAction: PlayerAction;
  /** 攻撃方向ラベル用 */
  attackDir: string;
}

const BTN_BASE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  border: '2px solid rgba(255,255,255,0.25)',
  borderRadius: 10,
  color: '#ffffff',
  fontWeight: 'bold',
  touchAction: 'none',
  userSelect: 'none',
  cursor: 'pointer',
  WebkitUserSelect: 'none',
  gap: 2,
};

function ActionButtons({
  onAction,
  onUIAction,
  onSkillUse,
  skillSlots,
  hasFloorItem,
  attackAction,
  attackDir,
}: ActionButtonsProps) {
  const fire = useCallback(
    (e: React.PointerEvent, action: PlayerAction) => {
      e.preventDefault();
      onAction(action);
    },
    [onAction],
  );

  const fireUI = useCallback(
    (e: React.PointerEvent, action: UIAction) => {
      e.preventDefault();
      onUIAction(action);
    },
    [onUIAction],
  );

  // 攻撃方向ラベル（ターゲット方向）
  const attackLabel = (() => {
    switch (attackDir) {
      case 'up':    return '↑攻撃';
      case 'down':  return '↓攻撃';
      case 'left':  return '←攻撃';
      case 'right': return '→攻撃';
      default:      return '攻撃';
    }
  })();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: '8px 10px',
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* 攻撃ボタン */}
      <button
        style={{
          ...BTN_BASE,
          width: 72,
          height: 56,
          backgroundColor: 'rgba(160,20,20,0.85)',
          borderColor: '#cc4444',
          fontSize: 13,
        }}
        onPointerDown={(e) => fire(e, attackAction)}
      >
        <span style={{ fontSize: 18 }}>⚔</span>
        <span style={{ fontSize: 10 }}>{attackLabel}</span>
      </button>

      {/* 待機ボタン */}
      <button
        style={{
          ...BTN_BASE,
          width: 56,
          height: 56,
          backgroundColor: 'rgba(20,60,120,0.85)',
          borderColor: '#4466aa',
          fontSize: 11,
        }}
        onPointerDown={(e) => fire(e, 'wait')}
      >
        <span style={{ fontSize: 16 }}>⏸</span>
        <span>待機</span>
      </button>

      {/* スキルボタン群 */}
      {skillSlots.map((sk, i) => (
        <button
          key={i}
          style={{
            ...BTN_BASE,
            width: 56,
            height: 56,
            backgroundColor:
              sk.cooldown > 0
                ? 'rgba(40,40,40,0.85)'
                : 'rgba(120,60,160,0.85)',
            borderColor: sk.cooldown > 0 ? '#555' : '#9944cc',
            fontSize: 10,
            opacity: sk.cooldown > 0 ? 0.6 : 1,
          }}
          disabled={sk.cooldown > 0}
          onPointerDown={(e) => {
            e.preventDefault();
            if (sk.cooldown <= 0) onSkillUse(i);
          }}
        >
          <span style={{ fontSize: 15 }}>✨</span>
          <span style={{ maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sk.cooldown > 0 ? `CT:${sk.cooldown}` : sk.name}
          </span>
        </button>
      ))}

      {/* アイテムボタン */}
      <button
        style={{
          ...BTN_BASE,
          width: 56,
          height: 56,
          backgroundColor: 'rgba(60,40,100,0.85)',
          borderColor: '#8855bb',
          fontSize: 11,
        }}
        onPointerDown={(e) => fireUI(e, 'open_inventory')}
      >
        <span style={{ fontSize: 16 }}>🎒</span>
        <span>アイテム</span>
      </button>

      {/* 装備ボタン */}
      <button
        style={{
          ...BTN_BASE,
          width: 56,
          height: 56,
          backgroundColor: 'rgba(20,80,40,0.85)',
          borderColor: '#44aa66',
          fontSize: 11,
        }}
        onPointerDown={(e) => fireUI(e, 'open_weapons')}
      >
        <span style={{ fontSize: 16 }}>🔧</span>
        <span>装備</span>
      </button>

      {/* 足元ボタン（足元にアイテムがある場合のみ） */}
      {hasFloorItem && (
        <button
          style={{
            ...BTN_BASE,
            width: 56,
            height: 56,
            backgroundColor: 'rgba(80,70,20,0.85)',
            borderColor: '#aaaa44',
            fontSize: 11,
          }}
          onPointerDown={(e) => fireUI(e, 'open_floor_item')}
        >
          <span style={{ fontSize: 16 }}>📦</span>
          <span>足元</span>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BattleScreen: メインコンポーネント
// ---------------------------------------------------------------------------

/**
 * バトル専用画面。探索キャンバスの代替として表示する。
 * GameCanvas から props を受け取り、バトルロジックは turn-system.ts に委譲する。
 */
export default function BattleScreen({
  gameState,
  battleLog,
  onAction,
  onUIAction,
  onSkillUse,
  skillSlots,
  hasFloorItem,
}: BattleScreenProps) {
  const target = getBattleTargetEnemy(gameState);
  const adjacentEnemies = target ? getAdjacentEnemies(gameState) : [];
  const player = gameState.player;

  // ターゲット敵の方向を計算して攻撃アクションを決定
  const { attackAction, attackDir } = (() => {
    if (!player || !target) return { attackAction: 'attack' as PlayerAction, attackDir: 'down' };
    const dx = target.pos.x - player.pos.x;
    const dy = target.pos.y - player.pos.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0
        ? { attackAction: 'move_right' as PlayerAction, attackDir: 'right' }
        : { attackAction: 'move_left'  as PlayerAction, attackDir: 'left'  };
    } else {
      return dy > 0
        ? { attackAction: 'move_down' as PlayerAction, attackDir: 'down' }
        : { attackAction: 'move_up'   as PlayerAction, attackDir: 'up'   };
    }
  })();

  // 隣接敵が複数いる場合はターゲット以外をサイドに表示
  const otherEnemies = adjacentEnemies.filter((e) => e.id !== target?.id);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a14',
        overflow: 'hidden',
        fontFamily: 'monospace',
      }}
    >
      {/* ── 最上部: プレイヤーステータス ── */}
      {player && (
        <PlayerStatusBar
          player={player}
          inventory={gameState.inventory}
          pilotLevel={gameState.pilot.level}
          gold={gameState.inventory.gold}
        />
      )}

      {/* ── 上部: 敵スプライト + ステータス ── */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 16px 8px',
          gap: 10,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 背景グリッド装飾 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(255,255,255,0.03) 32px),' +
              'repeating-linear-gradient(90deg, transparent, transparent 31px, rgba(255,255,255,0.03) 32px)',
            pointerEvents: 'none',
          }}
        />

        {/* フロア表示 */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 10,
            fontSize: 10,
            color: '#556677',
          }}
        >
          B{gameState.floor}F
        </div>

        {target ? (
          <>
            {/* メイン敵スプライト */}
            <EnemySpriteDisplay
              enemy={target}
              size={Math.min(256, 220)}
            />

            {/* 敵ステータスバー */}
            <EnemyStatusBar enemy={target} />

            {/* 複数隣接敵インジケーター */}
            {otherEnemies.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  position: 'absolute',
                  top: 6,
                  right: 10,
                }}
              >
                {otherEnemies.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <EnemySpriteDisplay enemy={e} size={40} />
                    <div
                      style={{
                        width: 40,
                        height: 4,
                        backgroundColor: '#222',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(e.hp / Math.max(1, e.maxHp)) * 100}%`,
                          height: '100%',
                          backgroundColor:
                            e.hp / e.maxHp > 0.5
                              ? '#44dd44'
                              : e.hp / e.maxHp > 0.25
                              ? '#ffaa22'
                              : '#ff4444',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#556677', fontSize: 14 }}>
            敵なし
          </div>
        )}
      </div>

      {/* ── 中部: バトルログ ── */}
      <BattleLog battleLog={battleLog} />

      {/* ── 下部: アクションボタン ── */}
      <ActionButtons
        onAction={onAction}
        onUIAction={onUIAction}
        onSkillUse={onSkillUse}
        skillSlots={skillSlots}
        hasFloorItem={hasFloorItem}
        attackAction={attackAction}
        attackDir={attackDir}
      />
    </div>
  );
}
