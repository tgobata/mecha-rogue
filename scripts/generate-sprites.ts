/**
 * @fileoverview メカローグ スプライト生成スクリプト
 *
 * Node.js の sharp ライブラリを使って RGBA ピクセルバッファから
 * PNG スプライトを生成し、メタデータ JSON を出力する。
 *
 * 実行: node --experimental-strip-types scripts/generate-sprites.ts
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** タイルの基本サイズ（px） */
const TILE_SIZE = 32;

/** ボスのサイズ（px） */
const BOSS_SIZE = 64;

/** プロジェクトルート（このスクリプトの1階層上） */
const PROJECT_ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

/** スプライト出力ルート */
const SPRITES_DIR = path.join(PROJECT_ROOT, 'public', 'sprites');

/** メタデータ出力先 */
const META_PATH = path.join(PROJECT_ROOT, 'src', 'game', 'assets', 'data', 'sprites.json');

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** RGBA ピクセル（各チャンネル 0-255） */
interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** スプライトフレーム情報 */
interface SpriteFrame {
  file: string;
  width: number;
  height: number;
}

/** スプライトメタデータ */
interface SpriteMeta {
  tiles: Record<string, SpriteFrame>;
  player: Record<string, SpriteFrame[]>;
  enemies: Record<string, SpriteFrame[]>;
  weapons: Record<string, SpriteFrame>;
  items: Record<string, SpriteFrame>;
  effects: Record<string, SpriteFrame[]>;
  ui: Record<string, SpriteFrame>;
  npc: Record<string, SpriteFrame>;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 16進カラー文字列を RGBA に変換する。
 * @param hex - "#rrggbb" 形式
 * @param alpha - アルファ値（0-255）
 */
function hexToRGBA(hex: string, alpha = 255): RGBA {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: alpha,
  };
}

/**
 * 空の RGBA バッファ（全透明）を作成する。
 */
function createBuffer(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * 4);
}

/**
 * バッファの特定ピクセルに色を書き込む。
 */
function setPixel(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: RGBA,
): void {
  if (x < 0 || x >= width || y < 0 || y >= Math.floor(buf.length / width / 4)) return;
  const idx = (y * width + x) * 4;
  buf[idx]     = color.r;
  buf[idx + 1] = color.g;
  buf[idx + 2] = color.b;
  buf[idx + 3] = color.a;
}

/**
 * バッファに矩形を塗りつぶす。
 */
function fillRect(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGBA,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(buf, width, x + dx, y + dy, color);
    }
  }
}

/**
 * バッファに水平線を引く。
 */
function hLine(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  len: number,
  color: RGBA,
): void {
  for (let i = 0; i < len; i++) setPixel(buf, width, x + i, y, color);
}

/**
 * バッファに垂直線を引く。
 */
function vLine(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  len: number,
  color: RGBA,
): void {
  for (let i = 0; i < len; i++) setPixel(buf, width, x, y + i, color);
}

/**
 * バッファ全体を単色で塗りつぶす。
 */
function clearBuffer(buf: Uint8Array, width: number, height: number, color: RGBA): void {
  fillRect(buf, width, 0, 0, width, height, color);
}

/**
 * PNG ファイルを sharp 経由で保存する。
 */
async function savePNG(
  buf: Uint8Array,
  width: number,
  height: number,
  filePath: string,
): Promise<void> {
  await sharp(Buffer.from(buf), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(filePath);
}

/**
 * ディレクトリを再帰的に作成する（存在する場合はスキップ）。
 */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// タイルスプライト生成
// ---------------------------------------------------------------------------

/**
 * 壁タイル（wall.png）を生成する。
 * ダークグレー背景にレンガ調の格子パターン。
 */
async function generateWallTile(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);
  const bg     = hexToRGBA('#2a2a2a');
  const mortar = hexToRGBA('#444444');
  const light  = hexToRGBA('#525252');
  const shadow = hexToRGBA('#1e1e1e');

  clearBuffer(buf, S, S, bg);

  // レンガの行高さ: 8px。行ごとにオフセットを交互にする。
  const brickH = 8;
  const brickW = 16;

  for (let row = 0; row < S / brickH; row++) {
    const y = row * brickH;
    const offset = (row % 2 === 0) ? 0 : brickW / 2;

    // 水平目地
    hLine(buf, S, 0, y, S, mortar);

    // 垂直目地
    for (let bx = offset; bx < S + brickW; bx += brickW) {
      vLine(buf, S, bx % S, y + 1, brickH - 1, mortar);
    }

    // レンガ本体（各ブロックに微妙なハイライトと影）
    for (let bx = offset - brickW; bx < S; bx += brickW) {
      const bxClamped = Math.max(bx, 0);
      const bw = Math.min(bx + brickW - 1, S - 1) - bxClamped;
      if (bw <= 0) continue;
      // 上部ハイライト
      hLine(buf, S, bxClamped + 1, y + 1, bw - 1, light);
      // 下部影
      hLine(buf, S, bxClamped + 1, y + brickH - 2, bw - 1, shadow);
    }
  }

  // ランダムノイズ（固定シード相当の擬似ノイズ）
  let seed = 42;
  for (let i = 0; i < 60; i++) {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const nx = seed % S;
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const ny = seed % S;
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const nv = 30 + (seed % 20);
    setPixel(buf, S, nx, ny, { r: nv, g: nv, b: nv, a: 255 });
  }

  const file = path.join(outDir, 'wall.png');
  await savePNG(buf, S, S, file);
  console.log('  Generated:', file);
  return { file: 'public/sprites/tiles/wall.png', width: S, height: S };
}

/**
 * 通路タイル（floor.png）を生成する。
 * 暗いグレー背景に金属床パネル感。
 */
async function generateFloorTile(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);
  const bg        = hexToRGBA('#1a1a1a');
  const grid      = hexToRGBA('#2d2d2d');
  const highlight = hexToRGBA('#252525');

  clearBuffer(buf, S, S, bg);

  // 8px 格子の点
  for (let y = 0; y < S; y += 8) {
    for (let x = 0; x < S; x += 8) {
      setPixel(buf, S, x, y, grid);
    }
  }

  // 中央付近のわずかなハイライト（半径 8px の円形グラデーション）
  const cx = S / 2;
  const cy = S / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist < 8) {
        const intensity = Math.floor((1 - dist / 8) * 10);
        const v = 26 + intensity;
        const existing_r = buf[(y * S + x) * 4];
        if (existing_r < v) {
          setPixel(buf, S, x, y, { r: v, g: v, b: v, a: 255 });
        }
      }
    }
  }

  // パネルの境界線（4分割）
  hLine(buf, S, 0, 0, S, highlight);
  hLine(buf, S, 0, S - 1, S, highlight);
  vLine(buf, S, 0, 0, S, highlight);
  vLine(buf, S, S - 1, 0, S, highlight);

  const file = path.join(outDir, 'floor.png');
  await savePNG(buf, S, S, file);
  console.log('  Generated:', file);
  return { file: 'public/sprites/tiles/floor.png', width: S, height: S };
}

/**
 * 階段タイル（stairs.png）を生成する。
 * 3段の俯瞰視点階段をピクセルアートで描画。
 * 各段は上面（明るい灰青）＋前面（中間）＋影（右端・下端）で立体感を表現。
 */
async function generateStairsTile(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  const bg       = hexToRGBA('#0a0e14');
  const stepTop1 = hexToRGBA('#c8eeff');
  const stepTop2 = hexToRGBA('#a0d4f0');
  const stepFace = hexToRGBA('#6699bb');
  const shadow   = hexToRGBA('#223344');
  const border   = hexToRGBA('#ffffff');
  const glow     = hexToRGBA('#ffffff');

  // 背景
  clearBuffer(buf, S, S, bg);

  // === Step 3（一番奥・上）===
  // 上面
  fillRect(buf, S, 10, 5, 12, 3, stepTop1);
  // 上端ハイライト
  hLine(buf, S, 10, 5, 12, glow);
  // 前面
  fillRect(buf, S, 10, 8, 12, 2, stepFace);
  // 右側影
  vLine(buf, S, 22, 5, 5, shadow);
  // 左端縦ライン
  vLine(buf, S, 10, 5, 3, shadow);

  // === Step 2（中間）===
  // 上面
  fillRect(buf, S, 7, 10, 15, 3, stepTop1);
  // 上端ハイライト
  hLine(buf, S, 7, 10, 15, glow);
  // 前面
  fillRect(buf, S, 7, 13, 15, 2, stepFace);
  // 右側影
  vLine(buf, S, 22, 10, 5, shadow);
  // 左端縦ライン
  vLine(buf, S, 7, 10, 3, shadow);

  // === Step 1（一番手前・下）===
  // 上面（stepTop2 で少し暗め）
  fillRect(buf, S, 4, 15, 18, 3, stepTop2);
  // 上端ハイライト
  hLine(buf, S, 4, 15, 18, glow);
  // 前面
  fillRect(buf, S, 4, 18, 18, 3, stepFace);
  // 右側影
  vLine(buf, S, 22, 15, 6, shadow);
  // 左端縦ライン
  vLine(buf, S, 4, 15, 3, shadow);

  // === 最前面の下の落ち影 ===
  fillRect(buf, S, 4, 21, 18, 2, shadow);

  // === エッジボーダー（各段の左上コーナーに border 色でコーナー強調）===
  setPixel(buf, S, 10, 5, border);
  setPixel(buf, S, 7, 10, border);
  setPixel(buf, S, 4, 15, border);

  const file = path.join(outDir, 'stairs.png');
  await savePNG(buf, S, S, file);
  console.log('  Generated:', file);
  return { file: 'public/sprites/tiles/stairs.png', width: S, height: S };
}

/**
 * 溶岩タイル（lava.png）を生成する。
 */
async function generateLavaTile(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);
  const bg = hexToRGBA('#ff4400');
  const hot = hexToRGBA('#ff8800');
  const bright = hexToRGBA('#ffff00');

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = Math.random();
      if (v < 0.1) setPixel(buf, S, x, y, bright);
      else if (v < 0.4) setPixel(buf, S, x, y, hot);
      else setPixel(buf, S, x, y, bg);
    }
  }
  const file = path.join(outDir, 'lava.png');
  await savePNG(buf, S, S, file);
  return { file: 'public/sprites/tiles/lava.png', width: S, height: S };
}

/**
 * 氷タイル（ice.png）を生成する。
 */
async function generateIceTile(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);
  const bg = hexToRGBA('#aaddff');
  const light = hexToRGBA('#ffffff', 180);
  const dark = hexToRGBA('#88bbdd');

  clearBuffer(buf, S, S, bg);
  for (let i = 0; i < 5; i++) {
    const y = 4 + i * 6;
    hLine(buf, S, 0, y, S, light);
    hLine(buf, S, 0, y+1, S, dark);
  }
  const file = path.join(outDir, 'ice.png');
  await savePNG(buf, S, S, file);
  return { file: 'public/sprites/tiles/ice.png', width: S, height: S };
}

/**
 * ワープタイル（warp.png）を生成する。
 */
async function generateWarpTile(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);
  const bg = hexToRGBA('#1a1a1a');
  const p1 = hexToRGBA('#cc44ff');
  const p2 = hexToRGBA('#44ffff');
  clearBuffer(buf, S, S, bg);
  const cx = 16, cy = 16;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dist = Math.sqrt((x-cx)**2 + (y-cy)**2);
      if (dist < 4) setPixel(buf, S, x, y, p2);
      else if (dist > 6 && dist < 8) setPixel(buf, S, x, y, p1);
      else if (dist > 10 && dist < 12) setPixel(buf, S, x, y, p2);
      else if (dist > 14 && dist < 15) setPixel(buf, S, x, y, p1);
    }
  }
  const file = path.join(outDir, 'warp.png');
  await savePNG(buf, S, S, file);
  return { file: 'public/sprites/tiles/warp.png', width: S, height: S };
}

/**
 * 罠タイル（trap.png）を生成する。
 * シグナル発信機デザイン（WiFiアンテナ型センサー罠）。
 * 警告色（黄・オレンジ・赤）。
 */
async function generateTrapTile(outDir: string): Promise<SpriteFrame> {
  const S      = TILE_SIZE; // 32
  const buf    = createBuffer(S, S);
  const bg     = hexToRGBA('#111111');
  const yellow = hexToRGBA('#aa8833');
  const orange = hexToRGBA('#885522');
  const red    = hexToRGBA('#773322');
  const redDot = hexToRGBA('#882222');
  const darkOg = hexToRGBA('#553311');

  // 背景
  clearBuffer(buf, S, S, bg);

  // デバイス本体: x=7..24 (18px幅), y=23..28 (6px高)
  fillRect(buf, S, 7, 23, 18, 6, orange);
  hLine(buf, S, 7, 23, 18, yellow);   // 上端ハイライト
  hLine(buf, S, 7, 28, 18, darkOg);  // 下端影
  vLine(buf, S, 7,  23, 6, yellow);   // 左端
  vLine(buf, S, 24, 23, 6, yellow);   // 右端

  // 信号発信点（デバイス上部中央、小突起）
  fillRect(buf, S, 15, 21, 3, 2, yellow);

  // インジケータドット（赤 × 2）
  fillRect(buf, S,  9, 25, 2, 2, redDot);
  fillRect(buf, S, 13, 25, 2, 2, redDot);

  // シグナルアーク（上半円）アーク中心 = デバイス上端中央
  const cx = 16, cy = 23;

  // 小アーク (r=4) 黄色
  for (let deg = 30; deg <= 150; deg += 3) {
    const rad = deg * Math.PI / 180;
    const x = Math.round(cx + 4 * Math.cos(rad));
    const y = Math.round(cy - 4 * Math.sin(rad));
    setPixel(buf, S, x, y, yellow);
  }

  // 中アーク (r=8) オレンジ
  for (let deg = 30; deg <= 150; deg += 2) {
    const rad = deg * Math.PI / 180;
    const x = Math.round(cx + 8 * Math.cos(rad));
    const y = Math.round(cy - 8 * Math.sin(rad));
    setPixel(buf, S, x, y, orange);
  }

  // 大アーク (r=13) 赤
  for (let deg = 25; deg <= 155; deg += 2) {
    const rad = deg * Math.PI / 180;
    const x = Math.round(cx + 13 * Math.cos(rad));
    const y = Math.round(cy - 13 * Math.sin(rad));
    setPixel(buf, S, x, y, red);
  }

  const file = path.join(outDir, 'trap.png');
  await savePNG(buf, S, S, file);
  return { file: 'public/sprites/tiles/trap.png', width: S, height: S };
}

/**
 * ヒント石碑（hint.png）を生成する。
 */
async function generateHintTile(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);
  const bg = hexToRGBA('#1a1a1a');
  clearBuffer(buf, S, S, bg);
  const stone = hexToRGBA('#555555');
  const rune = hexToRGBA('#00ffbb');
  fillRect(buf, S, 8, 4, 16, 24, stone);
  setPixel(buf, S, 12, 8, rune); setPixel(buf, S, 15, 8, rune);
  setPixel(buf, S, 13, 10, rune); setPixel(buf, S, 14, 10, rune);
  hLine(buf, S, 12, 14, 4, rune);
  setPixel(buf, S, 12, 18, rune); setPixel(buf, S, 15, 18, rune);
  const file = path.join(outDir, 'hint.png');
  await savePNG(buf, S, S, file);
  return { file: 'public/sprites/tiles/hint.png', width: S, height: S };
}

/**
 * ショップフロアタイル（shop.png）を生成する。
 * ネオン線画スタイル: 暗いネイビー背景、シアン1px枠線、中央に「店」文字（赤）。
 * SVGテキストレンダリングを使用して実際の「店」文字を描画する。
 */
async function generateShopTile(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const svg = `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${S}" height="${S}" fill="#071428"/>
    <rect x="0" y="0" width="${S}" height="1" fill="#00f0ff"/>
    <rect x="0" y="${S - 1}" width="${S}" height="1" fill="#00f0ff"/>
    <rect x="0" y="0" width="1" height="${S}" fill="#00f0ff"/>
    <rect x="${S - 1}" y="0" width="1" height="${S}" fill="#00f0ff"/>
    <text x="${S / 2}" y="${S / 2 + 1}" font-family="serif" font-size="20" font-weight="bold"
          fill="#ff4444" text-anchor="middle" dominant-baseline="middle">店</text>
  </svg>`;
  const file = path.join(outDir, 'shop.png');
  await sharp(Buffer.from(svg)).png().toFile(file);
  console.log('  Generated:', file);
  return { file: 'public/sprites/tiles/shop.png', width: S, height: S };
}

/**
 * タイルスプライト群を生成する。
 */
async function generateTileSprites(meta: SpriteMeta): Promise<void> {
  console.log('\n[Tiles]');
  const outDir = path.join(SPRITES_DIR, 'tiles');
  ensureDir(outDir);

  meta.tiles['wall']   = await generateWallTile(outDir);
  meta.tiles['floor']  = await generateFloorTile(outDir);
  meta.tiles['stairs'] = await generateStairsTile(outDir);
  meta.tiles['lava']   = await generateLavaTile(outDir);
  meta.tiles['ice']    = await generateIceTile(outDir);
  meta.tiles['warp']   = await generateWarpTile(outDir);
  meta.tiles['trap']   = await generateTrapTile(outDir);
  meta.tiles['hint']   = await generateHintTile(outDir);
  meta.tiles['shop']   = await generateShopTile(outDir);
}

// ---------------------------------------------------------------------------
// プレイヤースプライト生成
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// アルファベット文字モチーフ プレイヤースプライト
// ---------------------------------------------------------------------------

/** プレイヤーの文字バリアント */
type PlayerLetter = 'H' | 'D' | 'A' | 'B' | 'S' | 'F';

/** 文字ごとのパレット定義 */
interface LetterPalette {
  main: RGBA;
  mid: RGBA;
  dark: RGBA;
  edge: RGBA;
  accent: RGBA;
  sensor: RGBA;
  core: RGBA;
}

/** 各文字のパレットを返す */
function getLetterPalette(letter: PlayerLetter): LetterPalette {
  switch (letter) {
    case 'H':
      return {
        main:   hexToRGBA('#0a1e2e'),  // ダークネイビー（カバー#0d2a3aに近い）
        mid:    hexToRGBA('#0f2d42'),  // 少し明るいダーク
        dark:   hexToRGBA('#061218'),  // 影色
        edge:   hexToRGBA('#00e5ff'),  // シアンアウトライン（カバー完全一致）
        accent: hexToRGBA('#00b4cc'),  // 薄めシアン（背中パネル等）
        sensor: hexToRGBA('#ff3333'),  // 赤い目（カバー完全一致）
        core:   hexToRGBA('#00e5ff'),  // シアンコア
      };
    case 'D':
      return {
        main:   hexToRGBA('#5588aa'),
        mid:    hexToRGBA('#3a6680'),
        dark:   hexToRGBA('#1a3a55'),
        edge:   hexToRGBA('#ccddee'),
        accent: hexToRGBA('#ff4444'),
        sensor: hexToRGBA('#ff3333'),
        core:   hexToRGBA('#ff5555'),
      };
    case 'A':
      return {
        main:   hexToRGBA('#ff2200'),
        mid:    hexToRGBA('#ff8800'),
        dark:   hexToRGBA('#cc2200'),
        edge:   hexToRGBA('#ffffff'),
        accent: hexToRGBA('#ffdd00'),
        sensor: hexToRGBA('#ffaa00'),
        core:   hexToRGBA('#ffdd00'),
      };
    case 'B':
      return {
        main:   hexToRGBA('#0044ff'),
        mid:    hexToRGBA('#2266dd'),
        dark:   hexToRGBA('#002299'),
        edge:   hexToRGBA('#aabbff'),
        accent: hexToRGBA('#8800cc'),
        sensor: hexToRGBA('#aa44ff'),
        core:   hexToRGBA('#aabbff'),
      };
    case 'S':
      return {
        main:   hexToRGBA('#ffdd00'),
        mid:    hexToRGBA('#00ff88'),
        dark:   hexToRGBA('#ccaa00'),
        edge:   hexToRGBA('#ffffff'),
        accent: hexToRGBA('#88ff00'),
        sensor: hexToRGBA('#00ff88'),
        core:   hexToRGBA('#88ff00'),
      };
    case 'F':
      return {
        main:   hexToRGBA('#ffd700'),  // ブライトゴールド（フルパワー）
        mid:    hexToRGBA('#ffee88'),  // 薄いゴールド
        dark:   hexToRGBA('#aa8800'),  // 深いゴールド（影）
        edge:   hexToRGBA('#ffffff'),  // 白エッジ
        accent: hexToRGBA('#ffffff'),  // 白フラッシュ
        sensor: hexToRGBA('#ff8800'),  // オレンジセンサー（最大エネルギー）
        core:   hexToRGBA('#ffffff'),  // 白コア（フル充電）
      };
  }
}

/** 方向ごとのシアーX量を返す（y座標ベース）*/
function dirShearX(y: number, dir: 'down' | 'up' | 'left' | 'right'): number {
  const cy = 16;
  if (dir === 'right') return Math.round((cy - y) * 0.5);
  if (dir === 'left')  return Math.round((y - cy) * 0.5);
  return 0;
}

/** シアー付きhLine（各行をシアーしながら水平線を描く）*/
function hLineS(buf: Uint8Array, S: number, x: number, y: number, w: number, c: RGBA, dir: 'down' | 'up' | 'left' | 'right'): void {
  hLine(buf, S, x + dirShearX(y, dir), y, w, c);
}

/** シアー付きfillRect（各行ごとにシアーを適用）*/
function fillRectS(buf: Uint8Array, S: number, x: number, y: number, w: number, h: number, c: RGBA, dir: 'down' | 'up' | 'left' | 'right'): void {
  for (let row = 0; row < h; row++) {
    hLine(buf, S, x + dirShearX(y + row, dir), y + row, w, c);
  }
}

/** シアー付きvLine（各ピクセルごとにシアーを適用）*/
function vLineS(buf: Uint8Array, S: number, x: number, y: number, len: number, c: RGBA, dir: 'down' | 'up' | 'left' | 'right'): void {
  for (let i = 0; i < len; i++) {
    setPixel(buf, S, x + dirShearX(y + i, dir), y + i, c);
  }
}

/** シアー付きsetPixel */
function setPixelS(buf: Uint8Array, S: number, x: number, y: number, c: RGBA, dir: 'down' | 'up' | 'left' | 'right'): void {
  setPixel(buf, S, x + dirShearX(y, dir), y, c);
}

/**
 * 大きな顔パーツを描画する（目x2 + 鼻 + 口）
 * @param faceX 顔中心X
 * @param faceY 顔中心Y（目の行）
 * @param eyeColor 目の色
 * @param noseColor 鼻の色
 * @param mouthColor 口の色
 */
function drawFace(
  buf: Uint8Array, S: number,
  faceX: number, faceY: number,
  eyeColor: RGBA, noseColor: RGBA, mouthColor: RGBA,
  dir: 'down' | 'up' | 'left' | 'right',
): void {
  // 左目: 3x2 ピクセル
  fillRectS(buf, S, faceX - 5, faceY, 3, 2, eyeColor, dir);
  // 右目: 3x2 ピクセル
  fillRectS(buf, S, faceX + 2, faceY, 3, 2, eyeColor, dir);
  // 鼻: 2x1 ピクセル（目の1px下）
  fillRectS(buf, S, faceX - 1, faceY + 2, 2, 1, noseColor, dir);
  // 口: 5x2 ピクセル（目の3px下）
  fillRectS(buf, S, faceX - 3, faceY + 3, 6, 2, mouthColor, dir);
}

/**
 * アウトライン（縁取り）を描画する汎用ヘルパー。
 * バッファ内の不透明ピクセルの隣接透明ピクセルに色を書き込む。
 */
function drawOutline(buf: Uint8Array, S: number, color: RGBA): void {
  const snapshot = new Uint8Array(buf);
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      const idx = (y * S + x) * 4;
      if (snapshot[idx + 3] > 0) {
        const neighbors = [
          snapshot[((y-1)*S+x)*4+3], snapshot[((y+1)*S+x)*4+3],
          snapshot[(y*S+x-1)*4+3],   snapshot[(y*S+x+1)*4+3],
        ];
        if (neighbors.some(a => a === 0)) {
          buf[idx]   = color.r;
          buf[idx+1] = color.g;
          buf[idx+2] = color.b;
          buf[idx+3] = color.a;
        }
      }
    }
  }
}

/**
 * バッファ全ピクセルに色を乗算オーバーレイする（不透明ピクセルのみ）。
 */
function tintBuffer(buf: Uint8Array, S: number, r: number, g: number, b: number): void {
  for (let i = 0; i < S * S * 4; i += 4) {
    if (buf[i + 3] > 0) {
      buf[i]   = Math.min(255, Math.floor(buf[i]   * r / 255));
      buf[i+1] = Math.min(255, Math.floor(buf[i+1] * g / 255));
      buf[i+2] = Math.min(255, Math.floor(buf[i+2] * b / 255));
    }
  }
}

/**
 * バッファ全ピクセルを指定色で塗りつぶす（不透明ピクセルのみ）。
 */
function flashBuffer(buf: Uint8Array, S: number, r: number, g: number, b: number): void {
  for (let i = 0; i < S * S * 4; i += 4) {
    if (buf[i + 3] > 0) {
      buf[i] = r; buf[i+1] = g; buf[i+2] = b;
    }
  }
}

/**
 * バッファを右方向にシフトする（ノックバック表現）。
 */
function shiftBufferRight(buf: Uint8Array, S: number, amount: number): void {
  for (let y = 0; y < S; y++) {
    for (let x = S - 1; x >= 0; x--) {
      const src = (y * S + x) * 4;
      const dx = Math.min(x + amount, S - 1);
      const dst = (y * S + dx) * 4;
      buf[dst]   = buf[src];   buf[dst+1] = buf[src+1];
      buf[dst+2] = buf[src+2]; buf[dst+3] = buf[src+3];
    }
    for (let x = 0; x < amount; x++) {
      const idx = (y * S + x) * 4;
      buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = 0;
    }
  }
}

/**
 * 攻撃エフェクト（インパクト衝撃波）を指定方向に描画する。
 */
function drawAttackEffect(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'up' | 'left' | 'right',
  frame: number,
  palette: LetterPalette,
): void {
  const W = hexToRGBA('#ffffff');
  const Y = hexToRGBA('#ffff00');
  const O = hexToRGBA('#ff8800');
  const P = palette.accent;

  if (frame === 0) {
    // チャージ: 白縁取り
    drawOutline(buf, S, W);
    // コアグロー
    const cx = 16, cy = 16;
    setPixel(buf, S, cx, cy, W);
    setPixel(buf, S, cx-1, cy, P);
    setPixel(buf, S, cx+1, cy, P);
    setPixel(buf, S, cx, cy-1, P);
    setPixel(buf, S, cx, cy+1, P);
    setPixel(buf, S, cx-2, cy, Y);
    setPixel(buf, S, cx+2, cy, Y);
    setPixel(buf, S, cx, cy-2, Y);
    setPixel(buf, S, cx, cy+2, Y);
    return;
  }

  if (frame === 1) {
    // インパクト: 文字色フラッシュ
    flashBuffer(buf, S, palette.main.r, Math.min(255, palette.main.g + 100), palette.main.b);
    // 方向別衝撃波
    let cx: number, cy: number;
    if (direction === 'down')  { cx = 16; cy = 29; }
    else if (direction === 'up')   { cx = 16; cy = 2; }
    else if (direction === 'left') { cx = 2;  cy = 16; }
    else                           { cx = 29; cy = 16; }
    setPixel(buf, S, cx, cy, W);
    setPixel(buf, S, cx-1, cy, W);
    setPixel(buf, S, cx+1, cy, W);
    setPixel(buf, S, cx, cy-1, W);
    setPixel(buf, S, cx, cy+1, W);
    const r2pts = direction === 'down' || direction === 'up'
      ? [[-2,0],[2,0],[0,1],[0,-1],[-1,1],[1,1],[-1,-1],[1,-1]]
      : [[0,-2],[0,2],[1,0],[-1,0],[1,-1],[1,1],[-1,-1],[-1,1]];
    for (const [dx, dy] of r2pts) setPixel(buf, S, cx+dx, cy+dy, Y);
    for (let r = 3; r <= 5; r++) {
      const spread = r - 2;
      for (let s = -spread; s <= spread; s++) {
        if (direction === 'down' || direction === 'up') {
          const sy2 = direction === 'down' ? cy + r - 3 : cy - r + 3;
          setPixel(buf, S, cx + s, sy2, r <= 4 ? Y : O);
        } else {
          const sx2 = direction === 'right' ? cx + r - 3 : cx - r + 3;
          setPixel(buf, S, sx2, cy + s, r <= 4 ? Y : O);
        }
      }
    }
    return;
  }

  if (frame === 2) {
    // 残光: 攻撃方向にシアンライン
    const cyan = hexToRGBA('#00ffff');
    const cyanD = hexToRGBA('#00cccc', 150);
    for (let i = 0; i < 6; i++) {
      const alpha = Math.max(0, 200 - i * 33);
      if (direction === 'down') {
        setPixel(buf, S, 15, S - 1 - i, hexToRGBA('#00ffff', alpha));
        setPixel(buf, S, 16, S - 1 - i, hexToRGBA('#00ffff', alpha));
        if (i > 0) {
          setPixel(buf, S, 14, S - 1 - i, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
          setPixel(buf, S, 17, S - 1 - i, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
        }
      } else if (direction === 'up') {
        setPixel(buf, S, 15, i, hexToRGBA('#00ffff', alpha));
        setPixel(buf, S, 16, i, hexToRGBA('#00ffff', alpha));
        if (i > 0) {
          setPixel(buf, S, 14, i, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
          setPixel(buf, S, 17, i, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
        }
      } else if (direction === 'left') {
        setPixel(buf, S, i, 15, hexToRGBA('#00ffff', alpha));
        setPixel(buf, S, i, 16, hexToRGBA('#00ffff', alpha));
        if (i > 0) {
          setPixel(buf, S, i, 14, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
          setPixel(buf, S, i, 17, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
        }
      } else {
        setPixel(buf, S, S - 1 - i, 15, hexToRGBA('#00ffff', alpha));
        setPixel(buf, S, S - 1 - i, 16, hexToRGBA('#00ffff', alpha));
        if (i > 0) {
          setPixel(buf, S, S - 1 - i, 14, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
          setPixel(buf, S, S - 1 - i, 17, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
        }
      }
    }
    // suppress unused warnings
    void cyan; void cyanD;
  }
}

/**
 * 被ダメエフェクトを描画する。
 */
function drawHitEffect(buf: Uint8Array, S: number, frame: number, palette: LetterPalette): void {
  const Y = hexToRGBA('#ffff00');
  const O = hexToRGBA('#ff8800');

  if (frame === 0) {
    // 白フラッシュ + 右ノックバック
    shiftBufferRight(buf, S, 2);
    flashBuffer(buf, S, 255, 230, 230);
    // スパーク
    const sparks = [[7,10],[22,9],[6,17],[25,15],[9,22],[23,21],[14,8],[17,25],[4,14],[28,13]];
    for (const [sx, sy] of sparks) {
      setPixel(buf, S, sx, sy, hexToRGBA('#ffffff'));
      setPixel(buf, S, sx+1, sy, Y);
      setPixel(buf, S, sx, sy+1, Y);
    }
    [[8,11],[21,10],[7,18],[24,16],[10,23],[22,22]].forEach(([sx,sy]) =>
      setPixel(buf, S, sx, sy, O));
  } else {
    // 赤塗り + 亀裂
    flashBuffer(buf, S, 255, 34, 34);
    const crack = [[12,13],[13,13],[13,14],[14,14],[14,15],[15,15],[15,16],[16,16],[17,15],[18,14],[18,15],[19,15]];
    for (const [cx, cy] of crack) {
      setPixel(buf, S, cx, cy, hexToRGBA('#ff6600'));
      setPixel(buf, S, cx+1, cy, hexToRGBA('#ffaa00'));
    }
    [[9,12],[20,11],[7,19],[24,18],[11,23],[22,22],[15,9],[17,26]].forEach(([sx,sy]) => {
      setPixel(buf, S, sx, sy, Y);
      setPixel(buf, S, sx+1, sy, O);
    });
  }
  void palette;
}

// ---------------------------------------------------------------------------
// 文字 H 描画
// ---------------------------------------------------------------------------

/**
 * 文字 H キャラクターを描画する（ロボット型・カバー画像と同デザイン）。
 *
 * 特徴:
 * - ダークネイビー胴体＋シアンアウトライン（cover.png と同じ #00e5ff）
 * - 赤い目 2 つ（cover.png と同じ #ff3333）
 * - アンテナ・コアリアクター・肩アーマー・腕・ブレード・ブーツを持つ
 * - UP方向: 背中パネル（ベントライン）を表示、顔は非表示
 * - LEFT/RIGHT方向: シアー変形＋顔を横にずらし＋背中ベントライン
 * - ATTACK: 腕/ブレードを攻撃方向へ派手に突き出す
 * - HIT: 目が飛び出る（白い強膜＋大きな赤目）
 */
function drawLetterH(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
  frame: number,
): void {
  const pal = getLetterPalette('H');
  const W = pal.edge;    // #00e5ff シアン（アウトライン）
  const A = pal.accent;  // #00b4cc 薄めシアン（背中パネル）
  const R = pal.sensor;  // #ff3333 赤（目）
  const dir = direction;

  // ─── アニメーションオフセット ─────────────────────────────────────
  const bY = (state === 'idle' && frame === 1) ? 1 : 0;
  const leftFootY  = (state === 'move' && frame === 0) ? 1 : 0;
  const rightFootY = (state === 'move' && frame === 1) ? 1 : 0;
  const aX = state === 'attack' && frame >= 1
    ? (dir === 'right' ? 5 : dir === 'left' ? -5 : 0) : 0;
  const aY = state === 'attack' && frame >= 1
    ? (dir === 'down' ? 4 : dir === 'up' ? -4 : 0) : 0;
  const hX = state === 'hit' && frame === 0 ? -4 : 0;
  const hY = state === 'hit' && frame === 0 ? -2 : 0;
  const ox = aX + hX;
  const oy = aY + hY + bY;

  // ─── アンテナ ───────────────────────────────────────────────────
  // UP方向は薄めシアン、それ以外はシアン
  if (dir === 'up') {
    setPixelS(buf, S, 15+ox, 0+oy, A, dir);
    setPixelS(buf, S, 15+ox, 1+oy, A, dir);
  } else {
    setPixelS(buf, S, 15+ox, 0+oy, W, dir);
    setPixelS(buf, S, 15+ox, 1+oy, W, dir);
    setPixelS(buf, S, 16+ox, 0+oy, W, dir);
  }

  // ─── 頭部（10×7 px、x=11-20, y=2-8）────────────────────────────
  // ダークネイビー塗り
  fillRectS(buf, S, 11+ox, 2+oy, 10, 7, pal.main, dir);
  // シアン外枠
  hLineS(buf, S, 11+ox, 2+oy, 10, W, dir);   // 上辺
  hLineS(buf, S, 11+ox, 8+oy,  10, W, dir);   // 下辺
  vLineS(buf, S, 11+ox, 2+oy,  7,  W, dir);   // 左辺
  vLineS(buf, S, 20+ox, 2+oy,  7,  W, dir);   // 右辺

  // ─── ネック（x=14-17, y=9-10）───────────────────────────────────
  fillRectS(buf, S, 14+ox, 9+oy, 4, 2, pal.mid, dir);

  // ─── 方向別: UP=背面・それ以外=顔 ───────────────────────────────
  if (dir === 'up') {
    // 背面頭部: ベントライン3本（薄めシアン）
    hLineS(buf, S, 13+ox, 3+oy, 6, A, dir);
    hLineS(buf, S, 13+ox, 5+oy, 6, A, dir);
    hLineS(buf, S, 13+ox, 7+oy, 6, A, dir);
  } else {
    // 目の座標: DOWN=正面中央, RIGHT/LEFT=横に寄せる
    const faceCX = dir === 'right' ? 19+ox : dir === 'left' ? 13+ox : 16+ox;
    const eyeBaseY = 4+oy;

    if (state === 'hit') {
      // HIT: 目が飛び出る（白い強膜 6×4 ＋ 大きな赤目 4×2）
      const eyeW = hexToRGBA('#ffffff');
      // 左目（白い強膜）
      fillRectS(buf, S, faceCX-7, eyeBaseY-1, 6, 4, eyeW, dir);
      fillRectS(buf, S, faceCX-6, eyeBaseY,   4, 2, R,    dir);
      // 右目（白い強膜）
      fillRectS(buf, S, faceCX+1, eyeBaseY-1, 6, 4, eyeW, dir);
      fillRectS(buf, S, faceCX+2, eyeBaseY,   4, 2, R,    dir);
    } else {
      // 通常: 左目 3×2（x=faceCX-6〜-4）、右目 3×2（x=faceCX+1〜+3）
      fillRectS(buf, S, faceCX-6, eyeBaseY,   3, 2, R, dir);  // 左目
      fillRectS(buf, S, faceCX+1, eyeBaseY,   3, 2, R, dir);  // 右目
      // 目のハイライト（各目の左上1px）
      setPixelS(buf, S, faceCX-6, eyeBaseY, hexToRGBA('#ff6666'), dir);
      setPixelS(buf, S, faceCX+1, eyeBaseY, hexToRGBA('#ff6666'), dir);
    }

    // バイザーライン（y=7、薄めシアン横線）
    hLineS(buf, S, 12+ox, 7+oy, 8, A, dir);
  }

  // ─── 肩アーマー ─────────────────────────────────────────────────
  // 左肩（x=7-9, y=9-11）
  fillRectS(buf, S, 7+ox,  9+oy, 3, 3, pal.mid, dir);
  hLineS(buf, S,   7+ox,  9+oy, 3, W, dir);   // 上辺シアンエッジ
  vLineS(buf, S,   7+ox,  9+oy, 3, W, dir);   // 左辺シアンエッジ
  // 右肩（x=22-24, y=9-11）
  fillRectS(buf, S, 22+ox, 9+oy, 3, 3, pal.mid, dir);
  hLineS(buf, S,   22+ox, 9+oy, 3, W, dir);   // 上辺シアンエッジ
  vLineS(buf, S,   24+ox, 9+oy, 3, W, dir);   // 右辺シアンエッジ

  // ─── ボディ（14×10 px、x=9-22, y=11-20）────────────────────────
  fillRectS(buf, S, 9+ox, 11+oy, 14, 10, pal.main, dir);
  // シアン外枠
  hLineS(buf, S, 9+ox,  11+oy, 14, W, dir);  // 上辺
  hLineS(buf, S, 9+ox,  20+oy, 14, W, dir);  // 下辺
  vLineS(buf, S, 9+ox,  11+oy, 10, W, dir);  // 左辺
  vLineS(buf, S, 22+ox, 11+oy, 10, W, dir);  // 右辺

  // ボディ内装飾ライン（4隅にシアンショートライン）
  hLineS(buf, S, 10+ox, 13+oy, 3, A, dir);   // 左上
  hLineS(buf, S, 19+ox, 13+oy, 3, A, dir);   // 右上
  hLineS(buf, S, 10+ox, 18+oy, 3, A, dir);   // 左下
  hLineS(buf, S, 19+ox, 18+oy, 3, A, dir);   // 右下

  // コアリアクター（中央 x=14-17, y=14-16）
  // 外周シアン
  hLineS(buf, S, 14+ox, 14+oy, 4, W, dir);   // 上辺
  hLineS(buf, S, 14+ox, 16+oy, 4, W, dir);   // 下辺
  setPixelS(buf, S, 14+ox, 15+oy, W, dir);   // 左辺
  setPixelS(buf, S, 17+ox, 15+oy, W, dir);   // 右辺
  // 中心白
  setPixelS(buf, S, 15+ox, 15+oy, hexToRGBA('#ffffff'), dir);
  setPixelS(buf, S, 16+ox, 15+oy, hexToRGBA('#ffffff'), dir);

  // ─── 腕 ─────────────────────────────────────────────────────────
  // 左腕（x=6-8, y=12-18）
  fillRectS(buf, S, 6+ox, 12+oy, 3, 7, pal.main, dir);
  vLineS(buf, S,   6+ox, 12+oy, 7, W, dir);  // 左縁シアン
  // 右腕（x=23-25, y=12-18）
  fillRectS(buf, S, 23+ox, 12+oy, 3, 7, pal.main, dir);
  vLineS(buf, S,   25+ox, 12+oy, 7, W, dir); // 右縁シアン

  // ─── 左腕ブレード（x=5-6, y=18-23）─────────────────────────────
  if (dir !== 'up') {
    fillRectS(buf, S, 5+ox, 18+oy, 2, 6, pal.mid, dir);
    vLineS(buf, S,   5+ox, 18+oy, 6, W, dir);  // 左縁シアン
    setPixelS(buf, S, 5+ox, 23+oy, W, dir);    // 先端
    setPixelS(buf, S, 6+ox, 24+oy, W, dir);    // 先端
  }

  // ─── 背中ベントライン（LEFT/RIGHT方向のみ）──────────────────────
  if (dir === 'right') {
    // 背中側（左柱）にベントライン
    hLineS(buf, S, 10+ox, 13+oy, 2, A, dir);
    hLineS(buf, S, 10+ox, 16+oy, 2, A, dir);
    hLineS(buf, S, 10+ox, 19+oy, 2, A, dir);
  } else if (dir === 'left') {
    // 背中側（右柱）にベントライン
    hLineS(buf, S, 20+ox, 13+oy, 2, A, dir);
    hLineS(buf, S, 20+ox, 16+oy, 2, A, dir);
    hLineS(buf, S, 20+ox, 19+oy, 2, A, dir);
  } else if (dir === 'up') {
    // UP方向: 両腕にベントライン
    hLineS(buf, S, 9+ox,  13+oy, 2, A, dir);
    hLineS(buf, S, 9+ox,  16+oy, 2, A, dir);
    hLineS(buf, S, 9+ox,  19+oy, 2, A, dir);
    hLineS(buf, S, 21+ox, 13+oy, 2, A, dir);
    hLineS(buf, S, 21+ox, 16+oy, 2, A, dir);
    hLineS(buf, S, 21+ox, 19+oy, 2, A, dir);
  }

  // ─── 脚（x=11-13 左、x=18-20 右、y=21-25）───────────────────────
  fillRectS(buf, S, 11+ox, 21+oy, 3, 5, pal.main, dir);
  fillRectS(buf, S, 18+ox, 21+oy, 3, 5, pal.main, dir);

  // ─── ブーツ（左 x=9-13, 右 x=18-22, y=26-28）────────────────────
  const lfy = leftFootY;
  const rfy = rightFootY;
  // 左ブーツ
  fillRectS(buf, S, 9+ox,  26+oy+lfy, 5, 3, pal.mid, dir);
  hLineS(buf, S,   9+ox,  26+oy+lfy, 5, W, dir);  // 上辺
  hLineS(buf, S,   9+ox,  28+oy+lfy, 5, W, dir);  // 下辺
  vLineS(buf, S,   9+ox,  26+oy+lfy, 3, W, dir);  // 左辺
  vLineS(buf, S,   13+ox, 26+oy+lfy, 3, W, dir);  // 右辺
  // 右ブーツ
  fillRectS(buf, S, 18+ox, 26+oy+rfy, 5, 3, pal.mid, dir);
  hLineS(buf, S,   18+ox, 26+oy+rfy, 5, W, dir);
  hLineS(buf, S,   18+ox, 28+oy+rfy, 5, W, dir);
  vLineS(buf, S,   18+ox, 26+oy+rfy, 3, W, dir);
  vLineS(buf, S,   22+ox, 26+oy+rfy, 3, W, dir);

  // ─── ATTACK: 腕/ブレードを攻撃方向へ派手に突き出す ───────────────
  if (state === 'attack' && frame >= 1) {
    if (dir === 'down') {
      // 右腕を下に +4px 伸ばして拳追加
      fillRectS(buf, S, 23+ox, 19+oy, 3, 5, pal.mid, dir);
      fillRectS(buf, S, 22+ox, 23+oy, 5, 3, pal.mid, dir);  // 拳（幅広）
      hLineS(buf, S,   22+ox, 23+oy, 5, W, dir);
      hLineS(buf, S,   22+ox, 25+oy, 5, W, dir);
      vLineS(buf, S,   26+ox, 23+oy, 3, W, dir);
      // 左腕ブレードを前方へ（下に伸ばす）
      fillRectS(buf, S, 5+ox, 24+oy, 2, 4, pal.mid, dir);
      vLineS(buf, S,   5+ox, 24+oy, 4, W, dir);
      setPixelS(buf, S, 5+ox, 27+oy, W, dir);
    } else if (dir === 'up') {
      // 左腕を上に伸ばす
      fillRectS(buf, S, 6+ox, 5+oy,  3, 7, pal.mid, dir);
      fillRectS(buf, S, 5+ox, 3+oy,  4, 3, pal.mid, dir);  // 拳
      hLineS(buf, S,   5+ox, 3+oy,  4, W, dir);
      hLineS(buf, S,   5+ox, 5+oy,  4, W, dir);
      vLineS(buf, S,   5+ox, 3+oy,  3, W, dir);
    } else if (dir === 'right') {
      // 右腕を右へ水平に +5px 伸ばす
      fillRectS(buf, S, 25+ox, 13+oy, 6, 3, pal.mid, dir);
      fillRectS(buf, S, 29+ox, 11+oy, 3, 6, pal.mid, dir);  // 拳
      vLineS(buf, S,   31+ox, 11+oy, 6, W, dir);
      hLineS(buf, S,   29+ox, 11+oy, 3, W, dir);
      hLineS(buf, S,   29+ox, 16+oy, 3, W, dir);
    } else {
      // 左腕を左へ水平に +5px 伸ばす
      fillRectS(buf, S, 2+ox, 13+oy, 6, 3, pal.mid, dir);
      fillRectS(buf, S, 0+ox, 11+oy, 3, 6, pal.mid, dir);  // 拳
      vLineS(buf, S,   0+ox, 11+oy, 6, W, dir);
      hLineS(buf, S,   0+ox, 11+oy, 3, W, dir);
      hLineS(buf, S,   0+ox, 16+oy, 3, W, dir);
      // ブレードも前方（左）へ
      fillRectS(buf, S, 3+ox, 18+oy, 3, 6, pal.mid, dir);
      vLineS(buf, S,   3+ox, 18+oy, 6, W, dir);
    }
  }

  if (state === 'attack') drawAttackEffect(buf, S, direction, frame, pal);
  else if (state === 'hit') drawHitEffect(buf, S, frame, pal);
}

// ---------------------------------------------------------------------------
// 文字 D 描画（瀕死状態）
// ---------------------------------------------------------------------------

/**
 * 文字 D キャラクターを描画する（瀕死・明るい青灰系）。
 */
function drawLetterD(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
  frame: number,
): void {
  const pal = getLetterPalette('D');
  const W = pal.edge;
  const dir = direction;
  const bY = (state === 'idle' && frame === 1) ? 1 : 0;
  const leftFootY  = (state === 'move' && frame === 0) ? 1 : 0;
  const rightFootY = (state === 'move' && frame === 1) ? 1 : 0;
  const aX = state === 'attack' && frame >= 1
    ? (dir === 'right' ? 5 : dir === 'left' ? -5 : 0) : 0;
  const aY = state === 'attack' && frame >= 1
    ? (dir === 'down' ? 4 : dir === 'up' ? -4 : 0) : 0;
  const hX = state === 'hit' && frame === 0 ? -4 : 0;
  const hY = state === 'hit' && frame === 0 ? -2 : 0;
  const ox = aX + hX; const oy = aY + hY + bY;

  // D縦棒
  fillRectS(buf, S, 8+ox, 6+oy, 4, 21, pal.main, dir);
  // Dキャップ
  fillRectS(buf, S, 12+ox, 6+oy, 9, 2, pal.mid, dir);
  fillRectS(buf, S, 12+ox, 25+oy, 9, 2, pal.mid, dir);
  // Dカーブ
  fillRectS(buf, S, 21+ox, 8+oy, 2, 3, pal.mid, dir);
  fillRectS(buf, S, 22+ox, 11+oy, 2, 10, pal.main, dir);
  fillRectS(buf, S, 21+ox, 21+oy, 2, 3, pal.mid, dir);
  // エッジ
  vLineS(buf, S, 8+ox, 6+oy, 21, W, dir);
  // 頭部（左寄り）
  fillRectS(buf, S, 8+ox, 1+oy, 7, 6, pal.main, dir);
  hLineS(buf, S, 8+ox, 1+oy, 7, W, dir);
  // アンテナ（壊れている感じ）
  setPixelS(buf, S, 10+ox, 0+oy, pal.accent, dir);
  // 足
  fillRectS(buf, S, 7+ox, 25+oy+leftFootY, 5, 4, pal.mid, dir);
  hLineS(buf, S, 7+ox, 25+oy+leftFootY, 5, W, dir);
  fillRectS(buf, S, 18+ox, 26+oy+rightFootY, 4, 3, pal.mid, dir);

  // エネルギー漏れ（赤ピクセル）
  const leakPts = frame === 0
    ? [[13,14],[15,18],[21,12],[22,20],[16,10]]
    : [[14,15],[16,19],[21,11],[23,18],[15,9]];
  for (const [lx, ly] of leakPts)
    setPixelS(buf, S, lx+ox, ly+oy, pal.accent, dir);

  // クラック
  const crackPts = frame === 0
    ? [[12,12],[13,13],[13,15],[14,16],[11,18],[12,20]]
    : [[11,13],[12,14],[13,16],[12,18],[11,19],[13,21]];
  for (const [cx2, cy2] of crackPts)
    setPixelS(buf, S, cx2+ox, cy2+oy, hexToRGBA('#ff6666'), dir);

  // 顔（ダメージ顔）
  if (direction !== 'up') {
    const faceCX = direction === 'right' ? 20+ox : direction === 'left' ? 8+ox : 13+ox;
    const faceCY = 3+oy;
    // 目（赤く弱く光る、つぶれた目）
    fillRectS(buf, S, faceCX-4, faceCY, 3, 1, pal.sensor, dir); // 左目（細い）
    fillRectS(buf, S, faceCX+1, faceCY, 3, 1, pal.sensor, dir); // 右目（細い）
    // 口（歪んだ口）
    fillRectS(buf, S, faceCX-3, faceCY+3, 5, 1, pal.accent, dir);
  }

  if (state === 'attack') drawAttackEffect(buf, S, direction, frame, pal);
  else if (state === 'hit') drawHitEffect(buf, S, frame, pal);
}

// ---------------------------------------------------------------------------
// 文字 A 描画（攻撃バフ）
// ---------------------------------------------------------------------------

/**
 * 文字 A キャラクターを描画する（攻撃バフ・赤/オレンジ系）。
 */
function drawLetterA(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
  frame: number,
): void {
  const pal = getLetterPalette('A');
  const W = pal.edge; const G = pal.accent;
  const dir = direction;
  const bY = (state === 'idle' && frame === 1) ? 1 : 0;
  const leftFootY  = (state === 'move' && frame === 0) ? 1 : 0;
  const rightFootY = (state === 'move' && frame === 1) ? 1 : 0;
  const aX = state === 'attack' && frame >= 1
    ? (dir === 'right' ? 5 : dir === 'left' ? -5 : 0) : 0;
  const aY = state === 'attack' && frame >= 1
    ? (dir === 'down' ? 4 : dir === 'up' ? -4 : 0) : 0;
  const hX = state === 'hit' && frame === 0 ? -4 : 0;
  const hY = state === 'hit' && frame === 0 ? -2 : 0;
  const ox = aX + hX; const oy = aY + hY + bY;

  // A左対角線
  for (let y = 8; y <= 28; y++) {
    const x = 8 + Math.round((28 - y) * 7 / 20);
    const sx = dirShearX(y + oy, dir);
    fillRect(buf, S, x - 1 + ox + sx, y + oy, 3, 1, pal.main);
  }
  // A右対角線
  for (let y = 8; y <= 28; y++) {
    const x = 24 - Math.round((28 - y) * 7 / 20);
    const sx = dirShearX(y + oy, dir);
    fillRect(buf, S, x - 1 + ox + sx, y + oy, 3, 1, pal.main);
  }
  // A横棒
  fillRectS(buf, S, 11+ox, 17+oy, 10, 3, pal.mid, dir);
  hLineS(buf, S, 11+ox, 17+oy, 10, W, dir);
  hLineS(buf, S, 11+ox, 19+oy, 10, G, dir);
  // 腕
  fillRectS(buf, S, 6+ox, 14+oy, 4, 3, pal.mid, dir);
  fillRectS(buf, S, 22+ox, 14+oy, 4, 3, pal.mid, dir);
  // 足
  fillRectS(buf, S, 6+ox, 28+oy+leftFootY, 5, 3, pal.mid, dir);
  hLineS(buf, S, 6+ox, 28+oy+leftFootY, 5, W, dir);
  fillRectS(buf, S, 21+ox, 28+oy+rightFootY, 5, 3, pal.mid, dir);
  hLineS(buf, S, 21+ox, 28+oy+rightFootY, 5, W, dir);
  // 頭部（頂点）
  fillRectS(buf, S, 13+ox, 1+oy, 6, 7, pal.main, dir);
  hLineS(buf, S, 13+ox, 1+oy, 6, W, dir);
  vLineS(buf, S, 13+ox, 1+oy, 7, W, dir);
  vLineS(buf, S, 18+ox, 1+oy, 7, W, dir);
  // 攻撃オーラ
  drawOutline(buf, S, hexToRGBA('#ff6600', 180));

  // 顔
  if (direction !== 'up') {
    const faceCX = direction === 'right' ? 23+ox : direction === 'left' ? 9+ox : 16+ox;
    const faceCY = 4+oy;
    drawFace(buf, S, faceCX, faceCY, pal.sensor, G, pal.sensor, dir);
  }

  if (state === 'attack') drawAttackEffect(buf, S, direction, frame, pal);
  else if (state === 'hit') drawHitEffect(buf, S, frame, pal);
}

// ---------------------------------------------------------------------------
// 文字 B 描画（防御バフ）
// ---------------------------------------------------------------------------

/**
 * 文字 B キャラクターを描画する（防御バフ・青/紫系）。
 */
function drawLetterB(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
  frame: number,
): void {
  const pal = getLetterPalette('B');
  const W = pal.edge;
  const dir = direction;
  const bY = (state === 'idle' && frame === 1) ? 1 : 0;
  const leftFootY  = (state === 'move' && frame === 0) ? 1 : 0;
  const rightFootY = (state === 'move' && frame === 1) ? 1 : 0;
  const aX = state === 'attack' && frame >= 1
    ? (dir === 'right' ? 5 : dir === 'left' ? -5 : 0) : 0;
  const aY = state === 'attack' && frame >= 1
    ? (dir === 'down' ? 4 : dir === 'up' ? -4 : 0) : 0;
  const hX = state === 'hit' && frame === 0 ? -4 : 0;
  const hY = state === 'hit' && frame === 0 ? -2 : 0;
  const ox = aX + hX; const oy = aY + hY + bY;

  // B縦棒
  fillRectS(buf, S, 8+ox, 6+oy, 4, 21, pal.main, dir);
  vLineS(buf, S, 8+ox, 6+oy, 21, W, dir);
  // 上バンプ
  fillRectS(buf, S, 12+ox, 6+oy, 9, 2, pal.mid, dir);
  fillRectS(buf, S, 21+ox, 8+oy, 2, 3, pal.mid, dir);
  fillRectS(buf, S, 22+ox, 11+oy, 1, 3, pal.dark, dir);
  setPixelS(buf, S, 21+ox, 14+oy, pal.dark, dir);
  fillRectS(buf, S, 12+ox, 14+oy, 9, 2, pal.mid, dir);
  // 下バンプ
  fillRectS(buf, S, 12+ox, 16+oy, 9, 2, pal.mid, dir);
  fillRectS(buf, S, 21+ox, 18+oy, 2, 4, pal.mid, dir);
  fillRectS(buf, S, 22+ox, 22+oy, 1, 3, pal.dark, dir);
  setPixelS(buf, S, 21+ox, 25+oy, pal.dark, dir);
  fillRectS(buf, S, 12+ox, 25+oy, 9, 2, pal.mid, dir);
  // グロー
  const glowC = hexToRGBA('#8800cc', 200);
  setPixelS(buf, S, 23+ox, 12+oy, glowC, dir);
  setPixelS(buf, S, 23+ox, 13+oy, glowC, dir);
  setPixelS(buf, S, 23+ox, 22+oy, glowC, dir);
  setPixelS(buf, S, 23+ox, 23+oy, glowC, dir);
  // バリアオーラ
  drawOutline(buf, S, hexToRGBA('#4488ff', 180));
  // 頭部
  fillRectS(buf, S, 8+ox, 1+oy, 8, 6, pal.main, dir);
  hLineS(buf, S, 8+ox, 1+oy, 8, W, dir);
  // 足
  fillRectS(buf, S, 7+ox, 25+oy+leftFootY, 5, 4, pal.mid, dir);
  hLineS(buf, S, 7+ox, 25+oy+leftFootY, 5, W, dir);
  fillRectS(buf, S, 18+ox, 26+oy+rightFootY, 4, 3, pal.dark, dir);

  // 顔
  if (direction !== 'up') {
    const faceCX = direction === 'right' ? 20+ox : direction === 'left' ? 8+ox : 14+ox;
    const faceCY = 3+oy;
    drawFace(buf, S, faceCX, faceCY, pal.sensor, pal.sensor, W, dir);
  }

  if (state === 'attack') drawAttackEffect(buf, S, direction, frame, pal);
  else if (state === 'hit') drawHitEffect(buf, S, frame, pal);
}

// ---------------------------------------------------------------------------
// 文字 S 描画（スピードバフ）
// ---------------------------------------------------------------------------

/**
 * 文字 S キャラクターを描画する（スピードバフ・黄/緑系）。
 */
function drawLetterS(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
  frame: number,
): void {
  const pal = getLetterPalette('S');
  const W = pal.edge; const G = pal.accent;
  const dir = direction;
  const bY = (state === 'idle' && frame === 1) ? 1 : 0;
  const leftFootY  = (state === 'move' && frame === 0) ? 1 : 0;
  const rightFootY = (state === 'move' && frame === 1) ? 1 : 0;
  const aX = state === 'attack' && frame >= 1
    ? (dir === 'right' ? 5 : dir === 'left' ? -5 : 0) : 0;
  const aY = state === 'attack' && frame >= 1
    ? (dir === 'down' ? 4 : dir === 'up' ? -4 : 0) : 0;
  const hX = state === 'hit' && frame === 0 ? -4 : 0;
  const hY = state === 'hit' && frame === 0 ? -2 : 0;
  const ox = aX + hX; const oy = aY + hY + bY;

  // S上キャップ
  fillRectS(buf, S, 12+ox, 6+oy, 10, 2, pal.main, dir);
  hLineS(buf, S, 12+ox, 6+oy, 10, W, dir);
  // S上右部分
  fillRectS(buf, S, 21+ox, 8+oy, 2, 5, pal.main, dir);
  // S上カーブ
  setPixelS(buf, S, 20+ox, 12+oy, pal.mid, dir);
  setPixelS(buf, S, 19+ox, 13+oy, pal.mid, dir);
  setPixelS(buf, S, 18+ox, 14+oy, pal.mid, dir);
  setPixelS(buf, S, 17+ox, 14+oy, pal.mid, dir);
  // S中間
  fillRectS(buf, S, 11+ox, 14+oy, 10, 3, pal.mid, dir);
  hLineS(buf, S, 11+ox, 14+oy, 10, G, dir);
  hLineS(buf, S, 11+ox, 16+oy, 10, G, dir);
  // S下カーブ
  setPixelS(buf, S, 13+ox, 16+oy, pal.mid, dir);
  setPixelS(buf, S, 13+ox, 17+oy, pal.mid, dir);
  setPixelS(buf, S, 14+ox, 18+oy, pal.mid, dir);
  setPixelS(buf, S, 15+ox, 18+oy, pal.mid, dir);
  // S下左部分
  fillRectS(buf, S, 9+ox, 18+oy, 2, 5, pal.main, dir);
  // S下キャップ
  fillRectS(buf, S, 10+ox, 23+oy, 10, 2, pal.main, dir);
  hLineS(buf, S, 10+ox, 24+oy, 10, W, dir);
  // 足
  fillRectS(buf, S, 16+ox, 25+oy+leftFootY, 8, 4, pal.mid, dir);
  hLineS(buf, S, 16+ox, 25+oy+leftFootY, 8, W, dir);
  fillRectS(buf, S, 8+ox, 25+oy+rightFootY, 4, 3, pal.dark, dir);
  // 頭部
  fillRectS(buf, S, 14+ox, 1+oy, 6, 5, pal.main, dir);
  hLineS(buf, S, 14+ox, 1+oy, 6, W, dir);
  // スピードライン
  if (direction !== 'right') {
    hLine(buf, S, 1, 10+oy, 5, hexToRGBA('#ffdd00', 200));
    hLine(buf, S, 1, 14+oy, 4, hexToRGBA('#00ff88', 200));
    hLine(buf, S, 1, 18+oy, 5, hexToRGBA('#ffdd00', 200));
  }

  // 顔
  if (direction !== 'up') {
    const faceCX = direction === 'right' ? 23+ox : direction === 'left' ? 11+ox : 17+ox;
    const faceCY = 3+oy;
    drawFace(buf, S, faceCX, faceCY, pal.sensor, G, pal.sensor, dir);
  }

  if (state === 'attack') drawAttackEffect(buf, S, direction, frame, pal);
  else if (state === 'hit') drawHitEffect(buf, S, frame, pal);
}

// ---------------------------------------------------------------------------
// 文字 F 描画（HP満タン状態）
// ---------------------------------------------------------------------------

/**
 * 文字 F キャラクターを描画する（HP 100%・ゴールド系）。
 */
function drawLetterF(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
  frame: number,
): void {
  const pal = getLetterPalette('F');
  const W = pal.edge; const G = pal.accent; const M = pal.sensor;
  const dir = direction;
  const bY = (state === 'idle' && frame === 1) ? 1 : 0;
  const leftFootY  = (state === 'move' && frame === 0) ? 1 : 0;
  const rightFootY = (state === 'move' && frame === 1) ? 1 : 0;
  const aX = state === 'attack' && frame >= 1
    ? (dir === 'right' ? 5 : dir === 'left' ? -5 : 0) : 0;
  const aY = state === 'attack' && frame >= 1
    ? (dir === 'down' ? 4 : dir === 'up' ? -4 : 0) : 0;
  const hX = state === 'hit' && frame === 0 ? -4 : 0;
  const hY = state === 'hit' && frame === 0 ? -2 : 0;
  const ox = aX + hX; const oy = aY + hY + bY;

  // F縦棒
  fillRectS(buf, S, 8+ox, 10+oy, 4, 17, pal.main, dir);
  // F上横棒
  fillRectS(buf, S, 12+ox, 10+oy, 11, 3, pal.mid, dir);
  // F中横棒
  fillRectS(buf, S, 12+ox, 15+oy, 7, 3, pal.mid, dir);
  // エッジ
  vLineS(buf, S, 8+ox, 10+oy, 17, W, dir);
  hLineS(buf, S, 12+ox, 10+oy, 11, W, dir);
  hLineS(buf, S, 12+ox, 12+oy, 11, W, dir);
  hLineS(buf, S, 12+ox, 15+oy, 7, W, dir);
  hLineS(buf, S, 12+ox, 17+oy, 7, W, dir);
  hLineS(buf, S, 8+ox, 11+oy, 4, G, dir);
  vLineS(buf, S, 11+ox, 10+oy, 17, pal.core, dir);
  // コア
  setPixelS(buf, S, 15+ox, 16+oy, pal.core, dir);
  setPixelS(buf, S, 16+ox, 16+oy, pal.core, dir);
  setPixelS(buf, S, 22+ox, 11+oy, pal.core, dir);
  // 左足
  fillRectS(buf, S, 6+ox, 26+oy+leftFootY, 6, 4, pal.mid, dir);
  hLineS(buf, S, 6+ox, 26+oy+leftFootY, 6, W, dir);
  // 右足
  fillRectS(buf, S, 20+ox, 26+oy+rightFootY, 6, 4, pal.mid, dir);
  hLineS(buf, S, 20+ox, 26+oy+rightFootY, 6, W, dir);
  // 頭部
  fillRectS(buf, S, 12+ox, 2+oy, 8, 7, pal.main, dir);
  hLineS(buf, S, 12+ox, 2+oy, 8, W, dir);
  vLineS(buf, S, 12+ox, 2+oy, 7, W, dir);
  vLineS(buf, S, 19+ox, 2+oy, 7, W, dir);
  hLineS(buf, S, 13+ox, 6+oy, 6, M, dir);
  // アンテナ（ダブル）
  setPixelS(buf, S, 15+ox, 1+oy, G, dir);
  setPixelS(buf, S, 16+ox, 1+oy, G, dir);
  setPixelS(buf, S, 15+ox, 0+oy, M, dir);
  setPixelS(buf, S, 16+ox, 0+oy, M, dir);

  // 顔
  if (direction !== 'up') {
    const faceCX = direction === 'right' ? 23+ox : direction === 'left' ? 10+ox : 16+ox;
    const faceCY = 4+oy;
    drawFace(buf, S, faceCX, faceCY, W, M, G, dir);
  }

  if (state === 'attack') drawAttackEffect(buf, S, direction, frame, pal);
  else if (state === 'hit') drawHitEffect(buf, S, frame, pal);
}

// ---------------------------------------------------------------------------
// 統合ディスパッチ: drawLetterChar
// ---------------------------------------------------------------------------

/**
 * 指定文字のキャラクタースプライトを描画する。
 *
 * @param buf - 書き込み先 RGBA バッファ（全透明で渡すこと）
 * @param S - タイルサイズ（32）
 * @param letter - 文字バリアント
 * @param direction - 向き
 * @param state - アニメーション状態
 * @param frame - フレーム番号
 */
function drawLetterChar(
  buf: Uint8Array,
  S: number,
  letter: PlayerLetter,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
  frame: number,
): void {
  switch (letter) {
    case 'H': drawLetterH(buf, S, direction, state, frame); break;
    case 'D': drawLetterD(buf, S, direction, state, frame); break;
    case 'A': drawLetterA(buf, S, direction, state, frame); break;
    case 'B': drawLetterB(buf, S, direction, state, frame); break;
    case 'S': drawLetterS(buf, S, direction, state, frame); break;
    case 'F': drawLetterF(buf, S, direction, state, frame); break;
  }
}

// ---------------------------------------------------------------------------
// 後方互換: drawMechBody は drawLetterChar(H) に委譲
// ---------------------------------------------------------------------------

/**
 * @deprecated drawLetterChar を直接使用すること。
 */
function drawMechBody(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
  frame: number,
): void {
  // ---- パレット: 明るく輝くSFヒューマノイドメカ ----
  const bodyMain   = hexToRGBA('#00c8ff'); // エレクトリックシアン（メインアーマー）
  const bodyMid    = hexToRGBA('#0080ff'); // エレクトリックブルー（中間アーマー）
  const bodyDark   = hexToRGBA('#0044aa'); // ダークブルー（影・裏面）
  const bodyEdge   = hexToRGBA('#ffffff'); // エッジハイライト白
  const goldLine   = hexToRGBA('#ffdd00'); // ゴールドラインアクセント
  const jointC     = hexToRGBA('#ffdd00'); // 関節ゴールド
  const sensorC    = hexToRGBA('#ff00ff'); // マゼンタセンサー（発光）
  const sensorDim  = hexToRGBA('#cc00cc'); // センサー（暗め）
  const coreGreen  = hexToRGBA('#00ff88'); // エネルギーコア緑（発光）
  const coreDim    = hexToRGBA('#00cc66'); // エネルギーコア（暗め）
  const energyLine = hexToRGBA('#88eeff'); // エネルギーライン青白
  const cannonC    = hexToRGBA('#0055cc'); // キャノン本体ブルー
  const cannonTip  = hexToRGBA('#00ffff'); // キャノン先端シアン
  const boosterC   = hexToRGBA('#ffdd00'); // ブースターゴールド
  const boosterFire= hexToRGBA('#ff8800'); // ブースター炎オレンジ

  // 被ダメ・攻撃エフェクト
  const hitFlash   = hexToRGBA('#ff0000'); // ダメージフラッシュ真っ赤
  const hitCrack   = hexToRGBA('#ff4400'); // 亀裂オレンジ
  const sparkY     = hexToRGBA('#ffff00'); // スパーク黄
  const sparkO     = hexToRGBA('#ff8800'); // スパークオレンジ
  const muzzleW    = hexToRGBA('#ffffff'); // マズルフラッシュ白
  const muzzleY    = hexToRGBA('#ffff00'); // マズルフラッシュ黄
  const explosionO = hexToRGBA('#ff8800'); // 爆発オレンジ
  const explosionY = hexToRGBA('#ffff00'); // 爆発黄

  // ---- ヘルパ: コアカラー（frame 0/1 でグリーン/白 を交互点滅） ----
  const coreColor = frame === 0 ? coreGreen : hexToRGBA('#ffffff');

  // ---- DOWN 方向（正面） ----
  if (direction === 'down') {
    const bY = (state === 'idle' && frame === 1) ? 1 : 0;
    const legSpread = (state === 'move' && frame === 1) ? 1 : 0;

    // --- 脚部（逆関節型） ---
    // 太もも（左右）
    fillRect(buf, S, 7 - legSpread, 20 + bY, 4, 4, bodyDark);
    fillRect(buf, S, 21 + legSpread, 20 + bY, 4, 4, bodyDark);
    // 太もも上ゴールドライン
    hLine(buf, S, 7 - legSpread, 20 + bY, 4, goldLine);
    hLine(buf, S, 21 + legSpread, 20 + bY, 4, goldLine);
    // 膝ジョイント（ゴールド）
    setPixel(buf, S, 8 - legSpread, 23 + bY, jointC);
    setPixel(buf, S, 9 - legSpread, 23 + bY, jointC);
    setPixel(buf, S, 22 + legSpread, 23 + bY, jointC);
    setPixel(buf, S, 23 + legSpread, 23 + bY, jointC);
    // 脛（逆関節で外側）
    fillRect(buf, S, 5 - legSpread, 24 + bY, 4, 5, bodyMid);
    fillRect(buf, S, 23 + legSpread, 24 + bY, 4, 5, bodyMid);
    // 足先エッジ
    hLine(buf, S, 5 - legSpread, 24 + bY, 4, bodyEdge);
    hLine(buf, S, 23 + legSpread, 24 + bY, 4, bodyEdge);
    // ブースター（足先）
    setPixel(buf, S, 6 - legSpread, 28 + bY, boosterC);
    setPixel(buf, S, 7 - legSpread, 29 + bY, boosterFire);
    setPixel(buf, S, 24 + legSpread, 28 + bY, boosterC);
    setPixel(buf, S, 25 + legSpread, 29 + bY, boosterFire);

    // --- 胴体（中央装甲プレート） ---
    fillRect(buf, S, 10, 12 + bY, 12, 9, bodyMain);
    // 上下エッジ白ライン
    hLine(buf, S, 10, 12 + bY, 12, bodyEdge);
    hLine(buf, S, 10, 20 + bY, 12, bodyEdge);
    // 左右エッジ
    vLine(buf, S, 10, 12 + bY, 9, bodyEdge);
    vLine(buf, S, 21, 12 + bY, 9, bodyEdge);
    // 左右ダークパネル
    fillRect(buf, S, 11, 13 + bY, 2, 7, bodyDark);
    fillRect(buf, S, 19, 13 + bY, 2, 7, bodyDark);
    // ゴールドアクセントライン（胴体横）
    hLine(buf, S, 11, 14 + bY, 10, goldLine);
    hLine(buf, S, 11, 19 + bY, 10, goldLine);
    // エネルギーコア（胴体中央、2×2の発光ドット）
    setPixel(buf, S, 15, 16 + bY, coreColor);
    setPixel(buf, S, 16, 16 + bY, coreColor);
    setPixel(buf, S, 15, 17 + bY, coreDim);
    setPixel(buf, S, 16, 17 + bY, coreDim);
    // コア周囲グロー（十字）
    setPixel(buf, S, 14, 16 + bY, energyLine);
    setPixel(buf, S, 17, 16 + bY, energyLine);
    setPixel(buf, S, 15, 15 + bY, energyLine);
    setPixel(buf, S, 16, 18 + bY, energyLine);

    // --- 腕（左右） ---
    // 右腕: キャノン装備
    fillRect(buf, S, 22, 13 + bY, 4, 6, bodyDark);
    hLine(buf, S, 22, 13 + bY, 4, bodyEdge);
    setPixel(buf, S, 22, 13 + bY, jointC);
    setPixel(buf, S, 25, 13 + bY, jointC);
    // 右キャノン砲身（下向き）
    const recoilD = (state === 'attack' && frame === 0) ? -2 : 0;
    fillRect(buf, S, 23, 19 + bY, 2, 6 + recoilD, cannonC);
    hLine(buf, S, 22, 24 + bY + recoilD, 4, cannonTip);
    // キャノンサイドライン
    vLine(buf, S, 22, 19 + bY, 5 + recoilD, energyLine);
    // 左腕: シールド兼近接
    fillRect(buf, S, 6, 13 + bY, 4, 6, bodyDark);
    hLine(buf, S, 6, 13 + bY, 4, bodyEdge);
    setPixel(buf, S, 6, 13 + bY, jointC);
    setPixel(buf, S, 9, 13 + bY, jointC);
    // シールド本体（左腕外側）
    fillRect(buf, S, 4, 13 + bY, 3, 6, bodyMid);
    hLine(buf, S, 4, 13 + bY, 3, bodyEdge);
    hLine(buf, S, 4, 18 + bY, 3, bodyEdge);

    // --- 頭部（センサーバイザー付き） ---
    fillRect(buf, S, 12, 5 + bY, 8, 7, bodyMain);
    hLine(buf, S, 12, 5 + bY, 8, bodyEdge);
    vLine(buf, S, 12, 5 + bY, 7, bodyEdge);
    vLine(buf, S, 19, 5 + bY, 7, bodyEdge);
    hLine(buf, S, 12, 11 + bY, 8, bodyEdge);
    // センサーバイザー（マゼンタ発光横帯）
    hLine(buf, S, 13, 7 + bY, 6, sensorC);
    hLine(buf, S, 13, 8 + bY, 6, sensorDim);
    // 両目センサードット（マゼンタ輝点）
    setPixel(buf, S, 14, 7 + bY, hexToRGBA('#ffffff'));
    setPixel(buf, S, 17, 7 + bY, hexToRGBA('#ffffff'));
    // アンテナ（頭頂）
    setPixel(buf, S, 15, 4 + bY, goldLine);
    setPixel(buf, S, 16, 3 + bY, sensorC);
    setPixel(buf, S, 16, 2 + bY, hexToRGBA('#ffffff'));

    // --- 攻撃エフェクト ---
    if (state === 'attack') {
      if (frame === 0) {
        // チャージ: キャラ全体を白い輪郭ラインで縁取り、コア超高輝度点灯
        const white = hexToRGBA('#ffffff');
        // ボディ外周ピクセルを白縁取り
        for (let y = 1; y < S - 1; y++) {
          for (let x = 1; x < S - 1; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              const neighbors = [
                buf[((y-1)*S+x)*4+3], buf[((y+1)*S+x)*4+3],
                buf[(y*S+x-1)*4+3],   buf[(y*S+x+1)*4+3],
              ];
              if (neighbors.some(a => a === 0)) {
                buf[idx]   = 255; buf[idx+1] = 255;
                buf[idx+2] = 255; buf[idx+3] = 255;
              }
            }
          }
        }
        // コア超高輝度（白+マゼンタグロー）
        setPixel(buf, S, 15, 16 + bY, white);
        setPixel(buf, S, 16, 16 + bY, white);
        setPixel(buf, S, 15, 17 + bY, white);
        setPixel(buf, S, 16, 17 + bY, white);
        setPixel(buf, S, 14, 16 + bY, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 17, 16 + bY, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 15, 15 + bY, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 16, 18 + bY, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 13, 16 + bY, hexToRGBA('#ffff00'));
        setPixel(buf, S, 18, 16 + bY, hexToRGBA('#ffff00'));
        setPixel(buf, S, 15, 14 + bY, hexToRGBA('#ffff00'));
        setPixel(buf, S, 16, 19 + bY, hexToRGBA('#ffff00'));
        // キャノン発光
        hLine(buf, S, 22, 13 + bY, 4, sensorC);
        setPixel(buf, S, 23, 14 + bY, muzzleY);
        setPixel(buf, S, 24, 14 + bY, muzzleY);
      } else if (frame === 1) {
        // インパクト: スプライト全体の約1/3を爆発ドットで埋める、キャラ黄色フラッシュ
        // キャラを黄色にフラッシュ
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx]   = 255;
              buf[idx+1] = Math.min(255, buf[idx+1] + 180);
              buf[idx+2] = Math.max(0, buf[idx+2] - 80);
            }
          }
        }
        // 衝撃波: 白→黄→橙グラデーションドットを下方向に広げる（キャノン先端から）
        const mY = 25 + bY;
        // 中心白
        setPixel(buf, S, 24, mY,   hexToRGBA('#ffffff'));
        setPixel(buf, S, 23, mY,   hexToRGBA('#ffffff'));
        setPixel(buf, S, 25, mY,   hexToRGBA('#ffffff'));
        setPixel(buf, S, 24, mY-1, hexToRGBA('#ffffff'));
        // 第2リング黄
        setPixel(buf, S, 22, mY,   hexToRGBA('#ffff00'));
        setPixel(buf, S, 26, mY,   hexToRGBA('#ffff00'));
        setPixel(buf, S, 24, mY+1, hexToRGBA('#ffff00'));
        setPixel(buf, S, 23, mY+1, hexToRGBA('#ffff00'));
        setPixel(buf, S, 25, mY+1, hexToRGBA('#ffff00'));
        setPixel(buf, S, 22, mY-1, hexToRGBA('#ffff00'));
        setPixel(buf, S, 26, mY-1, hexToRGBA('#ffff00'));
        // 第3リング橙
        setPixel(buf, S, 21, mY,   hexToRGBA('#ff8800'));
        setPixel(buf, S, 27, mY,   hexToRGBA('#ff8800'));
        setPixel(buf, S, 24, mY+2, hexToRGBA('#ff8800'));
        setPixel(buf, S, 22, mY+1, hexToRGBA('#ff8800'));
        setPixel(buf, S, 26, mY+1, hexToRGBA('#ff8800'));
        setPixel(buf, S, 20, mY-1, hexToRGBA('#ff8800'));
        setPixel(buf, S, 28, mY-1, hexToRGBA('#ff8800'));
        setPixel(buf, S, 23, mY+2, hexToRGBA('#ff8800'));
        setPixel(buf, S, 25, mY+2, hexToRGBA('#ff8800'));
        setPixel(buf, S, 24, mY+3, hexToRGBA('#ff8800'));
        // 外縁スパーク
        setPixel(buf, S, 19, mY,   sparkY);
        setPixel(buf, S, 29, mY,   sparkY);
        setPixel(buf, S, 21, mY+2, sparkY);
        setPixel(buf, S, 27, mY+2, sparkY);
        setPixel(buf, S, 20, mY-2, sparkY);
        setPixel(buf, S, 28, mY-2, sparkY);
      } else if (frame === 2) {
        // 残光: 前方（下）に向かって薄いシアンのラインが伸びる
        const cyanFade = hexToRGBA('#00ffff', 200);
        const cyanDim  = hexToRGBA('#00cccc', 150);
        const cyanWeak = hexToRGBA('#008888', 120);
        // キャノン先端から下方向へシアンライン
        for (let dy = 0; dy < 5; dy++) {
          const alpha = Math.floor(200 - dy * 35);
          if (alpha <= 0) break;
          setPixel(buf, S, 23, 25 + bY + dy, hexToRGBA('#00ffff', alpha));
          setPixel(buf, S, 24, 25 + bY + dy, hexToRGBA('#00ffff', alpha));
          if (dy > 0) {
            setPixel(buf, S, 22, 25 + bY + dy, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
            setPixel(buf, S, 25, 25 + bY + dy, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
          }
        }
        setPixel(buf, S, 23, 25 + bY, cyanFade);
        setPixel(buf, S, 24, 25 + bY, cyanFade);
        setPixel(buf, S, 22, 26 + bY, cyanDim);
        setPixel(buf, S, 25, 26 + bY, cyanDim);
        setPixel(buf, S, 21, 27 + bY, cyanWeak);
        setPixel(buf, S, 26, 27 + bY, cyanWeak);
      }
    }

    // --- 被ダメ ---
    if (state === 'hit') {
      if (frame === 0) {
        // フレーム0: 白フラッシュ（ほぼ真っ白）+ ノックバック2px右、大スパーク10点
        // バッファを2px右にシフト（ノックバック感）
        for (let y = S - 1; y >= 0; y--) {
          for (let x = S - 1; x >= 0; x--) {
            const src = (y * S + x) * 4;
            const dst = (y * S + Math.min(x + 2, S - 1)) * 4;
            buf[dst]   = buf[src];   buf[dst+1] = buf[src+1];
            buf[dst+2] = buf[src+2]; buf[dst+3] = buf[src+3];
          }
          for (let x = 0; x < 2; x++) {
            const idx = (y * S + x) * 4;
            buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = 0;
          }
        }
        // ほぼ白フラッシュ（白→赤への遷移感：白 230 程度）
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx]   = 255;
              buf[idx+1] = 230;
              buf[idx+2] = 230;
            }
          }
        }
        // 大きなスパーク10点（黄＋白）
        const spBig = [[7,10],[22,9],[6,17],[25,15],[9,22],[23,21],[14,8],[17,25],[4,14],[28,13]];
        for (const [sx, sy] of spBig) {
          setPixel(buf, S, sx, sy + bY, hexToRGBA('#ffffff'));
          setPixel(buf, S, sx+1, sy + bY, sparkY);
          setPixel(buf, S, sx, sy + bY + 1, sparkY);
        }
        const spBig2 = [[8,11],[21,10],[7,18],[24,16],[10,23],[22,22]];
        for (const [sx, sy] of spBig2) setPixel(buf, S, sx, sy + bY, sparkO);
      } else {
        // フレーム1: 鮮やかな赤でボディ塗りつぶし、太い亀裂、スパーク8点残留
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx]   = 255;
              buf[idx+1] = 34;
              buf[idx+2] = 34;
            }
          }
        }
        // 太い亀裂ライン（胴体斜め、2px幅）
        const crackPixels = [
          [12,13],[13,13],[13,14],[14,14],[14,15],[15,15],
          [15,16],[16,16],[17,15],[18,14],[18,15],[19,15],
          [12,14],[16,17],[17,16],
        ];
        for (const [cx, cy] of crackPixels) {
          setPixel(buf, S, cx, cy + bY, hexToRGBA('#ff6600'));
          setPixel(buf, S, cx+1, cy + bY, hexToRGBA('#ffaa00'));
        }
        // スパーク8点残留
        const spPx = [[9,12],[20,11],[7,19],[24,18],[11,23],[22,22],[15,9],[17,26]];
        for (const [sx, sy] of spPx) {
          setPixel(buf, S, sx, sy + bY, sparkY);
          setPixel(buf, S, sx+1, sy + bY, sparkO);
        }
      }
    }
    return;
  }

  // ---- UP 方向（背面） ----
  if (direction === 'up') {
    const bY = (state === 'idle' && frame === 1) ? 1 : 0;
    const legSpread = (state === 'move' && frame === 1) ? 1 : 0;

    // 脚部（背面: 脚が画面下部に見える）
    fillRect(buf, S, 7 - legSpread, 20 + bY, 4, 4, bodyDark);
    fillRect(buf, S, 21 + legSpread, 20 + bY, 4, 4, bodyDark);
    hLine(buf, S, 7 - legSpread, 20 + bY, 4, goldLine);
    hLine(buf, S, 21 + legSpread, 20 + bY, 4, goldLine);
    setPixel(buf, S, 8 - legSpread, 23 + bY, jointC);
    setPixel(buf, S, 9 - legSpread, 23 + bY, jointC);
    setPixel(buf, S, 22 + legSpread, 23 + bY, jointC);
    setPixel(buf, S, 23 + legSpread, 23 + bY, jointC);
    fillRect(buf, S, 5 - legSpread, 24 + bY, 4, 5, bodyMid);
    fillRect(buf, S, 23 + legSpread, 24 + bY, 4, 5, bodyMid);
    setPixel(buf, S, 6 - legSpread, 28 + bY, boosterC);
    setPixel(buf, S, 7 - legSpread, 29 + bY, boosterFire);
    setPixel(buf, S, 24 + legSpread, 28 + bY, boosterC);
    setPixel(buf, S, 25 + legSpread, 29 + bY, boosterFire);

    // 胴体（背面装甲: ダーク寄り）
    fillRect(buf, S, 10, 11 + bY, 12, 9, bodyDark);
    hLine(buf, S, 10, 11 + bY, 12, bodyEdge);
    hLine(buf, S, 10, 19 + bY, 12, bodyEdge);
    vLine(buf, S, 10, 11 + bY, 9, bodyEdge);
    vLine(buf, S, 21, 11 + bY, 9, bodyEdge);
    // バックパック（背面バーニアユニット）
    fillRect(buf, S, 12, 12 + bY, 8, 5, bodyMid);
    hLine(buf, S, 12, 12 + bY, 8, bodyEdge);
    hLine(buf, S, 12, 16 + bY, 8, goldLine);
    // バーニアノズル（ゴールド×4）
    setPixel(buf, S, 13, 13 + bY, boosterC);
    setPixel(buf, S, 15, 13 + bY, boosterC);
    setPixel(buf, S, 16, 13 + bY, boosterC);
    setPixel(buf, S, 18, 13 + bY, boosterC);
    setPixel(buf, S, 13, 15 + bY, boosterFire);
    setPixel(buf, S, 15, 15 + bY, boosterFire);
    setPixel(buf, S, 16, 15 + bY, boosterFire);
    setPixel(buf, S, 18, 15 + bY, boosterFire);

    // 腕（背面）
    fillRect(buf, S, 6, 12 + bY, 4, 6, bodyDark);
    fillRect(buf, S, 22, 12 + bY, 4, 6, bodyDark);
    hLine(buf, S, 6, 12 + bY, 4, bodyEdge);
    hLine(buf, S, 22, 12 + bY, 4, bodyEdge);
    setPixel(buf, S, 6, 12 + bY, jointC);
    setPixel(buf, S, 25, 12 + bY, jointC);

    // 頭部（背面: 後頭部、アンテナ下向き）
    fillRect(buf, S, 12, 20 + bY, 8, 7, bodyMain);
    hLine(buf, S, 12, 20 + bY, 8, bodyEdge);
    hLine(buf, S, 12, 26 + bY, 8, bodyEdge);
    vLine(buf, S, 12, 20 + bY, 7, bodyEdge);
    vLine(buf, S, 19, 20 + bY, 7, bodyEdge);
    // 後部センサーライン（マゼンタ）
    hLine(buf, S, 13, 22 + bY, 6, sensorDim);
    hLine(buf, S, 13, 24 + bY, 6, sensorDim);
    // アンテナ（頭頂下向き）
    setPixel(buf, S, 15, 27 + bY, goldLine);
    setPixel(buf, S, 16, 28 + bY, sensorC);
    setPixel(buf, S, 16, 29 + bY, hexToRGBA('#ffffff'));

    // 攻撃: 右腕キャノンを上向きに
    if (state === 'attack') {
      const recoilU = frame === 0 ? 2 : 0;
      fillRect(buf, S, 23, 4 + recoilU, 2, 7, cannonC);
      hLine(buf, S, 22, 4 + recoilU, 4, cannonTip);
      vLine(buf, S, 22, 4 + recoilU, 6, energyLine);
      if (frame === 0) {
        // チャージ: キャラ全体を白い輪郭ラインで縁取り、コア超高輝度
        const white = hexToRGBA('#ffffff');
        for (let y = 1; y < S - 1; y++) {
          for (let x = 1; x < S - 1; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              const neighbors = [
                buf[((y-1)*S+x)*4+3], buf[((y+1)*S+x)*4+3],
                buf[(y*S+x-1)*4+3],   buf[(y*S+x+1)*4+3],
              ];
              if (neighbors.some(a => a === 0)) {
                buf[idx] = 255; buf[idx+1] = 255; buf[idx+2] = 255; buf[idx+3] = 255;
              }
            }
          }
        }
        setPixel(buf, S, 23, 4, muzzleY);
        setPixel(buf, S, 24, 4, muzzleY);
        setPixel(buf, S, 23, 5, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 24, 5, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 22, 4, hexToRGBA('#ffff00'));
        setPixel(buf, S, 25, 4, hexToRGBA('#ffff00'));
      } else if (frame === 1) {
        // インパクト: キャラ黄色フラッシュ、上方向への衝撃波
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx]   = 255;
              buf[idx+1] = Math.min(255, buf[idx+1] + 180);
              buf[idx+2] = Math.max(0, buf[idx+2] - 80);
            }
          }
        }
        // 衝撃波（上方向）
        setPixel(buf, S, 24, 3, hexToRGBA('#ffffff'));
        setPixel(buf, S, 23, 3, hexToRGBA('#ffffff'));
        setPixel(buf, S, 25, 3, hexToRGBA('#ffffff'));
        setPixel(buf, S, 24, 2, hexToRGBA('#ffff00'));
        setPixel(buf, S, 22, 2, hexToRGBA('#ffff00'));
        setPixel(buf, S, 26, 2, hexToRGBA('#ffff00'));
        setPixel(buf, S, 23, 1, hexToRGBA('#ff8800'));
        setPixel(buf, S, 25, 1, hexToRGBA('#ff8800'));
        setPixel(buf, S, 24, 1, hexToRGBA('#ff8800'));
        setPixel(buf, S, 21, 2, hexToRGBA('#ff8800'));
        setPixel(buf, S, 27, 2, hexToRGBA('#ff8800'));
        setPixel(buf, S, 22, 0, sparkY);
        setPixel(buf, S, 26, 0, sparkY);
        setPixel(buf, S, 20, 3, sparkY);
        setPixel(buf, S, 28, 3, sparkY);
      } else if (frame === 2) {
        // 残光: 上方向シアンライン
        for (let dy = 0; dy < 5; dy++) {
          const alpha = Math.floor(200 - dy * 35);
          if (alpha <= 0) break;
          setPixel(buf, S, 23, 4 - dy, hexToRGBA('#00ffff', alpha));
          setPixel(buf, S, 24, 4 - dy, hexToRGBA('#00ffff', alpha));
          if (dy > 0) {
            setPixel(buf, S, 22, 4 - dy, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
            setPixel(buf, S, 25, 4 - dy, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
          }
        }
      }
    }

    if (state === 'hit') {
      if (frame === 0) {
        // 白フラッシュ + ノックバック2px右 + 大スパーク
        for (let y = S - 1; y >= 0; y--) {
          for (let x = S - 1; x >= 0; x--) {
            const src = (y * S + x) * 4;
            const dst = (y * S + Math.min(x + 2, S - 1)) * 4;
            buf[dst] = buf[src]; buf[dst+1] = buf[src+1];
            buf[dst+2] = buf[src+2]; buf[dst+3] = buf[src+3];
          }
          for (let x = 0; x < 2; x++) {
            const idx = (y * S + x) * 4;
            buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = 0;
          }
        }
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx] = 255; buf[idx+1] = 230; buf[idx+2] = 230;
            }
          }
        }
        const spBig = [[7,11],[22,10],[6,18],[25,16],[9,23],[23,22],[14,9],[17,25]];
        for (const [sx, sy] of spBig) {
          setPixel(buf, S, sx, sy + bY, hexToRGBA('#ffffff'));
          setPixel(buf, S, sx+1, sy + bY, sparkY);
          setPixel(buf, S, sx, sy + bY + 1, sparkY);
        }
        const spBig2 = [[8,12],[21,11],[7,19],[24,17],[10,24]];
        for (const [sx, sy] of spBig2) setPixel(buf, S, sx, sy + bY, sparkO);
      } else {
        // 鮮やかな赤塗りつぶし + 太い亀裂 + スパーク8点
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx] = 255; buf[idx+1] = 34; buf[idx+2] = 34;
            }
          }
        }
        const crackPixels = [
          [13,12],[14,12],[14,13],[15,13],[15,14],[16,14],
          [16,15],[17,15],[17,13],[18,13],[18,14],[19,14],
          [13,13],[15,15],[16,16],
        ];
        for (const [cx, cy] of crackPixels) {
          setPixel(buf, S, cx, cy + bY, hexToRGBA('#ff6600'));
          setPixel(buf, S, cx+1, cy + bY, hexToRGBA('#ffaa00'));
        }
        const spPx = [[9,11],[20,10],[7,18],[24,17],[11,22],[22,21],[15,8],[18,25]];
        for (const [sx, sy] of spPx) {
          setPixel(buf, S, sx, sy + bY, sparkY);
          setPixel(buf, S, sx+1, sy + bY, sparkO);
        }
      }
    }
    return;
  }

  // ---- LEFT 方向（左向き側面） ----
  if (direction === 'left') {
    const bX = (state === 'idle' && frame === 1) ? 1 : 0;
    const legShift = (state === 'move' && frame === 1) ? 1 : 0;

    // 脚部（側面: 前後の脚）
    // 前脚（左方向: 画面左＝進行方向）
    fillRect(buf, S, 3 - legShift, 20, 3, 4, bodyDark);
    hLine(buf, S, 3 - legShift, 20, 3, goldLine);
    setPixel(buf, S, 3 - legShift, 23, jointC);
    setPixel(buf, S, 4 - legShift, 23, jointC);
    fillRect(buf, S, 2 - legShift, 24, 4, 5, bodyMid);
    hLine(buf, S, 2 - legShift, 24, 4, bodyEdge);
    setPixel(buf, S, 2 - legShift, 28, boosterC);
    setPixel(buf, S, 3 - legShift, 29, boosterFire);
    // 後脚
    fillRect(buf, S, 25 + legShift, 20, 3, 4, bodyDark);
    hLine(buf, S, 25 + legShift, 20, 3, goldLine);
    setPixel(buf, S, 25 + legShift, 23, jointC);
    setPixel(buf, S, 26 + legShift, 23, jointC);
    fillRect(buf, S, 25 + legShift, 24, 4, 5, bodyMid);
    hLine(buf, S, 25 + legShift, 24, 4, bodyEdge);
    setPixel(buf, S, 27 + legShift, 28, boosterC);
    setPixel(buf, S, 28 + legShift, 29, boosterFire);

    // 胴体（側面装甲）
    fillRect(buf, S, 7 + bX, 12, 18, 9, bodyMain);
    hLine(buf, S, 7 + bX, 12, 18, bodyEdge);
    hLine(buf, S, 7 + bX, 20, 18, bodyEdge);
    vLine(buf, S, 7 + bX, 12, 9, bodyEdge);
    vLine(buf, S, 24 + bX, 12, 9, bodyEdge);
    // ゴールドアクセントライン
    hLine(buf, S, 8 + bX, 14, 16, goldLine);
    hLine(buf, S, 8 + bX, 19, 16, goldLine);
    // エネルギーコア（側面）
    setPixel(buf, S, 15 + bX, 16, coreColor);
    setPixel(buf, S, 16 + bX, 16, coreColor);
    setPixel(buf, S, 15 + bX, 17, coreDim);
    setPixel(buf, S, 14 + bX, 16, energyLine);
    setPixel(buf, S, 17 + bX, 16, energyLine);
    // 前側ダークパネル
    fillRect(buf, S, 8 + bX, 13, 3, 7, bodyDark);

    // 腕（上部に突き出し）
    fillRect(buf, S, 9 + bX, 7, 5, 5, bodyDark);
    hLine(buf, S, 9 + bX, 7, 5, bodyEdge);
    setPixel(buf, S, 9 + bX, 7, jointC);
    setPixel(buf, S, 13 + bX, 7, jointC);

    // 頭部（側面）
    fillRect(buf, S, 10 + bX, 3, 8, 9, bodyMain);
    hLine(buf, S, 10 + bX, 3, 8, bodyEdge);
    hLine(buf, S, 10 + bX, 11, 8, bodyEdge);
    vLine(buf, S, 10 + bX, 3, 9, bodyEdge);
    vLine(buf, S, 17 + bX, 3, 9, bodyEdge);
    // センサー（左向き: 左辺マゼンタ発光）
    vLine(buf, S, 10 + bX, 5, 4, sensorC);
    setPixel(buf, S, 9 + bX, 6, sensorC);
    setPixel(buf, S, 9 + bX, 7, sensorDim);
    setPixel(buf, S, 9 + bX, 8, sensorDim);
    // アンテナ（頭頂）
    setPixel(buf, S, 13 + bX, 2, goldLine);
    setPixel(buf, S, 14 + bX, 1, sensorC);

    // キャノン（左向き: 左に突き出し）
    const recoilL = (state === 'attack' && frame === 0) ? 2 : 0;
    fillRect(buf, S, 2 + recoilL, 14, 8 + bX - recoilL, 3, cannonC);
    vLine(buf, S, 2 + recoilL, 14, 3, cannonTip);
    hLine(buf, S, 2 + recoilL, 14, 2, energyLine);

    if (state === 'attack') {
      if (frame === 0) {
        // チャージ: 白縁取り + コア超高輝度
        const white = hexToRGBA('#ffffff');
        for (let y = 1; y < S - 1; y++) {
          for (let x = 1; x < S - 1; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              const neighbors = [
                buf[((y-1)*S+x)*4+3], buf[((y+1)*S+x)*4+3],
                buf[(y*S+x-1)*4+3],   buf[(y*S+x+1)*4+3],
              ];
              if (neighbors.some(a => a === 0)) {
                buf[idx] = 255; buf[idx+1] = 255; buf[idx+2] = 255; buf[idx+3] = 255;
              }
            }
          }
        }
        setPixel(buf, S, 3, 14, muzzleY);
        setPixel(buf, S, 3, 15, muzzleY);
        setPixel(buf, S, 3, 16, coreGreen);
        setPixel(buf, S, 2, 14, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 2, 16, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 2, 13, hexToRGBA('#ffff00'));
        setPixel(buf, S, 2, 17, hexToRGBA('#ffff00'));
      } else if (frame === 1) {
        // インパクト: 黄色フラッシュ + 左方向衝撃波
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx]   = 255;
              buf[idx+1] = Math.min(255, buf[idx+1] + 180);
              buf[idx+2] = Math.max(0, buf[idx+2] - 80);
            }
          }
        }
        setPixel(buf, S, 1, 15, hexToRGBA('#ffffff'));
        setPixel(buf, S, 1, 14, hexToRGBA('#ffffff'));
        setPixel(buf, S, 1, 16, hexToRGBA('#ffffff'));
        setPixel(buf, S, 0, 15, hexToRGBA('#ffff00'));
        setPixel(buf, S, 0, 14, hexToRGBA('#ffff00'));
        setPixel(buf, S, 0, 16, hexToRGBA('#ffff00'));
        setPixel(buf, S, 2, 13, hexToRGBA('#ff8800'));
        setPixel(buf, S, 2, 17, hexToRGBA('#ff8800'));
        setPixel(buf, S, 0, 13, hexToRGBA('#ff8800'));
        setPixel(buf, S, 0, 17, hexToRGBA('#ff8800'));
        setPixel(buf, S, 1, 12, sparkY);
        setPixel(buf, S, 1, 18, sparkY);
        setPixel(buf, S, 3, 11, sparkY);
        setPixel(buf, S, 3, 19, sparkY);
      } else if (frame === 2) {
        // 残光: 左方向シアンライン
        for (let dx = 0; dx < 5; dx++) {
          const alpha = Math.floor(200 - dx * 35);
          if (alpha <= 0) break;
          setPixel(buf, S, 2 - dx < 0 ? 0 : 2 - dx, 14, hexToRGBA('#00ffff', alpha));
          setPixel(buf, S, 2 - dx < 0 ? 0 : 2 - dx, 15, hexToRGBA('#00ffff', alpha));
          if (dx > 0) {
            setPixel(buf, S, 2 - dx < 0 ? 0 : 2 - dx, 13, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
            setPixel(buf, S, 2 - dx < 0 ? 0 : 2 - dx, 16, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
          }
        }
        setPixel(buf, S, 3, 13, hexToRGBA('#008888', 120));
        setPixel(buf, S, 3, 17, hexToRGBA('#008888', 120));
      }
    }

    if (state === 'hit') {
      if (frame === 0) {
        // 白フラッシュ + ノックバック2px右 + 大スパーク
        for (let y = S - 1; y >= 0; y--) {
          for (let x = S - 1; x >= 0; x--) {
            const src = (y * S + x) * 4;
            const dst = (y * S + Math.min(x + 2, S - 1)) * 4;
            buf[dst] = buf[src]; buf[dst+1] = buf[src+1];
            buf[dst+2] = buf[src+2]; buf[dst+3] = buf[src+3];
          }
          for (let x = 0; x < 2; x++) {
            const idx = (y * S + x) * 4;
            buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = 0;
          }
        }
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx] = 255; buf[idx+1] = 230; buf[idx+2] = 230;
            }
          }
        }
        const spBig = [[6,11],[23,12],[5,17],[24,18],[8,22],[21,21],[13,8],[16,25]];
        for (const [sx, sy] of spBig) {
          setPixel(buf, S, sx + bX, sy, hexToRGBA('#ffffff'));
          setPixel(buf, S, sx + bX + 1, sy, sparkY);
          setPixel(buf, S, sx + bX, sy + 1, sparkY);
        }
        const spBig2 = [[7,12],[22,13],[6,18],[23,19],[9,23]];
        for (const [sx, sy] of spBig2) setPixel(buf, S, sx + bX, sy, sparkO);
      } else {
        // 鮮やかな赤塗りつぶし + 太い亀裂 + スパーク8点
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx] = 255; buf[idx+1] = 34; buf[idx+2] = 34;
            }
          }
        }
        const crackPixels = [
          [11,13],[12,13],[12,14],[13,14],[13,15],[14,15],
          [14,16],[15,16],[15,17],[16,17],[11,14],[13,16],[14,17],
        ];
        for (const [cx, cy] of crackPixels) {
          setPixel(buf, S, cx + bX, cy, hexToRGBA('#ff6600'));
          setPixel(buf, S, cx + bX + 1, cy, hexToRGBA('#ffaa00'));
        }
        const spPx = [[8,12],[14,19],[17,13],[11,21],[7,17],[23,16],[13,9],[18,24]];
        for (const [sx, sy] of spPx) {
          setPixel(buf, S, sx + bX, sy, sparkY);
          setPixel(buf, S, sx + bX + 1, sy, sparkO);
        }
      }
    }
    return;
  }

  // ---- RIGHT 方向（右向き側面） ----
  if (direction === 'right') {
    const bX = (state === 'idle' && frame === 1) ? -1 : 0;
    const legShift = (state === 'move' && frame === 1) ? 1 : 0;

    // 脚部（右向き）
    // 前脚（右方向: 画面右＝進行方向）
    fillRect(buf, S, 26 + legShift, 20, 3, 4, bodyDark);
    hLine(buf, S, 26 + legShift, 20, 3, goldLine);
    setPixel(buf, S, 27 + legShift, 23, jointC);
    setPixel(buf, S, 28 + legShift, 23, jointC);
    fillRect(buf, S, 26 + legShift, 24, 4, 5, bodyMid);
    hLine(buf, S, 26 + legShift, 24, 4, bodyEdge);
    setPixel(buf, S, 29 + legShift, 28, boosterC);
    setPixel(buf, S, 28 + legShift, 29, boosterFire);
    // 後脚
    fillRect(buf, S, 4 - legShift, 20, 3, 4, bodyDark);
    hLine(buf, S, 4 - legShift, 20, 3, goldLine);
    setPixel(buf, S, 4 - legShift, 23, jointC);
    setPixel(buf, S, 5 - legShift, 23, jointC);
    fillRect(buf, S, 3 - legShift, 24, 4, 5, bodyMid);
    hLine(buf, S, 3 - legShift, 24, 4, bodyEdge);
    setPixel(buf, S, 3 - legShift, 28, boosterC);
    setPixel(buf, S, 4 - legShift, 29, boosterFire);

    // 胴体（右向き側面）
    fillRect(buf, S, 7, 12, 18, 9, bodyMain);
    hLine(buf, S, 7, 12, 18, bodyEdge);
    hLine(buf, S, 7, 20, 18, bodyEdge);
    vLine(buf, S, 7, 12, 9, bodyEdge);
    vLine(buf, S, 24 + bX, 12, 9, bodyEdge);
    // ゴールドアクセントライン
    hLine(buf, S, 8, 14, 16, goldLine);
    hLine(buf, S, 8, 19, 16, goldLine);
    // エネルギーコア（側面）
    setPixel(buf, S, 15 + bX, 16, coreColor);
    setPixel(buf, S, 16 + bX, 16, coreColor);
    setPixel(buf, S, 15 + bX, 17, coreDim);
    setPixel(buf, S, 14 + bX, 16, energyLine);
    setPixel(buf, S, 17 + bX, 16, energyLine);
    // 後側ダークパネル
    fillRect(buf, S, 21 + bX, 13, 3, 7, bodyDark);

    // 腕（上部に突き出し）
    fillRect(buf, S, 18 + bX, 7, 5, 5, bodyDark);
    hLine(buf, S, 18 + bX, 7, 5, bodyEdge);
    setPixel(buf, S, 18 + bX, 7, jointC);
    setPixel(buf, S, 22 + bX, 7, jointC);

    // 頭部（右向き側面）
    fillRect(buf, S, 14 + bX, 3, 8, 9, bodyMain);
    hLine(buf, S, 14 + bX, 3, 8, bodyEdge);
    hLine(buf, S, 14 + bX, 11, 8, bodyEdge);
    vLine(buf, S, 14 + bX, 3, 9, bodyEdge);
    vLine(buf, S, 21 + bX, 3, 9, bodyEdge);
    // センサー（右向き: 右辺マゼンタ発光）
    vLine(buf, S, 21 + bX, 5, 4, sensorC);
    setPixel(buf, S, 22 + bX, 6, sensorC);
    setPixel(buf, S, 22 + bX, 7, sensorDim);
    setPixel(buf, S, 22 + bX, 8, sensorDim);
    // アンテナ（頭頂）
    setPixel(buf, S, 18 + bX, 2, goldLine);
    setPixel(buf, S, 17 + bX, 1, sensorC);

    // キャノン（右に突き出し）
    const recoilR = (state === 'attack' && frame === 0) ? -2 : 0;
    const csX = 24 + bX;
    fillRect(buf, S, csX, 14, 6 + recoilR, 3, cannonC);
    vLine(buf, S, 29 + recoilR, 14, 3, cannonTip);
    hLine(buf, S, 29 + recoilR, 14, 2, energyLine);

    if (state === 'attack') {
      if (frame === 0) {
        // チャージ: 白縁取り + コア超高輝度
        for (let y = 1; y < S - 1; y++) {
          for (let x = 1; x < S - 1; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              const neighbors = [
                buf[((y-1)*S+x)*4+3], buf[((y+1)*S+x)*4+3],
                buf[(y*S+x-1)*4+3],   buf[(y*S+x+1)*4+3],
              ];
              if (neighbors.some(a => a === 0)) {
                buf[idx] = 255; buf[idx+1] = 255; buf[idx+2] = 255; buf[idx+3] = 255;
              }
            }
          }
        }
        setPixel(buf, S, 29, 14, muzzleY);
        setPixel(buf, S, 29, 15, muzzleY);
        setPixel(buf, S, 29, 16, coreGreen);
        setPixel(buf, S, 30, 14, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 30, 16, hexToRGBA('#ff00ff'));
        setPixel(buf, S, 30, 13, hexToRGBA('#ffff00'));
        setPixel(buf, S, 30, 17, hexToRGBA('#ffff00'));
      } else if (frame === 1) {
        // インパクト: 黄色フラッシュ + 右方向衝撃波
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx]   = 255;
              buf[idx+1] = Math.min(255, buf[idx+1] + 180);
              buf[idx+2] = Math.max(0, buf[idx+2] - 80);
            }
          }
        }
        setPixel(buf, S, 30, 15, hexToRGBA('#ffffff'));
        setPixel(buf, S, 30, 14, hexToRGBA('#ffffff'));
        setPixel(buf, S, 30, 16, hexToRGBA('#ffffff'));
        setPixel(buf, S, 31, 15, hexToRGBA('#ffff00'));
        setPixel(buf, S, 31, 14, hexToRGBA('#ffff00'));
        setPixel(buf, S, 31, 16, hexToRGBA('#ffff00'));
        setPixel(buf, S, 29, 13, hexToRGBA('#ff8800'));
        setPixel(buf, S, 29, 17, hexToRGBA('#ff8800'));
        setPixel(buf, S, 31, 13, hexToRGBA('#ff8800'));
        setPixel(buf, S, 31, 17, hexToRGBA('#ff8800'));
        setPixel(buf, S, 30, 12, sparkY);
        setPixel(buf, S, 30, 18, sparkY);
        setPixel(buf, S, 28, 11, sparkY);
        setPixel(buf, S, 28, 19, sparkY);
      } else if (frame === 2) {
        // 残光: 右方向シアンライン
        for (let dx = 0; dx < 5; dx++) {
          const alpha = Math.floor(200 - dx * 35);
          if (alpha <= 0) break;
          const tx = Math.min(29 + dx, S - 1);
          setPixel(buf, S, tx, 14, hexToRGBA('#00ffff', alpha));
          setPixel(buf, S, tx, 15, hexToRGBA('#00ffff', alpha));
          if (dx > 0) {
            setPixel(buf, S, tx, 13, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
            setPixel(buf, S, tx, 16, hexToRGBA('#00cccc', Math.floor(alpha * 0.6)));
          }
        }
        setPixel(buf, S, 28, 13, hexToRGBA('#008888', 120));
        setPixel(buf, S, 28, 17, hexToRGBA('#008888', 120));
      }
    }

    if (state === 'hit') {
      if (frame === 0) {
        // 白フラッシュ + ノックバック2px右 + 大スパーク
        for (let y = S - 1; y >= 0; y--) {
          for (let x = S - 1; x >= 0; x--) {
            const src = (y * S + x) * 4;
            const dst = (y * S + Math.min(x + 2, S - 1)) * 4;
            buf[dst] = buf[src]; buf[dst+1] = buf[src+1];
            buf[dst+2] = buf[src+2]; buf[dst+3] = buf[src+3];
          }
          for (let x = 0; x < 2; x++) {
            const idx = (y * S + x) * 4;
            buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = 0;
          }
        }
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx] = 255; buf[idx+1] = 230; buf[idx+2] = 230;
            }
          }
        }
        const spBig = [[7,11],[23,12],[5,18],[26,16],[9,23],[22,22],[14,8],[17,26]];
        for (const [sx, sy] of spBig) {
          setPixel(buf, S, sx, sy, hexToRGBA('#ffffff'));
          setPixel(buf, S, sx+1, sy, sparkY);
          setPixel(buf, S, sx, sy + 1, sparkY);
        }
        const spBig2 = [[8,12],[22,13],[6,19],[25,17],[10,24]];
        for (const [sx, sy] of spBig2) setPixel(buf, S, sx, sy, sparkO);
      } else {
        // 鮮やかな赤塗りつぶし + 太い亀裂 + スパーク8点
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const idx = (y * S + x) * 4;
            if (buf[idx + 3] > 0) {
              buf[idx] = 255; buf[idx+1] = 34; buf[idx+2] = 34;
            }
          }
        }
        const crackPixels = [
          [13,13],[14,13],[14,14],[15,14],[15,15],[16,15],
          [16,16],[17,16],[17,14],[18,14],[18,15],[19,15],
          [13,14],[15,16],[16,17],
        ];
        for (const [cx, cy] of crackPixels) {
          setPixel(buf, S, cx, cy, hexToRGBA('#ff6600'));
          setPixel(buf, S, cx+1, cy, hexToRGBA('#ffaa00'));
        }
        const spPx = [[8,12],[15,19],[18,13],[11,21],[7,17],[24,16],[14,9],[19,24]];
        for (const [sx, sy] of spPx) {
          setPixel(buf, S, sx, sy, sparkY);
          setPixel(buf, S, sx+1, sy, sparkO);
        }
      }
    }
  }
}

/**
 * 指定文字・状態・方向のフレーム群を生成してメタデータに追加するユーティリティ。
 */
async function generateLetterFrames(
  outDir: string,
  letter: PlayerLetter,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
  prefix: string,
): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];
  const frameCount = state === 'attack' ? 3 : 2;
  const S = TILE_SIZE;

  for (let frame = 0; frame < frameCount; frame++) {
    const buf = createBuffer(S, S);
    drawLetterChar(buf, S, letter, direction, state, frame);

    const fileName = prefix === ''
      ? `${state}_${direction}_${frame}.png`
      : `${prefix}_${state}_${direction}_${frame}.png`;
    const file = path.join(outDir, fileName);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/player/${fileName}`, width: S, height: S });
  }

  return frames;
}

/**
 * プレイヤーアイドルアニメーション 2 フレームを生成する（H文字、DOWN 向き）。
 */
async function generatePlayerIdle(outDir: string): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];
  const S = TILE_SIZE;

  for (let frame = 0; frame < 2; frame++) {
    const buf = createBuffer(S, S);
    drawLetterChar(buf, S, 'H', 'down', 'idle', frame);
    const file = path.join(outDir, `idle_${frame}.png`);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/player/idle_${frame}.png`, width: S, height: S });
  }

  return frames;
}

/**
 * プレイヤー移動アニメーション 2 フレームを生成する（H文字、DOWN 向き）。
 */
async function generatePlayerMove(outDir: string): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];
  const S = TILE_SIZE;

  for (let frame = 0; frame < 2; frame++) {
    const buf = createBuffer(S, S);
    drawLetterChar(buf, S, 'H', 'down', 'move', frame);
    const file = path.join(outDir, `move_${frame}.png`);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/player/move_${frame}.png`, width: S, height: S });
  }

  return frames;
}

/**
 * プレイヤースプライト群を生成する。
 * H文字（通常）、D文字（near_death）、A/B/S文字（バフ状態）を含む。
 */
async function generatePlayerSprites(meta: SpriteMeta): Promise<void> {
  console.log('\n[Player]');
  const outDir = path.join(SPRITES_DIR, 'player');
  ensureDir(outDir);

  // 後方互換: idle, move (H文字 DOWN向き)
  meta.player['idle'] = await generatePlayerIdle(outDir);
  meta.player['move'] = await generatePlayerMove(outDir);

  // H文字: 4方向 × idle, move, attack, hit
  const directions = ['down', 'up', 'left', 'right'] as const;
  for (const dir of directions) {
    meta.player[`idle_${dir}`]   = await generateLetterFrames(outDir, 'H', dir, 'idle',   '');
    meta.player[`move_${dir}`]   = await generateLetterFrames(outDir, 'H', dir, 'move',   '');
    meta.player[`attack_${dir}`] = await generateLetterFrames(outDir, 'H', dir, 'attack', '');
    meta.player[`hit_${dir}`]    = await generateLetterFrames(outDir, 'H', dir, 'hit',    '');
  }

  // 方向なし: item_use, near_death
  meta.player['item_use']   = await generatePlayerItemUse(outDir);
  meta.player['near_death'] = await generatePlayerNearDeath(outDir);

  // D 文字瀕死スプライト（全方向）、item_use は near_death_*.png で代用するため生成しない
  await generateLetterSprites(meta, outDir, 'D', 'd', false);

  // A, B, S, F 文字バフスプライト
  await generateLetterSprites(meta, outDir, 'A', 'a');
  await generateLetterSprites(meta, outDir, 'B', 'b');
  await generateLetterSprites(meta, outDir, 'S', 's');
  await generateLetterSprites(meta, outDir, 'F', 'f');
}

// ---------------------------------------------------------------------------
// プレイヤー方向別アニメーション生成
// ---------------------------------------------------------------------------

/**
 * プレイヤーの方向別・状態別アニメーションフレームを生成する（H文字）。
 * idle/hit: 2フレーム, move: 2フレーム, attack: 3フレーム
 */
async function generatePlayerDirectional(
  outDir: string,
  direction: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'move' | 'attack' | 'hit',
): Promise<SpriteFrame[]> {
  return generateLetterFrames(outDir, 'H', direction, state, '');
}

/**
 * 文字バフスプライトを全方向・全状態で生成する。
 * generateItemUse が false の場合は item_use を生成しない（D文字瀕死スプライト用）。
 */
async function generateLetterSprites(
  meta: SpriteMeta,
  outDir: string,
  letter: PlayerLetter,
  prefix: string,
  generateItemUse = true,
): Promise<void> {
  const directions = ['down', 'up', 'left', 'right'] as const;
  for (const dir of directions) {
    meta.player[`${prefix}_idle_${dir}`]   = await generateLetterFrames(outDir, letter, dir, 'idle',   prefix);
    meta.player[`${prefix}_move_${dir}`]   = await generateLetterFrames(outDir, letter, dir, 'move',   prefix);
    meta.player[`${prefix}_attack_${dir}`] = await generateLetterFrames(outDir, letter, dir, 'attack', prefix);
    meta.player[`${prefix}_hit_${dir}`]    = await generateLetterFrames(outDir, letter, dir, 'hit',    prefix);
  }

  if (!generateItemUse) return;

  // item_use（方向なし）
  const frames: SpriteFrame[] = [];
  const S = TILE_SIZE;
  const auraGreen  = hexToRGBA('#00ff88');
  const auraGreen2 = hexToRGBA('#00cc66');
  const auraGreen3 = hexToRGBA('#44ff88');

  for (let frame = 0; frame < 2; frame++) {
    const buf = createBuffer(S, S);
    drawLetterChar(buf, S, letter, 'down', 'idle', 0);

    if (frame === 0) {
      // 放射状12本の光線
      const armTipX = 8, armTipY = 8;
      const rayCount = 12;
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * 2 * Math.PI;
        const cos2 = Math.cos(angle);
        const sin2 = Math.sin(angle);
        const maxR = 20;
        for (let r = 1; r <= maxR; r++) {
          const px = Math.round(armTipX + r * cos2);
          const py = Math.round(armTipY + r * sin2);
          if (px < 0 || px >= S || py < 0 || py >= S) break;
          const brightness = r <= 4 ? 255 : r <= 8 ? 200 : r <= 12 ? 150 : 100;
          setPixel(buf, S, px, py, r <= 4 ? hexToRGBA('#aaffcc') : hexToRGBA('#00ff88', brightness));
        }
      }
      setPixel(buf, S, armTipX, armTipY, hexToRGBA('#ffffff'));
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        setPixel(buf, S, armTipX + dx, armTipY + dy, auraGreen);
      }
    } else {
      // 緑オーバーレイ
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const idx = (y * S + x) * 4;
          if (buf[idx + 3] > 0) {
            buf[idx]     = Math.max(0, buf[idx]     - 30);
            buf[idx + 1] = Math.min(255, buf[idx + 1] + 100);
            buf[idx + 2] = Math.max(0, buf[idx + 2]  - 10);
          }
        }
      }
      // 縁取り
      drawOutline(buf, S, hexToRGBA('#44ff88'));
      // 8方向スター
      const cx2 = 16, cy2 = 16;
      const starDirs = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]] as const;
      for (const [dx, dy] of starDirs) {
        for (let r = 1; r <= 4; r++) {
          const px = cx2 + dx * (8 + r);
          const py = cy2 + dy * (8 + r);
          const col = r <= 2 ? auraGreen3 : r === 3 ? auraGreen : auraGreen2;
          setPixel(buf, S, px, py, col);
          if (r === 2) {
            setPixel(buf, S, px + dy, py + dx, hexToRGBA('#00ff88', 180));
            setPixel(buf, S, px - dy, py - dx, hexToRGBA('#00ff88', 180));
          }
        }
      }
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[0,0]] as const) {
        setPixel(buf, S, cx2 + dx, cy2 + dy, hexToRGBA('#ffffff'));
      }
    }

    const fileName = `${prefix}_item_use_${frame}.png`;
    const file = path.join(outDir, fileName);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/player/${fileName}`, width: S, height: S });
  }
  meta.player[`${prefix}_item_use`] = frames;
}

/**
 * アイテム使用アニメーション（2フレーム）。
 * H文字をベースに緑のオーラ/放射光線エフェクト。
 */
async function generatePlayerItemUse(outDir: string): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];
  const auraGreen  = hexToRGBA('#00ff88');
  const auraGreen2 = hexToRGBA('#00cc66');
  const auraGreen3 = hexToRGBA('#44ff88');
  const auraWhite  = hexToRGBA('#aaffcc');
  const S = TILE_SIZE;

  for (let frame = 0; frame < 2; frame++) {
    const buf = createBuffer(S, S);
    drawLetterChar(buf, S, 'H', 'down', 'idle', 0);

    if (frame === 0) {
      // 腕先（x=8, y=10）から放射状12本の光線
      const armTipX = 8, armTipY = 10;
      const rayCount = 12;
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * 2 * Math.PI;
        const cos2 = Math.cos(angle);
        const sin2 = Math.sin(angle);
        const maxR = 20;
        for (let r = 1; r <= maxR; r++) {
          const px = Math.round(armTipX + r * cos2);
          const py = Math.round(armTipY + r * sin2);
          if (px < 0 || px >= S || py < 0 || py >= S) break;
          const brightness = r <= 4 ? 255 : r <= 8 ? 200 : r <= 12 ? 150 : 100;
          setPixel(buf, S, px, py, r <= 4 ? auraWhite : hexToRGBA('#00ff88', brightness));
        }
      }
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount + 0.5 / rayCount) * 2 * Math.PI;
        const cos2 = Math.cos(angle);
        const sin2 = Math.sin(angle);
        for (const r of [4, 7, 10, 13]) {
          const px = Math.round(armTipX + r * cos2);
          const py = Math.round(armTipY + r * sin2);
          setPixel(buf, S, px, py, hexToRGBA('#00cc66', 180));
        }
      }
      setPixel(buf, S, armTipX, armTipY, hexToRGBA('#ffffff'));
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        setPixel(buf, S, armTipX + dx, armTipY + dy, auraGreen);
      }
    } else {
      // 緑オーバーレイ
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const idx = (y * S + x) * 4;
          if (buf[idx + 3] > 0) {
            buf[idx]     = Math.max(0, buf[idx]     - 30);
            buf[idx + 1] = Math.min(255, buf[idx + 1] + 100);
            buf[idx + 2] = Math.max(0, buf[idx + 2]  - 10);
          }
        }
      }
      // 縁取り（#44ff88）
      drawOutline(buf, S, hexToRGBA('#44ff88'));
      // 8方向スター
      const cx2 = 16, cy2 = 16;
      const starDirs = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]] as const;
      for (const [dx, dy] of starDirs) {
        for (let r = 1; r <= 4; r++) {
          const px = cx2 + dx * (8 + r);
          const py = cy2 + dy * (8 + r);
          const col = r <= 2 ? auraGreen3 : r === 3 ? auraGreen : auraGreen2;
          setPixel(buf, S, px, py, col);
          if (r === 2) {
            setPixel(buf, S, px + dy, py + dx, hexToRGBA('#00ff88', 180));
            setPixel(buf, S, px - dy, py - dx, hexToRGBA('#00ff88', 180));
          }
        }
      }
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[0,0]] as const) {
        setPixel(buf, S, cx2 + dx, cy2 + dy, hexToRGBA('#ffffff'));
      }
    }

    const fileName = `item_use_${frame}.png`;
    const file = path.join(outDir, fileName);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/player/${fileName}`, width: S, height: S });
  }

  return frames;
}

/**
 * 瀕死アニメーション（near_death, 2フレーム）。
 * D文字デザイン: 暗青灰装甲、赤いエネルギー漏れ、ダメージクラック。
 */
async function generatePlayerNearDeath(outDir: string): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];
  const S = TILE_SIZE;

  for (let frame = 0; frame < 2; frame++) {
    const buf = createBuffer(S, S);
    // D文字をベースに idle 状態で描画
    drawLetterChar(buf, S, 'D', 'down', 'idle', frame);

    const fileName = `near_death_${frame}.png`;
    const file = path.join(outDir, fileName);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/player/${fileName}`, width: S, height: S });
  }

  return frames;
}

// ---------------------------------------------------------------------------
// 敵スプライト生成
// ---------------------------------------------------------------------------

/**
 * スカウトドローン（scout_drone）を生成する。
 * 浮遊する小型の赤系ドローン。フレームごとにプロペラ角度が変わる。
 */
async function generateScoutDrone(outDir: string): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];

  const body    = hexToRGBA('#cc4444');
  const shadow  = hexToRGBA('#882222');
  const light   = hexToRGBA('#ff8888');
  const prop    = hexToRGBA('#ffffff');
  const eyeBig  = hexToRGBA('#00ffff');
  const eyeBlink  = hexToRGBA('#aaffff');

  for (let frame = 0; frame < 2; frame++) {
    const S = TILE_SIZE;
    const buf = createBuffer(S, S);

    // 丸っこいかわいいボディ
    const cx = 16, cy = 18;
    for (let y = cy - 6; y <= cy + 6; y++) {
      for (let x = cx - 7; x <= cx + 7; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + ((y - cy) * 1.1) ** 2);
        if (dist <= 7) {
          setPixel(buf, S, x, y, dist < 5 ? body : shadow);
        }
      }
    }
    // ハイライト
    setPixel(buf, S, cx - 3, cy - 4, light);
    setPixel(buf, S, cx - 2, cy - 4, light);

    // 超巨大でかわいいセンサー目
    if (frame === 0) {
      fillRect(buf, S, cx - 2, cy - 2, 5, 5, hexToRGBA('#000000'));
      fillRect(buf, S, cx - 1, cy - 1, 3, 3, eyeBig);
      setPixel(buf, S, cx, cy - 1, hexToRGBA('#ffffff')); // ハイライト
    } else {
      // 瞬き（ニコッ）
      hLine(buf, S, cx - 2, cy, 5, eyeBlink);
      setPixel(buf, S, cx - 3, cy - 1, eyeBlink);
      setPixel(buf, S, cx + 3, cy - 1, eyeBlink);
    }

    // コミカルに大きなプロペラ（frame 0: 水平、frame 1: 回転）
    if (frame === 0) {
      hLine(buf, S, cx - 12, cy - 9, 10, prop);
      hLine(buf, S, cx + 3, cy - 9, 10, prop);
      fillRect(buf, S, cx - 1, cy - 9, 3, 3, shadow);
    } else {
      // 45度回転
      for (let i = 0; i < 7; i++) {
        setPixel(buf, S, cx - 4 - i, cy - 7 - i, prop);
        setPixel(buf, S, cx + 5 + i, cy - 7 - i, prop);
      }
      fillRect(buf, S, cx - 1, cy - 8, 3, 3, shadow);
    }

    // 下部スラスター
    fillRect(buf, S, cx - 2, cy + 6, 2, 2, shadow);
    fillRect(buf, S, cx + 1, cy + 6, 2, 2, shadow);

    const file = path.join(outDir, `scout_drone_${frame}.png`);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/enemies/scout_drone_${frame}.png`, width: S, height: S });
  }

  return frames;
}

/**
 * ガードボット（guard_bot）を生成する。
 * 重装の四角いロボット。赤いセンサー目。
 */
async function generateGuardBot(outDir: string): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];

  const armor   = hexToRGBA('#777777');
  const dark    = hexToRGBA('#444444');
  const light   = hexToRGBA('#aaaaaa');
  const sensor  = hexToRGBA('#ff2222');
  const sensorGlow = hexToRGBA('#ff8888');

  for (let frame = 0; frame < 2; frame++) {
    const S = TILE_SIZE;
    const buf = createBuffer(S, S);
    // frame=1 で微妙に1px 上下バウンド
    const bY = frame === 0 ? 2 : 3;

    // 脚部（幅6px x 5px、左右）
    fillRect(buf, S, 10, bY + 22, 5, 5, dark);
    fillRect(buf, S, 17, bY + 22, 5, 5, dark);
    hLine(buf, S, 10, bY + 22, 5, armor);
    hLine(buf, S, 17, bY + 22, 5, armor);

    // 胴体（幅広強そう）
    fillRect(buf, S, 8, bY + 9, 16, 14, armor);
    fillRect(buf, S, 8, bY + 9, 1, 14, dark);   // 左影
    fillRect(buf, S, 23, bY + 9, 1, 14, dark);  // 右影
    hLine(buf, S, 9, bY + 9, 14, light);        // 上ハイライト
    hLine(buf, S, 9, bY + 22, 14, dark);        // 下影
    // 胸部パネル
    fillRect(buf, S, 11, bY + 12, 10, 6, dark);
    hLine(buf, S, 12, bY + 13, 8, armor);

    // 肩部（左右 非常に巨大な強そうな肩装甲）
    fillRect(buf, S, 4, bY + 7, 5, 8, dark);
    fillRect(buf, S, 23, bY + 7, 5, 8, dark);
    fillRect(buf, S, 5, bY + 8, 3, 6, armor);
    fillRect(buf, S, 24, bY + 8, 3, 6, armor);
    hLine(buf, S, 5, bY + 8, 3, light);
    hLine(buf, S, 24, bY + 8, 3, light);

    // 頭部（幅12px x 8px）
    fillRect(buf, S, 10, bY + 1, 12, 8, armor);
    fillRect(buf, S, 10, bY + 1, 1, 8, dark);
    fillRect(buf, S, 21, bY + 1, 1, 8, dark);
    hLine(buf, S, 11, bY + 1, 10, light);

    // 強そうなV字型センサー目
    setPixel(buf, S, 12, bY + 3, sensor);
    setPixel(buf, S, 13, bY + 4, sensor);
    setPixel(buf, S, 14, bY + 5, sensor);
    setPixel(buf, S, 15, bY + 5, sensor);
    setPixel(buf, S, 16, bY + 5, sensor);
    setPixel(buf, S, 17, bY + 5, sensor);
    setPixel(buf, S, 18, bY + 4, sensor);
    setPixel(buf, S, 19, bY + 3, sensor);
    // frame=1 ではグロー点灯強化
    if (frame === 1) {
      setPixel(buf, S, 14, bY + 6, sensorGlow);
      setPixel(buf, S, 17, bY + 6, sensorGlow);
    }

    const file = path.join(outDir, `guard_bot_${frame}.png`);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/enemies/guard_bot_${frame}.png`, width: S, height: S });
  }

  return frames;
}

/**
 * スパーク（spark）を生成する。
 * 黄色/シアンの電気エネルギー体。フレームで稲妻の形が変わる。
 */
async function generateSpark(outDir: string): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];

  const yellow = hexToRGBA('#ffff00');
  const cyan   = hexToRGBA('#00ffff');
  const white  = hexToRGBA('#ffffff');
  const dimY   = hexToRGBA('#444400');

  // フレーム0: 大きめの稲妻（縦方向強調）
  const lightning0: Array<[number, number, RGBA]> = [
    [16, 4,  white],
    [16, 5,  yellow],
    [15, 6,  yellow],
    [14, 7,  yellow],
    [15, 8,  cyan],
    [16, 8,  cyan],
    [17, 9,  yellow],
    [18, 10, yellow],
    [17, 11, cyan],
    [16, 11, cyan],
    [15, 12, yellow],
    [14, 13, yellow],
    [15, 14, yellow],
    [16, 14, white],
    [16, 15, yellow],
    [17, 16, yellow],
    [16, 17, cyan],
    [16, 18, white],
    // 分岐1
    [13, 9,  cyan],
    [12, 10, yellow],
    [11, 11, dimY],
    // 分岐2
    [19, 13, cyan],
    [20, 14, yellow],
    [21, 15, dimY],
    // グロー周囲
    [15, 5,  dimY],
    [17, 5,  dimY],
    [13, 8,  dimY],
    [19, 9,  dimY],
  ];

  // フレーム1: 別の稲妻形（横方向強調）
  const lightning1: Array<[number, number, RGBA]> = [
    [8,  14, white],
    [9,  13, yellow],
    [10, 12, yellow],
    [11, 13, cyan],
    [12, 12, cyan],
    [13, 11, yellow],
    [14, 12, yellow],
    [15, 11, white],
    [16, 11, yellow],
    [17, 12, yellow],
    [18, 11, cyan],
    [19, 12, cyan],
    [20, 11, yellow],
    [21, 10, yellow],
    [22, 11, white],
    [23, 12, yellow],
    // 分岐上
    [15, 9,  cyan],
    [16, 8,  yellow],
    [17, 7,  white],
    [16, 7,  yellow],
    // 分岐下
    [14, 15, cyan],
    [13, 16, yellow],
    [12, 17, dimY],
    // グロー
    [8,  13, dimY],
    [8,  15, dimY],
    [23, 11, dimY],
    [23, 13, dimY],
  ];

  const lightnings = [lightning0, lightning1];

  for (let frame = 0; frame < 2; frame++) {
    const S = TILE_SIZE;
    const buf = createBuffer(S, S);

    for (const [x, y, color] of lightnings[frame]) {
      setPixel(buf, S, x, y, color);
    }

    const file = path.join(outDir, `spark_${frame}.png`);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/enemies/spark_${frame}.png`, width: S, height: S });
  }

  return frames;
}

// ---------------------------------------------------------------------------
// 追加敵スプライト生成関数
// ---------------------------------------------------------------------------

/** 2フレーム敵を生成する汎用ヘルパー */
async function generateTwoFrameEnemy(
  outDir: string,
  id: string,
  drawFn: (buf: Uint8Array, S: number, frame: number) => void,
): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];
  for (let frame = 0; frame < 2; frame++) {
    const S = TILE_SIZE;
    const buf = createBuffer(S, S);
    drawFn(buf, S, frame);
    const file = path.join(outDir, `${id}_${frame}.png`);
    await savePNG(buf, S, S, file);
    console.log('  Generated:', file);
    frames.push({ file: `public/sprites/enemies/${id}_${frame}.png`, width: S, height: S });
  }
  return frames;
}

/** マインビートル: 甲虫型、背中に爆弾 */
function drawMineBeetle(buf: Uint8Array, S: number, frame: number): void {
  const body   = hexToRGBA('#228822');
  const dark   = hexToRGBA('#114411');
  const light  = hexToRGBA('#44cc44');
  const bomb   = hexToRGBA('#ffcc00');
  const bombDk = hexToRGBA('#aa8800');
  const eye    = hexToRGBA('#ff2200');
  const bY = frame === 0 ? 8 : 9;
  // 甲殻ボディ（楕円）
  fillRect(buf, S, 10, bY + 4, 12, 10, body);
  fillRect(buf, S, 9,  bY + 6, 14, 6,  body);
  hLine(buf, S, 11, bY + 4, 10, light);
  // 脚（左右3本ずつ）
  for (let i = 0; i < 3; i++) {
    const ly = bY + 6 + i * 2;
    hLine(buf, S, 5, ly, 4, dark);
    hLine(buf, S, 23, ly, 4, dark);
  }
  // 頭部
  fillRect(buf, S, 12, bY + 1, 8, 4, body);
  fillRect(buf, S, 13, bY + 2, 2, 2, eye);
  fillRect(buf, S, 17, bY + 2, 2, 2, eye);
  // 背中の超巨大爆弾（コミカル）
  const bombY = bY - 6;
  fillRect(buf, S, 10, bombY, 12, 10, bomb);
  fillRect(buf, S, 10, bombY, 1, 10, bombDk);
  fillRect(buf, S, 21, bombY, 1, 10, bombDk);
  hLine(buf, S, 11, bombY, 10, hexToRGBA('#ffffff'));
  
  // 導火線
  setPixel(buf, S, 15, bombY - 1, dark);
  setPixel(buf, S, 16, bombY - 1, dark);
  if (frame === 1) {
    setPixel(buf, S, 15, bombY - 2, hexToRGBA('#ff0000'));
    setPixel(buf, S, 16, bombY - 2, hexToRGBA('#ffaa00'));
  }
}

/** スライムX: 不定形液体メカ */
function drawSlimeX(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#00bb44');
  const light = hexToRGBA('#44ff88');
  const dark  = hexToRGBA('#007722');
  const eye   = hexToRGBA('#ffffff');
  const cx = 16;
  const cy = frame === 0 ? 17 : 18;
  // メインボディ（不定形の楕円）
  for (let y = cy - 8; y <= cy + 7; y++) {
    for (let x = cx - 9; x <= cx + 9; x++) {
      const dx = x - cx, dy = y - cy;
      const r = 9 - Math.abs(dy) * 0.3;
      if (Math.abs(dx) <= r) {
        setPixel(buf, S, x, y, Math.abs(dx) < r - 1 ? body : dark);
      }
    }
  }
  // ハイライト
  for (let i = 0; i < 5; i++) setPixel(buf, S, cx - 3 + i, cy - 6, light);
  // 醜くコミカルな非対称の目
  const eyeOff = frame === 0 ? 0 : 1;
  // 左目（巨大で下に垂れている）
  fillRect(buf, S, cx - 6, cy - 3 + eyeOff, 5, 6, eye);
  fillRect(buf, S, cx - 5, cy - 1 + eyeOff, 2, 2, hexToRGBA('#000000'));
  // 右目（小さくて上にズレてる）
  fillRect(buf, S, cx + 3, cy - 4, 3, 3, eye);
  setPixel(buf, S, cx + 4, cy - 3, hexToRGBA('#000000'));
  // 底部の滴り
  if (frame === 0) {
    setPixel(buf, S, cx - 2, cy + 8, dark);
    setPixel(buf, S, cx + 2, cy + 8, dark);
  } else {
    setPixel(buf, S, cx - 2, cy + 9, dark);
    setPixel(buf, S, cx + 2, cy + 9, dark);
  }
}

/** ミニスライム: スライムXの小型版 */
function drawMiniSlime(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#00aa33');
  const light = hexToRGBA('#33ff77');
  const dark  = hexToRGBA('#006622');
  const eye   = hexToRGBA('#ffffff');
  const cx = 16, cy = frame === 0 ? 19 : 20;
  for (let y = cy - 5; y <= cy + 4; y++) {
    for (let x = cx - 6; x <= cx + 6; x++) {
      const dx = x - cx, dy = y - cy;
      const r = 6 - Math.abs(dy) * 0.4;
      if (Math.abs(dx) <= r) setPixel(buf, S, x, y, Math.abs(dx) < r - 1 ? body : dark);
    }
  }
  hLine(buf, S, cx - 2, cy - 4, 5, light);
  
  // かわいい単眼
  fillRect(buf, S, cx - 2, cy - 2, 4, 4, eye);
  fillRect(buf, S, cx - 1, cy - 1, 2, 2, hexToRGBA('#000000'));
  
  // かわいいニコニコ口（frame=1で開く）
  if (frame === 0) {
    setPixel(buf, S, cx - 1, cy + 2, dark);
    setPixel(buf, S, cx + 1, cy + 2, dark);
    setPixel(buf, S, cx, cy + 3, dark);
  } else {
    fillRect(buf, S, cx - 1, cy + 2, 3, 2, hexToRGBA('#ffaaaa'));
  }
}

/** ラストハウンド: 犬型4足歩行 */
function drawRustHound(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#885522');
  const light = hexToRGBA('#cc8844');
  const dark  = hexToRGBA('#552200');
  const eye   = hexToRGBA('#ff6600');
  const rust  = hexToRGBA('#994433');
  const bY = frame === 0 ? 7 : 8;
  // 胴体
  fillRect(buf, S, 9, bY + 8, 14, 8, body);
  hLine(buf, S, 10, bY + 8, 12, light);
  // 錆びたスポット
  setPixel(buf, S, 12, bY + 10, rust);
  setPixel(buf, S, 18, bY + 11, rust);
  // 頭部
  fillRect(buf, S, 18, bY + 3, 8, 7, body);
  hLine(buf, S, 19, bY + 3, 6, light);
  // 口先（鼻）
  fillRect(buf, S, 24, bY + 6, 3, 3, dark);
  // 目
  setPixel(buf, S, 20, bY + 5, eye);
  setPixel(buf, S, 21, bY + 5, eye);
  // 耳
  setPixel(buf, S, 19, bY + 2, body);
  setPixel(buf, S, 19, bY + 1, dark);
  // 脚（4本）- フレームで交互に動く
  if (frame === 0) {
    fillRect(buf, S, 9,  bY + 16, 3, 5, dark);
    fillRect(buf, S, 13, bY + 16, 3, 4, body);
    fillRect(buf, S, 17, bY + 16, 3, 4, body);
    fillRect(buf, S, 21, bY + 16, 3, 5, dark);
  } else {
    fillRect(buf, S, 9,  bY + 16, 3, 4, body);
    fillRect(buf, S, 13, bY + 16, 3, 5, dark);
    fillRect(buf, S, 17, bY + 16, 3, 5, dark);
    fillRect(buf, S, 21, bY + 16, 3, 4, body);
  }
  // 尻尾
  setPixel(buf, S, 7, bY + 9, light);
  setPixel(buf, S, 6, bY + 8, light);
  setPixel(buf, S, 5, bY + 7 + frame, light);
}

/** アサルトメカ: 人型兵士ロボ */
function drawAssaultMecha(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#555588');
  const light = hexToRGBA('#8888cc');
  const dark  = hexToRGBA('#333366');
  const sensor = hexToRGBA('#ff4444');
  const gun   = hexToRGBA('#222222');
  const bY = frame === 0 ? 1 : 2;
  // 脚
  fillRect(buf, S, 11, bY + 22, 4, 7, dark);
  fillRect(buf, S, 17, bY + 22, 4, 7, dark);
  hLine(buf, S, 11, bY + 22, 4, body);
  hLine(buf, S, 17, bY + 22, 4, body);
  // 胴体
  fillRect(buf, S, 10, bY + 10, 12, 12, body);
  fillRect(buf, S, 10, bY + 10, 1, 12, dark);
  fillRect(buf, S, 21, bY + 10, 1, 12, dark);
  hLine(buf, S, 11, bY + 10, 10, light);
  // 胸部パネル
  fillRect(buf, S, 13, bY + 13, 6, 5, dark);
  hLine(buf, S, 14, bY + 14, 4, body);
  // 肩
  fillRect(buf, S, 7, bY + 10, 3, 5, body);
  fillRect(buf, S, 22, bY + 10, 3, 5, body);
  // 頭部
  fillRect(buf, S, 12, bY + 2, 8, 8, body);
  fillRect(buf, S, 12, bY + 2, 1, 8, dark);
  fillRect(buf, S, 19, bY + 2, 1, 8, dark);
  hLine(buf, S, 13, bY + 2, 6, light);
  fillRect(buf, S, 13, bY + 5, 6, 2, sensor);
  setPixel(buf, S, 13, bY + 5, dark);
  setPixel(buf, S, 18, bY + 5, dark);
  // 銃（右腕に装備）
  fillRect(buf, S, 22, bY + 12, 7, 2, gun);
  if (frame === 1) setPixel(buf, S, 28, bY + 12, hexToRGBA('#ff8800'));
}

/** ステルスキラー: 半透明黒いスリムロボ */
function drawStealthKiller(buf: Uint8Array, S: number, frame: number): void {
  const alpha = frame === 0 ? 200 : 160;
  const body  = hexToRGBA('#222244', alpha);
  const light = hexToRGBA('#aaaaff', alpha);
  const dark  = hexToRGBA('#111122', alpha);
  const blade = hexToRGBA('#ffffff', alpha);
  const eye   = hexToRGBA('#ff00ff', 255);
  const bY = frame === 0 ? 2 : 3;
  // スリムな胴体
  fillRect(buf, S, 13, bY + 8, 6, 14, body);
  fillRect(buf, S, 13, bY + 8, 1, 14, dark);
  hLine(buf, S, 14, bY + 8, 4, light);
  // 細い頭
  fillRect(buf, S, 14, bY + 2, 4, 6, body);
  hLine(buf, S, 14, bY + 2, 4, light);
  // 目（赤い細いスリット）
  hLine(buf, S, 14, bY + 4, 4, eye);
  // 腕（細い）
  vLine(buf, S, 11, bY + 9, 8, dark);
  vLine(buf, S, 20, bY + 9, 8, dark);
  // 刃（左腕から伸びる）
  for (let i = 0; i < 6; i++) setPixel(buf, S, 10 - i, bY + 9 + i, blade);
  // 脚
  fillRect(buf, S, 12, bY + 22, 3, 6, dark);
  fillRect(buf, S, 17, bY + 22, 3, 6, dark);
}

/** シールドナイト: 盾持ち重装ロボ */
function drawShieldKnight(buf: Uint8Array, S: number, frame: number): void {
  const armor = hexToRGBA('#666666');
  const light = hexToRGBA('#aaaaaa');
  const dark  = hexToRGBA('#333333');
  const shield = hexToRGBA('#888888');
  const shieldH = hexToRGBA('#cccccc');
  const eye   = hexToRGBA('#ff2222');
  const bY = frame === 0 ? 1 : 2;
  // 脚（太い）
  fillRect(buf, S, 11, bY + 22, 5, 7, dark);
  fillRect(buf, S, 16, bY + 22, 5, 7, dark);
  // 胴体（幅広）
  fillRect(buf, S, 8, bY + 9, 16, 13, armor);
  fillRect(buf, S, 8, bY + 9, 1, 13, dark);
  fillRect(buf, S, 23, bY + 9, 1, 13, dark);
  hLine(buf, S, 9, bY + 9, 14, light);
  // 胸部装甲
  fillRect(buf, S, 11, bY + 12, 10, 6, dark);
  hLine(buf, S, 12, bY + 13, 8, armor);
  // 肩アーマー
  fillRect(buf, S, 5, bY + 9, 3, 7, armor);
  fillRect(buf, S, 24, bY + 9, 3, 7, armor);
  // 頭部
  fillRect(buf, S, 11, bY + 1, 10, 8, armor);
  fillRect(buf, S, 11, bY + 1, 1, 8, dark);
  fillRect(buf, S, 20, bY + 1, 1, 8, dark);
  hLine(buf, S, 12, bY + 1, 8, light);
  // 目スリット
  fillRect(buf, S, 13, bY + 4, 3, 2, eye);
  fillRect(buf, S, 16, bY + 4, 3, 2, eye);
  // 盾（左側）
  fillRect(buf, S, 2, bY + 5, 6, 14, shield);
  fillRect(buf, S, 3, bY + 5, 4, 1, shieldH);
  fillRect(buf, S, 2, bY + 5, 1, 14, shieldH);
  // 十字紋
  vLine(buf, S, 5, bY + 7, 10, dark);
  hLine(buf, S, 3, bY + 12, 4, dark);
}

/** マインレイヤー: 地雷設置型ロボ */
function drawMineLayer(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#885500');
  const light = hexToRGBA('#ffaa00');
  const dark  = hexToRGBA('#442200');
  const mine  = hexToRGBA('#ffcc00');
  const sensor = hexToRGBA('#ff6600');
  const bY = frame === 0 ? 2 : 3;
  // 車輪型の下半身
  for (let i = 0; i < 3; i++) {
    const wx = 8 + i * 7;
    fillRect(buf, S, wx, bY + 20, 5, 5, dark);
    setPixel(buf, S, wx + 2, bY + 22, light);
  }
  // 胴体
  fillRect(buf, S, 9, bY + 10, 14, 10, body);
  fillRect(buf, S, 9, bY + 10, 1, 10, dark);
  fillRect(buf, S, 22, bY + 10, 1, 10, dark);
  hLine(buf, S, 10, bY + 10, 12, light);
  // 地雷搭載部（背部）
  fillRect(buf, S, 11, bY + 7, 10, 4, dark);
  for (let i = 0; i < 3; i++) {
    fillRect(buf, S, 12 + i * 3, bY + 8, 2, 2, mine);
  }
  // 頭部（センサーヘッド）
  fillRect(buf, S, 12, bY + 2, 8, 8, body);
  hLine(buf, S, 13, bY + 2, 6, light);
  fillRect(buf, S, 14, bY + 4, 4, 3, sensor);
  if (frame === 1) hLine(buf, S, 14, bY + 4, 4, hexToRGBA('#ffff00'));
}

/** ヒーラードローン: 医療用ドローン */
function drawHealerDrone(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#44aa44');
  const light = hexToRGBA('#88ff88');
  const dark  = hexToRGBA('#226622');
  const cross = hexToRGBA('#ffffff');
  const prop  = hexToRGBA('#aaffaa');
  const bY = frame === 0 ? 1 : 2;
  // 本体（丸みのある四角）
  fillRect(buf, S, 10, bY + 10, 12, 10, body);
  fillRect(buf, S, 9, bY + 11, 14, 8, body);
  hLine(buf, S, 10, bY + 10, 12, light);
  fillRect(buf, S, 9, bY + 11, 1, 8, dark);
  // 緑十字マーク
  vLine(buf, S, 15, bY + 11, 8, cross);
  vLine(buf, S, 16, bY + 11, 8, cross);
  hLine(buf, S, 12, bY + 14, 8, cross);
  hLine(buf, S, 12, bY + 15, 8, cross);
  // プロペラ（左右）
  if (frame === 0) {
    hLine(buf, S, 3, bY + 8, 6, prop);
    hLine(buf, S, 23, bY + 8, 6, prop);
  } else {
    for (let i = 0; i < 4; i++) {
      setPixel(buf, S, 3 + i, bY + 7 + i, prop);
      setPixel(buf, S, 29 - i, bY + 7 + i, prop);
    }
  }
  // 下部スラスター
  fillRect(buf, S, 13, bY + 20, 6, 3, dark);
  setPixel(buf, S, 14, bY + 22, light);
  setPixel(buf, S, 17, bY + 22, light);
}

/** メタルウルフ: 狼型4足 */
function drawMetalWolf(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#666688');
  const light = hexToRGBA('#9999bb');
  const dark  = hexToRGBA('#333355');
  const eye   = hexToRGBA('#00ffff');
  const fang  = hexToRGBA('#ffffff');
  const bY = frame === 0 ? 6 : 7;
  // 胴体
  fillRect(buf, S, 8, bY + 8, 16, 9, body);
  hLine(buf, S, 9, bY + 8, 14, light);
  fillRect(buf, S, 8, bY + 8, 1, 9, dark);
  // 頭部（前）
  fillRect(buf, S, 19, bY + 3, 9, 8, body);
  hLine(buf, S, 20, bY + 3, 7, light);
  fillRect(buf, S, 19, bY + 3, 1, 8, dark);
  // 口先
  fillRect(buf, S, 25, bY + 7, 4, 3, dark);
  setPixel(buf, S, 26, bY + 9, fang);
  setPixel(buf, S, 27, bY + 9, fang);
  // 目
  fillRect(buf, S, 21, bY + 5, 2, 2, eye);
  // 耳
  setPixel(buf, S, 20, bY + 2, body);
  setPixel(buf, S, 20, bY + 1, dark);
  setPixel(buf, S, 25, bY + 2, body);
  setPixel(buf, S, 25, bY + 1, dark);
  // 尻尾
  for (let i = 0; i < 4; i++) setPixel(buf, S, 6 - i, bY + 8 + i + (frame === 1 ? 1 : 0), light);
  // 4本脚
  if (frame === 0) {
    fillRect(buf, S, 8,  bY + 17, 3, 6, dark);
    fillRect(buf, S, 12, bY + 17, 3, 5, body);
    fillRect(buf, S, 17, bY + 17, 3, 5, body);
    fillRect(buf, S, 21, bY + 17, 3, 6, dark);
  } else {
    fillRect(buf, S, 8,  bY + 17, 3, 5, body);
    fillRect(buf, S, 12, bY + 17, 3, 6, dark);
    fillRect(buf, S, 17, bY + 17, 3, 6, dark);
    fillRect(buf, S, 21, bY + 17, 3, 5, body);
  }
}

/** ボムロッバー: 投擲型ロボ */
function drawBombLobber(buf: Uint8Array, S: number, frame: number): void {
  const body   = hexToRGBA('#884400');
  const light  = hexToRGBA('#ff6600');
  const dark   = hexToRGBA('#442200');
  const bomb   = hexToRGBA('#333333');
  const fuse   = hexToRGBA('#ff4400');
  const bY = frame === 0 ? 1 : 2;
  // 脚
  fillRect(buf, S, 11, bY + 22, 4, 6, dark);
  fillRect(buf, S, 17, bY + 22, 4, 6, dark);
  // 胴体（ずんぐり）
  fillRect(buf, S, 9, bY + 9, 14, 13, body);
  fillRect(buf, S, 9, bY + 9, 1, 13, dark);
  fillRect(buf, S, 22, bY + 9, 1, 13, dark);
  hLine(buf, S, 10, bY + 9, 12, light);
  // 太い腕
  fillRect(buf, S, 5, bY + 9, 4, 10, dark);
  fillRect(buf, S, 23, bY + 9, 4, 10, dark);
  hLine(buf, S, 5, bY + 9, 4, body);
  // 頭部
  fillRect(buf, S, 11, bY + 2, 10, 7, body);
  fillRect(buf, S, 11, bY + 2, 1, 7, dark);
  hLine(buf, S, 12, bY + 2, 8, light);
  fillRect(buf, S, 14, bY + 4, 4, 3, hexToRGBA('#ff4444'));
  // 爆弾を持つ右腕
  fillRect(buf, S, 23, bY + 7, 4, 4, bomb);
  setPixel(buf, S, 25, bY + 6, fuse);
  setPixel(buf, S, 25, bY + 5, fuse);
  if (frame === 1) setPixel(buf, S, 25, bY + 4, hexToRGBA('#ffff00'));
}

/** アシッドスピッター: 酸液噴射 */
function drawAcidSpitter(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#44aa00');
  const light = hexToRGBA('#88ff00');
  const dark  = hexToRGBA('#226600');
  const acid  = hexToRGBA('#aaff00', 200);
  const nozzle = hexToRGBA('#228800');
  const bY = frame === 0 ? 2 : 3;
  // 脚
  fillRect(buf, S, 11, bY + 22, 4, 6, dark);
  fillRect(buf, S, 17, bY + 22, 4, 6, dark);
  // 胴体
  fillRect(buf, S, 10, bY + 9, 12, 13, body);
  fillRect(buf, S, 10, bY + 9, 1, 13, dark);
  fillRect(buf, S, 21, bY + 9, 1, 13, dark);
  hLine(buf, S, 11, bY + 9, 10, light);
  // 頭部（前傾き）
  fillRect(buf, S, 11, bY + 2, 10, 7, body);
  hLine(buf, S, 12, bY + 2, 8, light);
  // ノズル（口部）
  fillRect(buf, S, 20, bY + 5, 5, 3, nozzle);
  // 酸液噴射（frame=1で広がる）
  if (frame === 0) {
    hLine(buf, S, 25, bY + 6, 3, acid);
  } else {
    hLine(buf, S, 25, bY + 5, 4, acid);
    hLine(buf, S, 25, bY + 6, 5, acid);
    hLine(buf, S, 25, bY + 7, 4, acid);
  }
  // 目
  fillRect(buf, S, 13, bY + 4, 2, 2, hexToRGBA('#ff8800'));
}

/** キャノンタートル: 亀型砲撃ロボ */
function drawCannonTurtle(buf: Uint8Array, S: number, frame: number): void {
  const shell = hexToRGBA('#447744');
  const light = hexToRGBA('#66cc66');
  const dark  = hexToRGBA('#224422');
  const barrel = hexToRGBA('#333333');
  const flash = hexToRGBA('#ffff88');
  const bY = frame === 0 ? 3 : 4;
  // 甲羅（大きな楕円）
  fillRect(buf, S, 7, bY + 7, 18, 14, shell);
  fillRect(buf, S, 6, bY + 9, 20, 10, shell);
  hLine(buf, S, 8, bY + 7, 16, light);
  fillRect(buf, S, 6, bY + 9, 1, 10, dark);
  // 甲羅パターン
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      fillRect(buf, S, 9 + c * 5, bY + 9 + r * 4, 3, 2, light);
    }
  }
  // 頭部
  fillRect(buf, S, 20, bY + 3, 7, 6, shell);
  hLine(buf, S, 21, bY + 3, 5, light);
  fillRect(buf, S, 25, bY + 4, 2, 4, dark);
  // 砲身
  fillRect(buf, S, 24, bY + 5, 8, 3, barrel);
  if (frame === 1) {
    hLine(buf, S, 30, bY + 5, 2, flash);
    hLine(buf, S, 30, bY + 6, 2, flash);
    hLine(buf, S, 30, bY + 7, 2, flash);
  }
  // 脚（4本）
  for (let i = 0; i < 4; i++) {
    fillRect(buf, S, 7 + i * 6, bY + 20, 4, 4, dark);
  }
}

/** フェイズゴースト: 半透明幽霊型 */
function drawPhaseGhost(buf: Uint8Array, S: number, frame: number): void {
  const a = frame === 0 ? 150 : 120;
  const body  = hexToRGBA('#4444aa', a);
  const light = hexToRGBA('#8888ff', a);
  const dark  = hexToRGBA('#222266', a);
  const eye   = hexToRGBA('#ffffff', 220);
  const glow  = hexToRGBA('#aaaaff', 100);
  const cx = 16, cy = 16;
  // 幽霊ボディ（上半身が丸い）
  for (let y = cy - 9; y <= cy + 8; y++) {
    for (let x = cx - 7; x <= cx + 7; x++) {
      const dx = x - cx, dy = y - cy;
      if (y < cy) {
        if (dx * dx + dy * dy <= 49) setPixel(buf, S, x, y, body);
      } else {
        if (Math.abs(dx) <= 7 - (y - cy) * 0.2) setPixel(buf, S, x, y, body);
      }
    }
  }
  // 下部の波打つ裾
  for (let i = 0; i < 5; i++) {
    const xo = cx - 6 + i * 3;
    const yo = cy + 7 + (frame === 0 ? (i % 2) : (1 - i % 2));
    setPixel(buf, S, xo, yo, dark);
    setPixel(buf, S, xo + 1, yo + 1, dark);
  }
  // 輝く目
  fillRect(buf, S, cx - 3, cy - 3, 2, 2, eye);
  fillRect(buf, S, cx + 1, cy - 3, 2, 2, eye);
  // グロー
  setPixel(buf, S, cx - 2, cy - 1, glow);
  setPixel(buf, S, cx + 2, cy - 1, glow);
  // ハイライト
  hLine(buf, S, cx - 3, cy - 7, 7, light);
}

/** ミミック: 宝箱に擬態 */
function drawMimic(buf: Uint8Array, S: number, frame: number): void {
  const chest = hexToRGBA('#885500');
  const light = hexToRGBA('#ffcc00');
  const dark  = hexToRGBA('#443300');
  const metal = hexToRGBA('#888844');
  const eye   = hexToRGBA('#ff0000');
  const teeth = hexToRGBA('#ffffff');
  // 宝箱ボディ
  fillRect(buf, S, 6, 10, 20, 14, chest);
  fillRect(buf, S, 6, 10, 1, 14, dark);
  fillRect(buf, S, 25, 10, 1, 14, dark);
  hLine(buf, S, 7, 10, 18, light);
  hLine(buf, S, 7, 23, 18, dark);
  // 蓋（frame=0 閉じている、frame=1 開いて目が光る）
  fillRect(buf, S, 6, 5, 20, 6, chest);
  fillRect(buf, S, 6, 5, 1, 6, dark);
  fillRect(buf, S, 25, 5, 1, 6, dark);
  hLine(buf, S, 7, 5, 18, light);
  // 金具
  fillRect(buf, S, 14, 8, 4, 6, metal);
  hLine(buf, S, 15, 9, 2, light);
  // 金具ロック
  fillRect(buf, S, 15, 13, 2, 3, dark);
  if (frame === 0) {
    // 閉じている状態：隙間なし
    hLine(buf, S, 6, 11, 20, dark);
  } else {
    // 開いた状態：目が光り、歯が見える
    fillRect(buf, S, 9, 12, 3, 2, eye);
    fillRect(buf, S, 20, 12, 3, 2, eye);
    for (let i = 0; i < 6; i++) {
      setPixel(buf, S, 8 + i * 3, 11, teeth);
      setPixel(buf, S, 8 + i * 3, 12, dark);
    }
  }
}

/** バーサーカー: 全身傷だらけの大型ロボ */
function drawBerserker(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#aa2222');
  const light = hexToRGBA('#ff4444');
  const dark  = hexToRGBA('#661111');
  const scratch = hexToRGBA('#cc3333');
  const eye   = hexToRGBA('#ff8800');
  const bY = frame === 0 ? 1 : 2;
  // 大型の脚
  fillRect(buf, S, 9, bY + 22, 6, 7, dark);
  fillRect(buf, S, 17, bY + 22, 6, 7, dark);
  hLine(buf, S, 9, bY + 22, 6, body);
  hLine(buf, S, 17, bY + 22, 6, body);
  // 幅広胴体
  fillRect(buf, S, 7, bY + 9, 18, 13, body);
  fillRect(buf, S, 7, bY + 9, 1, 13, dark);
  fillRect(buf, S, 24, bY + 9, 1, 13, dark);
  hLine(buf, S, 8, bY + 9, 16, light);
  // 傷跡
  setPixel(buf, S, 10, bY + 12, scratch);
  setPixel(buf, S, 11, bY + 13, scratch);
  setPixel(buf, S, 20, bY + 11, scratch);
  setPixel(buf, S, 21, bY + 12, scratch);
  setPixel(buf, S, 19, bY + 13, scratch);
  // 大型肩
  fillRect(buf, S, 4, bY + 9, 3, 8, body);
  fillRect(buf, S, 25, bY + 9, 3, 8, body);
  // 頭部（角付き）
  fillRect(buf, S, 11, bY + 1, 10, 8, body);
  fillRect(buf, S, 11, bY + 1, 1, 8, dark);
  fillRect(buf, S, 20, bY + 1, 1, 8, dark);
  hLine(buf, S, 12, bY + 1, 8, light);
  // 角
  setPixel(buf, S, 12, bY, body);
  setPixel(buf, S, 12, bY - 1, dark);
  setPixel(buf, S, 19, bY, body);
  setPixel(buf, S, 19, bY - 1, dark);
  // 怒りの目
  fillRect(buf, S, 13, bY + 4, 3, 2, eye);
  fillRect(buf, S, 16, bY + 4, 3, 2, eye);
  if (frame === 1) {
    hLine(buf, S, 13, bY + 3, 3, hexToRGBA('#ffcc00'));
    hLine(buf, S, 16, bY + 3, 3, hexToRGBA('#ffcc00'));
  }
}

/** テレポーター: 電波/ワープ装置付き */
function drawTeleporter(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#2255aa');
  const light = hexToRGBA('#44aaff');
  const dark  = hexToRGBA('#112255');
  const wave  = hexToRGBA('#88ddff', frame === 0 ? 200 : 120);
  const core  = hexToRGBA('#ffffff');
  const bY = frame === 0 ? 2 : 1; // frame=1で上方向に浮く
  // 脚
  fillRect(buf, S, 12, bY + 22, 3, 6, dark);
  fillRect(buf, S, 17, bY + 22, 3, 6, dark);
  // 胴体
  fillRect(buf, S, 10, bY + 9, 12, 13, body);
  fillRect(buf, S, 10, bY + 9, 1, 13, dark);
  fillRect(buf, S, 21, bY + 9, 1, 13, dark);
  hLine(buf, S, 11, bY + 9, 10, light);
  // ワープコア（胸部）
  fillRect(buf, S, 14, bY + 12, 4, 4, dark);
  setPixel(buf, S, 15, bY + 13, core);
  setPixel(buf, S, 16, bY + 13, core);
  // 電波リング（フレームで大きさ変化）
  const r = frame === 0 ? 3 : 5;
  const cx = 16, cy = bY + 14;
  for (let angle = 0; angle < 360; angle += 15) {
    const rad = angle * Math.PI / 180;
    const rx = Math.round(cx + r * Math.cos(rad));
    const ry = Math.round(cy + r * Math.sin(rad));
    setPixel(buf, S, rx, ry, wave);
  }
  // 頭部
  fillRect(buf, S, 12, bY + 2, 8, 7, body);
  hLine(buf, S, 13, bY + 2, 6, light);
  // アンテナ（2本）
  setPixel(buf, S, 14, bY + 1, light);
  setPixel(buf, S, 14, bY,     light);
  setPixel(buf, S, 17, bY + 1, light);
  setPixel(buf, S, 17, bY,     light);
  fillRect(buf, S, 14, bY + 4, 4, 2, hexToRGBA('#44ffff'));
}

/** コマンダー: 指揮官型ロボ（旗持ち） */
function drawCommander(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#555500');
  const light = hexToRGBA('#aaaa00');
  const dark  = hexToRGBA('#333300');
  const flag  = hexToRGBA('#ffff00');
  const flagDk = hexToRGBA('#aaaa00');
  const medal = hexToRGBA('#ffcc00');
  const bY = frame === 0 ? 1 : 2;
  // 脚
  fillRect(buf, S, 11, bY + 22, 4, 6, dark);
  fillRect(buf, S, 17, bY + 22, 4, 6, dark);
  // 胴体
  fillRect(buf, S, 10, bY + 9, 12, 13, body);
  fillRect(buf, S, 10, bY + 9, 1, 13, dark);
  fillRect(buf, S, 21, bY + 9, 1, 13, dark);
  hLine(buf, S, 11, bY + 9, 10, light);
  // 勲章
  setPixel(buf, S, 15, bY + 12, medal);
  setPixel(buf, S, 16, bY + 12, medal);
  setPixel(buf, S, 15, bY + 14, medal);
  setPixel(buf, S, 16, bY + 14, medal);
  // 肩アーマー
  fillRect(buf, S, 7, bY + 9, 3, 6, body);
  fillRect(buf, S, 22, bY + 9, 3, 6, body);
  // 頭部（帽子付き）
  fillRect(buf, S, 12, bY + 2, 8, 7, body);
  fillRect(buf, S, 12, bY + 2, 1, 7, dark);
  hLine(buf, S, 13, bY + 2, 6, light);
  // 帽子（ひさし）
  fillRect(buf, S, 10, bY + 1, 12, 2, body);
  hLine(buf, S, 10, bY + 1, 12, light);
  // 目
  fillRect(buf, S, 14, bY + 5, 2, 2, hexToRGBA('#ff8800'));
  fillRect(buf, S, 17, bY + 5, 2, 2, hexToRGBA('#ff8800'));
  // 旗（右腕から伸びる）
  vLine(buf, S, 23, bY + 2, 12, dark);
  fillRect(buf, S, 24, bY + 2, 5, 4, flag);
  if (frame === 1) {
    setPixel(buf, S, 24, bY + 3, flagDk);
    setPixel(buf, S, 25, bY + 3, flagDk);
  }
}

/** マグスナイパー: 長距離狙撃 */
function drawMagSniper(buf: Uint8Array, S: number, frame: number): void {
  const body   = hexToRGBA('#334455');
  const light  = hexToRGBA('#6688aa');
  const dark   = hexToRGBA('#112233');
  const barrel = hexToRGBA('#222222');
  const scope  = hexToRGBA('#00ffff');
  const bY = frame === 0 ? 2 : 3;
  // スリムな脚
  fillRect(buf, S, 13, bY + 22, 3, 6, dark);
  fillRect(buf, S, 17, bY + 22, 3, 6, dark);
  // 細身胴体
  fillRect(buf, S, 11, bY + 9, 10, 13, body);
  fillRect(buf, S, 11, bY + 9, 1, 13, dark);
  fillRect(buf, S, 20, bY + 9, 1, 13, dark);
  hLine(buf, S, 12, bY + 9, 8, light);
  // 頭部（前傾き）
  fillRect(buf, S, 12, bY + 2, 8, 7, body);
  hLine(buf, S, 13, bY + 2, 6, light);
  fillRect(buf, S, 17, bY + 4, 2, 2, scope);
  // 超長い銃身
  fillRect(buf, S, 20, bY + 11, 12, 2, barrel);
  fillRect(buf, S, 20, bY + 13, 3, 2, barrel); // マガジン
  // スコープ
  fillRect(buf, S, 22, bY + 9, 4, 2, barrel);
  setPixel(buf, S, 23, bY + 9, scope);
  setPixel(buf, S, 24, bY + 9, scope);
  // マズルフラッシュ（frame=1）
  if (frame === 1) {
    setPixel(buf, S, 31, bY + 11, hexToRGBA('#ffff00'));
    setPixel(buf, S, 31, bY + 12, hexToRGBA('#ffff00'));
  }
}

/** デスマシーン: 巨大破壊ロボ */
function drawDeathMachine(buf: Uint8Array, S: number, frame: number): void {
  const body   = hexToRGBA('#333333');
  const light  = hexToRGBA('#666666');
  const dark   = hexToRGBA('#111111');
  const danger = hexToRGBA('#ff0000');
  const yellow = hexToRGBA('#ffaa00');
  const bY = frame === 0 ? 0 : 1;
  // キャタピラ（底部）
  fillRect(buf, S, 4, bY + 24, 24, 6, dark);
  for (let i = 0; i < 6; i++) {
    fillRect(buf, S, 5 + i * 4, bY + 25, 3, 4, body);
  }
  // 巨大な胴体
  fillRect(buf, S, 5, bY + 8, 22, 16, body);
  fillRect(buf, S, 5, bY + 8, 1, 16, dark);
  fillRect(buf, S, 26, bY + 8, 1, 16, dark);
  hLine(buf, S, 6, bY + 8, 20, light);
  // 危険マーキング（斜線）
  for (let i = 0; i < 5; i++) {
    setPixel(buf, S, 8 + i * 3, bY + 14, danger);
    setPixel(buf, S, 9 + i * 3, bY + 15, danger);
    setPixel(buf, S, 10 + i * 3, bY + 16, yellow);
  }
  // 頭部（コックピット）
  fillRect(buf, S, 10, bY + 2, 12, 6, body);
  fillRect(buf, S, 10, bY + 2, 1, 6, dark);
  fillRect(buf, S, 21, bY + 2, 1, 6, dark);
  hLine(buf, S, 11, bY + 2, 10, light);
  fillRect(buf, S, 12, bY + 3, 8, 3, danger);
  if (frame === 1) {
    for (let i = 0; i < 4; i++) setPixel(buf, S, 13 + i, bY + 3, yellow);
  }
  // 砲塔（左右）
  fillRect(buf, S, 2, bY + 10, 5, 3, dark);
  fillRect(buf, S, 25, bY + 10, 5, 3, dark);
}

/** リフレクター: ミラー装甲（銀色） */
function drawReflector(buf: Uint8Array, S: number, frame: number): void {
  const body   = hexToRGBA('#888888');
  const mirror = hexToRGBA('#dddddd');
  const dark   = hexToRGBA('#444444');
  const shine  = hexToRGBA('#ffffff');
  const bY = frame === 0 ? 2 : 3;
  // 脚
  fillRect(buf, S, 11, bY + 22, 4, 6, dark);
  fillRect(buf, S, 17, bY + 22, 4, 6, dark);
  // 胴体（ミラー装甲）
  fillRect(buf, S, 10, bY + 9, 12, 13, body);
  // ミラーパネル
  fillRect(buf, S, 11, bY + 10, 10, 11, mirror);
  fillRect(buf, S, 11, bY + 10, 1, 11, dark);
  hLine(buf, S, 12, bY + 10, 8, shine);
  // 反射ライン（フレームでシフト）
  const off = frame === 0 ? 0 : 2;
  for (let i = 0; i < 3; i++) {
    setPixel(buf, S, 12 + i + off, bY + 12 + i, shine);
  }
  // 頭部
  fillRect(buf, S, 12, bY + 2, 8, 7, body);
  fillRect(buf, S, 12, bY + 2, 1, 7, dark);
  hLine(buf, S, 13, bY + 2, 6, mirror);
  fillRect(buf, S, 13, bY + 4, 6, 2, mirror);
  // 目（鏡のように光る）
  setPixel(buf, S, 14, bY + 5, shine);
  setPixel(buf, S, 17, bY + 5, shine);
}

/** アビスワーム: 地中からのぞく虫型 */
function drawAbyssWorm(buf: Uint8Array, S: number, frame: number): void {
  const body   = hexToRGBA('#442244');
  const light  = hexToRGBA('#885588');
  const dark   = hexToRGBA('#220022');
  const fang   = hexToRGBA('#ffffff');
  const eye    = hexToRGBA('#ff00ff');
  const soil   = hexToRGBA('#331133', 180);
  // 地面（下部）
  fillRect(buf, S, 0, 22, 32, 10, soil);
  // 体（地面から出てくる節）
  for (let seg = 0; seg < 3; seg++) {
    const sy = 20 - seg * 6 + (frame === 1 ? 1 : 0);
    const sw = 10 - seg * 2;
    const sx = 16 - sw / 2;
    fillRect(buf, S, Math.floor(sx), sy, sw, 5, seg === 0 ? body : dark);
    hLine(buf, S, Math.floor(sx), sy, sw, light);
  }
  // 頭部（最上部）
  const hy = frame === 0 ? 6 : 7;
  fillRect(buf, S, 10, hy, 12, 10, body);
  fillRect(buf, S, 10, hy, 1, 10, dark);
  fillRect(buf, S, 21, hy, 1, 10, dark);
  hLine(buf, S, 11, hy, 10, light);
  // 目（複眼）
  fillRect(buf, S, 12, hy + 3, 3, 3, eye);
  fillRect(buf, S, 17, hy + 3, 3, 3, eye);
  // 顎と牙
  fillRect(buf, S, 11, hy + 8, 10, 3, dark);
  for (let i = 0; i < 4; i++) {
    setPixel(buf, S, 12 + i * 3, hy + 10, fang);
  }
}

/** クロノシフター: 時計型ロボ */
function drawChronoShifter(buf: Uint8Array, S: number, frame: number): void {
  const body   = hexToRGBA('#224422');
  const light  = hexToRGBA('#44aa44');
  const dark   = hexToRGBA('#112211');
  const clock  = hexToRGBA('#88ffaa');
  const hand   = hexToRGBA('#ffffff');
  const bY = frame === 0 ? 2 : 3;
  // 脚
  fillRect(buf, S, 11, bY + 22, 4, 6, dark);
  fillRect(buf, S, 17, bY + 22, 4, 6, dark);
  // 胴体
  fillRect(buf, S, 10, bY + 9, 12, 13, body);
  fillRect(buf, S, 10, bY + 9, 1, 13, dark);
  fillRect(buf, S, 21, bY + 9, 1, 13, dark);
  hLine(buf, S, 11, bY + 9, 10, light);
  // 胸部時計盤
  const cx = 16, cy = bY + 15;
  const cr = 4;
  for (let angle = 0; angle < 360; angle += 30) {
    const rad = angle * Math.PI / 180;
    setPixel(buf, S, Math.round(cx + cr * Math.cos(rad)), Math.round(cy + cr * Math.sin(rad)), clock);
  }
  fillRect(buf, S, cx - 1, cy - 1, 2, 2, clock);
  // 時計の針（フレームで回転）
  if (frame === 0) {
    vLine(buf, S, cx, cy - 3, 3, hand);
    hLine(buf, S, cx, cy, 3, hand);
  } else {
    for (let i = 1; i <= 3; i++) setPixel(buf, S, cx + i, cy - i, hand);
    vLine(buf, S, cx, cy, 3, hand);
  }
  // 頭部
  fillRect(buf, S, 12, bY + 2, 8, 7, body);
  hLine(buf, S, 13, bY + 2, 6, light);
  fillRect(buf, S, 14, bY + 4, 4, 2, clock);
}

/** ナノスウォーム: 無数の粒子が集まった形（点描） */
function drawNanoSwarm(buf: Uint8Array, S: number, frame: number): void {
  const dark = hexToRGBA('#444444');
  const mid  = hexToRGBA('#888888');
  const lite = hexToRGBA('#bbbbbb');
  // 疑似ランダム点描（固定シード）でロボットシルエット
  let seed = frame === 0 ? 77 : 99;
  const dots: Array<[number, number, number]> = [];
  // 核（中心部は密度高）
  for (let y = 6; y < 26; y++) {
    for (let x = 7; x < 25; x++) {
      const dx = x - 16, dy = y - 16;
      const dist = Math.sqrt(dx * dx + dy * dy);
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      const prob = Math.max(0, 1 - dist / 11);
      if ((seed & 0xff) / 255 < prob) {
        dots.push([x, y, seed & 0xff]);
      }
    }
  }
  for (const [x, y, v] of dots) {
    const color = v < 80 ? dark : v < 160 ? mid : lite;
    setPixel(buf, S, x, y, color);
  }
  // フレームごとに一部ピクセルをシフト
  if (frame === 1) {
    for (let i = 0; i < 8; i++) {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      const px = 8 + (seed % 16);
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      const py = 8 + (seed % 16);
      setPixel(buf, S, px, py, hexToRGBA('#cccccc'));
    }
  }
}

/** ヴォイドストーカー: 宇宙的恐怖、ブラック系 */
function drawVoidStalker(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#110011');
  const light = hexToRGBA('#cc00cc');
  const dark  = hexToRGBA('#000000');
  const eye   = hexToRGBA('#ff00ff', 255);
  const aura  = hexToRGBA('#440044', 180);
  const bY = frame === 0 ? 2 : 1;
  // オーラ（外縁）
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = x - 16, dy = y - 14;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= 12 && dist < 14) setPixel(buf, S, x, y, aura);
    }
  }
  // 脚（触手状）
  for (let i = 0; i < 3; i++) {
    const lx = 10 + i * 5;
    const ly = bY + 22 + (frame === 0 ? i % 2 : 1 - i % 2);
    vLine(buf, S, lx, ly, 5, dark);
    setPixel(buf, S, lx - 1, ly + 4, light);
  }
  // 胴体（暗黒）
  fillRect(buf, S, 9, bY + 8, 14, 14, body);
  fillRect(buf, S, 9, bY + 8, 1, 14, dark);
  fillRect(buf, S, 22, bY + 8, 1, 14, dark);
  hLine(buf, S, 10, bY + 8, 12, light);
  // 腕（触手状）
  vLine(buf, S, 7, bY + 9, 8, dark);
  vLine(buf, S, 24, bY + 9, 8, dark);
  setPixel(buf, S, 6, bY + 16, light);
  setPixel(buf, S, 25, bY + 16, light);
  // 頭部（禍々しい形）
  fillRect(buf, S, 11, bY + 1, 10, 7, body);
  fillRect(buf, S, 11, bY + 1, 1, 7, dark);
  hLine(buf, S, 12, bY + 1, 8, light);
  // 複数の目
  setPixel(buf, S, 13, bY + 3, eye);
  setPixel(buf, S, 15, bY + 4, eye);
  setPixel(buf, S, 18, bY + 3, eye);
  setPixel(buf, S, 16, bY + 5, eye);
  if (frame === 1) {
    setPixel(buf, S, 14, bY + 4, hexToRGBA('#ffffff'));
    setPixel(buf, S, 17, bY + 4, hexToRGBA('#ffffff'));
  }
}

/** ラストボスシャドウ: 最後の影 */
function drawLastBossShadow(buf: Uint8Array, S: number, frame: number): void {
  const body  = hexToRGBA('#000011');
  const light = hexToRGBA('#0000ff');
  const dark  = hexToRGBA('#000000');
  const glow  = hexToRGBA('#2222aa', 180);
  const eye   = hexToRGBA('#4444ff', 255);
  const bY = frame === 0 ? 1 : 0;
  // 底部グロー
  for (let x = 4; x < 28; x++) {
    setPixel(buf, S, x, bY + 28, glow);
    setPixel(buf, S, x, bY + 29, hexToRGBA('#000044', 120));
  }
  // 巨大な影のシルエット
  fillRect(buf, S, 6, bY + 6, 20, 22, body);
  fillRect(buf, S, 4, bY + 8, 24, 18, body);
  fillRect(buf, S, 4, bY + 8, 1, 18, dark);
  fillRect(buf, S, 27, bY + 8, 1, 18, dark);
  hLine(buf, S, 5, bY + 8, 22, light);
  // 翼のような突起
  fillRect(buf, S, 2, bY + 10, 4, 8, body);
  fillRect(buf, S, 26, bY + 10, 4, 8, body);
  setPixel(buf, S, 1, bY + 14, light);
  setPixel(buf, S, 30, bY + 14, light);
  // 王冠（頭部）
  fillRect(buf, S, 11, bY + 2, 10, 6, body);
  setPixel(buf, S, 11, bY + 1, light);
  setPixel(buf, S, 13, bY, light);
  setPixel(buf, S, 16, bY + 1, light);
  setPixel(buf, S, 18, bY, light);
  setPixel(buf, S, 20, bY + 1, light);
  // 輝く双眼
  fillRect(buf, S, 13, bY + 10, 3, 3, eye);
  fillRect(buf, S, 18, bY + 10, 3, 3, eye);
  if (frame === 1) {
    setPixel(buf, S, 14, bY + 11, hexToRGBA('#aaaaff'));
    setPixel(buf, S, 19, bY + 11, hexToRGBA('#aaaaff'));
    // フレーム1でオーラが外に広がる
    for (let i = 0; i < 4; i++) {
      setPixel(buf, S, 3, bY + 10 + i * 2, glow);
      setPixel(buf, S, 28, bY + 10 + i * 2, glow);
    }
  }
}

/**
 * scout_drone の hit フレーム（2枚）を描画する。
 * frame 0: 赤フラッシュドット散布, frame 1: 暗化バージョン
 */
function drawScoutDroneHit(buf: Uint8Array, S: number, frame: number): void {
  const body   = frame === 0 ? hexToRGBA('#cc4444') : hexToRGBA('#882222');
  const shadow = hexToRGBA('#661111');
  const hitRed = hexToRGBA('#ff2200');
  const sparkO = hexToRGBA('#ff6600');
  const cx = 16, cy = 16;

  // ボディ（楕円）
  for (let y = cy - 6; y <= cy + 6; y++) {
    for (let x = cx - 7; x <= cx + 7; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + ((y - cy) * 1.1) ** 2);
      if (dist <= 7) setPixel(buf, S, x, y, dist < 5 ? body : shadow);
    }
  }

  // 赤ダメージドット
  const hitDots = [[14, 13], [18, 15], [16, 12], [13, 17], [19, 13], [15, 18]];
  for (const [hx, hy] of hitDots) setPixel(buf, S, hx, hy, hitRed);

  if (frame === 1) {
    const sparks = [[12, 12], [20, 14], [15, 20], [18, 11]];
    for (const [sx, sy] of sparks) setPixel(buf, S, sx, sy, sparkO);
  }
}

/**
 * guard_bot の hit フレーム（2枚）を描画する。
 * frame 0: 赤フラッシュドット散布, frame 1: 暗化バージョン
 */
function drawGuardBotHit(buf: Uint8Array, S: number, frame: number): void {
  const armor  = frame === 0 ? hexToRGBA('#777777') : hexToRGBA('#444444');
  const dark   = hexToRGBA('#333333');
  const light  = frame === 0 ? hexToRGBA('#aaaaaa') : hexToRGBA('#666666');
  const hitRed = hexToRGBA('#ff2200');
  const sparkO = hexToRGBA('#ff6600');
  const bY = 2;

  // 脚部
  fillRect(buf, S, 10, bY + 22, 5, 5, dark);
  fillRect(buf, S, 17, bY + 22, 5, 5, dark);

  // 胴体
  fillRect(buf, S, 8, bY + 9, 16, 14, armor);
  fillRect(buf, S, 8, bY + 9, 1, 14, dark);
  fillRect(buf, S, 23, bY + 9, 1, 14, dark);
  hLine(buf, S, 9, bY + 9, 14, light);

  // 肩部
  fillRect(buf, S, 4, bY + 7, 5, 8, dark);
  fillRect(buf, S, 23, bY + 7, 5, 8, dark);
  fillRect(buf, S, 5, bY + 8, 3, 6, armor);
  fillRect(buf, S, 24, bY + 8, 3, 6, armor);

  // 頭部
  fillRect(buf, S, 10, bY + 1, 12, 8, armor);
  fillRect(buf, S, 10, bY + 1, 1, 8, dark);
  fillRect(buf, S, 21, bY + 1, 1, 8, dark);

  // 赤ダメージドット
  const hitDots = [[9, 12], [15, 18], [20, 11], [11, 20], [17, 15], [13, 13]];
  for (const [hx, hy] of hitDots) setPixel(buf, S, hx, hy + bY, hitRed);

  if (frame === 1) {
    const sparks = [[10, 10], [19, 13], [12, 21], [18, 16]];
    for (const [sx, sy] of sparks) setPixel(buf, S, sx, sy + bY, sparkO);
  }
}

/**
 * 敵スプライト群を生成する。
 */
async function generateEnemySprites(meta: SpriteMeta): Promise<void> {
  console.log('\n[Enemies]');
  const outDir = path.join(SPRITES_DIR, 'enemies');
  ensureDir(outDir);

  meta.enemies['scout_drone']      = await generateScoutDrone(outDir);
  meta.enemies['guard_bot']        = await generateGuardBot(outDir);
  meta.enemies['spark']            = await generateSpark(outDir);

  // hit フレーム（被ダメアニメーション）
  meta.enemies['scout_drone_hit']  = await generateTwoFrameEnemy(outDir, 'scout_drone_hit',  drawScoutDroneHit);
  meta.enemies['guard_bot_hit']    = await generateTwoFrameEnemy(outDir, 'guard_bot_hit',    drawGuardBotHit);

  meta.enemies['mine_beetle']      = await generateTwoFrameEnemy(outDir, 'mine_beetle',      drawMineBeetle);
  meta.enemies['slime_x']          = await generateTwoFrameEnemy(outDir, 'slime_x',          drawSlimeX);
  meta.enemies['mini_slime']       = await generateTwoFrameEnemy(outDir, 'mini_slime',       drawMiniSlime);
  meta.enemies['rust_hound']       = await generateTwoFrameEnemy(outDir, 'rust_hound',       drawRustHound);
  meta.enemies['assault_mecha']    = await generateTwoFrameEnemy(outDir, 'assault_mecha',    drawAssaultMecha);
  meta.enemies['stealth_killer']   = await generateTwoFrameEnemy(outDir, 'stealth_killer',   drawStealthKiller);
  meta.enemies['shield_knight']    = await generateTwoFrameEnemy(outDir, 'shield_knight',    drawShieldKnight);
  meta.enemies['mine_layer']       = await generateTwoFrameEnemy(outDir, 'mine_layer',       drawMineLayer);
  meta.enemies['healer_drone']     = await generateTwoFrameEnemy(outDir, 'healer_drone',     drawHealerDrone);
  meta.enemies['metal_wolf']       = await generateTwoFrameEnemy(outDir, 'metal_wolf',       drawMetalWolf);
  meta.enemies['bomb_lobber']      = await generateTwoFrameEnemy(outDir, 'bomb_lobber',      drawBombLobber);
  meta.enemies['acid_spitter']     = await generateTwoFrameEnemy(outDir, 'acid_spitter',     drawAcidSpitter);
  meta.enemies['cannon_turtle']    = await generateTwoFrameEnemy(outDir, 'cannon_turtle',    drawCannonTurtle);
  meta.enemies['phase_ghost']      = await generateTwoFrameEnemy(outDir, 'phase_ghost',      drawPhaseGhost);
  meta.enemies['mimic']            = await generateTwoFrameEnemy(outDir, 'mimic',            drawMimic);
  meta.enemies['berserker']        = await generateTwoFrameEnemy(outDir, 'berserker',        drawBerserker);
  meta.enemies['teleporter']       = await generateTwoFrameEnemy(outDir, 'teleporter',       drawTeleporter);
  meta.enemies['commander']        = await generateTwoFrameEnemy(outDir, 'commander',        drawCommander);
  meta.enemies['mag_sniper']       = await generateTwoFrameEnemy(outDir, 'mag_sniper',       drawMagSniper);
  meta.enemies['death_machine']    = await generateTwoFrameEnemy(outDir, 'death_machine',    drawDeathMachine);
  meta.enemies['reflector']        = await generateTwoFrameEnemy(outDir, 'reflector',        drawReflector);
  meta.enemies['abyss_worm']       = await generateTwoFrameEnemy(outDir, 'abyss_worm',       drawAbyssWorm);
  meta.enemies['chrono_shifter']   = await generateTwoFrameEnemy(outDir, 'chrono_shifter',   drawChronoShifter);
  meta.enemies['nano_swarm']       = await generateTwoFrameEnemy(outDir, 'nano_swarm',       drawNanoSwarm);
  meta.enemies['void_stalker']     = await generateTwoFrameEnemy(outDir, 'void_stalker',     drawVoidStalker);
  meta.enemies['last_boss_shadow'] = await generateTwoFrameEnemy(outDir, 'last_boss_shadow', drawLastBossShadow);

  // 方向別サポート（down / left） × idle + attack
  await generateEnemyDirectional(outDir, meta, 'scout_drone',  drawScoutDroneFrame);
  await generateEnemyDirectional(outDir, meta, 'guard_bot',    drawGuardBotFrame);
  await generateEnemyDirectional(outDir, meta, 'rust_hound',   drawRustHoundFrame);

  // B10F以下 全敵の4方向フルスプライト
  await generateB10FEnemySprites(outDir);
}

// ---------------------------------------------------------------------------
// 敵方向別スプライト生成
// ---------------------------------------------------------------------------

/**
 * scout_drone の単フレーム描画（方向対応）。
 */
function drawScoutDroneFrame(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'left',
  state: 'idle' | 'attack',
  frame: number,
): void {
  const body   = hexToRGBA('#cc4444');
  const shadow = hexToRGBA('#882222');
  const light  = hexToRGBA('#ff8888');
  const eyeC   = hexToRGBA('#00ffff');
  const atkC   = hexToRGBA('#ff8800');

  const cx = direction === 'left' ? 14 : 16;
  const cy = 16;
  const bY = frame === 1 ? 1 : 0;

  for (let y = cy - 6 + bY; y <= cy + 6 + bY; y++) {
    for (let x = cx - 7; x <= cx + 7; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + ((y - cy - bY) * 1.1) ** 2);
      if (dist <= 7) setPixel(buf, S, x, y, dist < 5 ? body : shadow);
    }
  }
  setPixel(buf, S, cx - 3, cy - 4 + bY, light);
  setPixel(buf, S, cx - 2, cy - 4 + bY, light);

  if (direction === 'left') {
    // 横向き: 目を左側に
    fillRect(buf, S, cx - 4, cy - 1 + bY, 3, 3, hexToRGBA('#000000'));
    fillRect(buf, S, cx - 3, cy - 1 + bY, 2, 2, eyeC);
  } else {
    fillRect(buf, S, cx - 2, cy - 2 + bY, 5, 5, hexToRGBA('#000000'));
    fillRect(buf, S, cx - 1, cy - 1 + bY, 3, 3, eyeC);
  }

  if (state === 'attack') {
    // 攻撃: 前に突進エフェクト
    const atkX = direction === 'left' ? cx - 8 : cx + 6;
    fillRect(buf, S, atkX, cy - 2 + bY, 4, 4, atkC);
  }
}

/**
 * guard_bot の単フレーム描画（方向対応）。
 */
function drawGuardBotFrame(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'left',
  state: 'idle' | 'attack',
  frame: number,
): void {
  const body   = hexToRGBA('#888888');
  const shadow = hexToRGBA('#555555');
  const light  = hexToRGBA('#bbbbbb');
  const eyeC   = hexToRGBA('#ff0000');
  const atkC   = hexToRGBA('#ff4400');
  const bY = frame === 1 ? 1 : 0;
  const cx = direction === 'left' ? 13 : 16;

  // 胴体
  fillRect(buf, S, cx - 6, bY + 10, 12, 12, body);
  fillRect(buf, S, cx - 6, bY + 10,  1, 12, shadow);
  fillRect(buf, S, cx + 5, bY + 10,  1, 12, shadow);
  hLine(buf, S, cx - 5, bY + 10, 10, light);

  // 頭部
  fillRect(buf, S, cx - 5, bY + 3, 10, 7, body);
  fillRect(buf, S, cx - 3, bY + 5, 6, 3, hexToRGBA('#111111'));
  if (direction === 'left') {
    fillRect(buf, S, cx - 3, bY + 5, 3, 2, eyeC);
  } else {
    fillRect(buf, S, cx - 3, bY + 5, 2, 2, eyeC);
    fillRect(buf, S, cx + 1, bY + 5, 2, 2, eyeC);
  }

  // 腕
  fillRect(buf, S, cx - 9, bY + 11, 3, 6, shadow);
  fillRect(buf, S, cx + 6, bY + 11, 3, 6, body);

  if (state === 'attack') {
    const atkX = direction === 'left' ? cx - 12 : cx + 8;
    fillRect(buf, S, atkX, bY + 10, 5, 5, atkC);
  }

  // 脚
  fillRect(buf, S, cx - 5, bY + 22, 4, 6, shadow);
  fillRect(buf, S, cx + 1, bY + 22, 4, 6, body);
}

/**
 * rust_hound の単フレーム描画（方向対応）。
 */
function drawRustHoundFrame(
  buf: Uint8Array,
  S: number,
  direction: 'down' | 'left',
  state: 'idle' | 'attack',
  frame: number,
): void {
  const body   = hexToRGBA('#aa6622');
  const shadow = hexToRGBA('#774411');
  const light  = hexToRGBA('#ddaa66');
  const eyeC   = hexToRGBA('#ffff00');
  const atkC   = hexToRGBA('#ff2200');
  const bY = frame === 1 ? 1 : 0;

  if (direction === 'left') {
    // 横向き: 犬型横シルエット
    fillRect(buf, S, 4, bY + 14, 18, 8, body);
    fillRect(buf, S, 4, bY + 14,  1,  8, shadow);
    hLine(buf, S, 5, bY + 14, 16, light);
    // 頭
    fillRect(buf, S, 4, bY + 8, 8, 8, body);
    setPixel(buf, S, 5, bY + 10, eyeC);
    // 口（state=attack で開く）
    if (state === 'attack') {
      fillRect(buf, S, 4, bY + 14, 4, 3, atkC);
    }
    // 脚
    for (let i = 0; i < 4; i++) {
      fillRect(buf, S, 5 + i * 4, bY + 22, 3, frame === 0 ? 5 : 4, shadow);
    }
  } else {
    // down（正面）
    const cx = 16;
    fillRect(buf, S, cx - 6, bY + 10, 12, 10, body);
    fillRect(buf, S, cx - 4, bY + 4, 8, 8, body);
    setPixel(buf, S, cx - 2, bY + 6, eyeC);
    setPixel(buf, S, cx + 1, bY + 6, eyeC);
    if (state === 'attack') {
      fillRect(buf, S, cx - 3, bY + 10, 6, 3, atkC);
    }
    for (let i = 0; i < 2; i++) {
      fillRect(buf, S, cx - 5 + i * 8, bY + 20, 4, frame === 0 ? 6 : 5, shadow);
    }
  }
}

/**
 * 方向別敵スプライトを生成してメタデータに登録する。
 * キーは `{id}_dir_{direction}_{state}` 形式。
 */
async function generateEnemyDirectional(
  outDir: string,
  meta: SpriteMeta,
  id: string,
  drawFn: (buf: Uint8Array, S: number, dir: 'down' | 'left', state: 'idle' | 'attack', frame: number) => void,
): Promise<void> {
  for (const dir of ['down', 'left'] as const) {
    for (const state of ['idle', 'attack'] as const) {
      const frameCount = state === 'attack' ? 3 : 2;
      const frames: SpriteFrame[] = [];
      for (let frame = 0; frame < frameCount; frame++) {
        const S = TILE_SIZE;
        const buf = createBuffer(S, S);
        drawFn(buf, S, dir, state, frame);
        const fileName = `${id}_dir_${dir}_${state}_${frame}.png`;
        const file = path.join(outDir, fileName);
        await savePNG(buf, S, S, file);
        console.log('  Generated:', file);
        frames.push({ file: `public/sprites/enemies/${fileName}`, width: S, height: S });
      }
      meta.enemies[`${id}_dir_${dir}_${state}`] = frames;
    }
  }
}

// ---------------------------------------------------------------------------
// NPC スプライト生成
// ---------------------------------------------------------------------------

/**
 * ショップ NPC (shop_npc.png) を生成する。
 * ネオン線画スタイルのショップ陳列台。
 * 背景透明、シアン／赤のアウトラインのみ。
 */
async function generateShopNpc(outDir: string): Promise<SpriteFrame> {
  const S    = TILE_SIZE;
  const buf  = createBuffer(S, S);
  const cyan = hexToRGBA('#ffcc00');
  const red  = hexToRGBA('#ff4444');
  const navy = hexToRGBA('#1a0a00');

  // ---- 巾着袋 (y=0..4, x=12..19, 中央配置) ----
  // 巾着本体: fillRect(x=13, y=1, w=6, h=4, red)
  fillRect(buf, S, 13, 1, 6, 4, red);
  // 巾着紐: hLine(x=14, y=0, len=4, cyan)
  hLine(buf, S, 14, 0, 4, cyan);
  // 巾着底: 下弧をピクセルで表現（y=5 両端を除いた横線）
  hLine(buf, S, 14, 5, 4, cyan);
  setPixel(buf, S, 13, 4, cyan);
  setPixel(buf, S, 19, 4, cyan);

  // ---- 商品ボード (x=0..31, y=4..19) ----
  // 枠線1px
  hLine(buf, S, 0,  4, 32, cyan); // 上辺 y=4
  hLine(buf, S, 0, 19, 32, cyan); // 下辺 y=19
  vLine(buf, S, 0,  5, 14, cyan); // 左辺 x=0, y=5..18
  vLine(buf, S, 31, 5, 14, cyan); // 右辺 x=31, y=5..18
  // 内部塗りつぶし: fillRect(x=1, y=5, w=30, h=14, navy)
  fillRect(buf, S, 1, 5, 30, 14, navy);
  // 中央縦分割線: vLine(x=15, y=5, len=14) シアン
  vLine(buf, S, 15, 5, 14, cyan);

  // ---- 左ゾーン (x=1..14, y=5..18) ----

  // バッテリーアイコン (x=2..7, y=6..11): 枠シアン3x5, 内部赤2x3, 端子シアン1x1
  // 枠（外形 w=6,h=6 → x=2..7, y=6..11）
  hLine(buf, S, 2,  6, 6, cyan); // 上辺
  hLine(buf, S, 2, 11, 6, cyan); // 下辺
  vLine(buf, S, 2,  7, 4, cyan); // 左辺
  vLine(buf, S, 7,  7, 4, cyan); // 右辺
  // 内部充電量（赤 2x3 → x=3..4, y=7..9）
  fillRect(buf, S, 3, 7, 3, 3, red);
  // 端子（シアン 1x2 → x=8, y=8..9）
  vLine(buf, S, 8, 8, 2, cyan);

  // ポーション瓶 (x=2..5, y=12..17): 枠赤2x4+頭1x2
  // 瓶本体（x=2..5, y=14..17）
  hLine(buf, S, 2, 14, 4, red); // 上辺
  hLine(buf, S, 2, 17, 4, red); // 下辺
  vLine(buf, S, 2, 14, 4, red); // 左辺
  vLine(buf, S, 5, 14, 4, red); // 右辺
  // 瓶頸（x=3..4, y=12..13）
  vLine(buf, S, 3, 12, 2, red);
  vLine(buf, S, 4, 12, 2, red);

  // シールド (x=8..13, y=12..17): 枠シアン4x4+内部赤ハート2x2
  // 盾外形
  hLine(buf, S, 8,  12, 6, cyan); // 上辺
  vLine(buf, S, 8,  12, 5, cyan); // 左辺
  vLine(buf, S, 13, 12, 5, cyan); // 右辺
  // 盾底を尖らせる（中央1px）
  setPixel(buf, S, 10, 17, cyan);
  setPixel(buf, S, 11, 17, cyan);
  hLine(buf, S, 9, 16, 4, cyan);
  // 内部ハート（赤 2x2 → x=10..11, y=13..14）
  fillRect(buf, S, 10, 13, 2, 2, red);

  // ---- 右ゾーン (x=16..30, y=5..18) ----

  // 銃 (x=18..28, y=6..10): 銃身シアン8x2, 銃口先端シアン, グリップ赤2x3
  // 銃身（x=18..25, y=7..8）
  hLine(buf, S, 18, 7, 8, cyan);
  hLine(buf, S, 18, 8, 8, cyan);
  // 銃口先端（x=26..27, y=7）
  hLine(buf, S, 26, 7, 2, cyan);
  // グリップ（赤 x=19..20, y=9..11）
  fillRect(buf, S, 19, 9, 2, 3, red);

  // 剣 (対角線, x=17..27, y=11..17): シアン斜めライン7px, 柄赤2x2
  // 斜め刀身（左上→右下）
  for (let i = 0; i < 7; i++) {
    setPixel(buf, S, 17 + i, 11 + i, cyan);
  }
  // 柄（赤 x=24..25, y=16..17）
  fillRect(buf, S, 24, 16, 2, 2, red);
  // ガード（横）
  hLine(buf, S, 22, 15, 4, cyan);

  // 小瓶 (x=20..24, y=13..17): 赤3x4+頸シアン2x2
  // 瓶本体（x=20..23, y=14..17）
  hLine(buf, S, 20, 14, 4, red);
  hLine(buf, S, 20, 17, 4, red);
  vLine(buf, S, 20, 14, 4, red);
  vLine(buf, S, 23, 14, 4, red);
  // 瓶頸（シアン x=21..22, y=13）
  hLine(buf, S, 21, 13, 2, cyan);

  // ---- カウンター (x=3..28, y=20..24) ----
  // 天板: hLine(x=3, y=20, len=26) 赤
  hLine(buf, S, 3, 20, 26, red);
  // 枠線: vLine左, vLine右, hLine下
  vLine(buf, S, 3,  20, 5, cyan); // 左辺
  vLine(buf, S, 28, 20, 5, cyan); // 右辺
  hLine(buf, S, 3,  24, 26, cyan); // 下辺
  // 内部: fillRect(x=4, y=21, w=24, h=3, navy)
  fillRect(buf, S, 4, 21, 24, 3, navy);

  // ---- 脚 (y=25..29) ----
  // 左脚: x=6,7
  vLine(buf, S, 6, 25, 5, cyan);
  vLine(buf, S, 7, 25, 5, cyan);
  // 右脚: x=24,25
  vLine(buf, S, 24, 25, 5, cyan);
  vLine(buf, S, 25, 25, 5, cyan);
  // 底面
  hLine(buf, S, 5, 29, 4, cyan);  // 左底 x=5..8
  hLine(buf, S, 23, 29, 4, cyan); // 右底 x=23..26

  const file = path.join(outDir, 'shop_npc.png');
  await savePNG(buf, S, S, file);
  console.log('  Generated:', file);
  return { file: 'public/sprites/npc/shop_npc.png', width: S, height: S };
}

/**
 * ストレージ NPC (storage_npc.png) を生成する。
 * 緑系のロボット倉庫番。
 */
async function generateStorageNpc(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);
  const body   = hexToRGBA('#224422');
  const light  = hexToRGBA('#44aa44');
  const dark   = hexToRGBA('#000000');
  const shadow = hexToRGBA('#112211');
  const visor  = hexToRGBA('#88ff88');
  const box    = hexToRGBA('#886633');
  const boxL   = hexToRGBA('#ccaa66');

  // 頭部（四角い）
  fillRect(buf, S, 9, 3, 14, 10, body);
  fillRect(buf, S, 9, 3,  1, 10, shadow);
  fillRect(buf, S, 22, 3, 1, 10, dark);
  hLine(buf, S, 10, 3, 12, light);
  fillRect(buf, S, 12, 7, 8, 3, dark);
  hLine(buf, S, 13, 8, 6, visor);

  // 胴体
  fillRect(buf, S, 10, 13, 12, 11, body);
  fillRect(buf, S, 10, 13,  1, 11, shadow);
  fillRect(buf, S, 21, 13,  1, 11, dark);

  // 腕（箱を持つ）
  fillRect(buf, S, 4,  14, 6, 4, shadow);
  fillRect(buf, S, 22, 14, 6, 4, body);
  // 箱
  fillRect(buf, S, 3,  18, 8, 7, box);
  fillRect(buf, S, 3,  18, 1, 7, boxL);
  hLine(buf, S, 4, 18, 6, boxL);
  fillRect(buf, S, 21, 18, 8, 7, box);
  hLine(buf, S, 21, 18, 7, boxL);

  // 脚
  fillRect(buf, S, 11, 24, 4, 6, shadow);
  fillRect(buf, S, 17, 24, 4, 6, body);

  const file = path.join(outDir, 'storage_npc.png');
  await savePNG(buf, S, S, file);
  console.log('  Generated:', file);
  return { file: 'public/sprites/npc/storage_npc.png', width: S, height: S };
}

/**
 * 闇商人 NPC (black_market_npc.png) を生成する。
 * 黒マントを纏った怪しいロボット商人。
 */
async function generateBlackMarketNpc(outDir: string): Promise<SpriteFrame> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);
  const cloak    = hexToRGBA('#1a1a2e');
  const cloakL   = hexToRGBA('#2a2a4e');
  const cloakE   = hexToRGBA('#0a0a1e');
  const body     = hexToRGBA('#333355');
  const shadow   = hexToRGBA('#111133');
  const dark     = hexToRGBA('#000000');
  const visor    = hexToRGBA('#cc00ff');
  const visorL   = hexToRGBA('#ee88ff');
  const mystery  = hexToRGBA('#8800cc');
  const gold     = hexToRGBA('#ffdd00');

  // フード（マント上部）
  fillRect(buf, S, 7,  1, 18, 4, cloak);
  fillRect(buf, S, 9,  0, 14, 2, cloakE);
  hLine(buf, S, 10, 0, 12, cloakL);

  // 頭部（フードの中）
  fillRect(buf, S, 10, 5, 12, 8, body);
  fillRect(buf, S, 10, 5,  1, 8, shadow);
  fillRect(buf, S, 21, 5,  1, 8, dark);
  // 怪しいバイザー（一つ目風）
  fillRect(buf, S, 12, 8, 8, 3, dark);
  hLine(buf, S, 13, 9, 6, visor);
  setPixel(buf, S, 16, 8, visorL);
  setPixel(buf, S, 16, 9, visorL);

  // マント胴体（台形）
  fillRect(buf, S, 7,  13, 18, 12, cloak);
  fillRect(buf, S, 7,  13,  1, 12, cloakE);
  fillRect(buf, S, 24, 13,  1, 12, cloakE);
  // マントの縦線（布感）
  for (let i = 0; i < 4; i++) {
    vLine(buf, S, 9 + i * 4, 15, 8, cloakL);
  }

  // 胴体（マントの中）
  fillRect(buf, S, 11, 13, 10, 10, body);

  // 謎の宝石（胸に）
  fillRect(buf, S, 14, 16, 4, 4, mystery);
  setPixel(buf, S, 15, 17, visorL);
  setPixel(buf, S, 16, 17, visorL);

  // 腕（袖から少し見える）
  fillRect(buf, S, 5,  17, 4, 6, cloak);
  fillRect(buf, S, 23, 17, 4, 6, cloak);

  // 手（謎のコイン）
  fillRect(buf, S, 4,  22, 5, 4, cloakL);
  setPixel(buf, S, 5, 23, gold); setPixel(buf, S, 6, 22, gold); setPixel(buf, S, 6, 24, gold);
  setPixel(buf, S, 7, 23, gold);

  // 脚（マントで隠れているが少し見える）
  fillRect(buf, S, 11, 25, 4, 6, shadow);
  fillRect(buf, S, 17, 25, 4, 6, cloakE);
  // マント裾
  hLine(buf, S, 7, 25, 18, cloakE);

  const file = path.join(outDir, 'black_market_npc.png');
  await savePNG(buf, S, S, file);
  console.log('  Generated:', file);
  return { file: 'public/sprites/npc/black_market_npc.png', width: S, height: S };
}

/**
 * NPC スプライト群を生成する。
 */
async function generateNpcSprites(meta: SpriteMeta): Promise<void> {
  console.log('\n[NPC]');
  const outDir = path.join(SPRITES_DIR, 'npc');
  ensureDir(outDir);

  meta.npc['shop_npc']        = await generateShopNpc(outDir);
  meta.npc['storage_npc']     = await generateStorageNpc(outDir);
  meta.npc['black_market_npc'] = await generateBlackMarketNpc(outDir);
}

// ---------------------------------------------------------------------------
// 武器アイコン生成
// ---------------------------------------------------------------------------

/** アイコンサイズ */
const ICON_SIZE = 16;

/**
 * 武器アイコンを1枚生成して保存する。
 */
async function saveIcon(
  buf: Uint8Array,
  outDir: string,
  id: string,
  category: string,
): Promise<SpriteFrame> {
  const IS = ICON_SIZE;
  const file = path.join(outDir, `${id}.png`);
  await savePNG(buf, IS, IS, file);
  console.log('  Generated:', file);
  return { file: `public/sprites/weapons/${id}.png`, width: IS, height: IS };
}

/**
 * 武器アイコン群を生成する。
 */
async function generateWeaponSprites(meta: SpriteMeta): Promise<void> {
  console.log('\n[Weapons]');
  const outDir = path.join(SPRITES_DIR, 'weapons');
  ensureDir(outDir);
  const IS = ICON_SIZE;

  // カテゴリカラー
  const meleeC   = hexToRGBA('#ffcc44');
  const meleeDk  = hexToRGBA('#aa8822');
  const rangedC  = hexToRGBA('#44aaff');
  const rangedDk = hexToRGBA('#2266aa');
  const specialC = hexToRGBA('#cc44ff');
  const specialDk = hexToRGBA('#882299');
  const white    = hexToRGBA('#ffffff');
  const black    = hexToRGBA('#000000');
  const dark     = hexToRGBA('#111111');

  // machine_punch: 拳形
  {
    const buf = createBuffer(IS, IS);
    fillRect(buf, IS, 4, 5, 8, 7, meleeC);
    fillRect(buf, IS, 3, 7, 2, 5, meleeC);
    fillRect(buf, IS, 4, 5, 8, 1, white);
    fillRect(buf, IS, 11, 5, 1, 7, meleeDk);
    for (let i = 0; i < 4; i++) setPixel(buf, IS, 4 + i * 2, 4, meleeDk);
    meta.weapons['machine_punch'] = await saveIcon(buf, outDir, 'machine_punch', 'melee');
  }

  // blade_arm: 片刃の剣
  {
    const buf = createBuffer(IS, IS);
    // 刃
    for (let i = 0; i < 10; i++) {
      setPixel(buf, IS, 3 + i, 13 - i, meleeC);
      setPixel(buf, IS, 4 + i, 13 - i, meleeDk);
    }
    // 柄
    fillRect(buf, IS, 1, 12, 4, 2, meleeDk);
    setPixel(buf, IS, 2, 11, white);
    meta.weapons['blade_arm'] = await saveIcon(buf, outDir, 'blade_arm', 'melee');
  }

  // double_blade: 双剣（X字）
  {
    const buf = createBuffer(IS, IS);
    for (let i = 0; i < 12; i++) {
      setPixel(buf, IS, 2 + i, 2 + i,      meleeC);
      setPixel(buf, IS, 3 + i, 2 + i,      meleeDk);
      setPixel(buf, IS, 13 - i, 2 + i,     meleeC);
      setPixel(buf, IS, 12 - i, 2 + i,     meleeDk);
    }
    setPixel(buf, IS, 7, 7, white);
    setPixel(buf, IS, 8, 8, white);
    meta.weapons['double_blade'] = await saveIcon(buf, outDir, 'double_blade', 'melee');
  }

  // tri_cutter: 3枚刃（扇形）
  {
    const buf = createBuffer(IS, IS);
    // 中央刃
    for (let i = 0; i < 10; i++) setPixel(buf, IS, 3 + i, 8, meleeC);
    // 上刃
    for (let i = 0; i < 8; i++) setPixel(buf, IS, 4 + i, 5 + Math.floor(i * 0.4), meleeC);
    // 下刃
    for (let i = 0; i < 8; i++) setPixel(buf, IS, 4 + i, 11 - Math.floor(i * 0.4), meleeC);
    // ハブ
    fillRect(buf, IS, 2, 6, 3, 4, meleeDk);
    meta.weapons['tri_cutter'] = await saveIcon(buf, outDir, 'tri_cutter', 'melee');
  }

  // heavy_axe: 大斧
  {
    const buf = createBuffer(IS, IS);
    // 柄
    for (let i = 0; i < 12; i++) setPixel(buf, IS, 5 + Math.floor(i * 0.2), 3 + i, meleeDk);
    // 刃（大きな三角）
    fillRect(buf, IS, 6, 2, 7, 10, meleeC);
    fillRect(buf, IS, 12, 2, 1, 10, meleeDk);
    hLine(buf, IS, 6, 2, 7, white);
    // 削り
    for (let i = 0; i < 4; i++) setPixel(buf, IS, 6, 8 + i, meleeDk);
    meta.weapons['heavy_axe'] = await saveIcon(buf, outDir, 'heavy_axe', 'melee');
  }

  // chainsaw: チェーンソー
  {
    const buf = createBuffer(IS, IS);
    // 本体
    fillRect(buf, IS, 2, 6, 8, 4, meleeDk);
    hLine(buf, IS, 2, 6, 8, meleeC);
    // チェーン
    for (let i = 0; i < 10; i++) {
      const x = 9 + i;
      const y = i < 5 ? 5 : 10;
      setPixel(buf, IS, x, 5, i % 2 === 0 ? meleeC : meleeDk);
      setPixel(buf, IS, x, 10, i % 2 === 0 ? meleeC : meleeDk);
    }
    vLine(buf, IS, 14, 5, 6, meleeC);
    // 歯
    for (let i = 0; i < 5; i++) setPixel(buf, IS, 10 + i * 1, 4, white);
    meta.weapons['chainsaw'] = await saveIcon(buf, outDir, 'chainsaw', 'melee');
  }

  // plasma_blade: 光る剣（プラズマ色）
  {
    const buf = createBuffer(IS, IS);
    const plasma = hexToRGBA('#88ffff');
    const plasmaG = hexToRGBA('#44ffaa', 180);
    for (let i = 0; i < 11; i++) {
      setPixel(buf, IS, 3 + i, 13 - i, plasma);
      setPixel(buf, IS, 4 + i, 13 - i, hexToRGBA('#ffffff'));
      setPixel(buf, IS, 2 + i, 13 - i, plasmaG);
    }
    fillRect(buf, IS, 1, 11, 4, 2, meleeDk);
    setPixel(buf, IS, 2, 10, plasma);
    meta.weapons['plasma_blade'] = await saveIcon(buf, outDir, 'plasma_blade', 'melee');
  }

  // thunder_hammer: ハンマー（稲妻紋様）
  {
    const buf = createBuffer(IS, IS);
    const thunder = hexToRGBA('#ffff00');
    // ハンマーヘッド
    fillRect(buf, IS, 3, 2, 10, 7, meleeC);
    fillRect(buf, IS, 3, 2, 1, 7, meleeDk);
    fillRect(buf, IS, 12, 2, 1, 7, meleeDk);
    hLine(buf, IS, 4, 2, 8, white);
    // 稲妻紋
    setPixel(buf, IS, 7, 3, thunder);
    setPixel(buf, IS, 6, 4, thunder);
    setPixel(buf, IS, 8, 5, thunder);
    setPixel(buf, IS, 7, 6, thunder);
    // 柄
    vLine(buf, IS, 8, 8, 6, meleeDk);
    vLine(buf, IS, 7, 8, 6, meleeC);
    meta.weapons['thunder_hammer'] = await saveIcon(buf, outDir, 'thunder_hammer', 'melee');
  }

  // muramasa_blade: 細身の長剣（日本刀風）
  {
    const buf = createBuffer(IS, IS);
    const blade = hexToRGBA('#ddddff');
    const edge  = hexToRGBA('#ffffff');
    // 細長い刃
    for (let i = 0; i < 12; i++) {
      setPixel(buf, IS, 3 + i, 13 - i, blade);
      if (i > 2) setPixel(buf, IS, 2 + i, 13 - i, edge);
    }
    // 鍔
    fillRect(buf, IS, 3, 10, 4, 2, meleeDk);
    // 柄
    fillRect(buf, IS, 1, 11, 3, 4, hexToRGBA('#884400'));
    meta.weapons['muramasa_blade'] = await saveIcon(buf, outDir, 'muramasa_blade', 'melee');
  }

  // machine_gun: 銃身（横長）
  {
    const buf = createBuffer(IS, IS);
    fillRect(buf, IS, 1, 6, 13, 4, rangedDk);
    hLine(buf, IS, 1, 6, 13, rangedC);
    fillRect(buf, IS, 3, 4, 4, 2, rangedDk); // マガジン
    fillRect(buf, IS, 13, 7, 2, 2, rangedC); // マズル
    meta.weapons['machine_gun'] = await saveIcon(buf, outDir, 'machine_gun', 'ranged');
  }

  // shotgun: 短銃身+散弾感
  {
    const buf = createBuffer(IS, IS);
    fillRect(buf, IS, 2, 6, 9, 4, rangedDk);
    hLine(buf, IS, 2, 6, 9, rangedC);
    fillRect(buf, IS, 4, 4, 3, 2, rangedDk);
    // 散弾
    for (let i = 0; i < 3; i++) setPixel(buf, IS, 11 + i, 5 + i, rangedC);
    for (let i = 0; i < 3; i++) setPixel(buf, IS, 11 + i, 10 - i, rangedC);
    setPixel(buf, IS, 13, 8, rangedC);
    meta.weapons['shotgun'] = await saveIcon(buf, outDir, 'shotgun', 'ranged');
  }

  // sniper_rifle: 超長銃身
  {
    const buf = createBuffer(IS, IS);
    hLine(buf, IS, 0, 7, 15, rangedDk);
    hLine(buf, IS, 0, 8, 14, rangedC);
    fillRect(buf, IS, 3, 5, 3, 2, rangedDk); // スコープ
    setPixel(buf, IS, 4, 4, rangedC);
    fillRect(buf, IS, 5, 9, 2, 3, rangedDk); // グリップ
    meta.weapons['sniper_rifle'] = await saveIcon(buf, outDir, 'sniper_rifle', 'ranged');
  }

  // missile_pod: ミサイルポッド（縦列）
  {
    const buf = createBuffer(IS, IS);
    for (let i = 0; i < 3; i++) {
      const y = 3 + i * 4;
      fillRect(buf, IS, 3, y, 9, 3, rangedDk);
      hLine(buf, IS, 4, y, 7, rangedC);
      setPixel(buf, IS, 11, y + 1, hexToRGBA('#ff4400'));
    }
    meta.weapons['missile_pod'] = await saveIcon(buf, outDir, 'missile_pod', 'ranged');
  }

  // homing_missile: ミサイル1本（湾曲矢印）
  {
    const buf = createBuffer(IS, IS);
    fillRect(buf, IS, 2, 8, 7, 3, rangedDk);
    hLine(buf, IS, 2, 8, 7, rangedC);
    setPixel(buf, IS, 9, 8, rangedC);
    // 湾曲軌跡
    setPixel(buf, IS, 10, 7, rangedC);
    setPixel(buf, IS, 11, 6, rangedC);
    setPixel(buf, IS, 12, 6, rangedC);
    setPixel(buf, IS, 13, 7, rangedC);
    setPixel(buf, IS, 13, 8, rangedC);
    // 矢印
    setPixel(buf, IS, 12, 9, rangedC);
    setPixel(buf, IS, 11, 10, rangedC);
    // 炎
    setPixel(buf, IS, 1, 9, hexToRGBA('#ff4400'));
    setPixel(buf, IS, 0, 8, hexToRGBA('#ff8800'));
    meta.weapons['homing_missile'] = await saveIcon(buf, outDir, 'homing_missile', 'ranged');
  }

  // laser_cannon: レーザー砲（細長+ライン）
  {
    const buf = createBuffer(IS, IS);
    const laser = hexToRGBA('#00ffff');
    fillRect(buf, IS, 1, 6, 10, 4, rangedDk);
    hLine(buf, IS, 1, 6, 10, rangedC);
    hLine(buf, IS, 10, 7, 6, laser);
    hLine(buf, IS, 10, 8, 6, hexToRGBA('#aaffff', 150));
    fillRect(buf, IS, 4, 4, 3, 2, rangedDk);
    meta.weapons['laser_cannon'] = await saveIcon(buf, outDir, 'laser_cannon', 'ranged');
  }

  // plasma_cannon: プラズマ砲（丸みある砲身）
  {
    const buf = createBuffer(IS, IS);
    const plasma = hexToRGBA('#8844ff');
    // 砲身（太め）
    fillRect(buf, IS, 1, 5, 11, 6, rangedDk);
    hLine(buf, IS, 2, 5, 9, rangedC);
    fillRect(buf, IS, 1, 5, 1, 6, hexToRGBA('#222266'));
    // プラズマ球
    for (let y = 4; y <= 11; y++) {
      for (let x = 11; x <= 15; x++) {
        const dx = x - 13, dy = y - 7;
        if (dx * dx + dy * dy <= 9) setPixel(buf, IS, x, y, plasma);
      }
    }
    setPixel(buf, IS, 13, 7, white);
    meta.weapons['plasma_cannon'] = await saveIcon(buf, outDir, 'plasma_cannon', 'ranged');
  }

  // meteor_launcher: ロケット砲（炎）
  {
    const buf = createBuffer(IS, IS);
    const flame = hexToRGBA('#ff4400');
    const flameY = hexToRGBA('#ffaa00');
    fillRect(buf, IS, 3, 5, 10, 6, rangedDk);
    hLine(buf, IS, 3, 5, 10, rangedC);
    // ロケット弾
    fillRect(buf, IS, 12, 6, 3, 4, hexToRGBA('#888888'));
    setPixel(buf, IS, 14, 7, white);
    // 炎
    setPixel(buf, IS, 1, 7, flame);
    setPixel(buf, IS, 0, 7, flameY);
    setPixel(buf, IS, 1, 8, flameY);
    setPixel(buf, IS, 0, 6, flame);
    meta.weapons['meteor_launcher'] = await saveIcon(buf, outDir, 'meteor_launcher', 'ranged');
  }

  // emp_pulse: 電磁波（同心円）
  {
    const buf = createBuffer(IS, IS);
    const emp = hexToRGBA('#ffff44');
    const empG = hexToRGBA('#888800', 180);
    const cx = 8, cy = 8;
    for (const r of [2, 4, 6]) {
      for (let angle = 0; angle < 360; angle += 10) {
        const rad = angle * Math.PI / 180;
        const x = Math.round(cx + r * Math.cos(rad));
        const y = Math.round(cy + r * Math.sin(rad));
        setPixel(buf, IS, x, y, r < 5 ? emp : empG);
      }
    }
    fillRect(buf, IS, 7, 7, 2, 2, white);
    meta.weapons['emp_pulse'] = await saveIcon(buf, outDir, 'emp_pulse', 'special');
  }

  // gravity_well: 渦巻き（重力）
  {
    const buf = createBuffer(IS, IS);
    const grav = hexToRGBA('#cc44ff');
    const gravDk = hexToRGBA('#660088');
    // 渦巻き（アルキメデスの螺旋近似）
    for (let t = 0; t < 400; t++) {
      const angle = t * 0.1;
      const r = t * 0.025;
      const x = Math.round(8 + r * Math.cos(angle));
      const y = Math.round(8 + r * Math.sin(angle));
      if (x >= 0 && x < IS && y >= 0 && y < IS) {
        setPixel(buf, IS, x, y, r < 4 ? grav : gravDk);
      }
    }
    setPixel(buf, IS, 8, 8, white);
    meta.weapons['gravity_well'] = await saveIcon(buf, outDir, 'gravity_well', 'special');
  }

  // freeze_ray: 氷柱（青い光線）
  {
    const buf = createBuffer(IS, IS);
    const ice  = hexToRGBA('#88ddff');
    const iceW = hexToRGBA('#ccffff');
    const iceD = hexToRGBA('#2266aa');
    // 氷柱（三角形）
    for (let y = 2; y < 13; y++) {
      const w = Math.max(1, Math.floor((13 - y) * 0.4) + 1);
      const x = 8 - Math.floor(w / 2);
      hLine(buf, IS, x, y, w, y < 6 ? ice : iceD);
    }
    // 光線（水平）
    hLine(buf, IS, 9, 7, 6, ice);
    hLine(buf, IS, 9, 8, 6, iceW);
    setPixel(buf, IS, 15, 7, iceW);
    meta.weapons['freeze_ray'] = await saveIcon(buf, outDir, 'freeze_ray', 'special');
  }

  // shield_bash: 盾（円盾）
  {
    const buf = createBuffer(IS, IS);
    const shieldC = hexToRGBA('#cc44ff');
    const shieldL = hexToRGBA('#ee88ff');
    const shieldD = hexToRGBA('#662288');
    for (let y = 2; y < 14; y++) {
      for (let x = 3; x < 13; x++) {
        const dx = x - 8, dy = y - 8;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 5) setPixel(buf, IS, x, y, shieldC);
        else if (dist <= 6) setPixel(buf, IS, x, y, shieldD);
      }
    }
    // 十字
    vLine(buf, IS, 8, 4, 8, shieldL);
    hLine(buf, IS, 5, 8, 6, shieldL);
    meta.weapons['shield_bash'] = await saveIcon(buf, outDir, 'shield_bash', 'special');
  }

  // drain_lance: 槍（赤い吸収感）
  {
    const buf = createBuffer(IS, IS);
    const lance = hexToRGBA('#cc44ff');
    const drain = hexToRGBA('#ff2244');
    // 槍身
    for (let i = 0; i < 11; i++) {
      setPixel(buf, IS, 3 + i, 8, lance);
      setPixel(buf, IS, 3 + i, 9, specialDk);
    }
    // 穂先（三角）
    setPixel(buf, IS, 13, 7, drain);
    setPixel(buf, IS, 14, 8, drain);
    setPixel(buf, IS, 13, 9, drain);
    setPixel(buf, IS, 15, 8, white);
    // 吸収エフェクト（赤い粒子）
    setPixel(buf, IS, 10, 6, drain);
    setPixel(buf, IS, 11, 5, drain);
    setPixel(buf, IS, 9, 10, drain);
    meta.weapons['drain_lance'] = await saveIcon(buf, outDir, 'drain_lance', 'special');
  }

  // time_bomb: 時限爆弾（時計＋爆弾）
  {
    const buf = createBuffer(IS, IS);
    const bomb = hexToRGBA('#333333');
    const fuse = hexToRGBA('#ff4400');
    const clock = hexToRGBA('#ffcc44');
    // 爆弾本体（円）
    for (let y = 4; y < 14; y++) {
      for (let x = 3; x < 13; x++) {
        const dx = x - 8, dy = y - 9;
        if (dx * dx + dy * dy <= 16) setPixel(buf, IS, x, y, bomb);
      }
    }
    // 時計の文字盤
    for (let angle = 0; angle < 360; angle += 90) {
      const rad = angle * Math.PI / 180;
      setPixel(buf, IS, Math.round(8 + 3 * Math.cos(rad)), Math.round(9 + 3 * Math.sin(rad)), clock);
    }
    // 針
    setPixel(buf, IS, 8, 7, white);
    setPixel(buf, IS, 10, 9, white);
    // 導火線
    setPixel(buf, IS, 8, 3, bomb);
    setPixel(buf, IS, 9, 2, fuse);
    setPixel(buf, IS, 10, 1, fuse);
    meta.weapons['time_bomb'] = await saveIcon(buf, outDir, 'time_bomb', 'special');
  }
}

// ---------------------------------------------------------------------------
// アイテムアイコン生成
// ---------------------------------------------------------------------------

/**
 * アイテムアイコン群（カテゴリ別）を生成する。
 */
async function generateItemSprites(meta: SpriteMeta): Promise<void> {
  console.log('\n[Items]');
  const outDir = path.join(SPRITES_DIR, 'items');
  ensureDir(outDir);
  const IS = ICON_SIZE;
  const white = hexToRGBA('#ffffff');

  // recovery: 赤十字マーク
  {
    const buf = createBuffer(IS, IS);
    const red = hexToRGBA('#ff4444');
    fillRect(buf, IS, 2, 2, 12, 12, white);
    fillRect(buf, IS, 2, 2, 1, 12, hexToRGBA('#cccccc'));
    fillRect(buf, IS, 13, 2, 1, 12, hexToRGBA('#aaaaaa'));
    // 十字
    fillRect(buf, IS, 6, 3, 4, 10, red);
    fillRect(buf, IS, 3, 6, 10, 4, red);
    const file = path.join(outDir, 'recovery.png');
    await savePNG(buf, IS, IS, file);
    console.log('  Generated:', file);
    meta.items['recovery'] = { file: 'public/sprites/items/recovery.png', width: IS, height: IS };
  }

  // weapon: 剣シルエット
  {
    const buf = createBuffer(IS, IS);
    const gold = hexToRGBA('#ffcc44');
    const goldDk = hexToRGBA('#aa8822');
    for (let i = 0; i < 11; i++) {
      setPixel(buf, IS, 3 + i, 12 - i, gold);
      setPixel(buf, IS, 4 + i, 12 - i, goldDk);
    }
    fillRect(buf, IS, 2, 11, 4, 2, goldDk);
    setPixel(buf, IS, 3, 10, gold);
    const file = path.join(outDir, 'weapon.png');
    await savePNG(buf, IS, IS, file);
    console.log('  Generated:', file);
    meta.items['weapon'] = { file: 'public/sprites/items/weapon.png', width: IS, height: IS };
  }

  // exploration: 地図/コンパス
  {
    const buf = createBuffer(IS, IS);
    const teal = hexToRGBA('#44ffcc');
    const tealDk = hexToRGBA('#229977');
    fillRect(buf, IS, 2, 2, 12, 12, hexToRGBA('#225544'));
    fillRect(buf, IS, 2, 2, 1, 12, tealDk);
    fillRect(buf, IS, 2, 2, 12, 1, tealDk);
    // 地図の線
    hLine(buf, IS, 3, 5, 10, teal);
    hLine(buf, IS, 3, 8, 10, tealDk);
    hLine(buf, IS, 3, 11, 10, teal);
    vLine(buf, IS, 7, 3, 10, tealDk);
    // コンパス針
    setPixel(buf, IS, 7, 4, white);
    setPixel(buf, IS, 6, 7, teal);
    setPixel(buf, IS, 8, 10, teal);
    const file = path.join(outDir, 'exploration.png');
    await savePNG(buf, IS, IS, file);
    console.log('  Generated:', file);
    meta.items['exploration'] = { file: 'public/sprites/items/exploration.png', width: IS, height: IS };
  }

  // combat: 爆発/炎
  {
    const buf = createBuffer(IS, IS);
    const orange = hexToRGBA('#ff8800');
    const red    = hexToRGBA('#ff2200');
    const yellow = hexToRGBA('#ffff00');
    // 爆発中心
    for (let y = 4; y < 12; y++) {
      for (let x = 4; x < 12; x++) {
        const dx = x - 8, dy = y - 8;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 4) setPixel(buf, IS, x, y, dist < 2 ? yellow : orange);
      }
    }
    // 爆発の突起
    setPixel(buf, IS, 8, 1, orange);
    setPixel(buf, IS, 8, 2, red);
    setPixel(buf, IS, 12, 3, orange);
    setPixel(buf, IS, 13, 4, orange);
    setPixel(buf, IS, 3, 3, orange);
    setPixel(buf, IS, 2, 5, orange);
    setPixel(buf, IS, 13, 10, orange);
    setPixel(buf, IS, 2, 10, orange);
    const file = path.join(outDir, 'combat.png');
    await savePNG(buf, IS, IS, file);
    console.log('  Generated:', file);
    meta.items['combat'] = { file: 'public/sprites/items/combat.png', width: IS, height: IS };
  }

  // special: 星/疑問符
  {
    const buf = createBuffer(IS, IS);
    const purple = hexToRGBA('#cc44ff');
    const purpleDk = hexToRGBA('#882299');
    // 8方向の星
    const cx = 8, cy = 8;
    for (let angle = 0; angle < 360; angle += 45) {
      const rad = angle * Math.PI / 180;
      for (let r = 1; r <= 5; r++) {
        const x = Math.round(cx + r * Math.cos(rad));
        const y = Math.round(cy + r * Math.sin(rad));
        setPixel(buf, IS, x, y, r <= 3 ? purple : purpleDk);
      }
    }
    setPixel(buf, IS, 8, 8, white);
    setPixel(buf, IS, 7, 8, purple);
    setPixel(buf, IS, 9, 8, purple);
    const file = path.join(outDir, 'special.png');
    await savePNG(buf, IS, IS, file);
    console.log('  Generated:', file);
    meta.items['special'] = { file: 'public/sprites/items/special.png', width: IS, height: IS };
  }

  // machine_upgrade: チップ/IC（集積回路）サンプル画像準拠
  {
    const buf        = createBuffer(IS, IS);
    const bg         = hexToRGBA('#0d1929');  // 暗いネイビー（チップ内部も同色）
    const chipBorder = hexToRGBA('#00cccc');  // 明るいシアン
    const red        = hexToRGBA('#cc0000');  // 赤インジケータ
    const cyan       = hexToRGBA('#00cccc');  // 円（枠と同じシアン）

    // 背景（チップ内部含め全体を暗いネイビーで塗る）
    fillRect(buf, IS, 0, 0, IS, IS, bg);

    // チップ枠線（外周 x=2..13, y=2..13、1px幅）
    hLine(buf, IS, 2, 2, 12, chipBorder);   // 上辺
    hLine(buf, IS, 2, 13, 12, chipBorder);  // 下辺
    vLine(buf, IS, 2, 2, 12, chipBorder);   // 左辺
    vLine(buf, IS, 13, 2, 12, chipBorder);  // 右辺

    // ピン：上下 各2本（x=5, x=10）、2px長
    setPixel(buf, IS, 5, 0, chipBorder);  setPixel(buf, IS, 5, 1, chipBorder);
    setPixel(buf, IS, 10, 0, chipBorder); setPixel(buf, IS, 10, 1, chipBorder);
    setPixel(buf, IS, 5, 14, chipBorder); setPixel(buf, IS, 5, 15, chipBorder);
    setPixel(buf, IS, 10, 14, chipBorder);setPixel(buf, IS, 10, 15, chipBorder);

    // ピン：左右 各3本（y=4, y=7, y=10）、2px長
    setPixel(buf, IS, 0, 4, chipBorder);  setPixel(buf, IS, 1, 4, chipBorder);
    setPixel(buf, IS, 0, 7, chipBorder);  setPixel(buf, IS, 1, 7, chipBorder);
    setPixel(buf, IS, 0, 10, chipBorder); setPixel(buf, IS, 1, 10, chipBorder);
    setPixel(buf, IS, 14, 4, chipBorder); setPixel(buf, IS, 15, 4, chipBorder);
    setPixel(buf, IS, 14, 7, chipBorder); setPixel(buf, IS, 15, 7, chipBorder);
    setPixel(buf, IS, 14, 10, chipBorder);setPixel(buf, IS, 15, 10, chipBorder);

    // 赤インジケータ（左上内側 2×2）
    fillRect(buf, IS, 3, 3, 2, 2, red);

    // 中央の円（中心 8,8、半径 3、シアン塗りつぶし）
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy <= 9) {
          setPixel(buf, IS, 8 + dx, 8 + dy, cyan);
        }
      }
    }

    const file = path.join(outDir, 'machine_upgrade.png');
    await savePNG(buf, IS, IS, file);
    console.log('  Generated:', file);
    meta.items['machine_upgrade'] = { file: 'public/sprites/items/machine_upgrade.png', width: IS, height: IS };
  }

  // unidentified: 疑問符
  {
    const buf = createBuffer(IS, IS);
    const gray = hexToRGBA('#888888');
    const grayL = hexToRGBA('#aaaaaa');
    fillRect(buf, IS, 3, 2, 10, 12, hexToRGBA('#333333'));
    fillRect(buf, IS, 3, 2, 1, 12, hexToRGBA('#222222'));
    hLine(buf, IS, 3, 2, 10, gray);
    // 疑問符
    hLine(buf, IS, 5, 4, 6, grayL);
    setPixel(buf, IS, 10, 5, grayL);
    setPixel(buf, IS, 10, 6, grayL);
    setPixel(buf, IS, 9, 7, grayL);
    setPixel(buf, IS, 8, 8, grayL);
    setPixel(buf, IS, 8, 9, grayL);
    setPixel(buf, IS, 8, 11, grayL);
    setPixel(buf, IS, 8, 12, grayL);
    vLine(buf, IS, 5, 4, 4, grayL);
    const file = path.join(outDir, 'unidentified.png');
    await savePNG(buf, IS, IS, file);
    console.log('  Generated:', file);
    meta.items['unidentified'] = { file: 'public/sprites/items/unidentified.png', width: IS, height: IS };
  }

  // material: 結晶/鉱石
  {
    const buf = createBuffer(IS, IS);
    const crystal = hexToRGBA('#44cc88');
    const crystalL = hexToRGBA('#88ffcc');
    const crystalD = hexToRGBA('#226644');
    // 結晶の多角形（ひし形ベース）
    for (let y = 2; y < 14; y++) {
      const dist = Math.abs(y - 8);
      const w = Math.round((6 - dist) * 1.2);
      const x = 8 - w;
      if (w > 0) {
        hLine(buf, IS, x, y, w * 2, crystal);
        setPixel(buf, IS, x, y, crystalD);
        setPixel(buf, IS, x + w * 2 - 1, y, crystalD);
      }
    }
    // ハイライト
    setPixel(buf, IS, 7, 4, crystalL);
    setPixel(buf, IS, 6, 5, crystalL);
    setPixel(buf, IS, 8, 4, crystalL);
    const file = path.join(outDir, 'material.png');
    await savePNG(buf, IS, IS, file);
    console.log('  Generated:', file);
    meta.items['material'] = { file: 'public/sprites/items/material.png', width: IS, height: IS };
  }
}

// ---------------------------------------------------------------------------
// エフェクトスプライト生成
// ---------------------------------------------------------------------------

/**
 * 攻撃エフェクトスプライト群を生成する。
 */
async function generateEffectSprites(meta: SpriteMeta): Promise<void> {
  console.log('\n[Effects]');
  const outDir = path.join(SPRITES_DIR, 'effects');
  ensureDir(outDir);
  const S = TILE_SIZE;

  // --- slash（斬撃） ---
  {
    const frames: SpriteFrame[] = [];

    // frame 0: 右上から左下への太い斬撃線
    {
      const buf = createBuffer(S, S);
      const white  = hexToRGBA('#ffffff');
      const yellow = hexToRGBA('#ffff88');
      const yDim   = hexToRGBA('#888844', 200);
      for (let i = 0; i < 22; i++) {
        const x = 4 + i;
        const y = 4 + i;
        setPixel(buf, S, x,     y,     white);
        setPixel(buf, S, x + 1, y,     yellow);
        setPixel(buf, S, x,     y + 1, yellow);
        setPixel(buf, S, x + 1, y + 1, yDim);
      }
      const file = path.join(outDir, 'slash_0.png');
      await savePNG(buf, S, S, file);
      console.log('  Generated:', file);
      frames.push({ file: 'public/sprites/effects/slash_0.png', width: S, height: S });
    }

    // frame 1: 残像（薄い線）
    {
      const buf = createBuffer(S, S);
      const dim = hexToRGBA('#aaaa44', 120);
      const dimD = hexToRGBA('#666622', 80);
      for (let i = 2; i < 20; i++) {
        setPixel(buf, S, 5 + i, 5 + i, dim);
        setPixel(buf, S, 6 + i, 5 + i, dimD);
      }
      const file = path.join(outDir, 'slash_1.png');
      await savePNG(buf, S, S, file);
      console.log('  Generated:', file);
      frames.push({ file: 'public/sprites/effects/slash_1.png', width: S, height: S });
    }

    meta.effects['slash'] = frames;
  }

  // --- bullet（弾丸） ---
  {
    const frames: SpriteFrame[] = [];

    // frame 0: 右向き楕円の弾
    {
      const buf = createBuffer(S, S);
      const yellow = hexToRGBA('#ffff00');
      const white  = hexToRGBA('#ffffff');
      const yDim   = hexToRGBA('#aaaa00');
      const cx = 16, cy = 16;
      for (let y = cy - 3; y <= cy + 3; y++) {
        for (let x = cx - 6; x <= cx + 6; x++) {
          const dx = x - cx, dy = (y - cy) * 2;
          if (dx * dx + dy * dy <= 36) {
            setPixel(buf, S, x, y, dx * dx + dy * dy < 16 ? white : yellow);
          }
        }
      }
      // 尾（左側）
      hLine(buf, S, cx - 10, cy, 4, yDim);
      const file = path.join(outDir, 'bullet_0.png');
      await savePNG(buf, S, S, file);
      console.log('  Generated:', file);
      frames.push({ file: 'public/sprites/effects/bullet_0.png', width: S, height: S });
    }

    // frame 1: 弾の軌跡（細長い線）
    {
      const buf = createBuffer(S, S);
      const trail = hexToRGBA('#ffff00', 160);
      const trailD = hexToRGBA('#888800', 100);
      hLine(buf, S, 4, 15, 24, trailD);
      hLine(buf, S, 4, 16, 24, trail);
      hLine(buf, S, 4, 17, 24, trailD);
      const file = path.join(outDir, 'bullet_1.png');
      await savePNG(buf, S, S, file);
      console.log('  Generated:', file);
      frames.push({ file: 'public/sprites/effects/bullet_1.png', width: S, height: S });
    }

    meta.effects['bullet'] = frames;
  }

  // --- explosion（爆発） ---
  {
    const frames: SpriteFrame[] = [];

    // frame 0: 中心から広がる円（オレンジ/赤）
    {
      const buf = createBuffer(S, S);
      const red    = hexToRGBA('#ff2200');
      const orange = hexToRGBA('#ff8800');
      const yellow = hexToRGBA('#ffff00');
      const white  = hexToRGBA('#ffffff');
      const cx = 16, cy = 16;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 3) setPixel(buf, S, x, y, white);
          else if (dist <= 7) setPixel(buf, S, x, y, yellow);
          else if (dist <= 11) setPixel(buf, S, x, y, orange);
          else if (dist <= 13) setPixel(buf, S, x, y, red);
        }
      }
      const file = path.join(outDir, 'explosion_0.png');
      await savePNG(buf, S, S, file);
      console.log('  Generated:', file);
      frames.push({ file: 'public/sprites/effects/explosion_0.png', width: S, height: S });
    }

    // frame 1: 外周リング（煙/灰色）
    {
      const buf = createBuffer(S, S);
      const smoke  = hexToRGBA('#888888', 200);
      const smokeD = hexToRGBA('#444444', 150);
      const orange = hexToRGBA('#ff4400', 100);
      const cx = 16, cy = 16;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= 10 && dist <= 13) setPixel(buf, S, x, y, smoke);
          else if (dist >= 13 && dist <= 15) setPixel(buf, S, x, y, smokeD);
          else if (dist < 10 && dist >= 7) setPixel(buf, S, x, y, orange);
        }
      }
      const file = path.join(outDir, 'explosion_1.png');
      await savePNG(buf, S, S, file);
      console.log('  Generated:', file);
      frames.push({ file: 'public/sprites/effects/explosion_1.png', width: S, height: S });
    }

    meta.effects['explosion'] = frames;
  }
}

// ---------------------------------------------------------------------------
// メタデータ出力
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ボスマスター & アニメーション自動生成エンジン
// ---------------------------------------------------------------------------

type BossDrawFn = (buf: Uint8Array, S: number, color1: RGBA, color2: RGBA) => void;

function transformBuffer(
  src: Uint8Array, dst: Uint8Array, S: number, 
  scale: number, rotation: number, dx: number, dy: number
): void {
  const cx = S / 2;
  const cy = S / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const rx = (x - cx - dx) / scale;
      const ry = (y - cy - dy) / scale;
      const sx = Math.round(rx * cos - ry * sin + cx);
      const sy = Math.round(rx * sin + ry * cos + cy);
      if (sx >= 0 && sx < S && sy >= 0 && sy < S) {
        const sIdx = (sy * S + sx) * 4;
        const dIdx = (y * S + x) * 4;
        if (src[sIdx + 3] > 0) {
          dst[dIdx] = src[sIdx];
          dst[dIdx + 1] = src[sIdx + 1];
          dst[dIdx + 2] = src[sIdx + 2];
          dst[dIdx + 3] = src[sIdx + 3];
        }
      }
    }
  }
}

// 15体のボスの「基本描画」処理
const bossDrawers: Record<string, BossDrawFn> = {
  bug_swarm: (buf, S, c1, c2) => {
    // 大きな1体のハエ (64×64)
    const BLACK = hexToRGBA('#000000');
    const EYE   = hexToRGBA('#ff8800');
    const WHITE = hexToRGBA('#ffffff');

    // ---- 触角 ----
    for (const [px, py] of [[29,8],[27,6],[25,5],[23,3],[21,2],[20,1]] as [number,number][]) {
      setPixel(buf, S, px, py, c1);
    }
    for (const [px, py] of [[34,8],[36,6],[38,5],[40,3],[42,2],[43,1]] as [number,number][]) {
      setPixel(buf, S, px, py, c1);
    }

    // ---- 頭部 ----
    fillRect(buf, S, 23, 9, 18, 11, BLACK);
    hLine(buf, S, 26, 8, 12, c1);
    hLine(buf, S, 24, 18, 16, c1);
    vLine(buf, S, 23, 9, 11, c1);
    vLine(buf, S, 40, 9, 11, c1);
    setPixel(buf, S, 24, 9, c1);
    setPixel(buf, S, 39, 9, c1);
    setPixel(buf, S, 24, 18, c1);
    setPixel(buf, S, 39, 18, c1);
    // 左複眼
    fillRect(buf, S, 15, 10, 10, 9, EYE);
    setPixel(buf, S, 16, 11, WHITE);
    // 右複眼
    fillRect(buf, S, 39, 10, 10, 9, EYE);
    setPixel(buf, S, 40, 11, WHITE);
    // 触肢（口）
    for (const px of [30,31,32,33]) setPixel(buf, S, px, 19, c1);
    setPixel(buf, S, 29, 20, c1);
    setPixel(buf, S, 34, 20, c1);

    // ---- 胸部 ----
    fillRect(buf, S, 22, 19, 20, 15, BLACK);
    hLine(buf, S, 23, 19, 18, c1);
    hLine(buf, S, 22, 33, 20, c1);
    vLine(buf, S, 22, 20, 14, c1);
    vLine(buf, S, 41, 20, 14, c1);
    // 十字マーク
    hLine(buf, S, 24, 26, 16, c2);
    vLine(buf, S, 32, 21, 12, c2);
    // 中心輝点
    fillRect(buf, S, 30, 25, 4, 4, BLACK);
    setPixel(buf, S, 31, 25, c1);
    setPixel(buf, S, 32, 25, c1);
    setPixel(buf, S, 31, 26, c1);
    setPixel(buf, S, 32, 26, c1);

    // ---- 腹部 ----
    fillRect(buf, S, 25, 33, 14, 20, BLACK);
    fillRect(buf, S, 27, 53, 10, 3, BLACK);
    hLine(buf, S, 26, 33, 12, c1);
    vLine(buf, S, 24, 34, 20, c1);
    vLine(buf, S, 39, 34, 20, c1);
    setPixel(buf, S, 25, 34, c1);
    setPixel(buf, S, 38, 34, c1);
    hLine(buf, S, 27, 54, 10, c1);
    setPixel(buf, S, 26, 53, c1);
    setPixel(buf, S, 37, 53, c1);
    // 縞
    hLine(buf, S, 26, 39, 12, c2);
    hLine(buf, S, 26, 44, 12, c2);
    hLine(buf, S, 26, 49, 12, c2);

    // ---- 左翅 ----
    hLine(buf, S, 4, 16, 18, c1);
    hLine(buf, S, 2, 17, 3, c1);
    setPixel(buf, S, 2, 18, c1);
    vLine(buf, S, 2, 16, 13, c1);
    hLine(buf, S, 2, 29, 10, c1);
    setPixel(buf, S, 12, 30, c1);
    setPixel(buf, S, 15, 31, c1);
    setPixel(buf, S, 18, 31, c1);
    setPixel(buf, S, 21, 31, c1);
    // 翅脈
    hLine(buf, S, 4, 20, 16, { ...c1, a: 120 });
    hLine(buf, S, 4, 24, 14, { ...c1, a: 80 });
    vLine(buf, S, 8, 16, 13, { ...c1, a: 100 });
    vLine(buf, S, 14, 16, 12, { ...c1, a: 70 });

    // ---- 右翅 (左の鏡像) ----
    hLine(buf, S, 42, 16, 18, c1);
    hLine(buf, S, 59, 17, 3, c1);
    setPixel(buf, S, 61, 18, c1);
    vLine(buf, S, 61, 16, 13, c1);
    hLine(buf, S, 52, 29, 10, c1);
    setPixel(buf, S, 51, 30, c1);
    setPixel(buf, S, 48, 31, c1);
    setPixel(buf, S, 45, 31, c1);
    setPixel(buf, S, 42, 31, c1);
    // 翅脈
    hLine(buf, S, 44, 20, 16, { ...c1, a: 120 });
    hLine(buf, S, 46, 24, 14, { ...c1, a: 80 });
    vLine(buf, S, 55, 16, 13, { ...c1, a: 100 });
    vLine(buf, S, 49, 16, 12, { ...c1, a: 70 });

    // ---- 脚6本 ----
    // 左前脚
    for (const [px, py] of [[21,22],[19,23],[17,25],[15,27]] as [number,number][]) setPixel(buf, S, px, py, c1);
    // 左中脚
    for (const [px, py] of [[21,27],[18,28],[15,30],[12,32]] as [number,number][]) setPixel(buf, S, px, py, c1);
    // 左後脚
    for (const [px, py] of [[21,31],[18,33],[15,35],[13,37]] as [number,number][]) setPixel(buf, S, px, py, c1);
    // 右前脚
    for (const [px, py] of [[42,22],[44,23],[46,25],[48,27]] as [number,number][]) setPixel(buf, S, px, py, c1);
    // 右中脚
    for (const [px, py] of [[42,27],[45,28],[48,30],[51,32]] as [number,number][]) setPixel(buf, S, px, py, c1);
    // 右後脚
    for (const [px, py] of [[42,31],[45,33],[48,35],[50,37]] as [number,number][]) setPixel(buf, S, px, py, c1);
  },
  mach_runner: (buf, S, c1, c2) => {
    // 機械蜘蛛型ボス - オレンジネオン
    const BLACK = { r: 0, g: 0, b: 0, a: 255 };
    const RED_EYE = hexToRGBA('#cc0022');
    const EYE_HL  = hexToRGBA('#ff88aa', 200);
    const BLUE_GEM = hexToRGBA('#2255dd');
    const FLAME   = hexToRGBA('#ff4400');
    const FLAME2  = hexToRGBA('#ffaa00');
    const WHITE_HL = hexToRGBA('#ffffff', 180);

    // === 翼 (上部) ===
    // 左翼 (後退翼、y:5-16)
    fillRect(buf, S, 4, 8, 22, 7, BLACK);
    hLine(buf, S, 4, 7, 22, c1);
    hLine(buf, S, 6, 15, 18, c1);
    vLine(buf, S, 4, 8, 8, c1);
    setPixel(buf, S, 5, 15, c1);
    // 翼の縞
    for (let x = 7; x < 24; x += 4) {
      vLine(buf, S, x, 8, 7, c2);
    }
    // スピード線
    hLine(buf, S, 2, 10, 6, { ...c1, a: 140 });
    hLine(buf, S, 2, 12, 4, { ...c1, a: 100 });
    hLine(buf, S, 2, 14, 2, { ...c1, a: 70 });

    // 右翼 (後退翼、y:5-16)
    fillRect(buf, S, 38, 8, 22, 7, BLACK);
    hLine(buf, S, 38, 7, 22, c1);
    hLine(buf, S, 40, 15, 18, c1);
    vLine(buf, S, 59, 8, 8, c1);
    setPixel(buf, S, 58, 15, c1);
    for (let x = 40; x < 58; x += 4) {
      vLine(buf, S, x, 8, 7, c2);
    }
    hLine(buf, S, 56, 10, 6, { ...c1, a: 140 });
    hLine(buf, S, 58, 12, 4, { ...c1, a: 100 });
    hLine(buf, S, 60, 14, 2, { ...c1, a: 70 });

    // === 赤い複眼 (右上) ===
    fillRect(buf, S, 44, 18, 12, 12, BLACK);
    hLine(buf, S, 45, 18, 10, c1);
    hLine(buf, S, 45, 29, 10, c1);
    vLine(buf, S, 44, 19, 11, c1);
    vLine(buf, S, 55, 19, 11, c1);
    fillRect(buf, S, 46, 20, 8, 8, RED_EYE);
    setPixel(buf, S, 47, 21, EYE_HL);
    setPixel(buf, S, 48, 21, EYE_HL);
    setPixel(buf, S, 47, 22, EYE_HL);

    // === 砲身 (右) ===
    hLine(buf, S, 55, 27, 9, c1);
    hLine(buf, S, 55, 29, 9, c1);
    setPixel(buf, S, 63, 28, c1);

    // === 胴体 (横長) y:24-38 ===
    fillRect(buf, S, 12, 25, 42, 14, BLACK);
    hLine(buf, S, 13, 25, 40, c1);
    hLine(buf, S, 13, 38, 40, c1);
    vLine(buf, S, 12, 26, 13, c1);
    vLine(buf, S, 53, 26, 13, c1);
    // セグメント (4つ)
    for (let cx = 19; cx <= 47; cx += 9) {
      fillRect(buf, S, cx - 3, 27, 6, 10, BLACK);
      hLine(buf, S, cx - 2, 27, 4, c2);
      hLine(buf, S, cx - 2, 36, 4, c2);
      vLine(buf, S, cx - 3, 28, 8, c2);
      vLine(buf, S, cx + 2, 28, 8, c2);
    }
    // 青い宝石
    fillRect(buf, S, 33, 28, 6, 8, BLUE_GEM);
    setPixel(buf, S, 34, 29, WHITE_HL);

    // 目→胴体の接続
    vLine(buf, S, 44, 29, 3, c1);
    vLine(buf, S, 53, 29, 2, c1);

    // === ロケット (左側, 2基) ===
    // 上ロケット
    fillRect(buf, S, 4, 22, 12, 5, BLACK);
    hLine(buf, S, 5, 22, 11, c1);
    hLine(buf, S, 5, 26, 11, c1);
    vLine(buf, S, 4, 23, 4, c1);
    vLine(buf, S, 15, 23, 4, c1);
    setPixel(buf, S, 3, 23, FLAME);
    setPixel(buf, S, 2, 24, FLAME);
    setPixel(buf, S, 3, 24, FLAME2);
    setPixel(buf, S, 3, 25, FLAME);
    setPixel(buf, S, 2, 25, FLAME2);

    // 下ロケット
    fillRect(buf, S, 4, 29, 12, 5, BLACK);
    hLine(buf, S, 5, 29, 11, c1);
    hLine(buf, S, 5, 33, 11, c1);
    vLine(buf, S, 4, 30, 4, c1);
    vLine(buf, S, 15, 30, 4, c1);
    setPixel(buf, S, 3, 30, FLAME);
    setPixel(buf, S, 2, 31, FLAME);
    setPixel(buf, S, 3, 31, FLAME2);
    setPixel(buf, S, 3, 32, FLAME);
    setPixel(buf, S, 2, 32, FLAME2);

    // === 脚 6本 (関節付き) ===
    // 関節を描くヘルパー
    const joint = (x: number, y: number) => {
      setPixel(buf, S, x,     y,     BLACK);
      setPixel(buf, S, x - 1, y,     c1);
      setPixel(buf, S, x + 1, y,     c1);
      setPixel(buf, S, x,     y - 1, c1);
      setPixel(buf, S, x,     y + 1, c1);
    };

    // 左前脚
    vLine(buf, S, 20, 39, 5, c1); joint(20, 44);
    setPixel(buf, S, 17, 45, c1); setPixel(buf, S, 15, 47, c1);
    setPixel(buf, S, 13, 50, c1); setPixel(buf, S, 11, 53, c1);
    // 左中脚
    vLine(buf, S, 26, 39, 5, c1); joint(26, 44);
    setPixel(buf, S, 23, 46, c1); setPixel(buf, S, 20, 49, c1);
    setPixel(buf, S, 18, 52, c1); setPixel(buf, S, 16, 55, c1);
    // 左後脚
    vLine(buf, S, 32, 39, 5, c1); joint(32, 44);
    setPixel(buf, S, 29, 46, c1); setPixel(buf, S, 26, 49, c1);
    setPixel(buf, S, 24, 53, c1); setPixel(buf, S, 22, 57, c1);
    // 右前脚
    vLine(buf, S, 43, 39, 5, c1); joint(43, 44);
    setPixel(buf, S, 46, 45, c1); setPixel(buf, S, 48, 47, c1);
    setPixel(buf, S, 50, 50, c1); setPixel(buf, S, 52, 53, c1);
    // 右中脚
    vLine(buf, S, 37, 39, 5, c1); joint(37, 44);
    setPixel(buf, S, 40, 46, c1); setPixel(buf, S, 43, 49, c1);
    setPixel(buf, S, 45, 52, c1); setPixel(buf, S, 47, 55, c1);
    // 右後脚  (後寄り)
    hLine(buf, S, 50, 39, 3, c1); joint(53, 42);
    setPixel(buf, S, 55, 44, c1); setPixel(buf, S, 57, 47, c1);
    setPixel(buf, S, 58, 51, c1); setPixel(buf, S, 59, 55, c1);
  },
  junk_king: (buf, S, c1, c2) => {
    // ジャンクキング - 重装甲人型ロボット (64x64)
    const BLACK = { r: 0, g: 0, b: 0, a: 255 };
    const RED     = hexToRGBA('#ff2200');
    const RED_HL  = hexToRGBA('#ff8888', 180);

    // === 背中のジャンク (肩の上) ===
    vLine(buf, S, 21, 4, 10, c1);
    vLine(buf, S, 42, 4, 10, c1);
    vLine(buf, S, 38, 6,  8, c1);
    hLine(buf, S, 36, 6,  4, c1);
    // 歯車
    hLine(buf, S, 28, 2,  8, c1);
    vLine(buf, S, 28, 2,  8, c1);
    vLine(buf, S, 35, 2,  8, c1);
    hLine(buf, S, 28, 9,  8, c1);
    setPixel(buf, S, 30, 4, c2); setPixel(buf, S, 33, 4, c2);
    setPixel(buf, S, 30, 7, c2); setPixel(buf, S, 33, 7, c2);

    // === 頭部 (y:10-23) ===
    fillRect(buf, S, 22, 11, 20, 13, BLACK);
    hLine(buf, S, 24, 10, 16, c1);
    hLine(buf, S, 22, 23, 20, c1);
    vLine(buf, S, 22, 11, 13, c1);
    vLine(buf, S, 41, 11, 13, c1);
    setPixel(buf, S, 23, 11, c1); setPixel(buf, S, 40, 11, c1);
    // バイザー枠
    fillRect(buf, S, 24, 13, 16, 7, BLACK);
    hLine(buf, S, 24, 13, 16, c1);
    hLine(buf, S, 24, 19, 16, c1);
    vLine(buf, S, 23, 14,  6, c1);
    vLine(buf, S, 40, 14,  6, c1);
    // 赤い目 x2
    fillRect(buf, S, 25, 14, 5, 4, RED);
    fillRect(buf, S, 34, 14, 5, 4, RED);
    setPixel(buf, S, 26, 15, RED_HL);
    setPixel(buf, S, 35, 15, RED_HL);
    // 口グリル
    hLine(buf, S, 27, 21, 10, c2);
    setPixel(buf, S, 29, 22, c2); setPixel(buf, S, 32, 22, c2); setPixel(buf, S, 35, 22, c2);

    // === 左肩パッド (y:22-31) ===
    fillRect(buf, S, 10, 22, 14, 10, BLACK);
    hLine(buf, S, 10, 22, 14, c1);
    hLine(buf, S, 10, 31, 14, c1);
    vLine(buf, S, 10, 23,  9, c1);
    vLine(buf, S, 23, 23,  9, c1);
    hLine(buf, S, 12, 26, 10, c2);

    // === 右肩パッド (y:22-31) ===
    fillRect(buf, S, 40, 22, 14, 10, BLACK);
    hLine(buf, S, 40, 22, 14, c1);
    hLine(buf, S, 40, 31, 14, c1);
    vLine(buf, S, 40, 23,  9, c1);
    vLine(buf, S, 53, 23,  9, c1);
    hLine(buf, S, 42, 26, 10, c2);

    // === 胸部 (y:22-41) ===
    fillRect(buf, S, 22, 22, 20, 20, BLACK);
    hLine(buf, S, 22, 22, 20, c1);
    hLine(buf, S, 22, 41, 20, c1);
    vLine(buf, S, 22, 23, 19, c1);
    vLine(buf, S, 41, 23, 19, c1);
    hLine(buf, S, 24, 28, 16, c2);
    hLine(buf, S, 24, 36, 16, c1);
    // 中央コア
    fillRect(buf, S, 28, 30, 8, 6, BLACK);
    hLine(buf, S, 28, 30,  8, c2);
    hLine(buf, S, 28, 35,  8, c2);
    vLine(buf, S, 28, 31,  4, c2);
    vLine(buf, S, 35, 31,  4, c2);
    setPixel(buf, S, 31, 32, c2); setPixel(buf, S, 32, 32, c2);
    setPixel(buf, S, 31, 33, c2); setPixel(buf, S, 32, 33, c2);

    // === ベルト (y:42-48) ===
    fillRect(buf, S, 20, 42, 24,  6, BLACK);
    hLine(buf, S, 20, 42, 24, c1);
    hLine(buf, S, 20, 47, 24, c1);
    vLine(buf, S, 20, 43,  5, c1);
    vLine(buf, S, 43, 43,  5, c1);
    fillRect(buf, S, 29, 43,  6, 4, BLACK);
    hLine(buf, S, 29, 43,  6, c2);
    hLine(buf, S, 29, 46,  6, c2);
    vLine(buf, S, 29, 44,  2, c2);
    vLine(buf, S, 34, 44,  2, c2);

    // === 左腕 (シアン前腕・クロー付き) ===
    // 上腕
    vLine(buf, S, 20, 30, 6, c1);
    vLine(buf, S, 22, 31, 5, c1);
    fillRect(buf, S, 13, 32, 9, 6, BLACK);
    hLine(buf, S, 13, 32, 9, c1);
    hLine(buf, S, 13, 37, 9, c1);
    vLine(buf, S, 13, 33, 5, c1);
    // 前腕 (シアン発光)
    fillRect(buf, S, 4, 34, 10, 6, BLACK);
    hLine(buf, S, 4, 34, 10, c2);
    hLine(buf, S, 4, 39, 10, c2);
    vLine(buf, S,  4, 35,  5, c2);
    vLine(buf, S, 13, 35,  5, c2);
    // クロー指
    setPixel(buf, S, 2, 33, c2);
    setPixel(buf, S, 1, 32, c2); setPixel(buf, S, 1, 36, c2); setPixel(buf, S, 1, 39, c2);
    setPixel(buf, S, 2, 31, c2); setPixel(buf, S, 2, 38, c2);
    setPixel(buf, S, 3, 30, c2); setPixel(buf, S, 3, 39, c2);
    setPixel(buf, S, 4, 29, c2); setPixel(buf, S, 5, 29, c2);

    // === 右腕 + スタッフ ===
    // 上腕
    vLine(buf, S, 43, 30, 6, c1);
    vLine(buf, S, 41, 31, 5, c1);
    fillRect(buf, S, 42, 34,  8, 6, BLACK);
    hLine(buf, S, 42, 34,  8, c1);
    hLine(buf, S, 42, 39,  8, c1);
    vLine(buf, S, 49, 33,  7, c1);
    // 右手 (グリップ)
    fillRect(buf, S, 50, 38,  6, 6, BLACK);
    hLine(buf, S, 50, 38,  6, c1);
    hLine(buf, S, 50, 43,  6, c1);
    vLine(buf, S, 50, 39,  5, c1);
    vLine(buf, S, 55, 39,  5, c1);
    // スタッフ本体
    vLine(buf, S, 57, 4, 56, c1);
    vLine(buf, S, 58, 4, 56, c1);
    // スタッフ頭部
    fillRect(buf, S, 54, 4,  8, 8, BLACK);
    hLine(buf, S, 55, 4,  6, c1);
    hLine(buf, S, 55, 11,  6, c1);
    vLine(buf, S, 54, 5,  7, c1);
    vLine(buf, S, 61, 5,  7, c1);
    fillRect(buf, S, 56, 6,  4, 4, c2);
    // スタッフとグリップの接続
    hLine(buf, S, 55, 40,  3, c1);

    // === 左脚 (y:48-62) ===
    fillRect(buf, S, 22, 48, 10, 14, BLACK);
    hLine(buf, S, 22, 48, 10, c1);
    vLine(buf, S, 22, 49, 13, c1);
    vLine(buf, S, 31, 49, 13, c1);
    hLine(buf, S, 22, 54, 10, c2);  // 膝
    hLine(buf, S, 20, 61, 14, c1);  // ブーツ底
    setPixel(buf, S, 20, 60, c1); setPixel(buf, S, 33, 60, c1);

    // === 右脚 (y:48-62) ===
    fillRect(buf, S, 32, 48, 10, 14, BLACK);
    hLine(buf, S, 32, 48, 10, c1);
    vLine(buf, S, 32, 49, 13, c1);
    vLine(buf, S, 41, 49, 13, c1);
    hLine(buf, S, 32, 54, 10, c2);  // 膝
    hLine(buf, S, 30, 61, 14, c1);  // ブーツ底
    setPixel(buf, S, 30, 60, c1); setPixel(buf, S, 43, 60, c1);
  },
  phantom: (buf, S, c1, c2) => {
    // ファントム - 人型幽霊戦士 (64x64)
    const BLACK  = { r: 0, g: 0, b: 0, a: 255 };
    const EYE    = hexToRGBA('#ff6600');
    const EYE_HL = hexToRGBA('#ffcc88', 200);
    const CORE   = hexToRGBA('#cc88ff', 220);

    // === 頭部 (y:6-20) ===
    fillRect(buf, S, 24, 7, 16, 14, BLACK);
    // 頭の丸みのある輪郭
    hLine(buf, S, 26, 6,  12, c1);   // top
    hLine(buf, S, 24, 20, 16, c1);   // bottom
    vLine(buf, S, 24,  7, 14, c1);   // left
    vLine(buf, S, 39,  7, 14, c1);   // right
    setPixel(buf, S, 25,  7, c1); setPixel(buf, S, 38,  7, c1);  // 角丸
    setPixel(buf, S, 25, 20, c1); setPixel(buf, S, 38, 20, c1);
    // 赤い目 (オレンジ)
    fillRect(buf, S, 26, 11, 5, 4, EYE);
    fillRect(buf, S, 33, 11, 5, 4, EYE);
    setPixel(buf, S, 27, 12, EYE_HL);
    setPixel(buf, S, 34, 12, EYE_HL);

    // === 首 (y:20-24) ===
    fillRect(buf, S, 29, 20, 6, 4, BLACK);
    vLine(buf, S, 29, 20, 4, c1);
    vLine(buf, S, 34, 20, 4, c1);

    // === 胸部 (y:24-42) ===
    fillRect(buf, S, 20, 24, 24, 18, BLACK);
    hLine(buf, S, 20, 24, 24, c1);
    hLine(buf, S, 20, 41, 24, c1);
    vLine(buf, S, 20, 25, 17, c1);
    vLine(buf, S, 43, 25, 17, c1);
    // 鎖骨ライン
    hLine(buf, S, 22, 27, 20, c2);
    // 腹筋ライン
    hLine(buf, S, 22, 33, 20, c2);
    hLine(buf, S, 22, 38, 20, c2);
    vLine(buf, S, 32, 28,  5, c2);
    // 胸のコア
    fillRect(buf, S, 30, 29,  4, 4, BLACK);
    setPixel(buf, S, 31, 30, CORE);
    setPixel(buf, S, 32, 30, CORE);
    setPixel(buf, S, 31, 31, CORE);
    setPixel(buf, S, 32, 31, CORE);

    // === ベルト (y:42-47) ===
    fillRect(buf, S, 21, 42, 22,  5, BLACK);
    hLine(buf, S, 21, 42, 22, c1);
    hLine(buf, S, 21, 46, 22, c1);
    vLine(buf, S, 21, 43,  4, c1);
    vLine(buf, S, 42, 43,  4, c1);
    // バックル
    hLine(buf, S, 29, 43,  6, c1);
    hLine(buf, S, 29, 45,  6, c1);
    vLine(buf, S, 29, 44,  1, c1);
    vLine(buf, S, 34, 44,  1, c1);

    // === 左腕 (爪付き・前方伸ばし) ===
    // 肩
    fillRect(buf, S, 12, 24, 10, 8, BLACK);
    hLine(buf, S, 12, 24, 10, c1);
    hLine(buf, S, 12, 31, 10, c1);
    vLine(buf, S, 12, 25,  7, c1);
    // 上腕
    fillRect(buf, S, 6, 29, 8, 8, BLACK);
    hLine(buf, S,  6, 29,  8, c1);
    hLine(buf, S,  6, 36,  8, c1);
    vLine(buf, S,  6, 30,  7, c1);
    vLine(buf, S, 13, 30,  7, c1);
    // 前腕
    fillRect(buf, S, 2, 34, 6, 7, BLACK);
    hLine(buf, S, 2, 34,  6, c1);
    hLine(buf, S, 2, 40,  6, c1);
    vLine(buf, S, 2, 35,  6, c1);
    vLine(buf, S, 7, 35,  6, c1);
    // 爪 (5本の細長い指)
    setPixel(buf, S, 1, 34, c1); setPixel(buf, S, 0, 33, c1);  // 指1
    setPixel(buf, S, 1, 36, c1); setPixel(buf, S, 0, 35, c1);  // 指2
    setPixel(buf, S, 1, 38, c1); setPixel(buf, S, 0, 37, c1);  // 指3
    setPixel(buf, S, 1, 40, c1); setPixel(buf, S, 0, 39, c1);  // 指4
    setPixel(buf, S, 1, 42, c1); setPixel(buf, S, 0, 41, c1);  // 指5
    // エネルギースラッシュ線
    setPixel(buf, S, 3, 43, c1); setPixel(buf, S, 1, 45, c1);
    setPixel(buf, S, 5, 44, c1); setPixel(buf, S, 3, 46, c1);

    // === 右腕 (オーブ付き) ===
    // 肩
    fillRect(buf, S, 42, 24, 10, 8, BLACK);
    hLine(buf, S, 42, 24, 10, c1);
    hLine(buf, S, 42, 31, 10, c1);
    vLine(buf, S, 51, 25,  7, c1);
    // 上腕
    fillRect(buf, S, 50, 29, 8, 8, BLACK);
    hLine(buf, S, 50, 29,  8, c1);
    hLine(buf, S, 50, 36,  8, c1);
    vLine(buf, S, 50, 30,  7, c1);
    vLine(buf, S, 57, 30,  7, c1);
    // 前腕 (斜め下)
    fillRect(buf, S, 54, 35, 6, 7, BLACK);
    hLine(buf, S, 54, 35,  6, c1);
    hLine(buf, S, 54, 41,  6, c1);
    vLine(buf, S, 54, 36,  6, c1);
    vLine(buf, S, 59, 36,  6, c1);
    // 発光オーブ
    setPixel(buf, S, 60, 42, CORE);
    setPixel(buf, S, 61, 41, CORE);
    setPixel(buf, S, 61, 43, CORE);
    setPixel(buf, S, 62, 42, CORE);
    setPixel(buf, S, 60, 43, CORE);

    // === 左脚 (y:47-62) ===
    fillRect(buf, S, 20, 47, 11, 15, BLACK);
    hLine(buf, S, 20, 47, 11, c1);
    vLine(buf, S, 20, 48, 14, c1);
    vLine(buf, S, 30, 48, 14, c1);
    hLine(buf, S, 20, 53,  11, c2);  // 膝
    hLine(buf, S, 18, 61,  15, c1);  // ブーツ底
    setPixel(buf, S, 18, 60, c1); setPixel(buf, S, 32, 60, c1);
    // 地面ひび
    setPixel(buf, S, 16, 62, c2); setPixel(buf, S, 14, 63, c2);
    setPixel(buf, S, 18, 63, c2); setPixel(buf, S, 20, 63, c2);

    // === 右脚 (y:47-62) ===
    fillRect(buf, S, 33, 47, 11, 15, BLACK);
    hLine(buf, S, 33, 47, 11, c1);
    vLine(buf, S, 33, 48, 14, c1);
    vLine(buf, S, 43, 48, 14, c1);
    hLine(buf, S, 33, 53, 11, c2);  // 膝
    hLine(buf, S, 31, 61, 15, c1);  // ブーツ底
    setPixel(buf, S, 31, 60, c1); setPixel(buf, S, 45, 60, c1);
    // 地面ひび
    setPixel(buf, S, 44, 62, c2); setPixel(buf, S, 46, 63, c2);
    setPixel(buf, S, 42, 63, c2); setPixel(buf, S, 40, 63, c2);
  },
  iron_fortress: (buf, S, c1, c2) => {
    // アイアンフォートレス - 要塞型ロボット (64x64)
    const BLACK  = { r: 0, g: 0, b: 0, a: 255 };
    const EYE    = hexToRGBA('#ff4400');
    const EYE_HL = hexToRGBA('#ffaa88', 200);
    const CORE   = hexToRGBA('#ffff00');

    // === 城壁 胸壁（メルロン 3つ、y:2-12）===
    // 左メルロン
    fillRect(buf, S, 14, 2, 10, 10, BLACK);
    hLine(buf, S, 14, 2, 10, c1);
    vLine(buf, S, 14, 3, 9,  c1);
    vLine(buf, S, 23, 3, 9,  c1);
    // 中央メルロン
    fillRect(buf, S, 27, 2, 10, 10, BLACK);
    hLine(buf, S, 27, 2, 10, c1);
    vLine(buf, S, 27, 3, 9,  c1);
    vLine(buf, S, 36, 3, 9,  c1);
    // 右メルロン
    fillRect(buf, S, 40, 2, 10, 10, BLACK);
    hLine(buf, S, 40, 2, 10, c1);
    vLine(buf, S, 40, 3, 9,  c1);
    vLine(buf, S, 49, 3, 9,  c1);
    // 胸壁の台座（メルロンの下）
    hLine(buf, S, 12, 11, 40, c1);

    // === 城壁本体（y:12-28）===
    fillRect(buf, S, 12, 12, 40, 18, BLACK);
    hLine(buf, S, 12, 28, 40, c1);
    vLine(buf, S, 12, 13, 16, c1);
    vLine(buf, S, 51, 13, 16, c1);
    // 目 (赤、y:14-22)
    fillRect(buf, S, 18, 14, 10, 9, EYE);
    fillRect(buf, S, 36, 14, 10, 9, EYE);
    setPixel(buf, S, 19, 15, EYE_HL); setPixel(buf, S, 37, 15, EYE_HL);
    setPixel(buf, S, 20, 15, EYE_HL); setPixel(buf, S, 38, 15, EYE_HL);
    // 目の輪郭
    hLine(buf, S, 18, 14, 10, c1); hLine(buf, S, 18, 22, 10, c1);
    vLine(buf, S, 18, 15,  8, c1); vLine(buf, S, 27, 15,  8, c1);
    hLine(buf, S, 36, 14, 10, c1); hLine(buf, S, 36, 22, 10, c1);
    vLine(buf, S, 36, 15,  8, c1); vLine(buf, S, 45, 15,  8, c1);
    // 鼻梁(目の間)
    fillRect(buf, S, 28, 16, 8, 7, BLACK);
    hLine(buf, S, 29, 16, 6, c2);
    hLine(buf, S, 29, 22, 6, c2);

    // === 大きな盾（y:16-56, 左寄り）===
    // 盾の外形 (上が平たく下がV字)
    fillRect(buf, S, 4, 17, 28, 34, BLACK);
    hLine(buf, S, 4, 17, 28, c1);       // 盾上端
    vLine(buf, S, 4, 18, 34, c1);       // 盾左辺
    vLine(buf, S, 31, 18, 24, c1);      // 盾右辺
    // V字下端
    for (let i = 0; i <= 8; i++) {
      setPixel(buf, S,  4 + i, 52 - i, c1);  // 左斜め
      setPixel(buf, S, 31 - i, 52 - i, c1);  // 右斜め
    }
    setPixel(buf, S, 17, 56, c1);  // 先端
    setPixel(buf, S, 18, 56, c1);
    // 盾の中央ライン
    vLine(buf, S, 17, 19, 36, c2);
    vLine(buf, S, 18, 19, 36, c2);
    // 盾のコアドット
    fillRect(buf, S, 14, 34, 8, 8, BLACK);
    setPixel(buf, S, 17, 37, CORE);
    setPixel(buf, S, 18, 37, CORE);
    setPixel(buf, S, 17, 38, CORE);
    setPixel(buf, S, 18, 38, CORE);
    // 盾の内枠
    hLine(buf, S,  6, 20, 24, c2);
    hLine(buf, S,  6, 48, 20, c2);
    vLine(buf, S,  6, 21, 28, c2);
    vLine(buf, S, 29, 21, 28, c2);

    // === 右装甲ボディ (y:28-56)===
    fillRect(buf, S, 34, 28, 26, 28, BLACK);
    hLine(buf, S, 34, 28, 26, c1);
    hLine(buf, S, 34, 55, 26, c1);
    vLine(buf, S, 59, 29, 27, c1);
    // 段差ライン
    hLine(buf, S, 36, 35, 22, c2);
    hLine(buf, S, 36, 44, 22, c2);
    // パネル詳細
    fillRect(buf, S, 37, 36, 10, 8, BLACK);
    hLine(buf, S, 37, 36, 10, c2);
    hLine(buf, S, 37, 43, 10, c2);
    vLine(buf, S, 37, 37,  6, c2);
    vLine(buf, S, 46, 37,  6, c2);
    setPixel(buf, S, 41, 39, CORE);
    setPixel(buf, S, 42, 40, CORE);

    // === 左の砲身 (y:38-42, 3本)===
    hLine(buf, S, 1, 36, 10, c1);
    hLine(buf, S, 1, 38, 12, c1);
    hLine(buf, S, 1, 40, 10, c1);
    setPixel(buf, S,  1, 37, c1); setPixel(buf, S, 10, 37, c1);
    setPixel(buf, S,  1, 39, c1); setPixel(buf, S, 12, 39, c1);
    setPixel(buf, S,  1, 41, c1); setPixel(buf, S, 10, 41, c1);

    // === 右の砲身 (y:46-50, 3本)===
    hLine(buf, S, 52, 45, 12, c1);
    hLine(buf, S, 52, 47, 12, c1);
    hLine(buf, S, 52, 49, 12, c1);
    setPixel(buf, S, 52, 46, c1); setPixel(buf, S, 63, 46, c1);
    setPixel(buf, S, 52, 48, c1); setPixel(buf, S, 63, 48, c1);
    setPixel(buf, S, 52, 50, c1); setPixel(buf, S, 63, 50, c1);

    // === 台座/キャタピラ (y:56-62)===
    fillRect(buf, S, 4, 56, 56, 7, BLACK);
    hLine(buf, S, 4, 56, 56, c1);
    hLine(buf, S, 4, 62, 56, c1);
    vLine(buf, S,  4, 57, 6,  c1);
    vLine(buf, S, 59, 57, 6,  c1);
    // キャタピラのコマ
    for (let x = 8; x < 56; x += 8) {
      vLine(buf, S, x, 57, 6, c2);
    }
  },
  samurai_master: (buf, S, c1, c2) => {
    // サムライマスター - 侍ロボット (64x64)
    const BLACK  = { r: 0, g: 0, b: 0, a: 255 };
    const EYE    = hexToRGBA('#ff2255');
    const EYE_HL = hexToRGBA('#ffaacc', 200);
    const BLADE  = hexToRGBA('#aaddff');
    const TSUBA  = hexToRGBA('#ff6600');

    // === 背中の刀 ×2（X型に交差）===
    // 刀1: 左上→右下
    for (let i = 0; i < 20; i++) {
      setPixel(buf, S, 18 + i, 4 + i, BLADE);
    }
    setPixel(buf, S, 22, 8, TSUBA); setPixel(buf, S, 23, 8, TSUBA);
    setPixel(buf, S, 22, 9, TSUBA); setPixel(buf, S, 23, 9, TSUBA);
    // 刀2: 右上→左下
    for (let i = 0; i < 20; i++) {
      setPixel(buf, S, 45 - i, 4 + i, BLADE);
    }
    setPixel(buf, S, 40, 8, TSUBA); setPixel(buf, S, 41, 8, TSUBA);
    setPixel(buf, S, 40, 9, TSUBA); setPixel(buf, S, 41, 9, TSUBA);

    // === 兜 kuwagata (y:2-8) ===
    // 左角
    setPixel(buf, S, 24, 2, c1); setPixel(buf, S, 23, 3, c1);
    setPixel(buf, S, 22, 4, c1); setPixel(buf, S, 22, 5, c1);
    setPixel(buf, S, 23, 6, c1);
    // 右角
    setPixel(buf, S, 39, 2, c1); setPixel(buf, S, 40, 3, c1);
    setPixel(buf, S, 41, 4, c1); setPixel(buf, S, 41, 5, c1);
    setPixel(buf, S, 40, 6, c1);

    // === 兜本体 (y:6-18) ===
    fillRect(buf, S, 22, 7, 20, 12, BLACK);
    hLine(buf, S, 24, 6,  16, c1);   // top dome
    hLine(buf, S, 22, 18, 20, c1);   // bottom
    vLine(buf, S, 22, 7,  12, c1);   // left
    vLine(buf, S, 41, 7,  12, c1);   // right
    setPixel(buf, S, 23, 7,  c1); setPixel(buf, S, 40, 7,  c1);
    // 吹返し (faceplate wings)
    hLine(buf, S, 18, 12, 6, c1); hLine(buf, S, 18, 15, 6, c1);
    vLine(buf, S, 18, 13, 3, c1); vLine(buf, S, 23, 13, 3, c1);
    hLine(buf, S, 40, 12, 6, c1); hLine(buf, S, 40, 15, 6, c1);
    vLine(buf, S, 45, 13, 3, c1); vLine(buf, S, 40, 13, 3, c1);
    // 前立て（兜飾り）
    setPixel(buf, S, 32, 6, c1); setPixel(buf, S, 32, 5, c1); setPixel(buf, S, 32, 4, c1);
    // バイザー
    fillRect(buf, S, 25, 9, 14, 8, BLACK);
    hLine(buf, S, 25,  9, 14, c1);
    hLine(buf, S, 25, 16, 14, c1);
    vLine(buf, S, 25, 10,  7, c1);
    vLine(buf, S, 38, 10,  7, c1);
    // 赤い目 ×2
    fillRect(buf, S, 26, 11, 5, 4, EYE);
    fillRect(buf, S, 33, 11, 5, 4, EYE);
    setPixel(buf, S, 27, 12, EYE_HL); setPixel(buf, S, 34, 12, EYE_HL);

    // === 首 (y:18-22) ===
    fillRect(buf, S, 29, 18,  6, 4, BLACK);
    vLine(buf, S, 29, 18, 4, c1); vLine(buf, S, 34, 18, 4, c1);

    // === 肩鎧 sode (y:20-30) ===
    // 左肩
    fillRect(buf, S, 8, 20, 16, 12, BLACK);
    hLine(buf, S, 8, 20, 16, c1); hLine(buf, S, 8, 31, 16, c1);
    vLine(buf, S, 8, 21, 11, c1); vLine(buf, S, 23, 21, 11, c1);
    hLine(buf, S, 10, 24, 12, c2); hLine(buf, S, 10, 27, 12, c2);
    // 右肩
    fillRect(buf, S, 40, 20, 16, 12, BLACK);
    hLine(buf, S, 40, 20, 16, c1); hLine(buf, S, 40, 31, 16, c1);
    vLine(buf, S, 40, 21, 11, c1); vLine(buf, S, 55, 21, 11, c1);
    hLine(buf, S, 42, 24, 12, c2); hLine(buf, S, 42, 27, 12, c2);

    // === 胸鎧 do (y:20-40, 横縞) ===
    fillRect(buf, S, 22, 20, 20, 20, BLACK);
    hLine(buf, S, 22, 20, 20, c1); hLine(buf, S, 22, 39, 20, c1);
    vLine(buf, S, 22, 21, 19, c1); vLine(buf, S, 41, 21, 19, c1);
    // 横縞 (lamellar plates)
    for (let y = 24; y < 40; y += 4) hLine(buf, S, 23, y, 18, c2);
    // 胸のコア
    setPixel(buf, S, 31, 30, c1); setPixel(buf, S, 32, 30, c1);
    setPixel(buf, S, 31, 31, c1); setPixel(buf, S, 32, 31, c1);

    // === 腰帯 obi (y:40-44) ===
    fillRect(buf, S, 20, 40, 24,  4, BLACK);
    hLine(buf, S, 20, 40, 24, c1); hLine(buf, S, 20, 43, 24, c1);
    vLine(buf, S, 20, 41,  3, c1); vLine(buf, S, 43, 41,  3, c1);

    // === 草摺 kusazuri (y:44-52, 垂れ板) ===
    for (let x = 21; x < 43; x += 5) {
      fillRect(buf, S, x, 44, 4, 8, BLACK);
      hLine(buf, S, x, 44, 4, c1); hLine(buf, S, x, 51, 4, c1);
      vLine(buf, S, x, 45, 6, c1); vLine(buf, S, x+3, 45, 6, c1);
    }

    // === 左腕 + 大刀（構え）===
    // 上腕
    fillRect(buf, S, 12, 22, 10, 8, BLACK);
    hLine(buf, S, 12, 22, 10, c1); hLine(buf, S, 12, 29, 10, c1);
    vLine(buf, S, 12, 23,  7, c1);
    // 前腕
    fillRect(buf, S, 6, 28, 8, 8, BLACK);
    hLine(buf, S,  6, 28,  8, c1); hLine(buf, S,  6, 35,  8, c1);
    vLine(buf, S,  6, 29,  7, c1); vLine(buf, S, 13, 29,  7, c1);
    // 手（グリップ）
    fillRect(buf, S, 4, 34, 6, 6, BLACK);
    hLine(buf, S, 4, 34, 6, c1); hLine(buf, S, 4, 39, 6, c1);
    vLine(buf, S, 4, 35, 5, c1); vLine(buf, S, 9, 35, 5, c1);
    // 鍔（tsuba）- オレンジ円
    fillRect(buf, S, 3, 38, 8, 4, TSUBA);
    hLine(buf, S, 3, 38, 8, c1); hLine(buf, S, 3, 41, 8, c1);
    // 刀の刃（斜め上左方向）
    for (let i = 0; i < 22; i++) {
      setPixel(buf, S, 3 - (i > 10 ? i - 10 : 0), 37 - i, BLADE);
    }

    // === 右腕 + 脇差 ===
    // 上腕
    fillRect(buf, S, 42, 22, 10, 8, BLACK);
    hLine(buf, S, 42, 22, 10, c1); hLine(buf, S, 42, 29, 10, c1);
    vLine(buf, S, 51, 23,  7, c1);
    // 前腕
    fillRect(buf, S, 48, 30, 8, 7, BLACK);
    hLine(buf, S, 48, 30,  8, c1); hLine(buf, S, 48, 36,  8, c1);
    vLine(buf, S, 48, 31,  6, c1); vLine(buf, S, 55, 31,  6, c1);
    // 脇差
    hLine(buf, S, 50, 37, 12, BLADE);
    hLine(buf, S, 50, 38, 12, BLADE);
    fillRect(buf, S, 48, 36, 4, 4, TSUBA);

    // === 左脚 (y:52-62) ===
    fillRect(buf, S, 20, 52, 10, 10, BLACK);
    hLine(buf, S, 20, 52, 10, c1); vLine(buf, S, 20, 53, 9, c1); vLine(buf, S, 29, 53, 9, c1);
    hLine(buf, S, 20, 56, 10, c2);  // 膝
    hLine(buf, S, 18, 61, 14, c1);  // 草鞋
    setPixel(buf, S, 18, 60, c1); setPixel(buf, S, 31, 60, c1);

    // === 右脚 (y:52-62) ===
    fillRect(buf, S, 34, 52, 10, 10, BLACK);
    hLine(buf, S, 34, 52, 10, c1); vLine(buf, S, 34, 53, 9, c1); vLine(buf, S, 43, 53, 9, c1);
    hLine(buf, S, 34, 56, 10, c2);  // 膝
    hLine(buf, S, 32, 61, 14, c1);  // 草鞋
    setPixel(buf, S, 32, 60, c1); setPixel(buf, S, 45, 60, c1);
  },
  shadow_twin: (buf, S, c1, c2) => {
    // 双子ロボ: 左(c1=紫)が右向き、右(c2=マゼンタ)が左向き、互いにキャノンビームで接続
    const BLACK = hexToRGBA('#000000');
    const RED   = hexToRGBA('#ff2200');
    const DARK1 = hexToRGBA('#550099');
    const DARK2 = hexToRGBA('#990055');
    const BEAM  = hexToRGBA('#ffccff', 220);
    const AURA  = hexToRGBA('#ff4400', 180);
    const SPARK = hexToRGBA('#ffffff');

    // =========================================================
    // 左ツイン (c1=紫, 右向き) x:0-29
    // =========================================================

    // --- 頭部 ---
    fillRect(buf, S, 3, 3, 18, 11, c1);
    fillRect(buf, S, 6, 5, 4, 5, RED);          // 左目
    fillRect(buf, S, 13, 5, 4, 5, RED);         // 右目
    hLine(buf, S, 2, 2, 20, BLACK);
    hLine(buf, S, 2, 14, 20, BLACK);
    vLine(buf, S, 2, 3, 11, BLACK);
    vLine(buf, S, 21, 3, 11, BLACK);

    // --- 首 ---
    fillRect(buf, S, 8, 15, 8, 3, c1);

    // --- 胴体 ---
    fillRect(buf, S, 1, 18, 21, 18, c1);
    fillRect(buf, S, 4, 20, 13, 10, DARK1);     // チェストパネル
    fillRect(buf, S, 9, 22, 4, 6, c2);          // コアクリスタル(c2アクセント)
    hLine(buf, S, 1, 18, 21, BLACK);
    hLine(buf, S, 1, 35, 21, BLACK);
    vLine(buf, S, 1, 19, 16, BLACK);
    vLine(buf, S, 21, 19, 16, BLACK);

    // --- 左腕 (外側) ---
    fillRect(buf, S, 0, 19, 2, 7, c1);

    // --- 右キャノン腕 (内側=右方向) ---
    fillRect(buf, S, 22, 20, 8, 5, c1);
    fillRect(buf, S, 27, 21, 3, 3, DARK1);      // キャノン先端
    hLine(buf, S, 22, 20, 8, BLACK);
    hLine(buf, S, 22, 24, 8, BLACK);
    vLine(buf, S, 29, 21, 3, BLACK);

    // --- 左脚 ---
    fillRect(buf, S, 3, 36, 5, 9, c1);
    hLine(buf, S, 2, 36, 7, BLACK);
    hLine(buf, S, 2, 44, 7, BLACK);

    // --- 右脚 ---
    fillRect(buf, S, 13, 36, 5, 9, c1);
    hLine(buf, S, 12, 36, 7, BLACK);
    hLine(buf, S, 12, 44, 7, BLACK);

    // --- スラスター (c2色) ---
    fillRect(buf, S, 4, 45, 3, 5, c2);
    fillRect(buf, S, 14, 45, 3, 5, c2);

    // --- 破砕シャード (左) ---
    setPixel(buf, S, 3, 51, c1); setPixel(buf, S, 5, 52, c1);
    setPixel(buf, S, 2, 53, c1); setPixel(buf, S, 6, 53, c1);
    setPixel(buf, S, 4, 54, c1); setPixel(buf, S, 7, 51, c1);
    // --- 破砕シャード (右) ---
    setPixel(buf, S, 13, 51, c1); setPixel(buf, S, 15, 52, c1);
    setPixel(buf, S, 12, 53, c1); setPixel(buf, S, 16, 53, c1);
    setPixel(buf, S, 14, 54, c1); setPixel(buf, S, 17, 51, c1);

    // =========================================================
    // 接続ビーム (x:30-33, y:21-23)
    // =========================================================
    hLine(buf, S, 30, 21, 4, BEAM);
    hLine(buf, S, 30, 22, 4, BEAM);
    hLine(buf, S, 30, 23, 4, BEAM);
    setPixel(buf, S, 31, 20, SPARK);
    setPixel(buf, S, 32, 24, SPARK);

    // =========================================================
    // 右ツイン (c2=マゼンタ, 左向き) x:34-63
    // =========================================================

    // --- 頭部 ---
    fillRect(buf, S, 43, 3, 18, 11, c2);
    fillRect(buf, S, 44, 5, 4, 5, RED);         // 左目
    fillRect(buf, S, 51, 5, 4, 5, RED);         // 右目
    hLine(buf, S, 42, 2, 20, BLACK);
    hLine(buf, S, 42, 14, 20, BLACK);
    vLine(buf, S, 42, 3, 11, BLACK);
    vLine(buf, S, 61, 3, 11, BLACK);

    // --- 首 ---
    fillRect(buf, S, 48, 15, 8, 3, c2);

    // --- 胴体 ---
    fillRect(buf, S, 42, 18, 21, 18, c2);
    fillRect(buf, S, 47, 20, 13, 10, DARK2);    // チェストパネル
    fillRect(buf, S, 51, 22, 4, 6, c1);         // コアクリスタル(c1アクセント)
    hLine(buf, S, 42, 18, 21, BLACK);
    hLine(buf, S, 42, 35, 21, BLACK);
    vLine(buf, S, 42, 19, 16, BLACK);
    vLine(buf, S, 62, 19, 16, BLACK);

    // --- 右腕 (外側) ---
    fillRect(buf, S, 63, 19, 1, 7, c2);

    // --- 左キャノン腕 (内側=左方向) ---
    fillRect(buf, S, 34, 20, 8, 5, c2);
    fillRect(buf, S, 34, 21, 3, 3, DARK2);      // キャノン先端
    hLine(buf, S, 34, 20, 8, BLACK);
    hLine(buf, S, 34, 24, 8, BLACK);
    vLine(buf, S, 34, 21, 3, BLACK);

    // --- 左脚 ---
    fillRect(buf, S, 46, 36, 5, 9, c2);
    hLine(buf, S, 45, 36, 7, BLACK);
    hLine(buf, S, 45, 44, 7, BLACK);

    // --- 右脚 ---
    fillRect(buf, S, 56, 36, 5, 9, c2);
    hLine(buf, S, 55, 36, 7, BLACK);
    hLine(buf, S, 55, 44, 7, BLACK);

    // --- スラスター (c1色) ---
    fillRect(buf, S, 47, 45, 3, 5, c1);
    fillRect(buf, S, 57, 45, 3, 5, c1);

    // --- 破砕シャード (左) ---
    setPixel(buf, S, 46, 51, c2); setPixel(buf, S, 48, 52, c2);
    setPixel(buf, S, 45, 53, c2); setPixel(buf, S, 49, 53, c2);
    setPixel(buf, S, 47, 54, c2); setPixel(buf, S, 50, 51, c2);
    // --- 破砕シャード (右) ---
    setPixel(buf, S, 56, 51, c2); setPixel(buf, S, 58, 52, c2);
    setPixel(buf, S, 55, 53, c2); setPixel(buf, S, 59, 53, c2);
    setPixel(buf, S, 57, 54, c2); setPixel(buf, S, 60, 51, c2);

    // --- オーラ (右ツインを囲む赤/オレンジの炎) ---
    // 上部
    for (let ax = 40; ax <= 63; ax += 2) setPixel(buf, S, ax, 1, AURA);
    for (let ax = 41; ax <= 62; ax += 4) setPixel(buf, S, ax, 0, AURA);
    // 左サイド (ビーム位置y:21-23を避ける)
    for (let ay = 0; ay <= 19; ay += 2) setPixel(buf, S, 38, ay, AURA);
    for (let ay = 25; ay <= 60; ay += 2) setPixel(buf, S, 38, ay, AURA);
    for (let ay = 1; ay <= 18; ay += 3) setPixel(buf, S, 37, ay, AURA);
    for (let ay = 26; ay <= 59; ay += 3) setPixel(buf, S, 37, ay, AURA);
    // 右サイド
    for (let ay = 0; ay <= 60; ay += 2) setPixel(buf, S, 63, ay, AURA);
    // 下部
    for (let ax = 41; ax <= 62; ax += 3) setPixel(buf, S, ax, 58, AURA);
    for (let ax = 40; ax <= 63; ax += 4) setPixel(buf, S, ax, 59, AURA);
  },
  queen_of_shadow: (buf, S, c1, c2) => {
    // シルエットと王冠
    fillRect(buf, S, 20, 20, 24, 36, c1);
    fillRect(buf, S, 22, 12, 20, 8, hexToRGBA('#ffcc00'));
    setPixel(buf, S, 26, 24, c2); setPixel(buf, S, 36, 24, c2);
  },
  mind_controller: (buf, S, c1, c2) => {
    // 浮遊する脳
    const pink = hexToRGBA('#ff88cc');
    for(let y=16; y<48; y++) {
      for(let x=16; x<48; x++) {
        if((x-32)**2 + (y-32)**2 < 256) setPixel(buf, S, x, y, pink);
      }
    }
    vLine(buf, S, 24, 48, 12, c1);
    vLine(buf, S, 40, 48, 12, c1);
  },
  overload: (buf, S, c1, c2) => {
    // コピーメカ
    fillRect(buf, S, 20, 20, 24, 24, c1);
    fillRect(buf, S, 24, 24, 16, 16, hexToRGBA('#88ffff', 200));
  },
  time_eater: (buf, S, c1, c2) => {
    // 時計型
    for(let y=12; y<52; y++) {
      for(let x=12; x<52; x++) {
        const d = (x-32)**2 + (y-32)**2;
        if(d < 400) setPixel(buf, S, x, y, c1);
        else if(d < 450) setPixel(buf, S, x, y, hexToRGBA('#888888'));
      }
    }
    hLine(buf, S, 32, 32, 12, c2);
    vLine(buf, S, 32, 20, 12, c2);
  },
  eternal_core: (buf, S, c1, c2) => {
    // 核
    for(let y=20; y<44; y++){
      for(let x=20; x<44; x++){
        if((x-32)**2 + (y-32)**2 < 144) setPixel(buf, S, x, y, c1);
      }
    }
    for(let angle=0; angle<360; angle+=45){
      const a = angle * Math.PI / 180;
      setPixel(buf, S, 32 + 20*Math.cos(a), 32 + 20*Math.sin(a), c2);
    }
  },
  final_boss: (buf, S, c1, c2) => {
    // 禍々しい全ての集合体
    fillRect(buf, S, 16, 12, 32, 40, c1);
    fillRect(buf, S, 12, 20, 40, 8, c2);
    for(let i=0; i<64; i+=8){
      hLine(buf, S, 4, i, 56, hexToRGBA('#cc00ff', 100));
    }
  },
  death_machine: (buf, S, c1, c2) => {
    // 超重装甲
    fillRect(buf, S, 8, 16, 48, 32, hexToRGBA('#333333'));
    fillRect(buf, S, 16, 24, 32, 16, c1);
    setPixel(buf, S, 32, 32, c2);
  },
  last_boss_shadow: (buf, S, c1, c2) => {
    // ボス級の影 (巨大)
    fillRect(buf, S, 12, 12, 40, 40, hexToRGBA('#111122'));
    setPixel(buf, S, 24, 24, c2);
    setPixel(buf, S, 40, 24, c2);
  }
};

const bossColors: Record<string, [RGBA, RGBA]> = {
  bug_swarm: [hexToRGBA('#00ee66'), hexToRGBA('#003311')],
  mach_runner: [hexToRGBA('#ffaa00'), hexToRGBA('#664400')],
  junk_king: [hexToRGBA('#ff6600'), hexToRGBA('#00ccaa')],
  phantom: [hexToRGBA('#bb44ff'), hexToRGBA('#440088')],
  iron_fortress: [hexToRGBA('#00ff88'), hexToRGBA('#004422')],
  samurai_master: [hexToRGBA('#ffdd00'), hexToRGBA('#885500')],
  shadow_twin: [hexToRGBA('#8800ff'), hexToRGBA('#ff0088')],
  queen_of_shadow: [hexToRGBA('#110022'), hexToRGBA('#ff0000')],
  mind_controller: [hexToRGBA('#440088'), hexToRGBA('#00ffff')],
  overload: [hexToRGBA('#cccccc'), hexToRGBA('#4444ff')],
  time_eater: [hexToRGBA('#ffbb00'), hexToRGBA('#000000')],
  eternal_core: [hexToRGBA('#ff0044'), hexToRGBA('#ffbb00')],
  final_boss: [hexToRGBA('#220000'), hexToRGBA('#cc00ff')],
  death_machine: [hexToRGBA('#555555'), hexToRGBA('#ff0000')],
  last_boss_shadow: [hexToRGBA('#000000'), hexToRGBA('#4444ff')],
};

async function generateBossSprites(meta: SpriteMeta): Promise<void> {
  const outDir = path.join(SPRITES_DIR, 'enemies');
  ensureDir(outDir);
  const S = BOSS_SIZE;

  // 各ボスに対して10フレーム生成
  for (const [id, drawFn] of Object.entries(bossDrawers)) {
    const [c1, c2] = bossColors[id];
    const baseBuf = createBuffer(S, S);
    drawFn(baseBuf, S, c1, c2);
    
    // 10 Frames: move_0, move_1, atk_0, atk_1, atk_2, dmg_0, dmg_1, dead_0, dead_1, dead_2
    const framesData = [
      { name: 'move_0', scale: 1, rot: 0, dx: 0, dy: 0 },
      { name: 'move_1', scale: 1, rot: 0, dx: 0, dy: -2 }, // バウンド
      { name: 'atk_0',  scale: 1, rot: -0.1, dx: -2, dy: 0 }, // 振りかぶり
      { name: 'atk_1',  scale: 1, rot: 0.1, dx: 4, dy: 0 }, // 突進
      { name: 'atk_2',  scale: 1, rot: 0, dx: 0, dy: 0 }, // 戻り
      { name: 'dmg_0',  scale: 0.95, rot: -0.05, dx: -2, dy: -2 }, // のけぞり
      { name: 'dmg_1',  scale: 0.95, rot: 0.05, dx: 2, dy: 0 },
      { name: 'dead_0', scale: 0.8, rot: 0.5, dx: 0, dy: 0 }, // 回転縮小
      { name: 'dead_1', scale: 0.5, rot: 1.5, dx: 0, dy: 0 },
      { name: 'dead_2', scale: 0.1, rot: 3.14, dx: 0, dy: 0 }
    ];

    const frames: SpriteFrame[] = [];
    for (let i = 0; i < framesData.length; i++) {
      const fd = framesData[i];
      const buf = createBuffer(S, S);
      transformBuffer(baseBuf, buf, S, fd.scale, fd.rot, fd.dx, fd.dy);
      
      // Post-process FX
      if (fd.name.startsWith('atk_1')) {
        const fx = hexToRGBA('#ffff00', 180);
        for(let a=0; a<360; a+=30) setPixel(buf,S,32+16*Math.cos(a), 32+16*Math.sin(a), fx);
      }
      if (fd.name.startsWith('dmg_')) {
        for(let j=0; j<buf.length; j+=4) {
          if(buf[j+3] > 0) buf[j] = Math.min(255, buf[j] + 80);
        }
        const ex = hexToRGBA('#ff0000');
        for(let i=0; i<8; i++){
          setPixel(buf, S, 28+i, 28+i, ex);
          setPixel(buf, S, 28+i, 35-i, ex);
        }
      }
      
      const file = path.join(outDir, `${id}_${fd.name}.png`);
      await savePNG(buf, S, S, file);
      console.log('  Generated:', file);
      frames.push({ file: `public/sprites/enemies/${id}_${fd.name}.png`, width: S, height: S });
    }
    
    meta.enemies[id] = frames;
  }
}

// ---------------------------------------------------------------------------
// B10F以下 通常敵・ボス 4方向全状態スプライト生成
// ---------------------------------------------------------------------------

/**
 * バッファを水平反転して新しいバッファを返す。
 * left 向きを flip して right 向きを生成するために使用。
 */
function flipHorizontal(src: Uint8Array, S: number): Uint8Array {
  const dst = createBuffer(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const si = (y * S + x) * 4;
      const di = (y * S + (S - 1 - x)) * 4;
      dst[di]     = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return dst;
}

/**
 * 4方向フル対応描画関数の型。
 * down/up/left/right × idle/attack/hit × frame 0-1 を受け取る。
 */
type Enemy4DirDrawFn = (
  buf: Uint8Array,
  S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
) => void;

/**
 * 4方向 × idle/attack/hit × 2フレームの通常敵スプライトを生成する。
 * right は left のバッファを水平反転して生成する。
 */
async function generateEnemy4DirFull(
  outDir: string,
  id: string,
  drawFn: Enemy4DirDrawFn,
): Promise<void> {
  const DIRS = ['down', 'up', 'left', 'right'] as const;
  const STATES = ['idle', 'attack', 'hit'] as const;
  const S = TILE_SIZE;

  for (const dir of DIRS) {
    for (const state of STATES) {
      for (let frame = 0; frame < 2; frame++) {
        const buf = createBuffer(S, S);
        if (dir === 'right') {
          // right は left の水平反転
          drawFn(buf, S, 'left', state, frame);
          const flipped = flipHorizontal(buf, S);
          const fileName = `${id}_dir_right_${state}_${frame}.png`;
          const file = path.join(outDir, fileName);
          // 既存ファイルがある場合は上書きしない
          if (!fs.existsSync(file)) {
            await savePNG(flipped, S, S, file);
            console.log('  Generated:', file);
          }
        } else {
          drawFn(buf, S, dir, state, frame);
          const fileName = `${id}_dir_${dir}_${state}_${frame}.png`;
          const file = path.join(outDir, fileName);
          if (!fs.existsSync(file)) {
            await savePNG(buf, S, S, file);
            console.log('  Generated:', file);
          }
        }
      }
    }
  }
}

/**
 * ボスの4方向 × move/atk/dmg/dead × 2フレームスプライトを生成する。
 * right は left の水平反転。各方向は baseBuf を transformBuffer で加工して生成。
 */
async function generateBoss4DirSprites(outDir: string): Promise<void> {
  console.log('\n[Boss 4-Dir Sprites]');
  const S = BOSS_SIZE;
  const B10F_BOSSES = ['bug_swarm', 'mach_runner', 'junk_king', 'phantom', 'iron_fortress', 'samurai_master'] as const;
  const DIRS = ['down', 'up', 'left', 'right'] as const;
  const STATES = ['move', 'atk', 'dmg', 'dead'] as const;

  // 方向オフセット（up は-4px上、left は左寄り、right は右寄り）
  const dirOffsets: Record<string, { dx: number; dy: number }> = {
    down:  { dx: 0,  dy: 0  },
    up:    { dx: 0,  dy: -4 },
    left:  { dx: -4, dy: 0  },
    right: { dx: 4,  dy: 0  },
  };

  // 状態ごとの変換パラメータ（2フレーム分）
  const stateParams: Record<string, Array<{ scale: number; rot: number; dx: number; dy: number }>> = {
    move: [
      { scale: 1,    rot: 0,     dx: 0,  dy: 0  },
      { scale: 1,    rot: 0,     dx: 0,  dy: -2 },
    ],
    atk: [
      { scale: 1,    rot: -0.08, dx: -2, dy: 0  },
      { scale: 1,    rot: 0.08,  dx: 3,  dy: 0  },
    ],
    dmg: [
      { scale: 0.95, rot: -0.05, dx: -2, dy: -2 },
      { scale: 0.95, rot: 0.05,  dx: 2,  dy: 0  },
    ],
    dead: [
      { scale: 0.7,  rot: 0.5,   dx: 0,  dy: 0  },
      { scale: 0.4,  rot: 1.5,   dx: 0,  dy: 0  },
    ],
  };

  for (const id of B10F_BOSSES) {
    const [c1, c2] = bossColors[id];
    const drawFn = bossDrawers[id];
    const baseBuf = createBuffer(S, S);
    drawFn(baseBuf, S, c1, c2);

    for (const dir of DIRS) {
      const dOff = dirOffsets[dir];
      for (const state of STATES) {
        const params = stateParams[state];
        for (let frame = 0; frame < 2; frame++) {
          const p = params[frame];
          const fileName = `${id}_dir_${dir}_${state}_${frame}.png`;
          const file = path.join(outDir, fileName);
          const forceRegen = (id === 'bug_swarm' || id === 'mach_runner' || id === 'junk_king' || id === 'phantom' || id === 'iron_fortress' || id === 'samurai_master');
          if (!forceRegen && fs.existsSync(file)) continue;

          let buf = createBuffer(S, S);
          if (dir === 'right') {
            // right は left を水平反転
            const leftBuf = createBuffer(S, S);
            transformBuffer(baseBuf, leftBuf, S, p.scale, p.rot, dOff.dx + p.dx, dOff.dy + p.dy);
            buf = flipHorizontal(leftBuf, S);
          } else {
            transformBuffer(baseBuf, buf, S, p.scale, p.rot, dOff.dx + p.dx, dOff.dy + p.dy);
            // up 方向: 色を少し暗くして背面表現
            if (dir === 'up') {
              for (let i = 0; i < buf.length; i += 4) {
                if (buf[i + 3] > 0) {
                  buf[i]     = Math.max(0, buf[i]     - 40);
                  buf[i + 1] = Math.max(0, buf[i + 1] - 40);
                  buf[i + 2] = Math.max(0, buf[i + 2] - 40);
                }
              }
            }
          }

          // dmg: 赤みを増す
          if (state === 'dmg') {
            for (let i = 0; i < buf.length; i += 4) {
              if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 80);
            }
          }
          // dead: 透明度を下げて消滅演出
          if (state === 'dead') {
            const alpha = frame === 0 ? 180 : 80;
            for (let i = 0; i < buf.length; i += 4) {
              if (buf[i + 3] > 0) buf[i + 3] = Math.min(buf[i + 3], alpha);
            }
          }

          // bug_swarm / mach_runner / junk_king: 方向インジケーター（小矢印）を上乗せ
          if (id === 'bug_swarm' || id === 'mach_runner' || id === 'junk_king' || id === 'phantom' || id === 'iron_fortress' || id === 'samurai_master') {
            const arr = hexToRGBA('#ffffff', 210);
            if (dir === 'down') {
              hLine(buf, S, 28, 56, 8, arr);
              hLine(buf, S, 29, 57, 6, arr);
              hLine(buf, S, 30, 58, 4, arr);
              hLine(buf, S, 31, 59, 2, arr);
            } else if (dir === 'up') {
              hLine(buf, S, 31, 4, 2, arr);
              hLine(buf, S, 30, 5, 4, arr);
              hLine(buf, S, 29, 6, 6, arr);
              hLine(buf, S, 28, 7, 8, arr);
            } else if (dir === 'left') {
              vLine(buf, S, 4,  29, 2, arr);
              vLine(buf, S, 5,  28, 4, arr);
              vLine(buf, S, 6,  27, 6, arr);
              vLine(buf, S, 7,  26, 8, arr);
            } else if (dir === 'right') {
              vLine(buf, S, 59, 29, 2, arr);
              vLine(buf, S, 58, 28, 4, arr);
              vLine(buf, S, 57, 27, 6, arr);
              vLine(buf, S, 56, 26, 8, arr);
            }
          }

          await savePNG(buf, S, S, file);
          console.log('  Generated:', file);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// B10F以下 通常敵 4方向描画関数（12種）
// ---------------------------------------------------------------------------

/** scout_drone: 小型偵察ドローン（丸いボディ）4方向版 */
function drawScoutDrone4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const body   = hexToRGBA('#cc4444');
  const shadow = hexToRGBA('#882222');
  const light  = hexToRGBA('#ff8888');
  const eyeC   = hexToRGBA('#00ffff');
  const atkC   = hexToRGBA('#ff8800');
  const hitC   = hexToRGBA('#ff0000');
  const bY = frame === 1 ? 1 : 0;
  const cx = 16, cy = 16;

  // hit 時は赤くフラッシュ
  const mainColor = state === 'hit' ? hitC : body;

  if (dir === 'down' || dir === 'up') {
    // 正面 or 背面（丸ボディ）
    for (let y = cy - 6 + bY; y <= cy + 6 + bY; y++) {
      for (let x = cx - 7; x <= cx + 7; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + ((y - cy - bY) * 1.1) ** 2);
        if (dist <= 7) setPixel(buf, S, x, y, dist < 5 ? mainColor : shadow);
      }
    }
    if (dir === 'down') {
      // 正面: 目2つ
      setPixel(buf, S, cx - 3, cy - 4 + bY, light);
      setPixel(buf, S, cx - 2, cy - 4 + bY, light);
      fillRect(buf, S, cx - 2, cy - 2 + bY, 5, 5, hexToRGBA('#000000'));
      fillRect(buf, S, cx - 1, cy - 1 + bY, 3, 3, eyeC);
    } else {
      // 背面: 小さなスラスター（背中マーク）
      fillRect(buf, S, cx - 3, cy + 3 + bY, 6, 2, shadow);
      setPixel(buf, S, cx - 1, cy + 5 + bY, hexToRGBA('#ff8800'));
      setPixel(buf, S, cx + 1, cy + 5 + bY, hexToRGBA('#ff8800'));
    }
    if (state === 'attack') {
      const atkY = dir === 'down' ? cy + 7 + bY : cy - 8 + bY;
      fillRect(buf, S, cx - 2, atkY, 4, 4, atkC);
    }
    if (state === 'hit' && frame === 1) {
      // のけぞり: 縦にずれる
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 50);
      }
    }
  } else {
    // left: 横向き
    for (let y = cy - 5 + bY; y <= cy + 5 + bY; y++) {
      for (let x = cx - 7; x <= cx + 5; x++) {
        const dist = Math.sqrt(((x - cx + 1) * 1.2) ** 2 + ((y - cy - bY)) ** 2);
        if (dist <= 6) setPixel(buf, S, x, y, dist < 4 ? mainColor : shadow);
      }
    }
    setPixel(buf, S, cx - 3, cy - 4 + bY, light);
    fillRect(buf, S, cx - 4, cy - 1 + bY, 3, 3, hexToRGBA('#000000'));
    fillRect(buf, S, cx - 3, cy - 1 + bY, 2, 2, eyeC);
    if (state === 'attack') {
      fillRect(buf, S, cx - 8, cy - 2 + bY, 4, 4, atkC);
    }
    if (state === 'hit') {
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 50);
      }
    }
  }
  // ローター（プロペラ）: 上部に横線
  if (dir !== 'up') {
    hLine(buf, S, cx - 5, cy - 8 + bY, 10, shadow);
    if (frame === 0) {
      setPixel(buf, S, cx - 4, cy - 8 + bY, light);
      setPixel(buf, S, cx + 3, cy - 8 + bY, light);
    }
  }
}

/** mine_beetle: 地雷付き甲虫メカ 4方向版 */
function drawMineBeetle4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const shell  = hexToRGBA('#448844');
  const dark   = hexToRGBA('#224422');
  const light  = hexToRGBA('#88cc88');
  const mine   = hexToRGBA('#ff4444');
  const mineD  = hexToRGBA('#cc0000');
  const eyeC   = hexToRGBA('#ffff00');
  const hitC   = hexToRGBA('#ff6666');
  const bY = frame === 1 ? 1 : 0;
  const cx = 16, cy = 16;
  const mainShell = state === 'hit' ? hitC : shell;

  if (dir === 'down') {
    // 正面: 楕円甲虫ボディ
    fillRect(buf, S, cx - 8, cy - 2 + bY, 16, 10, mainShell);
    fillRect(buf, S, cx - 6, cy - 5 + bY, 12, 4, mainShell);
    hLine(buf, S, cx - 7, cy - 2 + bY, 14, light);
    // 目
    setPixel(buf, S, cx - 3, cy - 4 + bY, eyeC);
    setPixel(buf, S, cx + 2, cy - 4 + bY, eyeC);
    // 地雷（背中）
    fillRect(buf, S, cx - 2, cy + 3 + bY, 4, 4, mine);
    setPixel(buf, S, cx, cy + 2 + bY, mineD);
    // 脚
    for (let i = 0; i < 3; i++) {
      setPixel(buf, S, cx - 9, cy + i * 2 + bY, dark);
      setPixel(buf, S, cx + 8, cy + i * 2 + bY, dark);
    }
    if (state === 'attack') {
      // 地雷放出エフェクト
      fillRect(buf, S, cx - 3, cy + 8 + bY, 6, 3, hexToRGBA('#ff8800'));
    }
  } else if (dir === 'up') {
    // 背面
    fillRect(buf, S, cx - 8, cy - 2 + bY, 16, 10, mainShell);
    hLine(buf, S, cx - 7, cy - 2 + bY, 14, dark);
    // 地雷が見える（背面上部）
    fillRect(buf, S, cx - 2, cy - 6 + bY, 4, 4, mine);
    setPixel(buf, S, cx, cy - 7 + bY, mineD);
    for (let i = 0; i < 3; i++) {
      setPixel(buf, S, cx - 9, cy + i * 2 + bY, dark);
      setPixel(buf, S, cx + 8, cy + i * 2 + bY, dark);
    }
  } else {
    // left: 横向き甲虫
    fillRect(buf, S, cx - 7, cy - 4 + bY, 14, 8, mainShell);
    fillRect(buf, S, cx - 5, cy - 7 + bY, 6, 4, mainShell);
    hLine(buf, S, cx - 6, cy - 4 + bY, 12, light);
    setPixel(buf, S, cx - 5, cy - 5 + bY, eyeC);
    // 地雷（右側）
    fillRect(buf, S, cx + 5, cy - 2 + bY, 4, 4, mine);
    // 脚
    for (let i = 0; i < 3; i++) {
      setPixel(buf, S, cx - 5 + i * 4, cy + 4 + bY, dark);
      setPixel(buf, S, cx - 5 + i * 4, cy + 5 + bY, dark);
    }
    if (state === 'attack') {
      fillRect(buf, S, cx - 10, cy - 1 + bY, 4, 4, hexToRGBA('#ff8800'));
    }
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 60);
    }
  }
}

/** guard_bot: 守衛ロボット 4方向版 */
function drawGuardBot4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const body   = hexToRGBA('#888888');
  const shadow = hexToRGBA('#555555');
  const light  = hexToRGBA('#bbbbbb');
  const eyeC   = state === 'hit' ? hexToRGBA('#ffffff') : hexToRGBA('#ff0000');
  const atkC   = hexToRGBA('#ff4400');
  const bY = frame === 1 ? 1 : 0;
  const cx = 16;

  if (dir === 'down' || dir === 'up') {
    // 胴体
    fillRect(buf, S, cx - 6, bY + 10, 12, 12, body);
    fillRect(buf, S, cx - 6, bY + 10,  1, 12, shadow);
    fillRect(buf, S, cx + 5, bY + 10,  1, 12, shadow);
    hLine(buf, S, cx - 5, bY + 10, 10, dir === 'up' ? shadow : light);
    // 頭部
    fillRect(buf, S, cx - 5, bY + 3, 10, 7, body);
    if (dir === 'down') {
      fillRect(buf, S, cx - 3, bY + 5, 6, 3, hexToRGBA('#111111'));
      fillRect(buf, S, cx - 3, bY + 5, 2, 2, eyeC);
      fillRect(buf, S, cx + 1, bY + 5, 2, 2, eyeC);
    } else {
      // 背面: アンテナ、頭後部
      fillRect(buf, S, cx - 3, bY + 2, 6, 3, hexToRGBA('#444444'));
      setPixel(buf, S, cx - 1, bY + 1, shadow);
      setPixel(buf, S, cx + 1, bY + 1, shadow);
    }
    // 肩・腕
    fillRect(buf, S, cx - 9, bY + 11, 3, 6, shadow);
    fillRect(buf, S, cx + 6, bY + 11, 3, 6, body);
    // 脚
    fillRect(buf, S, cx - 5, bY + 22, 4, 6, shadow);
    fillRect(buf, S, cx + 1, bY + 22, 4, 6, body);
    if (state === 'attack' && dir === 'down') {
      fillRect(buf, S, cx - 12, bY + 10, 5, 5, atkC);
    }
  } else {
    // left: 横向き
    const lx = cx - 3;
    fillRect(buf, S, lx - 6, bY + 10, 12, 12, body);
    fillRect(buf, S, lx - 6, bY + 10,  1, 12, shadow);
    hLine(buf, S, lx - 5, bY + 10, 10, light);
    fillRect(buf, S, lx - 5, bY + 3, 10, 7, body);
    fillRect(buf, S, lx - 3, bY + 5, 3, 2, eyeC);
    fillRect(buf, S, lx - 9, bY + 11, 3, 6, shadow);
    fillRect(buf, S, lx + 6, bY + 11, 3, 6, body);
    fillRect(buf, S, lx - 5, bY + 22, 4, 6, shadow);
    fillRect(buf, S, lx + 1, bY + 22, 4, 6, body);
    if (state === 'attack') {
      fillRect(buf, S, lx - 12, bY + 10, 5, 5, atkC);
    }
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 70);
    }
  }
}

/** slime_x: 謎の粘体メカ 4方向版 */
function drawSlimeX4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const main  = hexToRGBA('#44aaff');
  const dark  = hexToRGBA('#226688');
  const light = hexToRGBA('#88ddff');
  const eyeC  = hexToRGBA('#ffffff');
  const atkC  = hexToRGBA('#0088ff');
  const bY = frame === 1 ? 2 : 0; // スライムは大きくバウンド
  const cx = 16, cy = 18;
  const mainC = state === 'hit' ? hexToRGBA('#aaddff') : main;

  // スライムは方向によらず似た形状（目の位置だけ変わる）
  const squeeze = dir === 'left' ? 2 : 0;
  for (let y = cy - 5 + bY; y <= cy + 6 + bY; y++) {
    for (let x = cx - 8 + squeeze; x <= cx + 8 - squeeze; x++) {
      const dist = Math.sqrt(((x - cx) / (1 + squeeze * 0.15)) ** 2 + ((y - cy - bY) * 0.85) ** 2);
      if (dist <= 7) setPixel(buf, S, x, y, dist < 5 ? mainC : dark);
    }
  }
  hLine(buf, S, cx - 6 + squeeze, cy - 5 + bY, 12 - squeeze * 2, light);

  if (dir === 'down') {
    fillRect(buf, S, cx - 3, cy - 2 + bY, 3, 3, hexToRGBA('#003366'));
    fillRect(buf, S, cx + 1, cy - 2 + bY, 3, 3, hexToRGBA('#003366'));
    setPixel(buf, S, cx - 2, cy - 1 + bY, eyeC);
    setPixel(buf, S, cx + 2, cy - 1 + bY, eyeC);
  } else if (dir === 'up') {
    // 背面: 小さな電子回路マーク
    hLine(buf, S, cx - 3, cy + 2 + bY, 6, dark);
    setPixel(buf, S, cx - 2, cy + 3 + bY, dark);
    setPixel(buf, S, cx + 2, cy + 3 + bY, dark);
  } else {
    // left: 目を左に
    fillRect(buf, S, cx - 5 + squeeze, cy - 2 + bY, 3, 3, hexToRGBA('#003366'));
    setPixel(buf, S, cx - 4 + squeeze, cy - 1 + bY, eyeC);
  }

  if (state === 'attack') {
    // 突起エフェクト
    const atkX = dir === 'left' ? cx - 9 : (dir === 'right' ? cx + 8 : cx - 3);
    const atkY = dir === 'down' ? cy + 7 + bY : (dir === 'up' ? cy - 7 + bY : cy - 1 + bY);
    fillRect(buf, S, atkX, atkY, 4, 4, atkC);
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) {
        buf[i]     = Math.min(255, buf[i] + 60);
        buf[i + 2] = Math.max(0,   buf[i + 2] - 40);
      }
    }
  }
}

/** mini_slime: スライムXの分裂体 4方向版 */
function drawMiniSlime4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const main  = hexToRGBA('#88ccff');
  const dark  = hexToRGBA('#4488aa');
  const eyeC  = hexToRGBA('#ffffff');
  const atkC  = hexToRGBA('#0066cc');
  const bY = frame === 1 ? 2 : 0;
  const cx = 16, cy = 20;
  const mainC = state === 'hit' ? hexToRGBA('#ffcccc') : main;

  for (let y = cy - 4 + bY; y <= cy + 4 + bY; y++) {
    for (let x = cx - 5; x <= cx + 5; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + ((y - cy - bY) * 1.1) ** 2);
      if (dist <= 5) setPixel(buf, S, x, y, dist < 3.5 ? mainC : dark);
    }
  }

  if (dir === 'down') {
    setPixel(buf, S, cx - 2, cy - 1 + bY, hexToRGBA('#001133'));
    setPixel(buf, S, cx + 1, cy - 1 + bY, hexToRGBA('#001133'));
    setPixel(buf, S, cx - 1, cy - 1 + bY, eyeC);
    setPixel(buf, S, cx + 1, cy - 1 + bY, eyeC);
  } else if (dir !== 'up') {
    setPixel(buf, S, cx - 3, cy - 1 + bY, hexToRGBA('#001133'));
    setPixel(buf, S, cx - 2, cy - 1 + bY, eyeC);
  }

  if (state === 'attack') {
    const atkX = dir === 'left' ? cx - 7 : (dir === 'right' ? cx + 5 : cx - 1);
    const atkY = dir === 'down' ? cy + 5 + bY : (dir === 'up' ? cy - 6 + bY : cy - 1 + bY);
    fillRect(buf, S, atkX, atkY, 3, 3, atkC);
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 70);
    }
  }
}

/** spark: 電撃型メカ 4方向版 */
function drawSpark4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const yellow = hexToRGBA('#ffff00');
  const cyan   = hexToRGBA('#00ffff');
  const white  = hexToRGBA('#ffffff');
  const dark   = hexToRGBA('#888800');
  const hitC   = hexToRGBA('#ff8800');
  const bY = frame === 1 ? 1 : 0;
  const cx = 16, cy = 16;
  const mainC  = state === 'hit' ? hitC : yellow;
  const accentC = state === 'hit' ? yellow : cyan;

  // 稲妻コア（中心の菱形）
  for (let d = 0; d <= 4; d++) {
    hLine(buf, S, cx - d, cy - 4 + bY + d, d * 2 + 1, mainC);
    hLine(buf, S, cx - d, cy + 4 + bY - d, d * 2 + 1, mainC);
  }

  // 稲妻の腕（方向によって形が変わる）
  if (dir === 'down' || dir === 'up') {
    // 縦の稲妻
    const yDir = dir === 'down' ? 1 : -1;
    setPixel(buf, S, cx, cy + yDir * 5 + bY, accentC);
    setPixel(buf, S, cx - 1, cy + yDir * 6 + bY, accentC);
    setPixel(buf, S, cx + 1, cy + yDir * 7 + bY, accentC);
    setPixel(buf, S, cx, cy + yDir * 8 + bY, accentC);
    // 横の稲妻補助
    hLine(buf, S, cx - 6, cy + bY, 5, dark);
    hLine(buf, S, cx + 2, cy + bY, 5, dark);
  } else {
    // 横の稲妻
    setPixel(buf, S, cx - 5, cy + bY, accentC);
    setPixel(buf, S, cx - 6, cy + 1 + bY, accentC);
    setPixel(buf, S, cx - 8, cy + bY, accentC);
    // 縦補助
    vLine(buf, S, cx, cy - 5 + bY, 4, dark);
    vLine(buf, S, cx, cy + 2 + bY, 4, dark);
  }

  // 放電スパーク（フレーム交互）
  if (frame === 0) {
    setPixel(buf, S, cx - 7, cy - 2 + bY, white);
    setPixel(buf, S, cx + 6, cy + 2 + bY, white);
  } else {
    setPixel(buf, S, cx - 5, cy + 3 + bY, white);
    setPixel(buf, S, cx + 4, cy - 3 + bY, white);
  }

  if (state === 'attack') {
    // 大放電
    hLine(buf, S, cx - 10, cy + bY, 5, accentC);
    hLine(buf, S, cx + 6,  cy + bY, 5, accentC);
    vLine(buf, S, cx, cy - 10 + bY, 5, accentC);
    vLine(buf, S, cx, cy + 6 + bY,  5, accentC);
  }
}

/** rust_hound: 錆びた犬型メカ 4方向版 */
function drawRustHound4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const body   = hexToRGBA('#aa6622');
  const shadow = hexToRGBA('#774411');
  const light  = hexToRGBA('#ddaa66');
  const eyeC   = hexToRGBA('#ffff00');
  const atkC   = hexToRGBA('#ff2200');
  const bY = frame === 1 ? 1 : 0;

  if (dir === 'left' || dir === 'right') {
    const cx = 16;
    // 横向き犬型
    fillRect(buf, S, cx - 8, bY + 14, 18, 8, body);
    fillRect(buf, S, cx - 8, bY + 14,  1,  8, shadow);
    hLine(buf, S, cx - 7, bY + 14, 16, light);
    // 頭（左側）
    fillRect(buf, S, cx - 8, bY + 8, 8, 8, body);
    setPixel(buf, S, cx - 6, bY + 10, eyeC);
    if (state === 'attack') {
      fillRect(buf, S, cx - 8, bY + 14, 4, 3, atkC);
    }
    // 脚
    for (let i = 0; i < 4; i++) {
      fillRect(buf, S, cx - 7 + i * 4, bY + 22, 3, frame === 0 ? 5 : 4, shadow);
    }
    // 尻尾（右側）
    setPixel(buf, S, cx + 9,  bY + 13, light);
    setPixel(buf, S, cx + 10, bY + 12, light);
  } else if (dir === 'down') {
    // 正面
    const fx = 16;
    fillRect(buf, S, fx - 6, bY + 10, 12, 10, body);
    fillRect(buf, S, fx - 4, bY + 4, 8, 8, body);
    setPixel(buf, S, fx - 2, bY + 6, eyeC);
    setPixel(buf, S, fx + 1, bY + 6, eyeC);
    if (state === 'attack') {
      fillRect(buf, S, fx - 3, bY + 10, 6, 3, atkC);
    }
    for (let i = 0; i < 2; i++) {
      fillRect(buf, S, fx - 5 + i * 8, bY + 20, 4, frame === 0 ? 6 : 5, shadow);
    }
  } else {
    // up: 背面
    const fx = 16;
    fillRect(buf, S, fx - 6, bY + 10, 12, 10, shadow);
    fillRect(buf, S, fx - 4, bY + 4, 8, 8, shadow);
    // 背中の錆模様
    setPixel(buf, S, fx - 2, bY + 8, light);
    setPixel(buf, S, fx + 1, bY + 8, light);
    setPixel(buf, S, fx, bY + 13, hexToRGBA('#886622'));
    for (let i = 0; i < 2; i++) {
      fillRect(buf, S, fx - 5 + i * 8, bY + 20, 4, frame === 0 ? 6 : 5, shadow);
    }
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 60);
    }
  }
}

/** assault_mecha: 大型二脚アサルトメカ 4方向版 */
function drawAssaultMecha4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const armor  = hexToRGBA('#4466aa');
  const dark   = hexToRGBA('#223366');
  const light  = hexToRGBA('#8899cc');
  const cannon = hexToRGBA('#ff4400');
  const eyeC   = hexToRGBA('#00ffff');
  const bY = frame === 1 ? 1 : 0;
  const cx = 16;
  const mainA = state === 'hit' ? hexToRGBA('#aabbdd') : armor;

  if (dir === 'down' || dir === 'up') {
    // 胴体
    fillRect(buf, S, cx - 7, bY + 8, 14, 14, mainA);
    fillRect(buf, S, cx - 7, bY + 8,  1, 14, dark);
    fillRect(buf, S, cx + 6, bY + 8,  1, 14, dark);
    hLine(buf, S, cx - 6, bY + 8, 12, dir === 'down' ? light : dark);
    // 頭部
    fillRect(buf, S, cx - 5, bY + 2, 10, 6, mainA);
    if (dir === 'down') {
      fillRect(buf, S, cx - 3, bY + 3, 6, 3, hexToRGBA('#111133'));
      setPixel(buf, S, cx - 2, bY + 4, eyeC);
      setPixel(buf, S, cx + 1, bY + 4, eyeC);
    } else {
      fillRect(buf, S, cx - 3, bY + 3, 6, 3, dark);
    }
    // 二脚
    fillRect(buf, S, cx - 6, bY + 22, 4, 8, dark);
    fillRect(buf, S, cx + 2, bY + 22, 4, 8, mainA);
    // 肩
    fillRect(buf, S, cx - 10, bY + 9, 4, 6, dark);
    fillRect(buf, S, cx + 6,  bY + 9, 4, 6, mainA);
    if (state === 'attack' && dir === 'down') {
      // キャノン発射
      fillRect(buf, S, cx + 7, bY + 8, 6, 4, cannon);
    }
  } else {
    // left: 横向き二脚
    const lx = cx - 4;
    fillRect(buf, S, lx - 6, bY + 8, 14, 14, mainA);
    fillRect(buf, S, lx - 6, bY + 8,  1, 14, dark);
    hLine(buf, S, lx - 5, bY + 8, 12, light);
    fillRect(buf, S, lx - 5, bY + 2, 10, 6, mainA);
    fillRect(buf, S, lx - 3, bY + 3, 3, 2, eyeC);
    // 二脚（横から見ると前後）
    fillRect(buf, S, lx - 4, bY + 22, 4, 8, dark);
    fillRect(buf, S, lx + 3, bY + 22, 4, 8, mainA);
    // キャノン（左側に突き出る）
    fillRect(buf, S, lx - 10, bY + 9, 6, 4, dark);
    if (state === 'attack') {
      fillRect(buf, S, lx - 14, bY + 9, 6, 4, cannon);
    }
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 60);
    }
  }
}

/** stealth_killer: 細身の影タイプ 4方向版 */
function drawStealthKiller4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const body  = hexToRGBA('#222244');
  const edge  = hexToRGBA('#6644aa');
  const blade = hexToRGBA('#ccccff');
  const eyeC  = hexToRGBA('#ff00ff');
  const atkC  = hexToRGBA('#ffffff');
  const bY = frame === 1 ? 1 : 0;
  const cx = 16;
  // hit 時: 紫フラッシュ
  const mainC = state === 'hit' ? hexToRGBA('#8844cc') : body;

  if (dir === 'down' || dir === 'up') {
    // 細身の縦シルエット
    fillRect(buf, S, cx - 3, bY + 4,  6, 24, mainC);
    fillRect(buf, S, cx - 4, bY + 6,  8,  4, mainC);
    vLine(buf, S, cx - 3, bY + 4, 24, edge);
    vLine(buf, S, cx + 2, bY + 4, 24, edge);
    if (dir === 'down') {
      setPixel(buf, S, cx - 1, bY + 7, eyeC);
      setPixel(buf, S, cx + 1, bY + 7, eyeC);
    } else {
      setPixel(buf, S, cx - 1, bY + 24, edge);
      setPixel(buf, S, cx + 1, bY + 24, edge);
    }
    if (state === 'attack') {
      const sy = dir === 'down' ? bY + 28 : bY + 2;
      fillRect(buf, S, cx - 1, sy, 2, 4, blade);
      setPixel(buf, S, cx, dir === 'down' ? sy + 4 : sy - 1, atkC);
    }
  } else {
    // left: 細身横向き
    fillRect(buf, S, cx - 8, bY + 10, 16,  6, mainC);
    fillRect(buf, S, cx - 6, bY + 7,  4,  3, mainC);
    hLine(buf, S, cx - 8, bY + 10, 16, edge);
    setPixel(buf, S, cx - 5, bY + 9, eyeC);
    if (state === 'attack') {
      fillRect(buf, S, cx - 12, bY + 9, 4, 5, blade);
      setPixel(buf, S, cx - 12, bY + 11, atkC);
    }
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) {
        buf[i]     = Math.min(255, buf[i] + 80);
        buf[i + 2] = Math.min(255, buf[i + 2] + 80);
      }
    }
  }
}

/** shield_knight: 盾装備重装甲 4方向版 */
function drawShieldKnight4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const armor  = hexToRGBA('#888866');
  const dark   = hexToRGBA('#444433');
  const light  = hexToRGBA('#ccccaa');
  const shield = hexToRGBA('#4466cc');
  const shEdge = hexToRGBA('#aaccff');
  const eyeC   = hexToRGBA('#ffaa00');
  const bY = frame === 1 ? 1 : 0;
  const cx = 16;
  const mainA = state === 'hit' ? hexToRGBA('#bbbbaa') : armor;

  if (dir === 'down') {
    // 正面: 左手に六角シールド
    fillRect(buf, S, cx - 6, bY + 8,  12, 14, mainA);
    fillRect(buf, S, cx - 6, bY + 8,   1, 14, dark);
    hLine(buf, S, cx - 5, bY + 8, 10, light);
    fillRect(buf, S, cx - 4, bY + 2, 8, 6, mainA);
    setPixel(buf, S, cx - 2, bY + 4, eyeC);
    setPixel(buf, S, cx + 1, bY + 4, eyeC);
    // 六角シールド（左）
    fillRect(buf, S, cx - 12, bY + 7, 7, 10, shield);
    hLine(buf, S, cx - 11, bY + 6, 5, shEdge);
    hLine(buf, S, cx - 11, bY + 17, 5, shEdge);
    vLine(buf, S, cx - 12, bY + 8, 9, shEdge);
    // 武器（右）
    if (state === 'attack') {
      fillRect(buf, S, cx + 6, bY + 5, 4, 10, hexToRGBA('#ff6600'));
    }
  } else if (dir === 'up') {
    // 背面: 盾の背中が見える
    fillRect(buf, S, cx - 6, bY + 8, 12, 14, dark);
    fillRect(buf, S, cx - 4, bY + 2, 8, 6, dark);
    hLine(buf, S, cx - 5, bY + 8, 10, armor);
    fillRect(buf, S, cx - 10, bY + 7, 5, 10, hexToRGBA('#334499'));
    hLine(buf, S, cx - 9, bY + 6, 3, shEdge);
  } else {
    // left: 横向き（盾が前面）
    const lx = cx - 2;
    fillRect(buf, S, lx - 5, bY + 8, 10, 14, mainA);
    fillRect(buf, S, lx - 5, bY + 8,  1, 14, dark);
    hLine(buf, S, lx - 4, bY + 8, 8, light);
    fillRect(buf, S, lx - 4, bY + 2, 8, 6, mainA);
    fillRect(buf, S, lx - 3, bY + 4, 3, 2, eyeC);
    // 盾（左前）
    fillRect(buf, S, lx - 11, bY + 6, 7, 12, shield);
    vLine(buf, S, lx - 11, bY + 7, 10, shEdge);
    hLine(buf, S, lx - 10, bY + 6, 5, shEdge);
    hLine(buf, S, lx - 10, bY + 18, 5, shEdge);
    if (state === 'attack') {
      fillRect(buf, S, lx - 14, bY + 8, 5, 5, hexToRGBA('#ff6600'));
    }
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 60);
    }
  }
}

/** mine_layer: 地雷設置工作メカ 4方向版 */
function drawMineLayer4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const body  = hexToRGBA('#667744');
  const dark  = hexToRGBA('#334422');
  const light = hexToRGBA('#aabb88');
  const mine  = hexToRGBA('#ff6600');
  const mineD = hexToRGBA('#cc3300');
  const eyeC  = hexToRGBA('#00ff88');
  const bY = frame === 1 ? 1 : 0;
  const cx = 16;
  const mainC = state === 'hit' ? hexToRGBA('#aabb77') : body;

  if (dir === 'down' || dir === 'up') {
    fillRect(buf, S, cx - 6, bY + 7, 12, 14, mainC);
    fillRect(buf, S, cx - 6, bY + 7,  1, 14, dark);
    hLine(buf, S, cx - 5, bY + 7, 10, dir === 'down' ? light : dark);
    fillRect(buf, S, cx - 4, bY + 2, 8, 5, mainC);
    if (dir === 'down') {
      fillRect(buf, S, cx - 2, bY + 3, 4, 2, hexToRGBA('#333311'));
      setPixel(buf, S, cx - 1, bY + 3, eyeC);
      setPixel(buf, S, cx + 1, bY + 3, eyeC);
    }
    // 地雷ベルトコンベア（胴体底部）
    hLine(buf, S, cx - 5, bY + 21, 10, mineD);
    if (state === 'attack') {
      // 地雷を設置するエフェクト
      fillRect(buf, S, cx - 2, bY + 23, 4, 4, mine);
      setPixel(buf, S, cx, bY + 22, mineD);
    } else {
      fillRect(buf, S, cx - 2, bY + 21, 4, 4, mine);
    }
    // トレッド脚
    fillRect(buf, S, cx - 7, bY + 17, 3, 4, dark);
    fillRect(buf, S, cx + 4, bY + 17, 3, 4, dark);
  } else {
    // left: 横向き
    const lx = cx - 3;
    fillRect(buf, S, lx - 6, bY + 7, 12, 14, mainC);
    hLine(buf, S, lx - 5, bY + 7, 10, light);
    fillRect(buf, S, lx - 4, bY + 2, 8, 5, mainC);
    setPixel(buf, S, lx - 3, bY + 3, eyeC);
    // 地雷（後部）
    fillRect(buf, S, lx + 5, bY + 10, 5, 5, mine);
    fillRect(buf, S, lx - 7, bY + 17, 3, 4, dark);
    fillRect(buf, S, lx + 4, bY + 17, 3, 4, dark);
    if (state === 'attack') {
      fillRect(buf, S, lx - 11, bY + 15, 5, 5, mine);
    }
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 60);
    }
  }
}

/** healer_drone: 回復支援ドローン 4方向版 */
function drawHealerDrone4Dir(
  buf: Uint8Array, S: number,
  dir: 'down' | 'up' | 'left' | 'right',
  state: 'idle' | 'attack' | 'hit',
  frame: number,
): void {
  const body  = hexToRGBA('#ffffff');
  const mid   = hexToRGBA('#aaddaa');
  const dark  = hexToRGBA('#448844');
  const cross = hexToRGBA('#ff3333');
  const glow  = hexToRGBA('#00ff88');
  const atkC  = hexToRGBA('#00ff44');
  const bY = frame === 1 ? 1 : 0;
  const cx = 16, cy = 16;
  const mainC = state === 'hit' ? hexToRGBA('#ffbbbb') : body;

  // 丸いボディ（ドローン型）
  for (let y = cy - 6 + bY; y <= cy + 6 + bY; y++) {
    for (let x = cx - 7; x <= cx + 7; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + ((y - cy - bY)) ** 2);
      if (dist <= 7) setPixel(buf, S, x, y, dist < 5 ? mainC : mid);
    }
  }
  hLine(buf, S, cx - 5, cy - 6 + bY, 10, body);

  // 医療十字マーク（正面/背面で位置変わる）
  if (dir === 'down') {
    setPixel(buf, S, cx, cy - 2 + bY, cross);
    hLine(buf, S, cx - 2, cy - 2 + bY, 5, cross);
    vLine(buf, S, cx, cy - 4 + bY, 5, cross);
  } else if (dir === 'up') {
    // 背面: 排気口
    fillRect(buf, S, cx - 2, cy + 3 + bY, 4, 2, dark);
    setPixel(buf, S, cx - 1, cy + 5 + bY, hexToRGBA('#00ff88'));
    setPixel(buf, S, cx + 1, cy + 5 + bY, hexToRGBA('#00ff88'));
  } else {
    // left: 横から見た十字
    hLine(buf, S, cx - 5, cy + bY, 4, cross);
    vLine(buf, S, cx - 3, cy - 2 + bY, 5, cross);
  }

  // 浮遊用ローター（上部）
  if (dir !== 'up') {
    hLine(buf, S, cx - 6, cy - 8 + bY, 12, dark);
    if (frame === 0) {
      setPixel(buf, S, cx - 4, cy - 8 + bY, glow);
      setPixel(buf, S, cx + 3, cy - 8 + bY, glow);
    }
  }

  if (state === 'attack') {
    // 回復ビーム発射
    const beamY = cy - 3 + bY;
    const beamX = dir === 'left' ? cx - 10 : (dir === 'right' ? cx + 7 : cx - 2);
    fillRect(buf, S, beamX, beamY, dir === 'down' || dir === 'up' ? 4 : 5, 3, atkC);
  }
  if (state === 'hit') {
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) buf[i] = Math.min(255, buf[i] + 50);
    }
  }
}

/**
 * B10F以下 全通常敵の4方向スプライトを生成する。
 */
async function generateB10FEnemySprites(outDir: string): Promise<void> {
  console.log('\n[B10F Enemy 4-Dir Sprites]');

  const enemies: Array<[string, Enemy4DirDrawFn]> = [
    ['scout_drone',   drawScoutDrone4Dir],
    ['mine_beetle',   drawMineBeetle4Dir],
    ['guard_bot',     drawGuardBot4Dir],
    ['slime_x',       drawSlimeX4Dir],
    ['mini_slime',    drawMiniSlime4Dir],
    ['spark',         drawSpark4Dir],
    ['rust_hound',    drawRustHound4Dir],
    ['assault_mecha', drawAssaultMecha4Dir],
    ['stealth_killer',drawStealthKiller4Dir],
    ['shield_knight', drawShieldKnight4Dir],
    ['mine_layer',    drawMineLayer4Dir],
    ['healer_drone',  drawHealerDrone4Dir],
  ];

  for (const [id, drawFn] of enemies) {
    await generateEnemy4DirFull(outDir, id, drawFn);
  }
}

/**
 * スプライトメタデータ JSON を書き出す。
 */
function saveMetadata(meta: SpriteMeta): void {
  ensureDir(path.dirname(META_PATH));
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf-8');
  console.log('\n  Metadata saved:', META_PATH);
}

// ---------------------------------------------------------------------------
// UIスプライト生成
// ---------------------------------------------------------------------------

/**
 * タイトルロゴ (title_logo.png) を生成する。
 * "MECHA ROGUE" をドット絵テキストで描画。
 */
async function generateTitleLogo(outDir: string): Promise<SpriteFrame> {
  const W = 256;
  const H = 64;
  const buf = createBuffer(W, H);
  const glow = hexToRGBA('#004488');
  const primary = hexToRGBA('#4488ff');
  const accent = hexToRGBA('#ffee88');

  // 背景に少しグロー
  fillRect(buf, W, 20, 10, 216, 44, { ...glow, a: 100 });
  
  const drawChar = (charObj: string[], startX: number, color: RGBA) => {
    const P = 4;
    for(let r=0; r<7; r++){
      for(let c=0; c<charObj[r].length; c++){
        if(charObj[r][c] === '#'){
          fillRect(buf, W, startX + c*P, 15 + r*P, P, P, color);
        }
      }
    }
  };

  const charMe = [
    "     ##",
    "    ## ",
    "   ##  ",
    "  ##   ",
    " ## ## ",
    "##   ##",
    "#     #"
  ];
  const charKa = [
    " ######",
    "     ##",
    "    # #",
    "   #  #",
    "  #   #",
    " #    #",
    "#     #"
  ];
  const charRo = [
    "#######",
    "##   ##",
    "##   ##",
    "##   ##",
    "##   ##",
    "##   ##",
    "#######"
  ];
  const charDash = [
    "       ",
    "       ",
    "       ",
    "#######",
    "       ",
    "       ",
    "       "
  ];
  const charGu = [
    "##   ##",
    " ##  ##",
    "#######",
    "     ##",
    "    ## ",
    "   ##  ",
    "  ##   "
  ];

  drawChar(charMe,   30, primary);
  drawChar(charKa,   70, primary);
  drawChar(charRo,  110, accent);
  drawChar(charDash,150, accent);
  drawChar(charGu,  190, accent);

  const file = path.join(outDir, 'title_logo.png');
  await savePNG(buf, W, H, file);
  return { file: 'public/sprites/ui/title_logo.png', width: W, height: H };
}

/**
 * ゲームオーバー (gameover.png) を生成する。
 */
async function generateGameOverGraphic(outDir: string): Promise<SpriteFrame> {
  const W = 192;
  const H = 48;
  const buf = createBuffer(W, H);
  const red = hexToRGBA('#ff0033');
  
  // "GAME OVER"
  fillRect(buf, W, 10, 10, 172, 28, { r: 40, g: 0, b: 0, a: 150 });
  
  // G
  fillRect(buf, W, 20, 15, 3, 18, red);
  hLine(buf, W, 23, 15, 6, red);
  hLine(buf, W, 23, 33, 6, red);
  vLine(buf, W, 29, 24, 9, red);
  hLine(buf, W, 26, 24, 3, red);
  
  // A
  fillRect(buf, W, 35, 15, 3, 18, red);
  fillRect(buf, W, 44, 15, 3, 18, red);
  hLine(buf, W, 38, 15, 6, red);
  hLine(buf, W, 38, 24, 6, red);
  
  // M
  fillRect(buf, W, 52, 15, 3, 18, red);
  fillRect(buf, W, 61, 15, 3, 18, red);
  setPixel(buf, W, 56, 17, red); setPixel(buf, W, 58, 17, red);
  
  // E
  fillRect(buf, W, 69, 15, 3, 18, red);
  hLine(buf, W, 72, 15, 6, red);
  hLine(buf, W, 72, 24, 5, red);
  hLine(buf, W, 72, 33, 6, red);

  // O R... (省略気味だが一通り描く)
  // O (100)
  fillRect(buf, W, 100, 15, 3, 18, red);
  fillRect(buf, W, 109, 15, 3, 18, red);
  hLine(buf, W, 103, 15, 6, red);
  hLine(buf, W, 103, 33, 6, red);
  
  // V (115)
  fillRect(buf, W, 115, 15, 2, 12, red);
  fillRect(buf, W, 123, 15, 2, 12, red);
  setPixel(buf, W, 117, 27, red); setPixel(buf, W, 121, 27, red);
  setPixel(buf, W, 119, 30, red);

  // E (128)
  fillRect(buf, W, 128, 15, 3, 18, red);
  hLine(buf, W, 131, 15, 6, red);
  hLine(buf, W, 131, 24, 5, red);
  hLine(buf, W, 131, 33, 6, red);

  // R (140)
  fillRect(buf, W, 140, 15, 3, 18, red);
  hLine(buf, W, 143, 15, 6, red);
  vLine(buf, W, 149, 15, 9, red);
  hLine(buf, W, 143, 24, 6, red);
  setPixel(buf, W, 145, 27, red); setPixel(buf, W, 147, 30, red);

  const file = path.join(outDir, 'gameover.png');
  await savePNG(buf, W, H, file);
  return { file: 'public/sprites/ui/gameover.png', width: W, height: H };
}

/**
 * UIスプライト群を生成する。
 */
async function generateUISprites(meta: SpriteMeta): Promise<void> {
  console.log('\n[UI]');
  const outDir = path.join(SPRITES_DIR, 'ui');
  ensureDir(outDir);

  meta.ui['title_logo'] = await generateTitleLogo(outDir);
  meta.ui['gameover']   = await generateGameOverGraphic(outDir);
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/**
 * スプライト生成のメインエントリポイント。
 */
async function main(): Promise<void> {
  console.log('=== メカローグ スプライト生成 ===');
  console.log('Output:', SPRITES_DIR);

  ensureDir(SPRITES_DIR);

  const meta: SpriteMeta = {
    tiles: {},
    player: {},
    enemies: {},
    weapons: {},
    items: {},
    effects: {},
    ui: {},
    npc: {},
  };

  await generateTileSprites(meta);
  await generatePlayerSprites(meta);
  await generateEnemySprites(meta);
  await generateNpcSprites(meta);
  await generateWeaponSprites(meta);
  await generateItemSprites(meta);
  await generateEffectSprites(meta);
  await generateBossSprites(meta);
  await generateUISprites(meta);

  // B10F以下 ボスの4方向スプライトを追加生成
  const enemiesDir = path.join(SPRITES_DIR, 'enemies');
  await generateBoss4DirSprites(enemiesDir);

  saveMetadata(meta);

  console.log('\n=== 生成完了 ===');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
