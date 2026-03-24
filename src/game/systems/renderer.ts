/**
 * @fileoverview Canvas 2D 描画エンジン
 * React 非依存。純粋な描画ロジック。
 * ビューポートカリング付きでフロアを描画する。
 */

import type { GameState } from '../core/game-state';
import {
  TILE_WALL,
  TILE_FLOOR,
  TILE_STAIRS_DOWN,
  TILE_START,
  TILE_ITEM,
  TILE_GOLD,
  TILE_WEAPON,
  TILE_LAVA,
  TILE_ICE,
  TILE_WARP,
  TILE_TRAP,
  TILE_SHOP,
  TILE_HINT,
} from '../core/constants';
import spriteMetaRaw from '../assets/data/sprites.json';

// Avoid ts strict checking issues
const spriteMeta: any = spriteMetaRaw;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * ゲームカメラ/ビューポートの設定。
 * プレイヤーを中心としたタイル表示範囲を定義する。
 */
export interface Viewport {
  /** 画面に表示するタイル数（横） */
  tilesX: number;
  /** 画面に表示するタイル数（縦） */
  tilesY: number;
  /** タイルの描画サイズ（px）。元の32pxをスケールして使う */
  tileSize: number;
  /** ビューポート中心に表示するフロア上の座標（プレイヤー座標） */
  centerX: number;
  centerY: number;
}

/**
 * スプライト画像のキャッシュ。
 * キー: スプライト名（例: "player_idle_0", "tile_wall"）
 * 値: 読み込み済みの HTMLImageElement
 */
export type SpriteCache = Map<string, HTMLImageElement>;

// ---------------------------------------------------------------------------
// スプライト読み込み
// ---------------------------------------------------------------------------

/**
 * スプライト名のリストから画像を非同期で読み込み、SpriteCache を返す。
 * 読み込みに失敗した画像は無視する（フォールバック描画で対応）。
 *
 * @param spriteList - 読み込むスプライトの名前と URL のペア配列 [name, url][]
 * @returns 読み込み済みの SpriteCache
 */
export async function loadSprites(
  spriteList: Array<[name: string, url: string]>,
): Promise<SpriteCache> {
  const cache: SpriteCache = new Map();

  const loadOne = ([name, url]: [string, string]): Promise<void> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        cache.set(name, img);
        resolve();
      };
      img.onerror = () => {
        // 読み込み失敗は無視する（フォールバック描画）
        resolve();
      };
      img.src = url;
    });

  await Promise.all(spriteList.map(loadOne));
  return cache;
}

/**
 * メカローグで使用するスプライト一覧を返す。
 * sprites.json の定義に基づく。
 *
 * @returns [name, url][] のスプライト一覧
 */
export function getDefaultSpriteList(): Array<[name: string, url: string]> {
  const list: Array<[name: string, url: string]> = [];
  
  // Tiles (除外設定: tile_wall と tile_floor は暗すぎるためフォールバックを使用)
  if (spriteMeta.tiles) {
    for (const [key, sprite] of Object.entries(spriteMeta.tiles)) {
      if (key !== 'wall' && key !== 'floor') {
        const spriteObj = sprite as any;
        const fileUrl = spriteObj.file.replace('public/', '/');
        // tile_stairs 等のプレフィックスに合わせる
        list.push([`tile_${key}`, fileUrl]);
      }
    }
  }

  // Player
  if (spriteMeta.player) {
    for (const [animKey, frames] of Object.entries(spriteMeta.player)) {
      const frs = frames as any[];
      frs.forEach((f: any, i: number) => {
        list.push([`player_${animKey}_${i}`, f.file.replace('public/', '/')]);
      });
    }
  }

  // NPC
  if (spriteMeta.npc) {
    for (const [key, sprite] of Object.entries(spriteMeta.npc)) {
      const spriteObj = sprite as any;
      list.push([`npc_${key}`, spriteObj.file.replace('public/', '/')]);
    }
  }

  // Enemies and Bosses
  if (spriteMeta.enemies) {
    for (const [enemyId, frames] of Object.entries(spriteMeta.enemies)) {
      const frs = frames as any[];
      if (frs.length === 2) {
        frs.forEach((f: any, i: number) => {
          list.push([`${enemyId}_${i}`, f.file.replace('public/', '/')]);
        });
      } else if (frs.length >= 10) {
        // ボス(10フレーム): move_0, move_1 は 0,1 にマッピングして描画ループに対応
        list.push([`${enemyId}_0`, frs[0].file.replace('public/', '/')]);
        list.push([`${enemyId}_1`, frs[1].file.replace('public/', '/')]);
        // 同時に全フレームを本来の名前でも登録しておく
        frs.forEach((f: any) => {
          const match = f.file.match(/_([a-z]+_\d)\.png$/);
          if (match) {
            list.push([`${enemyId}_${match[1]}`, f.file.replace('public/', '/')]);
          }
        });
      }
    }
  }

  // B10F以下の通常敵の4方向スプライトをロード（失敗は無視）
  const B10F_ENEMIES = [
    'scout_drone', 'mine_beetle', 'guard_bot', 'slime_x', 'mini_slime',
    'spark', 'rust_hound', 'assault_mecha', 'stealth_killer',
    'shield_knight', 'mine_layer', 'healer_drone',
  ];
  const B10F_BOSSES = ['bug_swarm', 'mach_runner', 'junk_king', 'phantom', 'iron_fortress'];
  const DIRS = ['down', 'up', 'left', 'right'];
  for (const id of B10F_ENEMIES) {
    for (const dir of DIRS) {
      for (const state of ['idle', 'attack', 'hit']) {
        for (let f = 0; f < 2; f++) {
          list.push([
            `${id}_dir_${dir}_${state}_${f}`,
            `/sprites/enemies/${id}_dir_${dir}_${state}_${f}.png`,
          ]);
        }
      }
    }
  }

  // レベルバリアント敵のスプライトをロード
  // ファイル名: {base}_lv{N}_{state}_dir_{dir}_idle_{frame}.png
  // レンダラーキー: {base}_lv{N}_dir_{dir}_{state}_{frame}
  const LV_ENEMY_BASES: Array<[string, number[]]> = [
    ['scout_drone',    [1, 2, 3]],
    ['mine_beetle',    [1, 2, 3]],
    ['guard_bot',      [1, 2, 3, 4]],
    ['slime_x',        [1, 2, 3]],
    ['mini_slime',     [1, 2]],
    ['spark',          [1, 2, 3, 4]],
    ['rust_hound',     [1, 2, 3, 4]],
    ['assault_mecha',  [1, 2, 3, 4]],
    ['stealth_killer', [1, 2, 3, 4]],
    ['shield_knight',  [1, 2, 3, 4]],
    ['mine_layer',     [1, 2, 3, 4]],
    ['healer_drone',   [1, 2, 3, 4]],
  ];
  for (const [base, levels] of LV_ENEMY_BASES) {
    for (const lv of levels) {
      const enemyId = `${base}_lv${lv}`;
      for (const dir of DIRS) {
        for (const state of ['idle', 'move', 'attack', 'hit']) {
          // attack は3フレーム（0,1,2）、他は2フレーム（0,1）
          const maxFrames = state === 'attack' ? 3 : 2;
          for (let f = 0; f < maxFrames; f++) {
            list.push([
              `${enemyId}_dir_${dir}_${state}_${f}`,
              `/sprites/enemies/${base}_lv${lv}_${state}_dir_${dir}_idle_${f}.png`,
            ]);
          }
        }
      }
    }
  }
  for (const id of B10F_BOSSES) {
    for (const dir of DIRS) {
      for (const state of ['move', 'atk', 'dmg', 'dead']) {
        for (let f = 0; f < 2; f++) {
          list.push([
            `${id}_dir_${dir}_${state}_${f}`,
            `/sprites/enemies/${id}_dir_${dir}_${state}_${f}.png`,
          ]);
        }
      }
    }
  }

  return list;
}

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/** タイルのフォールバック色マップ（#011: 全体的な明度を引き上げ視認性を改善） */
const TILE_FALLBACK_COLORS: Record<string, string> = {
  [TILE_WALL]:        '#6a6a80', // 青みがかった明るいグレー（壁を視認しやすく）
  [TILE_FLOOR]:       '#252535', // 暗い青紫（床。以前より明るく、壁との差を維持）
  [TILE_STAIRS_DOWN]: '#886600',
  [TILE_START]:       '#252535',
  'E':                '#252535',
  '$':                '#0d2d12', // アイテム: 緑みがかった床
  'G':                '#2d2200', // ゴールド: 金みがかった床
  'V':                '#1a1030', // 武器: 青紫みがかった床
  'B':                '#252535',
  'T':                '#252535',
  'R':                '#1a3020', // 休憩: 緑みがかった床
  'W':                '#1c1c30', // 武器修理: やや青い床
  'P':                '#182030', // ショップ: 青い床
  'H':                '#252535',
  'C':                '#584a6e', // ひび割れ壁: 紫みがかった中間色
  'w':                '#1a3045', // 水: 青い床
  'l':                '#451800', // 溶岩: 赤い床
  'i':                '#183030', // 氷: シアンがかった床
  'X':                '#30155a', // ワープ: 紫い床
  'M':                '#15301a', // 磁場: 緑がかった床
};

/**
 * タイル文字列からスプライトキーを返す。
 * スプライトが存在しないタイルは null を返す。
 */
function tileToSpriteKey(tile: string): string | null {
  switch (tile) {
    case TILE_WALL:        return 'tile_wall';
    case TILE_FLOOR:       return 'tile_floor';
    case TILE_STAIRS_DOWN: return 'tile_stairs';
    case TILE_START:       return 'tile_floor';
    case TILE_LAVA:        return 'tile_lava';
    case TILE_ICE:         return 'tile_ice';
    case TILE_WARP:        return 'tile_warp';
    case TILE_TRAP:        return 'tile_trap';
    case TILE_HINT:        return 'tile_hint';
    case TILE_SHOP:        return 'tile_shop';
    default:               return 'tile_floor'; // 通行可能タイルは床にフォールバック
  }
}

// ---------------------------------------------------------------------------
// メイン描画関数
// ---------------------------------------------------------------------------

/**
 * タイルフラッシュエフェクトのエントリ。
 * key: "x,y"、value: 色文字列と有効期限 (performance.now() ベース)。
 */
export type FlashMap = Map<string, { color: string; expiry: number }>;

/** 画面全体のフラッシュ */
export interface ScreenFlash {
  color: string;
  expiry: number;
  duration: number;
}

/**
 * ゲーム全体を Canvas に描画する。
 *
 * 描画順序（下から上へ）:
 * 1. 背景（黒で塗りつぶし）
 * 2. タイル層（isExplored のタイルを描画、isVisible でない場合はグレーオーバーレイ）
 * 2.5. フラッシュエフェクト（タイル上に色付き矩形を重ねる）
 * 3. 敵（isVisible なマスのみ）
 * 4. プレイヤー
 *
 * @param ctx - Canvas 2D コンテキスト
 * @param state - 現在のゲーム状態
 * @param viewport - ビューポート設定
 * @param sprites - スプライトキャッシュ
 * @param animFrame - アニメーションフレーム（0 または 1）
 * @param flashMap - タイルフラッシュエフェクトマップ（省略可）
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport: Viewport,
  sprites: SpriteCache,
  animFrame: number,
  flashMap?: FlashMap,
  screenFlash?: ScreenFlash | null,
): void {
  const { tilesX, tilesY, tileSize, centerX, centerY } = viewport;
  const canvasWidth  = tilesX * tileSize;
  const canvasHeight = tilesY * tileSize;

  // ─── 1. 背景塗りつぶし ────────────────────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (state.phase !== 'exploring' || state.map === null || state.player === null) {
    return;
  }

  const map    = state.map;
  const player = state.player;

  // ビューポートの左上タイル座標（フロア座標系）
  const halfX = Math.floor(tilesX / 2);
  const halfY = Math.floor(tilesY / 2);
  const startTileX = centerX - halfX;
  const startTileY = centerY - halfY;

  // ─── 2. タイル層 ─────────────────────────────────────────────────────
  for (let screenY = 0; screenY < tilesY; screenY++) {
    for (let screenX = 0; screenX < tilesX; screenX++) {
      const mapX = startTileX + screenX;
      const mapY = startTileY + screenY;

      // マップ範囲外は黒のまま
      if (mapX < 0 || mapX >= map.width || mapY < 0 || mapY >= map.height) {
        continue;
      }

      const cell = map.cells[mapY][mapX];

      // 未探索タイルは描画しない
      if (!cell.isExplored) {
        continue;
      }

      const drawX = screenX * tileSize;
      const drawY = screenY * tileSize;

      // タイル描画（スプライト優先、なければ色ベタ塗り）
      const spriteKey = tileToSpriteKey(cell.tile);
      const sprite    = spriteKey ? sprites.get(spriteKey) : undefined;

      if (sprite) {
        ctx.drawImage(sprite, drawX, drawY, tileSize, tileSize);
      } else {
        const color = TILE_FALLBACK_COLORS[cell.tile] ?? '#0a0a0a';
        ctx.fillStyle = color;
        ctx.fillRect(drawX, drawY, tileSize, tileSize);
      }

      // 壁タイル: 上辺にハイライトを追加して立体感・区別を強化
      if (cell.tile === TILE_WALL) {
        ctx.strokeStyle = '#6a6a7e';
        ctx.lineWidth = 1;
        ctx.strokeRect(drawX + 0.5, drawY + 0.5, tileSize - 1, tileSize - 1);
        // 上辺ハイライト（光が上から当たる演出）
        ctx.fillStyle = '#7a7a90';
        ctx.fillRect(drawX, drawY, tileSize, 2);
      }

      // 階段タイルに特別な表示を追加（常に表示）
      if (cell.tile === TILE_STAIRS_DOWN) {
        if (!sprite) {
          ctx.fillStyle = '#554400';
          ctx.fillRect(drawX, drawY, tileSize, tileSize);
        }
        ctx.fillStyle = '#ffdd00';
        ctx.font = `bold ${tileSize * 0.65}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('▼', drawX + tileSize / 2, drawY + tileSize / 2);
      }

      // アイテムタイル: 緑の★マーク
      if (cell.tile === TILE_ITEM) {
        ctx.fillStyle = '#44ff44';
        ctx.font = `bold ${Math.max(8, tileSize * 0.55)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', drawX + tileSize / 2, drawY + tileSize / 2);
      }

      // ゴールドタイル: 黄色の$マーク
      if (cell.tile === TILE_GOLD) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = `bold ${Math.max(8, tileSize * 0.55)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', drawX + tileSize / 2, drawY + tileSize / 2);
      }

      // 武器タイル: 青紫の↑マーク（剣のシルエット）
      if (cell.tile === TILE_WEAPON) {
        ctx.fillStyle = '#aa88ff';
        ctx.font = `bold ${Math.max(8, tileSize * 0.6)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚔', drawX + tileSize / 2, drawY + tileSize / 2);
      }

      // 視界外オーバーレイ（探索済みだが視野外）: 壁は薄め、床は中程度（#011: 透過率を下げ全体を明るく）
      if (!cell.isVisible) {
        const alpha = cell.tile === TILE_WALL ? 0.30 : 0.55;
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(drawX, drawY, tileSize, tileSize);
      }
    }
  }

  // ─── 2.5. フラッシュエフェクト描画 ──────────────────────────────────────
  // 攻撃・被弾・アイテム使用などのイベント時に対象タイルへ色付き矩形を重ねる。
  // 期限切れエントリはここで flashMap から削除する。
  if (flashMap && flashMap.size > 0) {
    const now = performance.now();
    for (const [key, flash] of flashMap) {
      if (now > flash.expiry) {
        flashMap.delete(key);
        continue;
      }
      const [fx, fy] = key.split(',').map(Number);
      // ビューポート範囲内かチェック
      const fScreenX = fx - startTileX;
      const fScreenY = fy - startTileY;
      if (fScreenX < 0 || fScreenX >= tilesX || fScreenY < 0 || fScreenY >= tilesY) {
        continue;
      }
      const fDrawX = fScreenX * tileSize;
      const fDrawY = fScreenY * tileSize;
      ctx.fillStyle = flash.color;
      ctx.fillRect(fDrawX, fDrawY, tileSize, tileSize);
    }
  }

  // ─── 2.6. ショップNPC描画（TILE_SHOP の可視タイルにスプライトを重ねる） ─
  const shopNpcSprite = sprites.get('npc_shop_npc');
  if (shopNpcSprite) {
    for (let screenY = 0; screenY < tilesY; screenY++) {
      for (let screenX = 0; screenX < tilesX; screenX++) {
        const mapX = startTileX + screenX;
        const mapY = startTileY + screenY;
        if (mapX < 0 || mapX >= map.width || mapY < 0 || mapY >= map.height) continue;
        const cell = map.cells[mapY][mapX];
        if (!cell.isExplored || !cell.isVisible) continue;
        if (cell.tile !== TILE_SHOP) continue;
        const drawX = screenX * tileSize;
        const drawY = screenY * tileSize;
        // タイルより 50% 大きく描画（タイル中央に合わせてオフセット）
        const drawSize = tileSize * 1.5;
        const offset   = (drawSize - tileSize) / 2;
        ctx.drawImage(shopNpcSprite, drawX - offset, drawY - offset, drawSize, drawSize);
      }
    }
  }

  // ─── 3. 敵描画（isVisible なマスのみ） ──────────────────────────────
  for (const enemy of state.enemies) {
    const mapX = enemy.pos.x;
    const mapY = enemy.pos.y;

    // ビューポート内かチェック
    const screenX = mapX - startTileX;
    const screenY = mapY - startTileY;
    if (screenX < 0 || screenX >= tilesX || screenY < 0 || screenY >= tilesY) {
      continue;
    }

    // 視界内かチェック
    const cell = map.cells[mapY][mapX];
    if (!cell.isVisible) {
      continue;
    }

    const drawX = screenX * tileSize;
    const drawY = screenY * tileSize;

    // 敵 animState に応じたスプライトキーを選択
    const enemyType  = enemy.enemyType;
    const enemyAnim  = enemy.animState ?? 'idle';
    const enemyDir   = enemy.facing ?? 'down';
    let enemySprite: HTMLImageElement | undefined;

    if (enemyAnim === 'attack') {
      // 方向別 attack フレームを試みる（ボス向け atk も確認）
      enemySprite =
        sprites.get(`${enemyType}_dir_${enemyDir}_atk_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_${enemyDir}_attack_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_down_atk_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_down_attack_${animFrame}`) ??
        sprites.get(`${enemyType}_attack_${animFrame}`) ??
        sprites.get(`${enemyType}_attack_0`) ??
        sprites.get(`${enemyType}_${animFrame}`);
    } else if (enemyAnim === 'hit') {
      // 方向別 hit/dmg フレームを試みる（ボス向け dmg も確認）
      enemySprite =
        sprites.get(`${enemyType}_dir_${enemyDir}_dmg_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_${enemyDir}_hit_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_down_dmg_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_down_hit_${animFrame}`) ??
        sprites.get(`${enemyType}_hit_${animFrame}`) ??
        sprites.get(`${enemyType}_hit_0`) ??
        sprites.get(`${enemyType}_${animFrame}`);
    } else if (enemyAnim === 'move') {
      // 移動（方向対応）
      enemySprite =
        sprites.get(`${enemyType}_dir_${enemyDir}_move_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_down_move_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_${enemyDir}_idle_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_down_idle_${animFrame}`) ??
        sprites.get(`${enemyType}_${animFrame}`);
    } else {
      // idle / その他: 方向対応を優先
      enemySprite =
        sprites.get(`${enemyType}_dir_${enemyDir}_idle_${animFrame}`) ??
        sprites.get(`${enemyType}_dir_down_idle_${animFrame}`) ??
        sprites.get(`${enemyType}_${animFrame}`);
    }

    const isBoss = enemy.isBoss === true;

    if (isBoss) {
      // ボス: 発光エフェクト設定
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff4400';
    }

    if (enemySprite) {
      if (isBoss) {
        // ボス: bossSize タイル×bossSize タイルの大きさで中心基準描画
        const bossTileCount = enemy.bossSize ?? 2;
        const bossDrawSize = tileSize * bossTileCount;
        const bossOffset   = (bossDrawSize - tileSize) / 2;
        ctx.drawImage(enemySprite, drawX - bossOffset, drawY - bossOffset, bossDrawSize, bossDrawSize);
      } else {
        // 通常敵: tileSize × 1.2 で中央描画
        const normalDrawSize = tileSize * 1.2;
        const normalOffset   = (normalDrawSize - tileSize) / 2;
        ctx.drawImage(enemySprite, drawX - normalOffset, drawY - normalOffset, normalDrawSize, normalDrawSize);
      }
      // hit 状態のとき赤フラッシュオーバーレイを重ねる
      if (enemyAnim === 'hit') {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 34, 0, 0.45)';
        ctx.fillRect(drawX, drawY, tileSize, tileSize);
      }
    } else {
      // フォールバック: 赤の丸（視認しやすい）
      const cx = drawX + tileSize / 2;
      const cy = drawY + tileSize / 2;
      const r  = isBoss ? tileSize * (enemy.bossSize ?? 2) * 0.35 : tileSize * 0.38;
      ctx.fillStyle = enemyAnim === 'hit' ? '#ff4422' : (isBoss ? '#ff2200' : '#dd1111');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // 敵マーク
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(8, isBoss ? tileSize * 0.6 : tileSize * 0.4)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isBoss ? 'B' : 'E', cx, cy);
    }

    if (isBoss) {
      // ボス: 発光エフェクトをリセット
      ctx.shadowBlur = 0;
    }

    // 敵HPバー（視認性向上）
    const hpRatio = enemy.hp / enemy.maxHp;
    const barW    = tileSize - 2;
    const barH    = Math.max(3, Math.floor(tileSize * 0.12));
    const barX    = drawX + 1;
    const barY    = drawY + 1;

    ctx.fillStyle = '#440000';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : hpRatio > 0.25 ? '#ffcc00' : '#ff4444';
    ctx.fillRect(barX, barY, Math.floor(barW * hpRatio), barH);
  }

  // ─── 4. プレイヤー描画 ───────────────────────────────────────────────
  const playerScreenX = player.pos.x - startTileX;
  const playerScreenY = player.pos.y - startTileY;

  if (
    playerScreenX >= 0 && playerScreenX < tilesX &&
    playerScreenY >= 0 && playerScreenY < tilesY
  ) {
    const drawX = playerScreenX * tileSize;
    const drawY = playerScreenY * tileSize;

    // animState と向きに対応したスプライトキーを選択
    const stateKey  = (player.animState === 'attack')     ? 'attack'    :
                      (player.animState === 'hit')        ? 'hit'       :
                      (player.animState === 'move')       ? 'move'      :
                      (player.animState === 'item_use')   ? 'item_use'  :
                      (player.animState === 'near_death') ? 'near_death' : 'idle';
    const facingKey = player.facing ?? 'down';
    const playerSprite =
      sprites.get(`player_${stateKey}_${facingKey}_${animFrame}`) ??
      sprites.get(`player_${stateKey}_${animFrame}`) ??
      sprites.get(`player_idle_${facingKey}_${animFrame}`) ??
      sprites.get(`player_idle_${animFrame}`);

    if (playerSprite) {
      // タイルより 50% 大きく描画（タイル中央に合わせてオフセット）
      const drawSize = tileSize * 1.5;
      const offset   = (drawSize - tileSize) / 2;
      ctx.drawImage(playerSprite, drawX - offset, drawY - offset, drawSize, drawSize);
    }
  }

  // ─── 5. 画面全体のフラッシュ ───────────────────────────────────────────
  if (screenFlash) {
    const now = performance.now();
    if (now <= screenFlash.expiry) {
      const elapsed = screenFlash.duration - (screenFlash.expiry - now);
      const alpha = 1 - elapsed / screenFlash.duration;
      ctx.save();
      ctx.fillStyle = screenFlash.color;
      ctx.globalAlpha = Math.min(0.5, alpha * 0.5); 
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.restore();
    }
  }
}
