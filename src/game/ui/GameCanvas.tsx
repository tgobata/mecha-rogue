"use client";

/**
 * @fileoverview ゲームループ React コンポーネント
 *
 * 責務:
 * - useRef で Canvas を保持
 * - useState で GameState を保持
 * - useGameInput でキー入力を受け取り processTurn を呼ぶ
 * - requestAnimationFrame で描画ループ（500msごとにアニメフレームを切り替え）
 * - スプライトを初回ロード（loadSprites）して SpriteCache を保持
 * - ゲーム開始時（phase === 'title'）はタイトル表示
 * - phase === 'exploring' 時は Canvas に renderGame を呼ぶ
 * - HUD を重ねて表示
 * - VirtualController でスマホ向け仮想コントローラーを表示
 * - InventoryPanel / WeaponPanel でインベントリ・武器パネルを表示
 */

import { useRef, useState, useEffect, useCallback } from "react";
import type { GameState, Player, WeaponRarity } from "../core/game-state";
import BaseScreen from "./BaseScreen";
import StatusPanel from "./StatusPanel";
import HelpManualOverlay from "./HelpManualOverlay";
import ShopPanel from "./ShopPanel";
import {
  getShopInventory,
  buyItem,
  sellItem,
  repairWeapon,
  type ShopItem,
} from "../core/shop-system";
import { createInitialGameState, INITIAL_FACING } from "../core/game-state";
import { saveGame, loadGame, getAllSaves } from "../core/save-system";
import {
  INITIAL_PLAYER_ATK,
  INITIAL_PLAYER_DEF,
  VIEW_RADIUS,
  TILE_FLOOR,
} from "../core/constants";
import itemsRaw from "../assets/data/items.json";
import { generateFloor } from "../core/maze-generator";
import {
  processTurn,
  discardWeapon,
  spawnEnemiesFromMap,
  getInventoryCapacity,
  getEnemyName,
  transitionToNextFloor,
  transitionToPrevFloor,
} from "../core/turn-system";
import { getSortedItems } from "../core/inventory-utils";
import { applyStartReturn } from "../core/start-return";
import { updateVisibility } from "../core/visibility";
import { getRoomAt } from "../core/floorUtils";
import { RoomType } from "../core/types";
import type { PlayerAction } from "../core/turn-system";
import {
  renderGame,
  loadSprites,
  getDefaultSpriteList,
} from "../systems/renderer";
import type { SpriteCache, Viewport, FlashMap, ScreenFlash } from "../systems/renderer";
import { useGameInput } from "../systems/input";
import type { UIAction } from "../systems/input";
import {
  initAudio,
  isAudioReady,
  playSE,
  playBGM,
  stopBGM,
  type BGMName,
} from "../systems/audio";
import { useTool, useInventoryItem, getItemName } from "../core/tool-system";
import { learnSkill, useActiveSkill, getAvailableSkills, getSkillDefinition } from "../core/skill-system";
import type { Skill } from "../core/skill-system";
import { checkAchievements } from "../systems/achievement-system";
import bossesRaw from "../assets/data/bosses.json";
import weaponsRaw from "../assets/data/weapons.json";

/**
 * フロア番号からボス固有の BGM 名を返す。
 * bosses.json に対応エントリがない場合は共通ボス BGM "boss" を返す。
 */
function getBossBGMName(floor: number): BGMName {
  const bossData = (bossesRaw as { id: string; floor: number }[]).find(
    (b) => b.floor === floor,
  );
  if (!bossData) return 'boss';
  const map: Record<string, BGMName> = {
    bug_swarm:      'boss_bug_swarm',
    mach_runner:    'boss_mach_runner',
    junk_king:      'boss_junk_king',
    phantom:        'boss_phantom',
    iron_fortress:  'boss_iron_fortress',
  };
  return map[bossData.id] ?? 'boss';
}

/** weapons.json エントリの最小型 */
interface WeaponDefMin { id: string; name: string; }
const WEAPON_DEFS_MIN = weaponsRaw as unknown as WeaponDefMin[];
/** weapons.json の id から武器名を返す。見つからなければ id をそのまま返す */
function getWeaponName(weaponId: string): string {
  return WEAPON_DEFS_MIN.find((d) => d.id === weaponId)?.name ?? weaponId;
}
import { createWeaponInstance, getAttackTargetPositions } from "../core/weapon-system";
import HUD from "./HUD";
import VirtualController from "./VirtualController";
import InventoryPanel from "./InventoryPanel";
import WeaponPanel from "./WeaponPanel";
import BossIntroOverlay from "./BossIntroOverlay";
import BossDefeatOverlay from "./BossDefeatOverlay";
import TitleScreen from "./TitleScreen";
import GameOverOverlay from "./GameOverOverlay";
import AchievementPanel from "./AchievementPanel";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 表示タイル数（横） */
const TILES_X = 15;
/** 表示タイル数（縦） */
const TILES_Y = 13;
/** タイルサイズの最小値 (px) */
const TILE_SIZE_MIN = 16;
/** タイルサイズの最大値 (px) */
const TILE_SIZE_MAX = 32;
/** アニメーションフレーム切り替え間隔 (ms) */
const ANIM_INTERVAL_MS = 500;
/** タイルフラッシュエフェクトの持続時間 (ms) */
const FLASH_DURATION_MS = 250;
/** attack/hit/item_use アニメ状態を維持する時間 (ms) */
const ANIM_STATE_DURATION_MS = 600;
/** バトルログの最大保持行数 */
const BATTLE_LOG_MAX = 15;
/** HUDに表示するバトルログの行数（スクロール可能な最大行） */
const BATTLE_LOG_DISPLAY = 15;

// ---------------------------------------------------------------------------
// 確認ダイアログ型
// ---------------------------------------------------------------------------

/**
 * ゲーム内確認ダイアログの状態。
 * null は非表示。
 */
type ConfirmDialog = {
  /** ダイアログに表示するメッセージ */
  message: string;
  /** 「はい」押下時に実行するコールバック */
  onConfirm: () => void;
} | null;

// ---------------------------------------------------------------------------
// メニューパネル型
// ---------------------------------------------------------------------------

/**
 * 開いているメニューパネルの状態。
 * null は閉じている。
 */
type MenuPanel =
  | null
  | { type: "inventory"; index: number }
  | { type: "status"; index: number }
  | { type: "weapons"; index: number }
  | { type: "pause"; index: number }
  | { type: "help" };

// ---------------------------------------------------------------------------
// BGM 選択ロジック
// ---------------------------------------------------------------------------

/**
 * フロア番号から探索 BGM トラック名を返す。
 * ボス階（floor % 5 === 0）は呼び出し元で "boss" を使うこと。
 *
 * @param floor - 現在のフロア番号
 * @returns 'explore' | 'explore_light' | 'deep'
 */
function getExploreBGM(floor: number): 'explore' | 'explore_light' | 'deep' {
  if (floor > 10) return 'deep';
  if (floor % 2 === 1) return 'explore_light'; // 奇数階（1,3,5,7,9）
  return 'explore';
}

// ---------------------------------------------------------------------------
// レアリティコード変換
// ---------------------------------------------------------------------------

/**
 * EquippedWeapon.rarity ('C'|'U'|'R'|'E'|'L') を
 * WeaponRarity ('common'|'uncommon'|'rare'|'legendary') に変換する。
 *
 * @param code - レアリティコード文字列
 * @returns WeaponRarity
 */
function rarityCodeToWeaponRarity(code: string): WeaponRarity {
  switch (code) {
    case "U":
      return "uncommon";
    case "R":
      return "rare";
    case "L":
      return "legendary";
    default:
      return "common";
  }
}

// ---------------------------------------------------------------------------
// セーブデータ移行
// ---------------------------------------------------------------------------

/**
 * 旧バージョンのセーブデータに不足しているフィールドをデフォルト値で補完する。
 * `createInitialGameState()` を基底として saved を上書きすることで、
 * 新規追加フィールドが undefined にならないことを保証する。
 */
function migrateGameState(saved: GameState): GameState {
  const defaults = createInitialGameState();
  
  // 基本的な移行
  const migrated: GameState = {
    ...defaults,
    ...saved,
    bossesDefeated: saved.bossesDefeated ?? [],
    achievements: saved.achievements ?? [],
    traps: saved.traps ?? [],
    hints: saved.hints ?? [],
    triggeredMonsterHouses: saved.triggeredMonsterHouses ?? [],
    skills: saved.skills ?? [],
    storage: saved.storage ?? [],
    storedGold: saved.storedGold ?? 0,
    upgradeCount: saved.upgradeCount ?? {},
    battleLog: Array.isArray(saved.battleLog) ? saved.battleLog.slice(-50) : [],
    enemies: saved.enemies ?? [],
    isBlackMarket: saved.isBlackMarket ?? false,
  };

  // フェーズ自動修復:
  // title フェーズはゲームのロード先として無効（タイトル画面のままになるため）
  // - map/player があれば exploring、それ以外は base に強制修正する
  if (migrated.phase === 'title') {
    if (migrated.map && migrated.player) {
      console.warn('[migrateGameState] Fix: phase "title" with map/player data → forcing to "exploring".');
      migrated.phase = 'exploring';
    } else {
      console.warn('[migrateGameState] Fix: phase "title" on load → forcing to "base".');
      migrated.phase = 'base';
    }
  }

  // instanceId 補完: 旧セーブデータには instanceId がないため付与する
  // 同種アイテムを複数所持した際の耐久度が混同しないよう、各スロット・装備中アイテムに
  // 一意な instanceId を付与し、装備中アイテムはスロット内の対応するエントリと同じ ID を共有する。
  const _genId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ── 武器 ──
  if (migrated.player?.weaponSlots) {
    const newWeaponSlots = (migrated.player.weaponSlots as any[]).map((w: any) =>
      w.instanceId ? w : { ...w, instanceId: _genId() }
    );
    // equippedWeapon: スロット内の対応エントリと instanceId を揃える
    let newEquippedWeapon = migrated.player.equippedWeapon as any;
    if (newEquippedWeapon && !newEquippedWeapon.instanceId) {
      const match = newWeaponSlots.find((w: any) =>
        w.id === newEquippedWeapon.id && w.durability === newEquippedWeapon.durability
      );
      newEquippedWeapon = { ...newEquippedWeapon, instanceId: match?.instanceId ?? _genId() };
    }
    migrated.player = {
      ...migrated.player,
      weaponSlots: newWeaponSlots as any,
      equippedWeapon: newEquippedWeapon,
    };
  } else if (migrated.player?.equippedWeapon && !(migrated.player.equippedWeapon as any).instanceId) {
    migrated.player = {
      ...migrated.player,
      equippedWeapon: { ...migrated.player.equippedWeapon, instanceId: _genId() } as any,
    };
  }

  // ── 盾 ──
  if (migrated.player?.shieldSlots) {
    const newShieldSlots = (migrated.player.shieldSlots as any[]).map((s: any) =>
      s.instanceId ? s : { ...s, instanceId: _genId() }
    );
    let newEquippedShield = migrated.player.equippedShield as any;
    if (newEquippedShield && !newEquippedShield.instanceId) {
      const match = newShieldSlots.find((s: any) =>
        s.shieldId === newEquippedShield.shieldId && s.durability === newEquippedShield.durability
      );
      newEquippedShield = { ...newEquippedShield, instanceId: match?.instanceId ?? _genId() };
    }
    migrated.player = {
      ...migrated.player,
      shieldSlots: newShieldSlots as any,
      equippedShield: newEquippedShield,
    };
  }

  // ── 防具 ──
  if (migrated.player?.armorSlots) {
    const newArmorSlots = (migrated.player.armorSlots as any[]).map((a: any) =>
      a.instanceId ? a : { ...a, instanceId: _genId() }
    );
    let newEquippedArmor = migrated.player.equippedArmor as any;
    if (newEquippedArmor && !newEquippedArmor.instanceId) {
      const match = newArmorSlots.find((a: any) =>
        a.armorId === newEquippedArmor.armorId && a.durability === newEquippedArmor.durability
      );
      newEquippedArmor = { ...newEquippedArmor, instanceId: match?.instanceId ?? _genId() };
    }
    migrated.player = {
      ...migrated.player,
      armorSlots: newArmorSlots as any,
      equippedArmor: newEquippedArmor,
    };
  }

  return migrated;
}

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 画面サイズからタイルサイズを計算する。
 */
function calcTileSize(containerWidth: number, containerHeight: number): number {
  const byWidth = Math.floor(containerWidth / TILES_X);
  const byHeight = Math.floor(containerHeight / TILES_Y);
  const raw = Math.min(byWidth, byHeight);
  return Math.max(TILE_SIZE_MIN, Math.min(TILE_SIZE_MAX, raw));
}

// ---------------------------------------------------------------------------
// GameCanvas コンポーネント
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// BattleLogPanel コンポーネント（スクロール可能なバトルログ表示）
// ---------------------------------------------------------------------------

const LOG_COLORS: Record<string, string> = {
  damage: '#ff8888',
  recv: '#ffaa66',
  kill: '#ffdd44',
  floor: '#88ddff',
  item: '#88ff88',
  warn: '#ff5555',
  system: '#ff4444',
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

/**
 * prev → next のバトルログ差分を抽出する。
 * processTurn 内で .slice(-50) トリムが発生しても正しく新規エントリを検出する。
 * next = prev[trim:] + newEntries の構造を前提に、最長一致オーバーラップを探す。
 */
function findNewBattleLogEntries(prevLog: string[], nextLog: string[]): string[] {
  const maxOverlap = Math.min(prevLog.length, nextLog.length);
  for (let overlap = maxOverlap; overlap >= 0; overlap--) {
    let match = true;
    for (let i = 0; i < overlap; i++) {
      if (nextLog[i] !== prevLog[prevLog.length - overlap + i]) {
        match = false;
        break;
      }
    }
    if (match) return nextLog.slice(overlap);
  }
  return nextLog;
}

function BattleLogPanel({ battleLog }: { battleLog: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 新しいログが来たら最下部へ自動スクロール（ユーザーが手動スクロール中は除く）
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
      className="flex-shrink-0 px-2 py-1 select-none"
      style={{
        backgroundColor: 'rgba(0,0,0,0.82)',
        borderTop: '1px solid #333',
        fontFamily: 'monospace',
        fontSize: 12,
        maxHeight: 108,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: '#334455 transparent',
        cursor: 'default',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      {displayed.map((line, i) => (
        <p
          key={`${battleLog.length - displayed.length + i}`}
          style={{
            color: LOG_COLORS[getLogType(line)],
            opacity: i === lastIdx ? 1.0 : i === lastIdx - 1 ? 0.88 : i === lastIdx - 2 ? 0.75 : 0.6,
            margin: 0,
            lineHeight: '1.5',
            animation: i === lastIdx ? 'hud-fadein 0.3s ease-in' : undefined,
          }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * ゲームのメインキャンバスコンポーネント。
 * タイトル画面とゲームプレイ画面の切り替えを担う。
 */
export default function GameCanvas() {
  // ── Refs ──────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0); // 0 or 1
  const lastAnimMsRef = useRef<number>(0);
  const rafIdRef = useRef<number>(0);
  const spritesRef = useRef<SpriteCache>(new Map());
  const stateRef = useRef<GameState>(createInitialGameState());
  /**
   * animState の有効期限タイマー。
   * キー: 'player' または敵の id (文字列)
   * 値: performance.now() ベースの有効期限 (ms)
   * RAF ループがこのマップを参照し、期限切れエントリを idle にリセットする。
   */
  const animStateExpiryRef = useRef<Map<string, number>>(new Map());
  /**
   * タイルフラッシュエフェクトマップ。
   * キー: "x,y"、値: 色文字列と有効期限 (performance.now() ベース)。
   * RAF ループ内の renderGame へ渡し、描画後に期限切れエントリを削除する。
   */
  const flashMapRef = useRef<FlashMap>(new Map());
  /** 画面全体のフラッシュエフェクト状態 */
  const screenFlashRef = useRef<ScreenFlash | null>(null);

  // ── フラッシュヘルパー ─────────────────────────────────────────────
  /**
   * 指定タイルにフラッシュエフェクトを登録する。
   * @param x - フロア座標 X
   * @param y - フロア座標 Y
   * @param color - CSS 色文字列 (rgba)
   */
  function addFlash(x: number, y: number, color: string): void {
    flashMapRef.current.set(`${x},${y}`, {
      color,
      expiry: performance.now() + FLASH_DURATION_MS,
    });
  }

  /**
   * 画面全体を指定色でフラッシュさせる。
   */
  function triggerScreenFlash(color: string, duration: number = 1500): void {
    screenFlashRef.current = {
      color,
      duration,
      expiry: performance.now() + duration,
    };
  }

  /**
   * プレイヤーの向きから前方タイル座標を返す。
   * @param player - Player オブジェクト
   * @returns 前方タイル座標、またはプレイヤーが null のとき null
   */
  function getFrontTile(player: Player): { x: number; y: number } | null {
    const dirs: Record<string, { dx: number; dy: number }> = {
      up:    { dx: 0, dy: -1 },
      down:  { dx: 0, dy:  1 },
      left:  { dx: -1, dy: 0 },
      right: { dx:  1, dy: 0 },
    };
    const dir = dirs[player.facing];
    if (!dir) return null;
    return { x: player.pos.x + dir.dx, y: player.pos.y + dir.dy };
  }

  // ── State ─────────────────────────────────────────────────────────────
  const [gameState, setGameState] = useState<GameState>(createInitialGameState);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [tileSize, setTileSize] = useState<number>(TILE_SIZE_MAX);
  const [spritesReady, setSpritesReady] = useState(false);
  const [menuPanel, setMenuPanel] = useState<MenuPanel>(null);
  const menuPanelRef = useRef<MenuPanel>(null);
  const [hasSaveData, setHasSaveData] = useState(false);
  const [isLoadingSave, setIsLoadingSave] = useState(false);
  /** ロード失敗時のエラーメッセージ */
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  /** ゲームオーバーになった階層番号。null = 初回来訪またはゲームオーバー以外 */
  const [deathFloor, setDeathFloor] = useState<number | null>(null);
  const [enemiesDefeated, setEnemiesDefeated] = useState(0);
  const [goldEarned, setGoldEarned] = useState(0);
  const [activeSaveSlot, setActiveSaveSlot] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [breakNotif, setBreakNotif] = useState<string | null>(null);
  const [bossWarning, setBossWarning] = useState(false);
  const [floorNotif, setFloorNotif] = useState<string | null>(null);
  const breakNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bossWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floorNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** ボス演出を表示済みのフロア番号セット（同フロアで重複表示しない） */
  const bossIntroShownRef = useRef<Set<number>>(new Set());
  /** ボスを視界内で確認済みのフロア番号セット（HP バー表示制御用） */
  const [bossSeenFloors, setBossSeenFloors] = useState<Set<number>>(new Set());
  /** ボス撃破演出: 撃破したボスの enemyType。null = 非表示 */
  const [bossDefeatEffect, setBossDefeatEffect] = useState<string | null>(null);
  /** スキル選択ダイアログの状態。null = 非表示 */
  const [skillSelectState, setSkillSelectState] = useState<{ level: number; available: Skill[] } | null>(null);
  /** レベルアップ検出用：前回のパイロットレベルを保持 */
  const prevPilotLevelRef = useRef<number>(1);
  /** ボス撃破演出中に保留するスキル選択状態 */
  const pendingSkillSelectRef = useRef<{ level: number; available: Skill[] } | null>(null);
  /** 敵VS敵撃破通知 */
  const [enemyKillNotif, setEnemyKillNotif] = useState<string | null>(null);
  const enemyKillNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // 互換性維持のため残すが、後ほど TitleScreen が全スロットをチェックする
      setHasSaveData(!!localStorage.getItem("mecha_rogue_save"));
    }
  }, []);

  // stateRef は常に最新の gameState を反映する（RAF クロージャ対策）
  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  // menuPanelRef は常に最新の menuPanel を反映する（クロージャ対策）
  useEffect(() => {
    menuPanelRef.current = menuPanel;
  }, [menuPanel]);

  // ── スプライト読み込み ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    loadSprites(getDefaultSpriteList()).then((cache) => {
      spritesRef.current = cache;
      setSpritesReady(true);
    });
  }, []);

  // ── コンテナサイズ監視 ───────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateSize = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      setTileSize(calcTileSize(w, h));
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Canvas の devicePixelRatio 対応 ─────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalW = TILES_X * tileSize;
    const logicalH = TILES_Y * tileSize;

    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, [tileSize]);

  // ── requestAnimationFrame 描画ループ ────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!spritesReady) return;

    const loop = (timestamp: number) => {
      // 500ms ごとにアニメフレームを切り替える
      if (timestamp - lastAnimMsRef.current >= ANIM_INTERVAL_MS) {
        animFrameRef.current = animFrameRef.current === 0 ? 1 : 0;
        lastAnimMsRef.current = timestamp;
      }

      // ── animState 有効期限チェック ───────────────────────────────
      // ANIM_STATE_DURATION_MS が経過したエンティティの animState を idle に戻す。
      // stateRef を直接書き換えることで React の再レンダリングを発生させず、
      // 次のキー入力まで正しいスプライトが描画されるようにする。
      const expiryMap = animStateExpiryRef.current;
      if (expiryMap.size > 0) {
        const now = performance.now();
        let stateChanged = false;
        let current = stateRef.current;

        if (expiryMap.has('player') && now >= (expiryMap.get('player') ?? 0)) {
          expiryMap.delete('player');
          if (current.player && current.player.animState !== 'idle') {
            current = {
              ...current,
              player: { ...current.player, animState: 'idle' as const },
            };
            stateChanged = true;
          }
        }

        for (const [key, expiry] of expiryMap) {
          if (key === 'player') continue;
          if (now >= expiry) {
            expiryMap.delete(key);
            const enemyIdx = current.enemies.findIndex((e) => String(e.id) === key);
            if (enemyIdx !== -1 && current.enemies[enemyIdx].animState !== 'idle') {
              const updatedEnemies = current.enemies.map((e, i) =>
                i === enemyIdx ? { ...e, animState: 'idle' as const } : e,
              );
              current = { ...current, enemies: updatedEnemies };
              stateChanged = true;
            }
          }
        }

        if (stateChanged) {
          stateRef.current = current;
        }
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        rafIdRef.current = requestAnimationFrame(loop);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafIdRef.current = requestAnimationFrame(loop);
        return;
      }

      const state = stateRef.current;

      if (state.phase === "exploring" && state.player) {
        const viewport: Viewport = {
          tilesX: TILES_X,
          tilesY: TILES_Y,
          tileSize,
          centerX: state.player.pos.x,
          centerY: state.player.pos.y,
        };
        try {
          renderGame(
            ctx,
            state,
            viewport,
            spritesRef.current,
            animFrameRef.current,
            flashMapRef.current,
            screenFlashRef.current,
          );
        } catch (err) {
          // renderGame が例外を投げた場合は黒画面を防ぐためエラー表示を行う
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#ff4444";
          ctx.font = "12px monospace";
          ctx.fillText("描画エラー: " + String(err), 10, 20);
          console.error("[renderGame] error:", err);
        }
      } else if (state.phase !== "exploring") {
        // exploring 以外のフェーズ（base / title / gameover 等）はキャンバスを黒で塗り潰す
        ctx.fillStyle = "#000";
        ctx.fillRect(
          0,
          0,
          canvas.width / (window.devicePixelRatio || 1),
          canvas.height / (window.devicePixelRatio || 1),
        );
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [spritesReady, tileSize]);

  // ── バトルログ追加ヘルパー ──────────────────────────────────────
  const addLog = useCallback((line: string) => {
    setBattleLog((prev) => {
      const next = [...prev, line];
      return next.length > BATTLE_LOG_MAX ? next.slice(-BATTLE_LOG_MAX) : next;
    });
  }, []);

  // addLog は将来の拡張用に保持（未使用 lint 回避）
  void addLog;

  // ── レベルアップ検出 → スキル選択ダイアログ ─────────────────
  // ボス撃破演出中の場合は pendingSkillSelectRef に保留し、演出終了後に表示する
  useEffect(() => {
    const oldLevel = prevPilotLevelRef.current;
    const newLevel = gameState.pilot.level;
    if (newLevel > oldLevel) {
      prevPilotLevelRef.current = newLevel;
      const available = getAvailableSkills(newLevel).filter(
        (s) => !gameState.skills.some((sk) => sk.id === s.id),
      );
      if (available.length > 0) {
        if (bossDefeatEffect !== null) {
          // ボス撃破演出中: 演出終了後に表示するため保留
          pendingSkillSelectRef.current = { level: newLevel, available };
        } else {
          setSkillSelectState({ level: newLevel, available });
        }
      }
    } else {
      prevPilotLevelRef.current = newLevel;
    }
  }, [gameState.pilot.level, gameState.skills, bossDefeatEffect]);

  // ボス撃破演出が終了したとき、保留中のスキル選択があれば表示する
  useEffect(() => {
    if (bossDefeatEffect === null && pendingSkillSelectRef.current !== null) {
      setSkillSelectState(pendingSkillSelectRef.current);
      pendingSkillSelectRef.current = null;
    }
  }, [bossDefeatEffect]);

  // ── スキル習得ハンドラ ────────────────────────────────────────
  const handleLearnSkill = useCallback((skillId: string) => {
    const newState = learnSkill(stateRef.current, skillId as import("../core/game-state").SkillId);
    setGameState(newState);
    stateRef.current = newState;
    const def = getSkillDefinition(skillId as import("../core/game-state").SkillId);
    setBattleLog((prev) =>
      [...prev, `スキル習得：${def?.name ?? skillId}`].slice(-BATTLE_LOG_MAX),
    );
    setSkillSelectState(null);
  }, []);

  // ── アクティブスキル使用ハンドラ（キー 1/2/3） ────────────────
  const handleUseSkill = useCallback((slotIndex: number) => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;
    const activeSkills = state.skills.filter((sk) => {
      const def = getSkillDefinition(sk.id);
      return def?.type === "active";
    });
    const target = activeSkills[slotIndex];
    if (!target) return;
    if (target.cooldownRemaining > 0) {
      playSE("ui_cancel");
      return;
    }
    const newState = useActiveSkill(state, target.id);
    setGameState(newState);
    stateRef.current = newState;
    // useActiveSkill が battleLog に追記済みなので差分を UI ログへ同期
    const prevLen = state.battleLog?.length ?? 0;
    const newLogs = (newState.battleLog ?? []).slice(prevLen);
    if (newLogs.length > 0) {
      setBattleLog((prev) => [...prev, ...newLogs].slice(-BATTLE_LOG_MAX));
    }
    playSE("ui_select");
  }, []);

  // ── タイトル画面BGM起動（初回インタラクション時） ─────────────
  const handleTitleInteract = useCallback(() => {
    if (!isAudioReady()) {
      initAudio().then(() => playBGM("title"));
    }
  }, []);

  const handleGameOverReturn = useCallback(
    (toTitle: boolean) => {
      // stateRef.current を使って常に最新の状態を参照する（React state は非同期更新のため古い値の場合がある）
      const currentState = stateRef.current;
      const penalizedState = applyStartReturn(currentState);
      const finalState: GameState = {
        ...penalizedState,
        phase: toTitle ? "title" : "base",
        player: null,
        enemies: [],
        map: null,
        exploration: null,
        // machine.hp を maxHp に確実にリセットする
        machine: { ...penalizedState.machine, hp: penalizedState.machine.maxHp },
      };

      setGameState(finalState);
      stateRef.current = finalState;
      if (!toTitle) {
        setDeathFloor(currentState.floor);
        playBGM("base");
      } else {
        setDeathFloor(null);
        playBGM("title");
      }
      setMenuPanel(null);
      setBattleLog([]);

      if (activeSaveSlot !== null) {
        // セーブは常に "base" フェーズで保存する（"title" フェーズで保存するとロード後にタイトル画面から動けなくなるため）
        saveGame({ ...finalState, phase: "base" }, activeSaveSlot);
      }
    },
    [activeSaveSlot],
  );

  // ── タイトル → 拠点へ移動 ───────────────────────────────────
  const handleMoveToBase = useCallback(() => {
    // initAudio() の完了を待ってから BGM を再生（モバイルの autoplay policy 対応）
    initAudio().then(() => playBGM("base")).catch(() => {});
    setDeathFloor(null);
    setGameState((prev) => {
      const next: GameState = {
        ...prev,
        phase: "base",
        player: null,
        enemies: [],
        map: null,
        exploration: null,
        // machine.hp を maxHp に確実にリセット（リタイア後も HP が戻るよう保証）
        machine: { ...prev.machine, hp: prev.machine.maxHp },
        pilot: { ...prev.pilot, level: 1, exp: 0, skillPoints: 0 },
        inventory: {
          ...prev.inventory,
          gold: Math.floor(prev.inventory.gold * 0.5),
        },
      };
      stateRef.current = next;
      return next;
    });
    setMenuPanel(null);
    setBattleLog([]);
  }, []);

  const handleNewGame = useCallback(() => {
    const saves = getAllSaves();
    const emptyIdx = saves.findIndex((s) => s === null);
    const targetSlot = emptyIdx === -1 ? 1 : emptyIdx + 1;

    setActiveSaveSlot(targetSlot);
    setDeathFloor(null);
    setGameState(createInitialGameState());
    handleMoveToBase();
  }, [handleMoveToBase]);

  const handleLoadGameFromSlot = useCallback(
    (slot: number) => {
      setIsLoadingSave(true);
      setLoadErrorMessage(null);

      // setTimeout を使うことで「ロード中」の UI がレンダリングされる時間を確保する
      // 150ms にすることで重いセーブデータの JSON.parse 前にローディング表示が確実に描画される
      setTimeout(() => {
        try {
          const saved = loadGame(slot);
          if (saved) {
            console.log(`[Load] Slot ${slot} loaded successfully. Version: ${saved.version}`);
            const state = migrateGameState(saved.gameState);
            
            setDeathFloor(null);
            setGameState(state);
            setMenuPanel(null);
            setBattleLog(["ゲームを再開しました"]);
            setActiveSaveSlot(slot);

            // BGM 選択 (exploring 中なら階層に応じた曲、そうでなければ拠点)
            if (playBGM) {
              const bgmName = (
                state.phase === "exploring" &&
                state.floor &&
                typeof state.floor === "number"
              )
                ? (state.floor % 5 === 0 ? "boss" : getExploreBGM(state.floor))
                : "base";
              initAudio().then(() => playBGM(bgmName)).catch(() => {});
            }
            // 成功した場合はローディングを閉じる
            setIsLoadingSave(false);
          } else {
            const err = `Slot ${slot} のデータ読み込みに失敗しました（データ構造不正、または対象データなし）。`;
            console.error(err);
            setLoadErrorMessage(err);
          }
        } catch (e) {
          const err = `致命的なロードエラー: ${e instanceof Error ? e.message : String(e)}`;
          console.error(err);
          setLoadErrorMessage(err);
        }
      }, 150);
    },
    [],
  );

  const handleSaveAndExit = useCallback(() => {
    try {
      if (activeSaveSlot !== null) {
        saveGame(stateRef.current, activeSaveSlot);
      }
      setHasSaveData(true);

      setDeathFloor(null);
      setGameState(createInitialGameState());
      setMenuPanel(null);
      setBattleLog([]);
      playBGM("title");
    } catch (e) {
      console.error("Failed to save", e);
    }
  }, [activeSaveSlot]);

  /** セーブせずにタイトルへ戻る（拠点画面専用） */
  const handleReturnToTitleWithoutSave = useCallback(() => {
    setDeathFloor(null);
    setGameState(createInitialGameState());
    setMenuPanel(null);
    setBattleLog([]);
    playBGM("title");
  }, []);

  // ── 拠点 → 迷宮入口（ダンジョン開始） ──────────────────────
  const handleEnterDungeon = useCallback(() => {
    const floorNumber = 1; // Start at floor 1
    // 入場時は常に通常 BGM（ボス BGM はボスを視認した際に切り替え）
    initAudio().then(() => playBGM(getExploreBGM(floorNumber)));

    const baseState = stateRef.current;
    const floor = generateFloor(floorNumber);
    const enemies = spawnEnemiesFromMap(floor, floorNumber);
    const visibleFloor = updateVisibility(floor, floor.startPos, VIEW_RADIUS);

    const initialPlayer: Player = {
      pos: floor.startPos,
      hp: baseState.machine.maxHp,
      maxHp: baseState.machine.maxHp,
      atk: INITIAL_PLAYER_ATK,
      def: INITIAL_PLAYER_DEF,
      facing: INITIAL_FACING,
      weaponSlots: baseState.inventory.equippedWeapons.map((ew) => {
        const rarity = rarityCodeToWeaponRarity(ew.rarity);
        const instance = createWeaponInstance(ew.weaponId, rarity);
        return {
          ...instance,
          durability: ew.durability,
          weaponLevel: ew.weaponLevel,
        };
      }),
      shieldSlots: baseState.inventory.equippedShields ?? [],
      armorSlots: baseState.inventory.equippedArmors ?? [],
      equippedShield: null,
      equippedArmor: null,
    };

    const newState: GameState = {
      ...baseState,
      phase: "exploring",
      player: initialPlayer,
      enemies: enemies,
      map: visibleFloor,
      floor: floorNumber,
      achievements: baseState.achievements || [],
      exploration: {
        currentFloor: visibleFloor,
        playerPos: floor.startPos,
        floorNumber: floorNumber,
        turn: 0,
      },
    };

    setDeathFloor(null);
    setEnemiesDefeated(0);
    setGoldEarned(0);
    bossIntroShownRef.current.clear();
    setBossSeenFloors(new Set());
    setGameState(newState);
    setMenuPanel(null);
    setBattleLog([`B${floorNumber}F へ潜入した`]);
    if (activeSaveSlot !== null) saveGame(newState, activeSaveSlot);
  }, [activeSaveSlot]);

  // ── キー入力処理（PlayerAction） ────────────────────────────────
  const handleAction = useCallback(
    (action: PlayerAction) => {
      const prev = stateRef.current;
      if (prev.phase !== "exploring") return;

      const prevFloor = prev.floor;
      const prevHp = prev.player?.hp ?? 0;
      const prevEquippedWeapon = prev.player?.equippedWeapon ?? null;

      let nextActionResults: ReturnType<typeof processTurn>;
      try {
        nextActionResults = processTurn(prev, action);
      } catch (e) {
        console.error("[handleAction] processTurn threw:", e);
        return;
      }

      const killedCount =
        prev.enemies.length - nextActionResults.enemies.length;
      if (killedCount > 0) setEnemiesDefeated((prev) => prev + killedCount);

      const goldGained = nextActionResults.inventory.gold - prev.inventory.gold;
      if (goldGained > 0) setGoldEarned((prev) => prev + goldGained);

      const next = nextActionResults;

      // ── SE 再生 & BGM 変更 ──────────────────────────────────

      if (action === "attack") playSE("attack_melee");

      // 武器破壊検出
      if (
        prevEquippedWeapon &&
        !next.player?.equippedWeapon &&
        (prev.player?.weaponSlots?.length ?? 0) > (next.player?.weaponSlots?.length ?? 0)
      ) {
        playSE('weapon_break');
      }

      const defeatedEnemies = prev.enemies.filter(
        (e) => !next.enemies.some((ne) => ne.id === e.id),
      );
      if (defeatedEnemies.length > 0) {
        playSE("enemy_death");
        const defeatedBoss = defeatedEnemies.find((e) => e.isBoss === true);
        if (defeatedBoss) {
          // 複数体構成ボス（bug_swarm, shadow_twin 等）は同種が全滅した時だけ撃破扱い
          const allUnitsDefeated = !next.enemies.some(
            (ne) => ne.enemyType === defeatedBoss.enemyType && ne.isBoss && ne.hp > 0,
          );
          if (allUnitsDefeated) {
            // ボス撃破演出を表示
            setBossDefeatEffect(defeatedBoss.enemyType);
            // ラスボスは専用 BGM、それ以外は通常探索 BGM に戻す
            if (defeatedBoss.enemyType === "last_boss_shadow") {
              playBGM("bossDefeat");
            } else {
              playBGM(getExploreBGM(next.floor));
            }
          }
        }
      }

      if (next.player && prevHp > next.player.hp) playSE("hit_player");

      if (next.floor > prevFloor) {
        playSE("floor_descend");
        // ボスフロアでも入場時は通常 BGM（ボス BGM はボスを視認した際に切り替え）
        playBGM(getExploreBGM(next.floor));

        // オートセーブ（フロア移動時）
        if (activeSaveSlot !== null) {
          saveGame(next, activeSaveSlot);
        }
      } else {
        // 同じフロア内での BGM 切り替え（モンスターハウス入室時）
        if (next.exploration?.currentFloor && next.player) {
          const room = getRoomAt(
            next.exploration.currentFloor,
            next.player.pos,
          );
          if (room?.type === RoomType.MONSTER_HOUSE) {
            playBGM("battle");
          } else if (next.floor % 5 !== 0) {
            // ボスフロア以外: 通常探索 BGM（ボスフロアは視認トリガーで制御）
            playBGM(getExploreBGM(next.floor));
          }
        }
      }

      // ── 実績チェック ──────────────────────────────────────────
      const newUnlocked = checkAchievements(next);
      if (newUnlocked.length > 0) {
        setBattleLog((prev) => [
          ...prev,
          ...newUnlocked.map((id) => `実績解除: ${id}`),
        ]);
        setGameState((s) => ({
          ...s,
          achievements: [...(s.achievements || []), ...newUnlocked],
        }));
      }

      // ── ゲームオーバー処理 ──────────────────────────────────────
      if (next.phase === "gameover") {
        playSE("player_death");
        playBGM("gameOver");
        // ゲームオーバー時はリザルト画面（GameOverOverlay）を表示するため、phase はそのままにする
        setGameState(next);
        return;
      }

      // ── バトルログ生成 ───────────────────────────────────────
      const newLogs: string[] = [];

      // processTurn の battleLog に追記された新規エントリを同期（拾得・罠・武器破壊等）
      // .slice(-50) トリムで prevLen > next.length になる場合も正しく検出するため
      // findNewBattleLogEntries で最長オーバーラップを使って差分を取る
      const syncedLogs = findNewBattleLogEntries(prev.battleLog ?? [], next.battleLog ?? []);
      newLogs.push(...syncedLogs);

      // 装備破損通知（目立つポップアップ）
      const breakLog = syncedLogs.find((l) => l.includes('壊れた'));
      if (breakLog) {
        setBreakNotif(breakLog);
        // ビープ音と画面フラッシュを発動
        playSE('equipment_break_long');
        triggerScreenFlash('rgba(255, 0, 0, 0.4)', 1500);

        if (breakNotifTimerRef.current) clearTimeout(breakNotifTimerRef.current);
        breakNotifTimerRef.current = setTimeout(() => setBreakNotif(null), 3500);
      }

      // ボスブロック通知（目立つ赤ポップアップ）
      const hasBossBlock = syncedLogs.some((l) => l.includes('ボスを倒さなければ下階へは行けない'));
      if (hasBossBlock) {
        setBossWarning(true);
        if (bossWarningTimerRef.current) clearTimeout(bossWarningTimerRef.current);
        bossWarningTimerRef.current = setTimeout(() => setBossWarning(false), 3000);
      }

      // 敵VS敵撃破通知
      const enemyKillLog = syncedLogs.find((l) => l.includes('が') && l.includes('を撃破！'));
      if (enemyKillLog) {
        setEnemyKillNotif(enemyKillLog);
        playSE('enemy_death');
        if (enemyKillNotifTimerRef.current) clearTimeout(enemyKillNotifTimerRef.current);
        enemyKillNotifTimerRef.current = setTimeout(() => setEnemyKillNotif(null), 3000);
      }

      // プレイヤーが敵を攻撃してダメージを与えた
      if (action === 'attack' || action.startsWith('move_')) {
        for (const prevEnemy of prev.enemies) {
          const nextEnemy = next.enemies.find((ne) => ne.id === prevEnemy.id);
          if (nextEnemy && nextEnemy.hp < prevEnemy.hp) {
            const dmg = prevEnemy.hp - nextEnemy.hp;
            const name = prevEnemy.name ?? getEnemyName(prevEnemy.enemyType);
            newLogs.push(`${name}を攻撃してダメージ${dmg}を与えた`);
          }
        }
      }

      // 敵から攻撃を受けた（攻撃元を特定）
      if (next.player && prevHp > next.player.hp) {
        const dmg = prevHp - next.player.hp;
        const attackers = next.enemies.filter((e) => e.animState === 'attack');
        const attackerName = attackers.length === 1
          ? (attackers[0].name ?? getEnemyName(attackers[0].enemyType))
          : attackers.length > 1
            ? attackers.map((e) => e.name ?? getEnemyName(e.enemyType)).join('・')
            : '敵';
        newLogs.push(`${attackerName}から攻撃、${dmg}ダメージを受けた！`);
      }

      // 敵を倒した
      for (const e of defeatedEnemies) {
        const name = e.name ?? getEnemyName(e.enemyType);
        newLogs.push(`${name}を倒した！（+${e.expReward} EXP）`);
      }

      if (next.floor > prevFloor) {
        newLogs.push(`B${next.floor}F へ降りた`);
        const msg = `▼ B${next.floor}F へ降りた`;
        setFloorNotif(msg);
        if (floorNotifTimerRef.current) clearTimeout(floorNotifTimerRef.current);
        floorNotifTimerRef.current = setTimeout(() => setFloorNotif(null), 3000);
      }
      if (next.floor < prevFloor) {
        newLogs.push(`B${next.floor}F へ上がった`);
        const msg = `▲ B${next.floor}F へ上がった`;
        setFloorNotif(msg);
        if (floorNotifTimerRef.current) clearTimeout(floorNotifTimerRef.current);
        floorNotifTimerRef.current = setTimeout(() => setFloorNotif(null), 3000);
      }

      if (newLogs.length > 0) {
        setBattleLog((prevLogs) => {
          const merged = [...prevLogs, ...newLogs];
          return merged.length > BATTLE_LOG_MAX
            ? merged.slice(-BATTLE_LOG_MAX)
            : merged;
        });
      }

      setGameState(next);
      stateRef.current = next;

      // ── ボス初視認演出 + BGM 切り替え ────────────────────────────
      // ボスが初めてプレイヤーの視界に入ったタイミングで演出表示 & ボス BGM に切り替え
      if (next.phase === 'exploring' && next.map) {
        const bossFirstSeen = next.enemies.some(
          (e) => e.isBoss === true && next.map!.cells[e.pos.y]?.[e.pos.x]?.isVisible === true,
        );
        if (bossFirstSeen) {
          setBossSeenFloors((prev) => {
            if (prev.has(next.floor)) return prev;
            const next2 = new Set(prev);
            next2.add(next.floor);
            return next2;
          });
        }
        if (bossFirstSeen && !bossIntroShownRef.current.has(next.floor)) {
          bossIntroShownRef.current.add(next.floor);
          playBGM(getBossBGMName(next.floor));
          setGameState((s) => ({ ...s, phase: 'bossIntro' }));
        }
      }

      // ── animState 有効期限を登録 ──────────────────────────────
      // attack / hit / item_use など idle 以外の状態に ANIM_STATE_DURATION_MS の
      // 表示期間を設定する。RAF ループがこの期限を参照して idle に戻す。
      const expiry = performance.now() + ANIM_STATE_DURATION_MS;
      if (next.player && next.player.animState && next.player.animState !== 'idle') {
        animStateExpiryRef.current.set('player', expiry);
      }
      for (const enemy of next.enemies) {
        if (enemy.animState && enemy.animState !== 'idle') {
          animStateExpiryRef.current.set(String(enemy.id), expiry);
        }
      }

      // ── タイルフラッシュエフェクト登録 ────────────────────────
      if (prev.player) {
        if (action === 'attack') {
          // 攻撃時: 装備武器の attackPattern / attackRange に基づく全対象タイルをフラッシュ
          const attackTargets = getAttackTargetPositions(
            prev.player.pos,
            prev.player.facing,
            prev.player.equippedWeapon ?? null,
            prev.map ?? null,
          );
          for (const t of attackTargets) {
            addFlash(t.x, t.y, 'rgba(255,200,0,0.7)');
          }
        } else if (
          action === 'move_up' ||
          action === 'move_down' ||
          action === 'move_left' ||
          action === 'move_right'
        ) {
          // 移動時: 前方1マスのみフラッシュ（従来通り）
          const front = getFrontTile(prev.player);
          if (front) {
            addFlash(front.x, front.y, 'rgba(255,200,0,0.7)');
          }
        }
      }

      // プレイヤーが被弾 → プレイヤータイルを赤フラッシュ
      if (next.player && prev.player && next.player.hp < prev.player.hp) {
        addFlash(next.player.pos.x, next.player.pos.y, 'rgba(255,0,0,0.7)');
      }

      // 敵が被弾 → その敵タイルを赤フラッシュ
      for (const prevEnemy of prev.enemies) {
        const nextEnemy = next.enemies.find((e) => e.id === prevEnemy.id);
        if (nextEnemy && nextEnemy.hp < prevEnemy.hp) {
          addFlash(nextEnemy.pos.x, nextEnemy.pos.y, 'rgba(255,0,0,0.7)');
        }
      }

      // 設置済み爆弾が爆発した → 爆発タイルをオレンジフラッシュ
      const prevBombs = prev.placedBombs ?? [];
      const nextBombs = next.placedBombs ?? [];
      const explodedBombs = prevBombs.filter(
        (pb) => !nextBombs.some((nb) => nb.id === pb.id)
      );
      for (const bomb of explodedBombs) {
        if (bomb.radius === 0) {
          addFlash(bomb.pos.x, bomb.pos.y, 'rgba(255,120,0,0.9)');
        } else {
          const range = bomb.radius <= 2 ? 1 : 2;
          const orthOnly = bomb.radius === 1;
          for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
              if (orthOnly && dx !== 0 && dy !== 0) continue;
              addFlash(bomb.pos.x + dx, bomb.pos.y + dy, 'rgba(255,120,0,0.9)');
            }
          }
        }
      }
    },
    [gameState.phase, activeSaveSlot, handleEnterDungeon],
  );

  // ── ショップ処理 ──────────────────────────────────────────────
  const handleBuyItem = useCallback((item: ShopItem) => {
    const state = stateRef.current;
    if (state.phase !== "shop") return;

    // 購入上限チェック: 武器はマシンの weaponSlots 数、アイテムはポーチ容量上限
    if (item.type === "weapon") {
      const currentWeaponCount = state.player?.weaponSlots?.length ?? state.inventory.equippedWeapons.length;
      if (currentWeaponCount >= state.machine.weaponSlots) {
        playSE("ui_cancel");
        setBattleLog((prev) =>
          [...prev, "武器スロットがいっぱいです"].slice(-BATTLE_LOG_MAX),
        );
        return;
      }
    } else {
      const maxItemCap = state.machine.itemPouch;
      if (state.inventory.items.length >= maxItemCap) {
        playSE("ui_cancel");
        setBattleLog((prev) =>
          [...prev, "アイテムポーチがいっぱいです"].slice(-BATTLE_LOG_MAX),
        );
        return;
      }
    }

    const next = buyItem(state, item.id, item.type);

    if (next.inventory.gold < state.inventory.gold) {
      playSE("ui_select");
      setGameState(next);
      stateRef.current = next;
      const buyName = item.type === 'weapon' ? getWeaponName(item.id) : getItemName(item.id);
      const buyPrice = state.inventory.gold - next.inventory.gold;
      setBattleLog((prev) =>
        [...prev, `🛒 ${buyName} を購入した（-${buyPrice}G）`].slice(-BATTLE_LOG_MAX),
      );
    } else {
      playSE("ui_cancel");
      setBattleLog((prev) =>
        [...prev, "購入できません"].slice(-BATTLE_LOG_MAX),
      );
    }
  }, []);

  // ── ショップ売却処理 ──────────────────────────────────────────
  const handleSellItem = useCallback((itemId: string, itemType: 'weapon' | 'item', index: number) => {
    const state = stateRef.current;
    if (state.phase !== "shop") return;

    const next = sellItem(state, itemId, itemType, index);

    if (next.inventory.gold > state.inventory.gold) {
      playSE("ui_select");
      setGameState(next);
      stateRef.current = next;
      const sellName = itemType === 'weapon' ? (state.player?.weaponSlots?.[index]?.name ?? getWeaponName(itemId)) : getItemName(itemId);
      const sellPrice = next.inventory.gold - state.inventory.gold;
      setBattleLog((prev) =>
        [...prev, `💹 ${sellName} を ${sellPrice}G で売却した`].slice(-BATTLE_LOG_MAX),
      );
    }
  }, []);

  const handleShopClose = useCallback(() => {
    const state = stateRef.current;
    if (state.phase !== "shop") return;

    setGameState({
      ...state,
      phase: "exploring",
    });
    // playSE('menu_cancel'); // 仮
  }, []);

  // ── アイテム使用処理 ─────────────────────────────────────────
  const handleUseItem = useCallback((index: number) => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;

    const item = state.inventory.items[index];
    if (!item) return;

    // escape_module は専用処理（帰還）
    if (item.itemId === "escape_module") {
      playSE("floor_descend");
      playBGM("base");
      const escapeState: GameState = {
        ...state,
        phase: "base",
        player: null,
        enemies: [],
        map: null,
        exploration: null,
        inventory: {
          ...state.inventory,
          items: state.inventory.items.filter((_, i) => i !== index),
        },
      };
      setDeathFloor(null);
      setGameState(escapeState);
      setMenuPanel(null);
      setBattleLog([]);
      return;
    }

    // warp_down: 下階転送
    if (item.itemId === "warp_chip_down") {
      const isBossFloor = state.floor > 0 && (bossesRaw as {floor: number}[]).some((def) => def.floor === state.floor);
      const bossAlive = isBossFloor && state.enemies.some((e) => e.isBoss && e.hp > 0);
      if (bossAlive) {
        playSE('ui_cancel');
        setBattleLog((prev) => [...prev, 'ボスを倒さなければ転送できない！'].slice(-BATTLE_LOG_MAX));
        return;
      }
      if (!state.player) return;
      const { nextState: consumed } = useInventoryItem(state, index);
      playSE('floor_descend');
      const transitionFields = transitionToNextFloor({ ...consumed, player: consumed.player! });
      const warpedState = { ...consumed, ...transitionFields, placedBombs: [] as import('../core/game-state').PlacedBomb[], phase: 'exploring' as const };
      setGameState(warpedState);
      stateRef.current = warpedState;
      setBattleLog((prev) => [...prev, `下階転送チップを使用した（B${warpedState.floor}Fへ転送）`].slice(-BATTLE_LOG_MAX));
      setFloorNotif(`▼ B${warpedState.floor}F へ転送された`);
      if (floorNotifTimerRef.current) clearTimeout(floorNotifTimerRef.current);
      floorNotifTimerRef.current = setTimeout(() => setFloorNotif(null), 3000);
      return;
    }

    // warp_up: 上階転送
    if (item.itemId === "warp_chip_up") {
      if (state.floor <= 1) {
        playSE('ui_cancel');
        setBattleLog((prev) => [...prev, 'これ以上上の階はない！'].slice(-BATTLE_LOG_MAX));
        return;
      }
      if (!state.player) return;
      const { nextState: consumed } = useInventoryItem(state, index);
      playSE('floor_descend');
      const transitionFields = transitionToPrevFloor({ ...consumed, player: consumed.player! });
      const warpedState = { ...consumed, ...transitionFields, placedBombs: [] as import('../core/game-state').PlacedBomb[], phase: 'exploring' as const };
      setGameState(warpedState);
      stateRef.current = warpedState;
      setBattleLog((prev) => [...prev, `上階転送チップを使用した（B${warpedState.floor}Fへ転送）`].slice(-BATTLE_LOG_MAX));
      setFloorNotif(`▲ B${warpedState.floor}F へ転送された`);
      if (floorNotifTimerRef.current) clearTimeout(floorNotifTimerRef.current);
      floorNotifTimerRef.current = setTimeout(() => setFloorNotif(null), 3000);
      return;
    }

    // warp_random: フロア内ランダムワープ
    if (item.itemId === "warp_chip_random") {
      if (!state.player || !state.map) return;
      const walkableTiles: {x: number; y: number}[] = [];
      for (let y = 0; y < state.map.cells.length; y++) {
        for (let x = 0; x < state.map.cells[y].length; x++) {
          const tile = state.map.cells[y][x].tile;
          if (tile === TILE_FLOOR) {
            walkableTiles.push({ x, y });
          }
        }
      }
      if (walkableTiles.length === 0) return;
      const dest = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
      const { nextState: consumed } = useInventoryItem(state, index);
      playSE('item_pickup');
      const warpedState = {
        ...consumed,
        player: consumed.player ? { ...consumed.player, pos: dest } : consumed.player,
      };
      setGameState(warpedState);
      stateRef.current = warpedState;
      addFlash(dest.x, dest.y, 'rgba(0,150,255,0.8)');
      setBattleLog((prev) => [...prev, `フロアワープチップを使用した（${dest.x},${dest.y}へ転送）`].slice(-BATTLE_LOG_MAX));
      return;
    }

    // inventory.items（items.json 系）の使用処理
    const { nextState, log } = useInventoryItem(state, index);
    // アイテム使用アニメーション（使用できた場合のみ）
    const withAnim: GameState = nextState.player
      ? {
          ...nextState,
          player: { ...nextState.player, animState: "item_use" as const },
        }
      : nextState;
    setGameState(withAnim);
    stateRef.current = withAnim;
    // item_use アニメ有効期限を登録
    if (withAnim.player?.animState === 'item_use') {
      animStateExpiryRef.current.set('player', performance.now() + ANIM_STATE_DURATION_MS);
    }
    // アイテム使用フラッシュ → プレイヤータイルを緑フラッシュ
    if (withAnim.player) {
      addFlash(withAnim.player.pos.x, withAnim.player.pos.y, 'rgba(0,255,136,0.6)');
    }
    // フラッシュグレネード使用時: 影響範囲を白フラッシュ
    const usedItemDef = (itemsRaw as unknown as Array<{id: string; effect?: string; flashRadius?: number}>)
      .find((d) => d.id === item.itemId);
    if (usedItemDef?.effect === 'flash_grenade' && state.player) {
      const fr = usedItemDef.flashRadius ?? 2;
      for (let dy = -fr; dy <= fr; dy++) {
        for (let dx = -fr; dx <= fr; dx++) {
          addFlash(state.player.pos.x + dx, state.player.pos.y + dy, 'rgba(255,255,200,0.85)');
        }
      }
    }
    // 爆弾設置時: 設置マスを赤フラッシュ
    if (usedItemDef?.effect === 'place_bomb' && state.player) {
      addFlash(state.player.pos.x, state.player.pos.y, 'rgba(255,50,0,0.7)');
    }
    setBattleLog((prevLogs) => {
      const merged = [...prevLogs, log];
      return merged.length > BATTLE_LOG_MAX
        ? merged.slice(-BATTLE_LOG_MAX)
        : merged;
    });
  }, []);

  // ── アイテム鑑定処理 ─────────────────────────────────────────
  const handleIdentifyItem = useCallback((targetIndex: number) => {
    const state = stateRef.current;
    if (state.phase !== 'exploring') return;
    // 識別スコープを探す
    const scopeIndex = state.inventory.items.findIndex((it) => it.itemId === 'id_scope' && !it.unidentified);
    if (scopeIndex < 0) return;
    const { nextState, log } = useInventoryItem(state, scopeIndex, targetIndex);
    playSE('item_pickup');
    setGameState(nextState);
    stateRef.current = nextState;
    setBattleLog((prev) => {
      const merged = [...prev, log];
      return merged.length > BATTLE_LOG_MAX ? merged.slice(-BATTLE_LOG_MAX) : merged;
    });
  }, []);

  const handleSortChange = useCallback((key: 'default' | 'name' | 'category') => {
    setGameState((prev) => ({
      ...prev,
      inventory: { ...prev.inventory, sortKey: key },
    }));
    stateRef.current = {
      ...stateRef.current,
      inventory: { ...stateRef.current.inventory, sortKey: key },
    };
  }, []);

  // ── アイテムドロップ処理 ────────────────────────────────────
  const handleDropItem = useCallback((index: number) => {
    const state = stateRef.current;
    if (state.phase !== "exploring" && state.phase !== "shop") return;

    const item = state.inventory.items[index];
    if (!item) return;

    const newItems = state.inventory.items.filter((_, i) => i !== index);
    const next: GameState = {
      ...state,
      inventory: { ...state.inventory, items: newItems },
    };
    setGameState(next);
    stateRef.current = next;

    setMenuPanel((prev) => {
      if (prev?.type !== "inventory") return prev;
      const newIndex = Math.min(prev.index, newItems.length - 1);
      return { type: "inventory", index: Math.max(0, newIndex) };
    });

    setBattleLog((prev) => {
      const merged = [...prev, `${getItemName(item.itemId)} を捨てた`];
      return merged.length > BATTLE_LOG_MAX
        ? merged.slice(-BATTLE_LOG_MAX)
        : merged;
    });
  }, []);

  // ── 武器装備処理 ──────────────────────────────────────────────
  const handleEquipWeapon = useCallback((index: number) => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;
    if (!state.player?.weaponSlots) return;

    const weapon = state.player.weaponSlots[index];
    if (!weapon) return;

    const next: GameState = {
      ...state,
      player: {
        ...state.player,
        equippedWeapon: weapon,
      },
    };

    setGameState(next);
    stateRef.current = next;

    setBattleLog((prev) => [
      ...prev,
      `${weapon.name} を装備した`,
    ].slice(-BATTLE_LOG_MAX));
  }, []);

  // ── 盾装備処理 ─────────────────────────────────────────────
  const handleEquipShield = useCallback((index: number) => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;
    if (!state.player?.shieldSlots) return;

    const shield = state.player.shieldSlots[index];
    if (!shield) return;

    const next: GameState = {
      ...state,
      player: {
        ...state.player,
        equippedShield: shield,
      },
    };

    setGameState(next);
    stateRef.current = next;

    setBattleLog((prev) => [
      ...prev,
      `${shield.name} を装備した`,
    ].slice(-BATTLE_LOG_MAX));
  }, []);

  // ── 盾外す処理 ─────────────────────────────────────────────
  const handleUnequipShield = useCallback(() => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;
    if (!state.player?.equippedShield) return;

    const shieldName = state.player.equippedShield.name;
    const next: GameState = {
      ...state,
      player: {
        ...state.player,
        equippedShield: null,
      },
    };

    setGameState(next);
    stateRef.current = next;

    setBattleLog((prev) => [
      ...prev,
      `📤 ${shieldName} を外した`,
    ].slice(-BATTLE_LOG_MAX));
  }, []);

  // ── 盾破棄処理 ─────────────────────────────────────────────
  const handleDropShield = useCallback((index: number) => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;
    if (!state.player?.shieldSlots) return;

    const shield = state.player.shieldSlots[index];
    if (!shield) return;

    const newShieldSlots = state.player.shieldSlots.filter((_, i) => i !== index);
    const isEquipped = (shield.instanceId && state.player.equippedShield?.instanceId)
      ? state.player.equippedShield.instanceId === shield.instanceId
      : state.player.equippedShield?.shieldId === shield.shieldId;
    const newEquippedShield = isEquipped ? null : state.player.equippedShield;

    const next: GameState = {
      ...state,
      player: {
        ...state.player,
        shieldSlots: newShieldSlots,
        equippedShield: newEquippedShield,
      },
      inventory: {
        ...state.inventory,
        equippedShields: (state.inventory.equippedShields ?? []).filter((_, i) => i !== index),
      },
    };

    setGameState(next);
    stateRef.current = next;

    setBattleLog((prev) => [
      ...prev,
      `🗑 ${shield.name} を破棄した`,
    ].slice(-BATTLE_LOG_MAX));
  }, []);

  // ── アーマー装備処理 ─────────────────────────────────────────
  const handleEquipArmor = useCallback((index: number) => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;
    if (!state.player?.armorSlots) return;

    const armor = state.player.armorSlots[index];
    if (!armor) return;

    const next: GameState = {
      ...state,
      player: {
        ...state.player,
        equippedArmor: armor,
      },
    };

    setGameState(next);
    stateRef.current = next;

    setBattleLog((prev) => [
      ...prev,
      `${armor.name} を装備した`,
    ].slice(-BATTLE_LOG_MAX));
  }, []);

  // ── アーマー外す処理 ─────────────────────────────────────────
  const handleUnequipArmor = useCallback(() => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;
    if (!state.player?.equippedArmor) return;

    const armorName = state.player.equippedArmor.name;
    const next: GameState = {
      ...state,
      player: {
        ...state.player,
        equippedArmor: null,
      },
    };

    setGameState(next);
    stateRef.current = next;

    setBattleLog((prev) => [
      ...prev,
      `📤 ${armorName} を外した`,
    ].slice(-BATTLE_LOG_MAX));
  }, []);

  // ── アーマー破棄処理 ─────────────────────────────────────────
  const handleDropArmor = useCallback((index: number) => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;
    if (!state.player?.armorSlots) return;

    const armor = state.player.armorSlots[index];
    if (!armor) return;

    const newArmorSlots = state.player.armorSlots.filter((_, i) => i !== index);
    const isEquipped = (armor.instanceId && state.player.equippedArmor?.instanceId)
      ? state.player.equippedArmor.instanceId === armor.instanceId
      : state.player.equippedArmor?.armorId === armor.armorId;
    const newEquippedArmor = isEquipped ? null : state.player.equippedArmor;

    // アーマー破棄時は maxHpBonus を差し引く
    const hpBonusToRemove = isEquipped ? (armor.maxHpBonus ?? 0) : 0;
    const newMaxHp = Math.max(1, (state.player.maxHp ?? 0) - hpBonusToRemove);
    const newHp = Math.min(state.player.hp ?? 1, newMaxHp);

    const next: GameState = {
      ...state,
      player: {
        ...state.player,
        armorSlots: newArmorSlots,
        equippedArmor: newEquippedArmor,
        maxHp: newMaxHp,
        hp: newHp,
      },
      inventory: {
        ...state.inventory,
        equippedArmors: (state.inventory.equippedArmors ?? []).filter((_, i) => i !== index),
      },
    };

    setGameState(next);
    stateRef.current = next;

    setBattleLog((prev) => [
      ...prev,
      `🗑 ${armor.name} を破棄した`,
    ].slice(-BATTLE_LOG_MAX));
  }, []);

  // ── 武器破棄（捨てる）処理 ────────────────────────────────────
  const handleDropWeapon = useCallback((index: number) => {
    const state = stateRef.current;
    if (state.phase !== "exploring") return;
    if (!state.player?.weaponSlots) return;

    const weapon = state.player.weaponSlots[index];
    if (!weapon) return;

    const next = discardWeapon(state, index);
    setGameState(next);
    stateRef.current = next;

    setBattleLog((prev) => [
      ...prev,
      `🗑 ${weapon.name} を破棄した`,
    ].slice(-BATTLE_LOG_MAX));
  }, []);

  // ── UIAction 処理 ────────────────────────────────────────────
  const handleUIAction = useCallback(
    (action: UIAction) => {
      const state = stateRef.current;
      // ヘルプはどのフェーズでも開ける
      if (action === "open_help") {
        setMenuPanel((prev) => (prev?.type === "help" ? null : { type: "help" }));
        return;
      }
      if (state.phase !== "exploring") return;

      setMenuPanel((prev) => {
        switch (action) {
          case "open_inventory":
            if (prev?.type === "inventory") return null;
            return { type: "inventory", index: 0 };

          case "open_weapons":
            if (prev?.type === "weapons") return null;
            return { type: "weapons", index: 0 };

          case "open_status":
            if (prev?.type === "status") return null;
            return { type: "status", index: 0 };

          case "close_menu":
            // 何も開いていなければポーズメニューを開く
            if (prev === null) return { type: "pause", index: 0 };
            return null;

          case "menu_up": {
            if (!prev || prev.type === "help") return prev;
            const newIndex = Math.max(0, prev.index - 1);
            return { ...prev, index: newIndex };
          }

          case "menu_down": {
            if (!prev || prev.type === "help") return prev;
            let maxIndex = 0;
            if (prev.type === "inventory") {
              maxIndex =
                typeof state.inventory?.items === "object"
                  ? Math.max(0, state.inventory.items.length - 1)
                  : 0;
            } else if (prev.type === "weapons") {
              const currentSlots = state.player?.weaponSlots ?? [];
              maxIndex = Math.max(0, currentSlots.length - 1);
            } else if (prev.type === "pause") {
              maxIndex = 2; // 0:Resume, 1:Save&Exit, 2:Retire
            }
            const newIndex = Math.min(maxIndex, prev.index + 1);
            return { ...prev, index: newIndex };
          }

          case "menu_select":
            return prev;

          default:
            return prev;
        }
      });

      if (action === "menu_select") {
        // menuPanelRef で最新値を読む（state updater 内で side effect を起こすアンチパターンを回避）
        const panel = menuPanelRef.current;
        if (!panel) return;
        if (panel.type === "inventory") {
          const sorted = getSortedItems(state.inventory.items, state.inventory.sortKey);
          const originalIndex = sorted[panel.index]?.originalIndex;
          if (originalIndex !== undefined) {
            handleUseItem(originalIndex);
          }
        } else if (panel.type === "weapons") {
          handleEquipWeapon(panel.index);
        } else if (panel.type === "pause") {
          if (panel.index === 0) {
            setMenuPanel(null); // 再開
          } else if (panel.index === 1) {
            setMenuPanel(null);
            handleSaveAndExit(); // セーブして終了
          } else if (panel.index === 2) {
            setMenuPanel(null);
            handleMoveToBase(); // 拠点へ帰還
          }
        }
      }
    },
    [handleUseItem, handleEquipWeapon, handleSaveAndExit, handleMoveToBase],
  );

  // ── キーボード入力フック ─────────────────────────────────────
  const isMenuOpen = menuPanel !== null;

  useGameInput(
    handleAction,
    gameState.phase === "exploring",
    handleUIAction,
    isMenuOpen,
  );

  // 拠点画面での Enter/Z 対応
  useEffect(() => {
    if (gameState.phase !== "base" || isMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "z") {
        playSE("ui_select");
        handleEnterDungeon();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState.phase, isMenuOpen, handleEnterDungeon]);

  // ── スキルホットキー（1/2/3）────────────────────────────────
  useEffect(() => {
    if (gameState.phase !== "exploring" || isMenuOpen || skillSelectState !== null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "1") handleUseSkill(0);
      else if (e.key === "2") handleUseSkill(1);
      else if (e.key === "3") handleUseSkill(2);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState.phase, isMenuOpen, skillSelectState, handleUseSkill]);

  // ── 常にキャンバスをレンダリングし、タイトル/ゲームオーバーはオーバーレイで表示 ──
  // 理由: Canvas が DOM に存在しないとき canvasRef.current === null のため
  // DPR セットアップ useEffect が効かず、キャンバスがデフォルトの 300×150px のまま
  // になり、プレイヤーが描画領域外（y=6*tileSize > 150）に落ちて見えなくなる。

  const canvasLogicalW = TILES_X * tileSize;
  const canvasLogicalH = TILES_Y * tileSize;

  return (
    // 外枠: 相対配置でオーバーレイを重ねる
    <div className="relative flex flex-col w-full h-full bg-black">
      {/*
       * Canvas エリア: containerRef はここに設置。
       * flex-1 + min-h-0 で仮想コントローラー分を除いた残り高さを確保。
       * overflow-hidden でキャンバスが外にはみ出ないよう制御。
       * タイトル/ゲームオーバー中も常に存在することで DPR 計算が正しく機能する。
       */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden"
      >
        {/* キャンバス＋pcInfoBar を同幅でまとめる外枠 */}
        <div
          className="flex flex-col items-stretch flex-shrink-0"
          style={{ width: canvasLogicalW }}
        >
          {/* Canvas + HUD + パネルオーバーレイ ラッパー */}
          <div
            className="relative flex-shrink-0"
            style={{ width: canvasLogicalW, height: canvasLogicalH }}
          >
            <canvas
              ref={canvasRef}
              className="block"
              style={{ imageRendering: "pixelated" }}
            />

            {/* HUD オーバーレイ（exploring フェーズのみ） */}
            {gameState.player && gameState.phase === "exploring" && (
              <HUD
                player={gameState.player}
                floorNumber={gameState.floor}
                floor={gameState.map}
                enemies={gameState.enemies}
                isMenuOpen={isMenuOpen}
                inventory={gameState.inventory}
                level={gameState.pilot.level}
                gold={gameState.inventory.gold}
                bossHPVisible={bossSeenFloors.has(gameState.floor)}
              />
            )}

            {/* インベントリパネルオーバーレイ */}
            {menuPanel?.type === "inventory" &&
              gameState.phase === "exploring" && (
                <InventoryPanel
                  inventory={gameState.inventory}
                  maxCapacity={gameState.machine.itemPouch}
                  selectedIndex={menuPanel.index}
                  onClose={() => setMenuPanel(null)}
                  onUseItem={handleUseItem}
                  onDropItem={handleDropItem}
                  hasIdentifyScope={gameState.inventory.items.some(it => it.itemId === 'id_scope' && !it.unidentified)}
                  onIdentifyItem={handleIdentifyItem}
                  onSortChange={handleSortChange}
                />
              )}

            {/* 武器パネルオーバーレイ */}
            {menuPanel?.type === "weapons" &&
              gameState.phase === "exploring" && (
                <WeaponPanel
                  weaponSlots={gameState.player?.weaponSlots ?? []}
                  activeWeapon={gameState.player?.equippedWeapon}
                  maxCapacity={gameState.machine.weaponSlots}
                  selectedIndex={menuPanel.index}
                  onClose={() => setMenuPanel(null)}
                  onEquipWeapon={handleEquipWeapon}
                  onDropWeapon={(index) => {
                    const weapon = gameState.player?.weaponSlots?.[index];
                    if (!weapon) return;
                    setConfirmDialog({
                      message: `${weapon.name} を捨てますか？`,
                      onConfirm: () => handleDropWeapon(index),
                    });
                  }}
                  shieldSlots={gameState.player?.shieldSlots ?? []}
                  maxShieldSlots={gameState.machine.shieldSlots ?? 1}
                  activeShield={gameState.player?.equippedShield}
                  onEquipShield={handleEquipShield}
                  onUnequipShield={handleUnequipShield}
                  onDropShield={(index) => {
                    const shield = gameState.player?.shieldSlots?.[index];
                    if (!shield) return;
                    setConfirmDialog({
                      message: `${shield.name} を捨てますか？`,
                      onConfirm: () => handleDropShield(index),
                    });
                  }}
                  armorSlots={gameState.player?.armorSlots ?? []}
                  maxArmorSlots={gameState.machine.armorSlots ?? 1}
                  activeArmor={gameState.player?.equippedArmor}
                  onEquipArmor={handleEquipArmor}
                  onUnequipArmor={handleUnequipArmor}
                  onDropArmor={(index) => {
                    const armor = gameState.player?.armorSlots?.[index];
                    if (!armor) return;
                    setConfirmDialog({
                      message: `${armor.name} を捨てますか？`,
                      onConfirm: () => handleDropArmor(index),
                    });
                  }}
                />
              )}

            {/* ステータスパネルオーバーレイ */}
            {menuPanel?.type === "status" &&
              gameState.phase === "exploring" && (
                <StatusPanel
                  player={gameState.player!}
                  pilot={gameState.pilot}
                  onClose={() => setMenuPanel(null)}
                />
              )}

            {/* ヘルプマニュアルオーバーレイ（どのフェーズでも表示可能） */}
            {menuPanel?.type === "help" && (
              <HelpManualOverlay onClose={() => setMenuPanel(null)} />
            )}

            {/* ショップパネルオーバーレイ */}
            {gameState.phase === "shop" && (
              <ShopPanel
                shopInventory={gameState.exploration?.shopInventory ?? []}
                gold={gameState.inventory.gold}
                playerItems={gameState.inventory.items}
                playerWeapons={gameState.player?.weaponSlots ?? []}
                onBuy={handleBuyItem}
                onSell={handleSellItem}
                onClose={handleShopClose}
                lastMessage={battleLog[battleLog.length - 1]}
              />
            )}

            {/* ⏸ ポーズメニューオーバーレイ */}
            {menuPanel?.type === "pause" && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="w-full max-w-sm bg-gray-900 border border-gray-600 rounded-lg p-6 font-mono text-center shadow-lg shadow-black/50">
                  <h2 className="text-xl font-bold text-yellow-400 mb-6 drop-shadow-md pb-2 border-b border-gray-700">
                    システムメニュー
                  </h2>
                  <div className="flex flex-col gap-3">
                    {[
                      {
                        label: "ゲームを再開",
                        color:
                          "bg-blue-600 border-blue-400 hover:bg-blue-500 text-blue-100",
                      },
                      {
                        label: "セーブして終了",
                        color:
                          "bg-green-700 border-green-500 hover:bg-green-600 text-green-100",
                      },
                      {
                        label: "拠点へ帰還（リタイア）",
                        color:
                          "bg-red-800 border-red-600 hover:bg-red-700 text-red-100",
                      },
                    ].map((btn, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleUIAction("menu_select")}
                        onMouseEnter={() =>
                          setMenuPanel({ type: "pause", index: idx })
                        }
                        className={`py-3 px-4 rounded font-bold border-2 transition-all ${
                          menuPanel.index === idx
                            ? `ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900 scale-105 ${btn.color}`
                            : `opacity-80 scale-100 border-transparent bg-gray-800 text-gray-400`
                        }`}
                      >
                        {menuPanel.index === idx ? "▶ " : ""}
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-gray-500 text-xs mt-6 px-4">
                    ※
                    セーブして終了するとタイトル画面に戻ります。拠点へ帰還すると現在の進行状況を破棄します。
                  </div>
                </div>
              </div>
            )}

            {/* ── スキル選択ダイアログ ── */}
            {skillSelectState !== null && gameState.phase === "exploring" && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
                <div className="bg-gray-900 border border-yellow-500 rounded-lg p-5 max-w-xs w-full mx-4 font-mono shadow-lg shadow-black/60">
                  <h2 className="text-base font-bold text-yellow-400 mb-4 text-center border-b border-gray-700 pb-2">
                    Lv.{skillSelectState.level} レベルアップ！ スキルを習得
                  </h2>
                  <div className="flex flex-col gap-2">
                    {skillSelectState.available.map((skill) => (
                      <div
                        key={skill.id}
                        className="flex items-start gap-3 bg-gray-800 border border-gray-600 rounded p-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-bold text-white">{skill.name}</span>
                            <span
                              style={{
                                fontSize: 9,
                                padding: "1px 5px",
                                borderRadius: 4,
                                backgroundColor: skill.type === "active" ? "rgba(80,120,220,0.5)" : "rgba(60,160,80,0.5)",
                                border: `1px solid ${skill.type === "active" ? "#4466cc" : "#44aa55"}`,
                                color: skill.type === "active" ? "#aabbff" : "#88ddaa",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {skill.type === "active" ? "アクティブ" : "パッシブ"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 leading-snug">{skill.description}</p>
                        </div>
                        <button
                          onClick={() => handleLearnSkill(skill.id)}
                          className="flex-shrink-0 px-3 py-1 rounded text-xs font-bold bg-yellow-600 border border-yellow-400 text-yellow-100 hover:bg-yellow-500 transition-colors"
                        >
                          習得
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setSkillSelectState(null)}
                    className="mt-4 w-full py-1.5 rounded text-xs font-bold bg-gray-700 border border-gray-500 text-gray-300 hover:bg-gray-600 transition-colors"
                  >
                    後で決める
                  </button>
                </div>
              </div>
            )}

            {/* ── 確認ダイアログオーバーレイ ── */}
            {confirmDialog && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-gray-900 border border-red-500 rounded-lg p-4 max-w-xs w-full mx-4 font-mono shadow-lg shadow-black/60">
                  <p
                    className="text-sm text-gray-200 mb-4 text-center leading-relaxed"
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {confirmDialog.message}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => {
                        confirmDialog.onConfirm();
                        setConfirmDialog(null);
                      }}
                      className="px-5 py-2 rounded text-sm font-bold bg-red-700 border border-red-500 text-red-100 hover:bg-red-600 transition-colors"
                    >
                      はい
                    </button>
                    <button
                      onClick={() => setConfirmDialog(null)}
                      className="px-5 py-2 rounded text-sm font-bold bg-gray-700 border border-gray-500 text-gray-200 hover:bg-gray-600 transition-colors"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── ボス登場オーバーレイ ── */}
            {gameState.phase === "bossIntro" && (
              <BossIntroOverlay
                floor={gameState.floor}
                onFinish={() => {
                  setGameState((prev) => ({ ...prev, phase: "exploring" }));
                }}
              />
            )}

            {/* ── ボス撃破演出 ── */}
            {bossDefeatEffect && (
              <BossDefeatOverlay
                bossType={bossDefeatEffect}
                onFinish={() => setBossDefeatEffect(null)}
              />
            )}

            {/* ── 装備破損通知 ── */}
            {breakNotif && (
              <div
                style={{
                  position: 'absolute',
                  top: '18%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 40,
                  pointerEvents: 'none',
                  backgroundColor: 'rgba(80, 0, 0, 0.92)',
                  border: '2px solid #ff4444',
                  borderRadius: 8,
                  padding: '10px 20px',
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  boxShadow: '0 0 20px #ff0000, 0 0 40px rgba(255,0,0,0.4)',
                  animation: 'pulse 0.5s ease-in-out infinite alternate',
                }}
              >
                <div style={{ fontSize: 11, color: '#ff8888', marginBottom: 2 }}>⚠ 装備破損</div>
                <div style={{ fontSize: 13, color: '#ffcccc', fontWeight: 'bold' }}>{breakNotif}</div>
              </div>
            )}

            {/* ── ボスブロック警告 ── */}
            {bossWarning && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'rgba(200, 0, 0, 0.85)',
                  color: '#fff',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: '2px solid #ff4444',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  zIndex: 100,
                  pointerEvents: 'none',
                  letterSpacing: '0.05em',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                }}
              >
                ボスを倒さなければ下階へは行けない！
              </div>
            )}

            {/* ── 階移動通知 ── */}
            {floorNotif && !bossWarning && (
              <div
                style={{
                  position: 'absolute',
                  top: '18%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(10, 40, 80, 0.92)',
                  color: '#88ddff',
                  padding: '14px 32px',
                  borderRadius: '10px',
                  border: '2px solid #4499cc',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  zIndex: 110,
                  pointerEvents: 'none',
                  letterSpacing: '0.08em',
                  fontFamily: 'monospace',
                  boxShadow: '0 0 24px rgba(68,153,204,0.6)',
                  whiteSpace: 'nowrap',
                }}
              >
                {floorNotif}
              </div>
            )}

            {/* ── 敵VS敵撃破通知 ── */}
            {enemyKillNotif && (
              <div
                style={{
                  position: 'absolute',
                  top: '28%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(40, 60, 20, 0.92)',
                  border: '1px solid #88cc44',
                  borderRadius: 6,
                  padding: '6px 14px',
                  pointerEvents: 'none',
                  zIndex: 120,
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  minWidth: 160,
                  boxShadow: '0 0 10px rgba(136,204,68,0.4)',
                  animation: 'pulse 0.5s ease-in-out infinite alternate',
                }}
              >
                <div style={{ fontSize: 10, color: '#aadd66', marginBottom: 2 }}>⚔ 敵同士の戦闘</div>
                <div style={{ fontSize: 12, color: '#ccff88', fontWeight: 'bold' }}>{enemyKillNotif}</div>
              </div>
            )}
          </div>

          {/* ── バトルログ: キャンバス直下 ── */}
          {/* パネル開放中にタップ → パネルを閉じる */}
          {gameState.phase === "exploring" && battleLog.length > 0 && (
            <div onPointerDown={() => { if (menuPanel) setMenuPanel(null); }}>
              <BattleLogPanel battleLog={battleLog} />
            </div>
          )}

          {/* pc-info-bar: バトルログ直下に配置 */}
          {/* パネル開放中にクリック → パネルを閉じる（pointer-events-none は削除済み） */}
          {gameState.phase === "exploring" && gameState.player && (
            <div
              className="pc-info-bar kb-guide hidden flex-shrink-0 flex-row gap-3 items-start px-2 py-1 select-none"
              onPointerDown={() => { if (menuPanel) setMenuPanel(null); }}
              style={{
                backgroundColor: "rgba(0,0,0,0.85)",
                borderTop: "1px solid rgba(80,80,120,0.5)",
                fontFamily: "monospace",
                fontSize: 10,
                color: "#aaaacc",
                maxHeight: 220,
                overflow: "hidden",
              }}
            >
              {/* キーボード操作ガイド */}
              <div style={{ width: 170, flexShrink: 0 }}>
                <div style={{ marginBottom: 3 }}>
                  <span style={{ color: "#ffee88", fontWeight: "bold", fontSize: 11 }}>
                    キーボード操作
                  </span>
                </div>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ color: "#8888aa", fontSize: 9 }}>
                      <th
                        style={{
                          textAlign: "left",
                          paddingRight: 8,
                          paddingBottom: 1,
                        }}
                      >
                        キー
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          paddingRight: 8,
                          paddingBottom: 1,
                          color: isMenuOpen ? "#aaaacc" : "#ffffff",
                        }}
                      >
                        通常
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          paddingBottom: 1,
                          color: isMenuOpen ? "#ffffff" : "#aaaacc",
                        }}
                      >
                        パネル
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["WASD/矢印", "移動", "↑↓選択"],
                        ["Ctrl+WASD", "向き変更", "—"],
                        ["Z / X", "攻撃", "決定"],
                        ["Space", "待機", "—"],
                        ["I", "アイテム", "閉じる"],
                        ["E", "装備", "閉じる"],
                        ["H", "マニュアル確認", "閉じる"],
                        ["Esc", "メニュー", "閉じる"],
                      ] as [string, string, string][]
                    ).map(([key, normal, menu]) => (
                      <tr key={key}>
                        <td
                          style={{
                            paddingRight: 8,
                            paddingBottom: 1,
                            color: "#ffdd88",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {key}
                        </td>
                        <td
                          style={{
                            paddingRight: 8,
                            paddingBottom: 1,
                            color: isMenuOpen ? "#555577" : "#ddddff",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {normal}
                        </td>
                        <td
                          style={{
                            paddingBottom: 1,
                            color: isMenuOpen ? "#ddddff" : "#555577",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {menu}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* スキル一覧（縦並び・固定幅内） */}
                {gameState.skills.length > 0 && (
                  <div style={{ marginTop: 4, borderTop: "1px solid rgba(80,80,120,0.4)", paddingTop: 3 }}>
                    {gameState.skills
                      .filter(sk => getSkillDefinition(sk.id)?.type === "active")
                      .slice(0, 3)
                      .map((sk, i) => {
                        const def = getSkillDefinition(sk.id);
                        const ready = sk.cooldownRemaining === 0;
                        return (
                          <div key={sk.id} style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 2 }}>
                            <span style={{ color: "#ffdd88", fontSize: 9, minWidth: 14, flexShrink: 0 }}>[{i + 1}]</span>
                            <span style={{
                              fontSize: 9,
                              color: ready ? "#eeeeff" : "#44445a",
                              fontWeight: ready ? "bold" : "normal",
                              flexShrink: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}>{def?.name ?? sk.id}</span>
                            {ready ? (
                              <span style={{
                                fontSize: 8,
                                background: "rgba(0,180,60,0.25)",
                                border: "1px solid #00cc44",
                                color: "#00ff88",
                                borderRadius: 3,
                                padding: "0 3px",
                                flexShrink: 0,
                              }}>▶可</span>
                            ) : (
                              <span style={{ fontSize: 8, color: "#aa5533", flexShrink: 0 }}>
                                CD:{sk.cooldownRemaining}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    {gameState.skills.filter(sk => getSkillDefinition(sk.id)?.type === "passive").length > 0 && (
                      <div style={{ fontSize: 8, color: "#556677", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        ✦ {gameState.skills
                          .filter(sk => getSkillDefinition(sk.id)?.type === "passive")
                          .map(sk => getSkillDefinition(sk.id)?.name ?? sk.id)
                          .join(" / ")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 装備中武器 */}
              <div
                style={{
                  minWidth: 130,
                  flexShrink: 0,
                  borderLeft: "1px solid rgba(100,100,150,0.4)",
                  paddingLeft: 8,
                }}
              >
                <div
                  style={{
                    color: "#ffdd88",
                    fontWeight: "bold",
                    marginBottom: 3,
                    fontSize: 11,
                  }}
                >
                  装備武器
                  {(gameState.player?.weaponSlots?.length ?? 0) >= gameState.machine.weaponSlots && (
                    <span style={{ color: "#ff4444", marginLeft: 4, fontSize: 9 }}>
                      [満タン]
                    </span>
                  )}
                </div>
                {(() => {
                  const w = gameState.player?.equippedWeapon;
                  const slots = gameState.player?.weaponSlots ?? [];
                  const rarityColor: Record<string, string> = {
                    common: "#aaaaaa",
                    uncommon: "#44dd44",
                    rare: "#4488ff",
                    legendary: "#ffaa00",
                  };
                  return (
                    <>
                      {w ? (
                        <div
                          style={{ color: rarityColor[w.rarity] ?? "#aaaaaa" }}
                        >
                          ⚔ {w.name}
                          {w.durability !== null && (
                            <span style={{ color: "#888899", marginLeft: 4 }}>
                              {w.durability}/{w.maxDurability}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: "#555577" }}>⚔ 素手</div>
                      )}
                      {slots
                        .filter((s) => s.id !== w?.id)
                        .slice(0, 3)
                        .map((s, i) => (
                          <div
                            key={i}
                            style={{ color: "#666688", fontSize: 9 }}
                          >
                            　{s.name}
                          </div>
                        ))}
                    </>
                  );
                })()}
              </div>

              {/* アイテム一覧 */}
              {gameState.inventory.items.length > 0 && (
                <div
                  style={{
                    minWidth: 130,
                    flexShrink: 0,
                    borderLeft: "1px solid rgba(100,100,150,0.4)",
                    paddingLeft: 8,
                  }}
                >
                  <div
                    style={{
                      color: "#88bbaa",
                      fontWeight: "bold",
                      marginBottom: 3,
                      fontSize: 11,
                    }}
                  >
                    アイテム
                    {gameState.inventory.items.length >= getInventoryCapacity(gameState.pilot.level) && (
                      <span style={{ color: "#ff4444", marginLeft: 4, fontSize: 9 }}>
                        [満タン]
                      </span>
                    )}
                  </div>
                  {gameState.inventory.items.slice(0, 6).map((it, i) => (
                    <div
                      key={i}
                      style={{
                        color: "#99ddaa",
                        fontSize: 9,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {it.unidentified
                        ? "？？？のパーツ"
                        : getItemName(it.itemId)}
                      {it.quantity > 1 ? ` ×${it.quantity}` : ""}
                    </div>
                  ))}
                  {gameState.inventory.items.length > 6 && (
                    <div style={{ color: "#666688", fontSize: 9 }}>
                      …他{gameState.inventory.items.length - 6}件
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
        {/* end: キャンバス＋pcInfoBar 外枠 */}
      </div>

      {/* ── 視界枠下: 操作ガイド + 装備 + アイテム（PC のみ）/ アニメ ── */}
      <style>{`
        @keyframes hud-fadein {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (pointer: coarse) {
          .vc-wrapper   { display: flex !important; }
          .kb-guide     { display: none !important; }
          .pc-info-bar  { display: none !important; }
        }
        @media (pointer: fine) {
          .vc-wrapper   { display: none !important; }
          .kb-guide     { display: flex !important; }
          .pc-info-bar  { display: flex !important; }
        }
      `}</style>

      {/* ── 仮想コントローラー（スマホ） ── */}
      <div className="vc-wrapper hidden pointer-events-auto justify-center py-2 w-full px-2">
        <VirtualController
          onAction={(action) => {
            if (gameState.phase === "exploring") {
              playSE("ui_select");
              handleAction(action);
            }
          }}
          onUIAction={(action) => {
            if (gameState.phase === "exploring") {
              handleUIAction(action);
            }
          }}
          skillSlots={gameState.skills
            .filter((sk) => getSkillDefinition(sk.id)?.type === "active")
            .map((sk) => ({
              name: getSkillDefinition(sk.id)?.name ?? sk.id,
              cooldown: sk.cooldownRemaining,
            }))}
          onSkillUse={(slotIndex) => {
            if (gameState.phase === "exploring") {
              handleUseSkill(slotIndex);
            }
          }}
          disabled={gameState.phase !== "exploring"}
        />
      </div>

      {/* ── タイトル画面オーバーレイ ── */}
      {gameState.phase === "title" && (
        <TitleScreen
          onNewGame={handleNewGame}
          onLoadGame={handleLoadGameFromSlot}
          onAchievements={() =>
            setGameState((prev) => ({ ...prev, phase: "achievements" }))
          }
        />
      )}

      {/* ── 実績画面オーバーレイ ── */}
      {gameState.phase === "achievements" && (
        <AchievementPanel
          unlockedIds={gameState.achievements}
          onClose={() => setGameState((prev) => ({ ...prev, phase: "title" }))}
        />
      )}

      {/* ── ゲームオーバーオーバーレイ ── */}
      {gameState.phase === "gameover" && (
        <GameOverOverlay
          floor={gameState.floor}
          enemiesDefeated={enemiesDefeated}
          goldEarned={goldEarned}
          onRestart={() => handleGameOverReturn(false)}
          onTitle={() => handleGameOverReturn(true)}
        />
      )}

      {/* ── ボス登場アニメーションオーバーレイ ── */}
      {gameState.phase === "bossIntro" && (
        <BossIntroOverlay
          floor={gameState.floor}
          onFinish={() =>
            setGameState((prev) => ({ ...prev, phase: "exploring" }))
          }
        />
      )}

      {/* ── ボス撃破演出（全画面レイヤー外） ── */}
      {bossDefeatEffect && (
        <BossDefeatOverlay
          bossType={bossDefeatEffect}
          onFinish={() => setBossDefeatEffect(null)}
        />
      )}

      {/* ── 拠点画面オーバーレイ ── */}
      {gameState.phase === "base" && (
        <BaseScreen
          gameState={gameState}
          deathFloor={deathFloor}
          onEnterDungeon={handleEnterDungeon}
          onUpdateState={setGameState}
          onSaveAndExit={handleSaveAndExit}
          onReturnToTitle={handleReturnToTitleWithoutSave}
        />
      )}

      {isLoadingSave && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white z-[200] backdrop-blur-md">
          {!loadErrorMessage ? (
            <>
              <div className="text-2xl font-bold font-mono animate-pulse mb-4 tracking-widest text-blue-400">
                LOADING SAVE DATA...
              </div>
              <div className="w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 animate-[loading_2s_linear_infinite]" />
              </div>
            </>
          ) : (
            <div className="max-w-md p-6 bg-red-900/40 border border-red-500 rounded-lg text-center animate-[hud-fadein_0.3s_ease-out]">
              <div className="text-xl font-bold text-red-400 mb-4">LOAD FAILED</div>
              <div className="text-sm font-mono text-red-200 mb-6 break-all">
                {loadErrorMessage}
              </div>
              <button
                className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold transition-colors"
                onClick={() => setIsLoadingSave(false)}
              >
                CLOSE
              </button>
            </div>
          )}
          <style jsx>{`
            @keyframes loading {
              0% { transform: translateX(-100%); width: 30%; }
              50% { width: 60%; }
              100% { transform: translateX(333%); width: 30%; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 表示名変換
// ---------------------------------------------------------------------------

/**
 * enemyType を日本語表示名に変換する。
 * getEnemyName（enemies.json / bosses.json 参照）に委譲する。
 */
function enemyDisplayName(enemyType: string): string {
  return getEnemyName(enemyType);
}
