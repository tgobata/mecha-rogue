/**
 * @fileoverview メカローグ 1〜3階敵スプライト生成スクリプト
 *
 * 各敵の名前・特徴・装備・攻撃方法に完全合致したドット絵を生成する。
 * Node.js の sharp ライブラリを使って RGBA ピクセルバッファから PNG を生成。
 *
 * 実行: node --experimental-strip-types scripts/generate-floor1-3-sprites.ts
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const TILE_SIZE = 32;

const PROJECT_ROOT = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..'
);

const ENEMIES_DIR = path.join(PROJECT_ROOT, 'public', 'sprites', 'enemies');

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

type Direction = 'down' | 'up' | 'left' | 'right';
type State = 'idle' | 'move' | 'attack' | 'hit' | 'levelup' | 'dead';

interface EnemyDef {
  id: string;
  drawFn: DrawFn;
}

type DrawFn = (
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  isLv2: boolean
) => void;

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function hexToRGBA(hex: string, alpha = 255): RGBA {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: alpha,
  };
}

function createBuffer(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * 4);
}

function setPixel(buf: Uint8Array, width: number, x: number, y: number, color: RGBA): void {
  if (x < 0 || x >= width || y < 0 || y >= Math.floor(buf.length / width / 4)) return;
  const idx = (y * width + x) * 4;
  buf[idx]     = color.r;
  buf[idx + 1] = color.g;
  buf[idx + 2] = color.b;
  buf[idx + 3] = color.a;
}

function fillRect(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGBA
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(buf, width, x + dx, y + dy, color);
    }
  }
}

function hLine(buf: Uint8Array, width: number, x: number, y: number, len: number, color: RGBA): void {
  for (let i = 0; i < len; i++) setPixel(buf, width, x + i, y, color);
}

function vLine(buf: Uint8Array, width: number, x: number, y: number, len: number, color: RGBA): void {
  for (let i = 0; i < len; i++) setPixel(buf, width, x, y + i, color);
}

function fillCircle(buf: Uint8Array, width: number, cx: number, cy: number, r: number, color: RGBA): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        setPixel(buf, width, cx + dx, cy + dy, color);
      }
    }
  }
}

function drawCircleOutline(buf: Uint8Array, width: number, cx: number, cy: number, r: number, color: RGBA): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(dist - r) < 0.8) {
        setPixel(buf, width, cx + dx, cy + dy, color);
      }
    }
  }
}

function fillEllipse(
  buf: Uint8Array,
  width: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: RGBA
): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    for (let dx = -hw; dx <= hw; dx++) {
      setPixel(buf, width, cx + dx, cy + dy, color);
    }
  }
}

function drawLine(
  buf: Uint8Array,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: RGBA
): void {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  if (steps === 0) { setPixel(buf, width, x1, y1, color); return; }
  for (let s = 0; s <= steps; s++) {
    const px = Math.round(x1 + (x2 - x1) * s / steps);
    const py = Math.round(y1 + (y2 - y1) * s / steps);
    setPixel(buf, width, px, py, color);
  }
}

async function savePNG(buf: Uint8Array, width: number, height: number, filePath: string): Promise<void> {
  await sharp(Buffer.from(buf), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(filePath);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function dirOffset(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'down':  return { dx: 0,  dy: 1  };
    case 'up':    return { dx: 0,  dy: -1 };
    case 'left':  return { dx: -1, dy: 0  };
    case 'right': return { dx: 1,  dy: 0  };
  }
}

const BLACK       = hexToRGBA('#000000');
const WHITE       = hexToRGBA('#ffffff');

// ---------------------------------------------------------------------------
// 1. scout_drone（スカウトドローン）
// ---------------------------------------------------------------------------
// 偵察用小型飛行ドローン。円形ボディ+アンテナ+プロペラ翼+カメラ眼。
// ---------------------------------------------------------------------------

function drawScoutDrone(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  isLv2: boolean
): void {
  const BODY_BASE   = '#556677';
  const ANTENNA     = '#aabbcc';
  const PROPELLER   = '#334455';
  const BODY_LV2    = '#556644';   // Lv2: 緑がかる
  const HIGHLIGHT   = '#7799aa';

  const bodyHex  = isLv2 ? BODY_LV2 : BODY_BASE;
  const body     = hexToRGBA(bodyHex);
  const ant      = hexToRGBA(ANTENNA);
  const prop     = hexToRGBA(PROPELLER);
  const hi       = hexToRGBA(HIGHLIGHT);

  const dOff = dirOffset(dir);

  // -- ベース位置 --
  const cx = 16;
  // move: プロペラがバウンド（ボディ上下）
  const bounceY = (state === 'move') && frame === 1 ? -1 : 0;
  // dead: 傾く・煙・消滅
  const deadTiltX = state === 'dead' ? (frame === 0 ? 2 : frame === 1 ? 4 : 6) : 0;
  const deadTiltY = state === 'dead' ? (frame === 0 ? 1 : frame === 1 ? 3 : 5) : 0;
  const cy = 15 + bounceY + deadTiltY;

  // dead frame2 はほぼ透明（爆発点滅）
  const globalAlpha = state === 'dead' && frame === 2 ? 80 : 255;

  function pixel(x: number, y: number, c: RGBA): void {
    setPixel(buf, S, x, y, { ...c, a: Math.min(c.a, globalAlpha) });
  }

  // -- dead frame2: 爆発（オレンジ円）--
  if (state === 'dead' && frame === 2) {
    fillCircle(buf, S, cx + deadTiltX, cy, 8, hexToRGBA('#ff6600', 120));
    fillCircle(buf, S, cx + deadTiltX, cy, 5, hexToRGBA('#ffcc00', 180));
    return;
  }

  // -- dead frame1: 煙 --
  if (state === 'dead' && frame === 1) {
    // 煙のドット
    pixel(cx + deadTiltX,     cy - 10, hexToRGBA('#888888', 160));
    pixel(cx + deadTiltX - 1, cy - 11, hexToRGBA('#aaaaaa', 140));
    pixel(cx + deadTiltX + 1, cy - 11, hexToRGBA('#aaaaaa', 140));
    pixel(cx + deadTiltX,     cy - 12, hexToRGBA('#888888', 100));
  }

  // -- アンテナ（2本）--
  const antBase = state === 'dead' && frame >= 1 ? hexToRGBA('#664444') : ant;
  vLine(buf, S, cx + deadTiltX - 4, cy - 8, 3, antBase);
  vLine(buf, S, cx + deadTiltX + 3, cy - 8, 3, antBase);
  setPixel(buf, S, cx + deadTiltX - 4, cy - 9, antBase);
  setPixel(buf, S, cx + deadTiltX + 3, cy - 9, antBase);

  // -- プロペラ翼（左右）--
  // move フレームで翼のY位置が変わる仕様: frame0=y12相当, frame1=y10相当
  const wingY = cy + (state === 'move' && frame === 1 ? -3 : -1);
  const propColor = state === 'hit' ? hexToRGBA('#ff8888') : prop;

  // 左翼
  fillRect(buf, S, cx + deadTiltX - 11, wingY, 4, 2, propColor);
  // 右翼
  fillRect(buf, S, cx + deadTiltX + 7,  wingY, 4, 2, propColor);

  // -- 円形ボディ（直径14px = 半径7）--
  const bodyColor = state === 'hit' ? hexToRGBA('#cc4444') : body;
  fillCircle(buf, S, cx + deadTiltX, cy, 7, bodyColor);

  // ハイライト（上部左）
  fillCircle(buf, S, cx + deadTiltX - 2, cy - 3, 2, hi);

  // levelup: 全体が黄白色フラッシュ
  if (state === 'levelup') {
    const flashAlpha = frame === 0 ? 180 : 100;
    fillCircle(buf, S, cx + deadTiltX, cy, 7, hexToRGBA('#ffffcc', flashAlpha));
    drawCircleOutline(buf, S, cx + deadTiltX, cy, 9, hexToRGBA('#ffee88', 150));
  }

  // -- アウトライン --
  drawCircleOutline(buf, S, cx + deadTiltX, cy, 7, BLACK);

  // -- カメラ眼 --
  // 方向に応じた位置: down=下部, up=上部, left=左側, right=右側
  let eyeOffX = dOff.dx * 4;
  let eyeOffY = dOff.dy * 4;
  const eyeX = cx + deadTiltX + eyeOffX;
  const eyeY = cy + eyeOffY;

  // Lv2: 眼が2つ（dual_eye_laser）
  const eyeColor = state === 'hit' ? hexToRGBA('#ff0000') :
                   isLv2           ? hexToRGBA('#00ffaa') :
                                     hexToRGBA('#00ccff');
  fillCircle(buf, S, eyeX, eyeY, 2, eyeColor);
  setPixel(buf, S, eyeX, eyeY, BLACK); // 瞳

  if (isLv2) {
    // 2つ目の眼（90度ずれた位置）
    let eye2X: number, eye2Y: number;
    if (dir === 'down' || dir === 'up') {
      eye2X = cx + deadTiltX + 3;
      eye2Y = cy + dOff.dy * 2;
    } else {
      eye2X = cx + deadTiltX + dOff.dx * 2;
      eye2Y = cy + 3;
    }
    fillCircle(buf, S, eye2X, eye2Y, 2, eyeColor);
    setPixel(buf, S, eye2X, eye2Y, BLACK);
  }

  // -- attack: 眼からレーザービーム --
  if (state === 'attack') {
    const beamLen = frame === 0 ? 4 : frame === 1 ? 8 : 0;
    const beamColor = hexToRGBA('#00eeff');
    if (frame === 2) {
      // frame2: 閃光（眼の周囲が光る）
      fillCircle(buf, S, eyeX, eyeY, 4, hexToRGBA('#ffffff', 200));
    } else {
      for (let i = 1; i <= beamLen; i++) {
        const bx = eyeX + dOff.dx * i;
        const by = eyeY + dOff.dy * i;
        setPixel(buf, S, bx, by, beamColor);
        // ビームに幅を持たせる
        if (i > 1) {
          setPixel(buf, S, bx + dOff.dy, by + dOff.dx, hexToRGBA('#00ccee', 180));
          setPixel(buf, S, bx - dOff.dy, by - dOff.dx, hexToRGBA('#00ccee', 180));
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. mine_beetle（マインビートル）
// ---------------------------------------------------------------------------
// 甲虫型メカ。6本脚、背中に爆弾ランプ。歩いて近づき自爆。
// ---------------------------------------------------------------------------

function drawMineBeetle(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  isLv2: boolean
): void {
  const SHELL_BASE  = '#4a3a2a';
  const SHELL_LV2   = '#5a2a2a'; // Lv2: 赤みを帯びる
  const HIGHLIGHT   = '#6b5a4a';
  const LEG         = '#2a2a2a';
  const LAMP_BASE   = '#ff2200';
  const LAMP_BRIGHT = '#ff6600';

  const shellHex = isLv2 ? SHELL_LV2 : SHELL_BASE;
  const shell  = hexToRGBA(shellHex);
  const hi     = hexToRGBA(HIGHLIGHT);
  const leg    = hexToRGBA(LEG);

  const dOff = dirOffset(dir);

  // move: 脚が交互に動く
  const bounceY = state === 'move' && frame === 1 ? 1 : 0;

  // dead: 甲羅が割れて爆発
  const cx = 16;
  const cy = 18 + bounceY;

  if (state === 'dead' && frame === 2) {
    // 爆発
    fillCircle(buf, S, cx, cy, 10, hexToRGBA('#ff6600', 180));
    fillCircle(buf, S, cx, cy, 6,  hexToRGBA('#ffcc00', 220));
    fillCircle(buf, S, cx, cy, 3,  hexToRGBA('#ffffff', 240));
    return;
  }

  const shellColor = state === 'hit' ? hexToRGBA('#884444') :
                     state === 'dead' && frame === 1 ? hexToRGBA('#3a2a1a') :
                     shell;

  // 方向によって描画変更
  if (dir === 'down') {
    // 正面: 6本脚が下に見える
    // 甲羅（楕円）
    fillEllipse(buf, S, cx, cy, 9, 6, shellColor);
    fillRect(buf, S, cx - 5, cy - 3, 10, 3, hi); // 上部ハイライト

    // アウトライン
    for (let dy = -6; dy <= 6; dy++) {
      const hw = Math.floor(9 * Math.sqrt(Math.max(0, 1 - (dy / 6) ** 2)));
      if (dy === -6 || dy === 6) {
        hLine(buf, S, cx - hw, cy + dy, hw * 2 + 1, BLACK);
      } else {
        setPixel(buf, S, cx - hw, cy + dy, BLACK);
        setPixel(buf, S, cx + hw, cy + dy, BLACK);
      }
    }

    // 6本脚（左3右3）
    for (let i = 0; i < 3; i++) {
      const legX1 = cx - 9;
      const legX2 = cx + 9;
      const legBaseY = cy - 2 + i * 2;
      // 脚の交互動作
      const legOff = state === 'move' ? ((frame === 0 ? (i % 2) : (1 - i % 2)) * 2) : 0;
      // 左脚
      hLine(buf, S, legX1 - 3, legBaseY + legOff, 4, leg);
      setPixel(buf, S, legX1 - 3, legBaseY + legOff + 1, leg);
      // 右脚
      hLine(buf, S, legX2, legBaseY + legOff, 4, leg);
      setPixel(buf, S, legX2 + 2, legBaseY + legOff + 1, leg);
    }

    // 爆弾ランプ（背中中央）
    drawLamps(buf, S, cx, cy - 1, state, frame, isLv2, LAMP_BASE, LAMP_BRIGHT);

  } else if (dir === 'up') {
    // 背面: 甲羅のみ（ランプが見える）
    fillEllipse(buf, S, cx, cy, 9, 6, shellColor);
    fillRect(buf, S, cx - 5, cy - 3, 10, 3, hexToRGBA('#3a2a1a')); // 背面は暗い

    for (let dy = -6; dy <= 6; dy++) {
      const hw = Math.floor(9 * Math.sqrt(Math.max(0, 1 - (dy / 6) ** 2)));
      setPixel(buf, S, cx - hw, cy + dy, BLACK);
      setPixel(buf, S, cx + hw, cy + dy, BLACK);
    }
    hLine(buf, S, cx - 9, cy - 6, 19, BLACK);
    hLine(buf, S, cx - 9, cy + 6, 19, BLACK);

    // 6本脚（背面でも見える）
    for (let i = 0; i < 3; i++) {
      const legBaseY = cy - 2 + i * 2;
      const legOff = state === 'move' ? ((frame === 0 ? (i % 2) : (1 - i % 2)) * 2) : 0;
      hLine(buf, S, cx - 12, legBaseY + legOff, 4, leg);
      hLine(buf, S, cx + 9,  legBaseY + legOff, 4, leg);
    }

    drawLamps(buf, S, cx, cy - 1, state, frame, isLv2, LAMP_BASE, LAMP_BRIGHT);

  } else {
    // left / right: 側面（3本脚が見える）
    const facingRight = dir === 'right';
    const flipX = facingRight ? 1 : -1;

    // 胴体（楕円を横に扁平）
    fillEllipse(buf, S, cx, cy, 8, 5, shellColor);
    // 背中ハイライト
    hLine(buf, S, cx - 6, cy - 4, 12, hi);

    // アウトライン
    for (let dy = -5; dy <= 5; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 5) ** 2)));
      setPixel(buf, S, cx - hw, cy + dy, BLACK);
      setPixel(buf, S, cx + hw, cy + dy, BLACK);
    }
    hLine(buf, S, cx - 8, cy - 5, 17, BLACK);
    hLine(buf, S, cx - 8, cy + 5, 17, BLACK);

    // 頭部（向いている方向）
    const headX = cx + flipX * 8;
    fillCircle(buf, S, headX, cy, 3, hi);
    setPixel(buf, S, headX + flipX * 2, cy, hexToRGBA('#ff4400')); // 目

    // 3本脚（下側に見える）
    for (let i = 0; i < 3; i++) {
      const legX = cx - 5 + i * 5;
      const legOff = state === 'move' ? ((frame === 0 ? (i % 2) : (1 - i % 2)) * 2) : 0;
      vLine(buf, S, legX, cy + 5, 3 + legOff, leg);
      setPixel(buf, S, legX - 1, cy + 5 + 2 + legOff, leg);
      setPixel(buf, S, legX + 1, cy + 5 + 2 + legOff, leg);
    }

    drawLamps(buf, S, cx, cy - 1, state, frame, isLv2, LAMP_BASE, LAMP_BRIGHT);
  }

  // hit: ランプが消えかかる（関数内で処理）
  // levelup: ランプが2つに増える演出（関数内で処理）
  // attack: ランプ点滅はdrawLamps内

  // dead frame0: 甲羅が割れる線
  if (state === 'dead' && frame === 0) {
    drawLine(buf, S, cx - 3, cy - 4, cx + 2, cy + 4, BLACK);
    drawLine(buf, S, cx + 1, cy - 3, cx - 2, cy + 3, BLACK);
  }
}

/** mine_beetle 用ランプ描画ヘルパー */
function drawLamps(
  buf: Uint8Array,
  S: number,
  cx: number,
  cy: number,
  state: State,
  frame: number,
  isLv2: boolean,
  lampBaseHex: string,
  lampBrightHex: string
): void {
  const lampBase   = hexToRGBA(lampBaseHex);
  const lampBright = hexToRGBA(lampBrightHex);

  const lampColor =
    state === 'dead'    ? hexToRGBA('#440000') :
    state === 'hit'     ? hexToRGBA('#884400') :
    state === 'attack' && frame === 1 ? lampBright :
    state === 'attack' && frame === 2 ? hexToRGBA('#ffcc00') :
    state === 'levelup' ? (frame === 0 ? hexToRGBA('#ffff00') : hexToRGBA('#ffffff')) :
    lampBase;

  // ランプ1個目
  fillCircle(buf, S, cx, cy, 2, lampColor);
  setPixel(buf, S, cx, cy, hexToRGBA('#ffeeee', 200)); // 内部光

  if (isLv2) {
    // Lv2: ランプ2個
    fillCircle(buf, S, cx - 3, cy, 2, lampColor);
    setPixel(buf, S, cx - 3, cy, hexToRGBA('#ffeeee', 200));
    fillCircle(buf, S, cx + 3, cy, 2, lampColor);
    setPixel(buf, S, cx + 3, cy, hexToRGBA('#ffeeee', 200));
  }
}

// ---------------------------------------------------------------------------
// 3. guard_bot（ガードボット）
// ---------------------------------------------------------------------------
// 二足歩行の警備ロボ。盾+電撃バトンを装備。
// ---------------------------------------------------------------------------

function drawGuardBot(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  isLv2: boolean
): void {
  const BODY_BASE  = '#445566';
  const BODY_LV2   = '#5566aa'; // Lv2: 少し明るい
  const HIGHLIGHT  = '#6688aa';
  const SHADOW     = '#223344';
  const SHIELD     = '#7799aa';
  const SHIELD_LV2 = '#99bbcc'; // Lv2: 盾が大きい（色も明るく）
  const BATON      = '#ffcc33';
  const ARMOR      = '#8899aa'; // Lv3装甲

  const bodyHex   = isLv2 ? BODY_LV2 : BODY_BASE;
  const shieldHex = isLv2 ? SHIELD_LV2 : SHIELD;
  const body      = hexToRGBA(bodyHex);
  const hi        = hexToRGBA(HIGHLIGHT);
  const sh        = hexToRGBA(SHADOW);
  const shield    = hexToRGBA(shieldHex);
  const baton     = hexToRGBA(BATON);

  const bounceY = state === 'move' && frame === 1 ? 1 : 0;

  // dead: 横向きに崩れる
  const isDead = state === 'dead';
  const deadTiltX = isDead ? frame * 3 : 0;
  const deadTiltY = isDead ? frame * 2 : 0;

  const cx = 16 + deadTiltX;
  const headTop = 6 + bounceY + deadTiltY;
  const bodyTop = 13 + bounceY + deadTiltY;
  const bodyBot = bodyTop + 12;
  const legTop  = bodyBot;

  // hit: ボディが赤くなる
  const bodyColor = state === 'hit' ? hexToRGBA('#774455') : body;

  // -- 頭部（8x8）--
  fillRect(buf, S, cx - 4, headTop, 8, 7, bodyColor);
  // 頭部ハイライト（上）
  hLine(buf, S, cx - 4, headTop, 8, hi);

  // 目（方向によって位置変化）
  const dOff = dirOffset(dir);
  const eyeColor = state === 'dead' ? hexToRGBA('#223344') :
                   state === 'hit'  ? hexToRGBA('#ff2200') :
                   hexToRGBA('#ff8800');
  // 正面/背面では両目、横向きでは1つ
  if (dir === 'down') {
    setPixel(buf, S, cx - 2, headTop + 3, eyeColor);
    setPixel(buf, S, cx + 1, headTop + 3, eyeColor);
    // 眼の光
    setPixel(buf, S, cx - 2, headTop + 2, hexToRGBA('#ffcc00', 180));
    setPixel(buf, S, cx + 1, headTop + 2, hexToRGBA('#ffcc00', 180));
  } else if (dir === 'up') {
    // 背面: 目が見えない（暗い）
    setPixel(buf, S, cx - 2, headTop + 3, hexToRGBA('#334455'));
    setPixel(buf, S, cx + 1, headTop + 3, hexToRGBA('#334455'));
  } else if (dir === 'left') {
    setPixel(buf, S, cx - 3, headTop + 3, eyeColor);
  } else {
    setPixel(buf, S, cx + 2, headTop + 3, eyeColor);
  }

  // -- ボディ（12x16）--
  fillRect(buf, S, cx - 6, bodyTop, 12, 12, bodyColor);
  // ハイライト（上・左）
  hLine(buf, S, cx - 6, bodyTop, 12, hi);
  vLine(buf, S, cx - 6, bodyTop, 12, hi);
  // 影（右・下）
  vLine(buf, S, cx + 5, bodyTop, 12, sh);
  hLine(buf, S, cx - 6, bodyTop + 11, 12, sh);

  // Lv3: 肩当て・胸当て（装甲板）
  if (isLv2) {
    fillRect(buf, S, cx - 8, bodyTop, 3, 4, hexToRGBA(ARMOR));
    fillRect(buf, S, cx + 5, bodyTop, 3, 4, hexToRGBA(ARMOR));
    fillRect(buf, S, cx - 4, bodyTop + 2, 8, 3, hexToRGBA(ARMOR));
  }

  // アウトライン（ボディ）
  hLine(buf, S, cx - 6, bodyTop, 12, BLACK);
  hLine(buf, S, cx - 6, bodyTop + 12, 12, BLACK);
  vLine(buf, S, cx - 6, bodyTop, 13, BLACK);
  vLine(buf, S, cx + 5, bodyTop, 13, BLACK);
  // 頭部アウトライン
  hLine(buf, S, cx - 4, headTop, 8, BLACK);
  vLine(buf, S, cx - 4, headTop, 7, BLACK);
  vLine(buf, S, cx + 3, headTop, 7, BLACK);

  // -- 脚（二足歩行）--
  const legOff0 = state === 'move' && frame === 0 ? -2 : 0;
  const legOff1 = state === 'move' && frame === 0 ? 2  : 0;
  if (!isDead) {
    // 左脚
    fillRect(buf, S, cx - 5, legTop, 3, 5 + legOff0, sh);
    // 右脚
    fillRect(buf, S, cx + 2, legTop, 3, 5 + legOff1, sh);
    // 足先
    fillRect(buf, S, cx - 6, legTop + 4 + legOff0, 4, 2, hexToRGBA(SHADOW));
    fillRect(buf, S, cx + 2, legTop + 4 + legOff1, 4, 2, hexToRGBA(SHADOW));
  }

  // -- 盾と武器の配置（方向別）--
  // down: 左腕に盾、右腕にバトン
  // up: 盾と武器が後ろ側（見えにくい）
  // left: 盾が前（左）、バトンが後ろ（右）
  // right: バトンが前（右）、盾が後ろ（左）

  const isAttack = state === 'attack';
  const attackPush = isAttack && frame === 1 ? 4 : 0;
  const isHitShield = state === 'hit'; // 盾が光る

  if (!isDead) {
    if (dir === 'down') {
      // 左腕: 盾
      const shieldW = isLv2 ? 6 : 5;
      const shieldH = isLv2 ? 9 : 7;
      const sX = cx - 10;
      const sY = bodyTop + 1;
      fillRect(buf, S, sX, sY, shieldW, shieldH, isHitShield ? hexToRGBA('#aaccff') : shield);
      hLine(buf, S, sX, sY, shieldW, BLACK);
      hLine(buf, S, sX, sY + shieldH, shieldW, BLACK);
      vLine(buf, S, sX, sY, shieldH, BLACK);
      vLine(buf, S, sX + shieldW - 1, sY, shieldH + 1, BLACK);

      // 右腕: バトン（攻撃時に突き出す）
      const batonY = bodyTop + attackPush;
      fillRect(buf, S, cx + 6, bodyTop + 2, 2, 7 + attackPush, baton);
      hLine(buf, S, cx + 5, batonY + 6 + attackPush, 4, BLACK);
      // 電撃エフェクト（攻撃時）
      if (isAttack) {
        const boltColor = hexToRGBA('#ffee00', 200);
        setPixel(buf, S, cx + 7, batonY, boltColor);
        setPixel(buf, S, cx + 6, batonY - 1, boltColor);
        setPixel(buf, S, cx + 8, batonY - 1, boltColor);
        if (frame === 1) {
          for (let i = 0; i < 4; i++) {
            setPixel(buf, S, cx + 7 + (i % 2 === 0 ? 1 : -1), batonY - 2 - i, boltColor);
          }
        }
      }
      // levelup: バトンが光る
      if (state === 'levelup') {
        fillRect(buf, S, cx + 6, bodyTop + 2, 2, 7, hexToRGBA('#ffffff', frame === 0 ? 200 : 120));
      }

    } else if (dir === 'up') {
      // 背面
      const shieldW = isLv2 ? 6 : 5;
      const shieldH = isLv2 ? 9 : 7;
      fillRect(buf, S, cx - 9, bodyTop + 2, shieldW, shieldH, hexToRGBA('#556677')); // 暗い
      fillRect(buf, S, cx + 5, bodyTop + 2, 2, 6, hexToRGBA('#bb9922')); // バトン（暗い）

    } else if (dir === 'left') {
      // 盾が前（左側）、バトンが後ろ（右側）
      const shieldW = isLv2 ? 6 : 5;
      const shieldH = isLv2 ? 9 : 7;
      const sX = cx - 10 - attackPush;
      const sY = bodyTop + 1;
      fillRect(buf, S, sX, sY, shieldW, shieldH, isHitShield ? hexToRGBA('#aaccff') : shield);
      hLine(buf, S, sX, sY, shieldW, BLACK);
      hLine(buf, S, sX, sY + shieldH, shieldW, BLACK);
      vLine(buf, S, sX, sY, shieldH, BLACK);
      vLine(buf, S, sX + shieldW, sY, shieldH + 1, BLACK);
      // バトン後ろ側
      fillRect(buf, S, cx + 5, bodyTop + 3, 2, 6, baton);

    } else {
      // right: バトンが前（右側）、盾が後ろ（左側）
      const shieldW = isLv2 ? 6 : 5;
      const shieldH = isLv2 ? 9 : 7;
      // 盾（後ろ）
      fillRect(buf, S, cx - 8, bodyTop + 2, shieldW, shieldH, hexToRGBA('#5577889'));
      fillRect(buf, S, cx - 8, bodyTop + 2, shieldW, shieldH, hexToRGBA('#556677'));
      // バトン（前、攻撃的）
      const bX = cx + 6 + attackPush;
      fillRect(buf, S, bX, bodyTop + 2, 2, 7, baton);
      hLine(buf, S, bX - 1, bodyTop + 2 + attackPush, 4, BLACK);
      if (isAttack) {
        const boltColor = hexToRGBA('#ffee00', 200);
        setPixel(buf, S, bX + 1, bodyTop + 1, boltColor);
        setPixel(buf, S, bX,     bodyTop,     boltColor);
        setPixel(buf, S, bX + 2, bodyTop,     boltColor);
        if (frame === 1) {
          for (let i = 0; i < 4; i++) {
            setPixel(buf, S, bX + 3 + i, bodyTop + (i % 2 === 0 ? 1 : -1), boltColor);
          }
        }
      }
      if (state === 'levelup') {
        fillRect(buf, S, bX, bodyTop + 2, 2, 7, hexToRGBA('#ffffff', frame === 0 ? 200 : 120));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. slime_x（スライムX）
// ---------------------------------------------------------------------------
// X字の目を持つゲル体。倒すとミニスライムに分裂。
// ---------------------------------------------------------------------------

function drawSlimeX(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  isLv2: boolean
): void {
  // Lv2: 赤みを帯びたゲル体、X目が輝く
  const BODY_BASE  = '#33bb44';
  const BODY_LV2   = '#bb4433';
  const HIGHLIGHT  = '#55dd66';
  const HL_LV2     = '#dd6655';
  const OUTLINE    = '#115522';
  const OUT_LV2    = '#551100';
  const EYE        = '#220022';

  const bodyHex    = isLv2 ? BODY_LV2 : BODY_BASE;
  const hlHex      = isLv2 ? HL_LV2 : HIGHLIGHT;
  const outHex     = isLv2 ? OUT_LV2 : OUTLINE;

  const bodyBase = hexToRGBA(bodyHex);
  const hl       = hexToRGBA(hlHex);
  const out      = hexToRGBA(outHex);
  const eyeC     = hexToRGBA(EYE);

  const dOff = dirOffset(dir);

  // move: frame0=横に伸びる, frame1=縦に伸びる
  const stretchX = state === 'move' && frame === 0 ? 2 : 0;
  const stretchY = state === 'move' && frame === 1 ? 2 : 0;

  const cx = 16;
  const cy = 18;
  const rx = 10 + stretchX;
  const ry =  7 + stretchY;

  // dead: 分裂演出
  if (state === 'dead') {
    if (frame === 0) {
      // frame0: ひびが入る
      fillEllipse(buf, S, cx, cy, rx, ry, bodyBase);
      // ひびの線
      drawLine(buf, S, cx, cy - ry, cx + 2, cy, hexToRGBA('#000000'));
      drawLine(buf, S, cx - 3, cy, cx, cy + ry, hexToRGBA('#000000'));
    } else if (frame === 1) {
      // frame1: 2つに割れる
      fillEllipse(buf, S, cx - 5, cy, 5, ry - 1, hexToRGBA(bodyHex, 200));
      fillEllipse(buf, S, cx + 5, cy, 5, ry - 1, hexToRGBA(bodyHex, 200));
    } else {
      // frame2: 消える（小さな残滓）
      fillCircle(buf, S, cx - 4, cy, 2, hexToRGBA(bodyHex, 80));
      fillCircle(buf, S, cx + 4, cy, 2, hexToRGBA(bodyHex, 80));
    }
    return;
  }

  // ゲルボディ（楕円）
  const bodyColor = state === 'hit' ? hexToRGBA('#cc3322') : bodyBase;
  fillEllipse(buf, S, cx, cy, rx, ry, bodyColor);

  // ハイライト（上部）
  fillCircle(buf, S, cx - rx / 3, cy - ry / 2, 2, hl);

  // levelup: キラキラ光る
  if (state === 'levelup') {
    const flashC = hexToRGBA('#ffffff', frame === 0 ? 160 : 80);
    fillEllipse(buf, S, cx, cy, rx + 2, ry + 2, flashC);
    // キラキラ点
    const spark = hexToRGBA('#ffff88', 220);
    setPixel(buf, S, cx,     cy - ry - 2, spark);
    setPixel(buf, S, cx + rx + 2, cy,     spark);
    setPixel(buf, S, cx - rx - 2, cy,     spark);
    setPixel(buf, S, cx,     cy + ry + 2, spark);
  }

  // アウトライン
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    setPixel(buf, S, cx - hw - 1, cy + dy, out);
    setPixel(buf, S, cx + hw + 1, cy + dy, out);
  }
  for (let dx = -rx; dx <= rx; dx++) {
    const hh = Math.floor(ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)));
    setPixel(buf, S, cx + dx, cy - hh - 1, out);
    setPixel(buf, S, cx + dx, cy + hh + 1, out);
  }

  // X字の目: 方向で片寄り
  const eyeBaseX = cx + dOff.dx * 3;
  const eyeBaseY = cy + dOff.dy * 2 - 1;

  const eyeColor = state === 'hit' ? hexToRGBA('#ff0000') :
                   isLv2 ? hexToRGBA('#ff8800') :
                   eyeC;

  // 左目のX
  const lx = eyeBaseX - 4;
  const ly = eyeBaseY;
  setPixel(buf, S, lx - 1, ly - 1, eyeColor);
  setPixel(buf, S, lx,     ly,     eyeColor);
  setPixel(buf, S, lx + 1, ly + 1, eyeColor);
  setPixel(buf, S, lx + 1, ly - 1, eyeColor);
  setPixel(buf, S, lx - 1, ly + 1, eyeColor);

  // 右目のX
  const rx2 = eyeBaseX + 4;
  const ry2 = eyeBaseY;
  setPixel(buf, S, rx2 - 1, ry2 - 1, eyeColor);
  setPixel(buf, S, rx2,     ry2,     eyeColor);
  setPixel(buf, S, rx2 + 1, ry2 + 1, eyeColor);
  setPixel(buf, S, rx2 + 1, ry2 - 1, eyeColor);
  setPixel(buf, S, rx2 - 1, ry2 + 1, eyeColor);

  // 底部の不定形の足
  const footColor = hexToRGBA(bodyHex, 180);
  for (let i = -4; i <= 4; i += 2) {
    fillCircle(buf, S, cx + i, cy + ry, 2, footColor);
  }

  // attack: 触手を伸ばす
  if (state === 'attack') {
    const pseudoLen = frame === 0 ? 3 : frame === 1 ? 8 : 2;
    const pseudoColor = hl;
    const startX = cx + dOff.dx * (rx + 1);
    const startY = cy + dOff.dy * (ry + 1);
    for (let i = 1; i <= pseudoLen; i++) {
      const px = startX + dOff.dx * i;
      const py = startY + dOff.dy * i;
      const thickness = Math.max(1, 3 - i);
      fillCircle(buf, S, px, py, thickness, pseudoColor);
    }
    // 先端を太く
    if (frame === 1) {
      const tipX = startX + dOff.dx * pseudoLen;
      const tipY = startY + dOff.dy * pseudoLen;
      fillCircle(buf, S, tipX, tipY, 2, hexToRGBA(hlHex, 220));
    }
  }
}

// ---------------------------------------------------------------------------
// 5. mini_slime（ミニスライム）
// ---------------------------------------------------------------------------
// スライムXから生まれた小型スライム。点目で丸い。
// ---------------------------------------------------------------------------

function drawMiniSlime(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  isLv2: boolean
): void {
  // Lv2: 少し大きく、目が三角に変化
  const BODY_BASE = '#55cc66';
  const BODY_LV2  = '#66dd77';
  const HIGHLIGHT = '#77ee88';
  const OUTLINE   = '#224433';

  const bodyHex = isLv2 ? BODY_LV2 : BODY_BASE;
  const body    = hexToRGBA(bodyHex);
  const hi      = hexToRGBA(HIGHLIGHT);
  const out     = hexToRGBA(OUTLINE);

  const dOff = dirOffset(dir);
  const baseR = isLv2 ? 7 : 6;

  // dead: 消える
  if (state === 'dead') {
    if (frame === 0) {
      // 通常
      fillEllipse(buf, S, 16, 19, baseR + 1, baseR - 1, body);
    } else if (frame === 1) {
      // 半透明
      fillEllipse(buf, S, 16, 19, baseR + 1, baseR - 1, hexToRGBA(bodyHex, 120));
    }
    // frame2: 消滅（何も描かない）
    return;
  }

  // ジャンプ（move）
  const jumpOffset = state === 'move' && frame === 1 ? -4 : 0;
  const cx = 16;
  const cy = 19 + jumpOffset;

  // move時の影（地面に）
  if (state === 'move' && frame === 1) {
    fillEllipse(buf, S, cx, 21, baseR - 1, 2, hexToRGBA('#000000', 60));
  }

  // hit: 体が赤くなり縮む
  const hitShrink = state === 'hit' ? -1 : 0;
  const bodyColor = state === 'hit' ? hexToRGBA('#cc4422') : body;
  const rx = baseR + 1 + hitShrink;
  const ry = baseR - 1 + hitShrink;

  fillEllipse(buf, S, cx, cy, rx, ry, bodyColor);
  // ハイライト
  fillCircle(buf, S, cx - rx / 3, cy - ry / 2, 1, hi);

  // levelup: 体が輝く
  if (state === 'levelup') {
    fillEllipse(buf, S, cx, cy, rx + 2, ry + 2, hexToRGBA('#ffffff', frame === 0 ? 150 : 80));
    const spark = hexToRGBA('#ffff88', 200);
    setPixel(buf, S, cx,     cy - ry - 2, spark);
    setPixel(buf, S, cx + rx + 2, cy,     spark);
    setPixel(buf, S, cx - rx - 2, cy,     spark);
  }

  // アウトライン
  drawCircleOutline(buf, S, cx, cy, Math.max(rx, ry), out);

  // 目（方向別）
  const eyeCX = cx + dOff.dx * 2;
  const eyeCY = cy + dOff.dy * 2 - 1;
  const eyeColor = state === 'hit' ? hexToRGBA('#ff2200') : BLACK;

  if (isLv2) {
    // Lv2: 三角形の目
    setPixel(buf, S, eyeCX - 2, eyeCY,     eyeColor);
    setPixel(buf, S, eyeCX - 3, eyeCY - 1, eyeColor);
    setPixel(buf, S, eyeCX - 1, eyeCY - 1, eyeColor);

    setPixel(buf, S, eyeCX + 2, eyeCY,     eyeColor);
    setPixel(buf, S, eyeCX + 1, eyeCY - 1, eyeColor);
    setPixel(buf, S, eyeCX + 3, eyeCY - 1, eyeColor);
  } else {
    // 2点の目
    setPixel(buf, S, eyeCX - 2, eyeCY, eyeColor);
    setPixel(buf, S, eyeCX + 1, eyeCY, eyeColor);
  }

  // 小さな口
  setPixel(buf, S, eyeCX, eyeCY + 2, BLACK);

  // attack: ジャンプして体当たり
  if (state === 'attack') {
    const jumpY = frame === 0 ? -2 : frame === 1 ? -7 : -1;
    const jumpX = frame === 1 ? dOff.dx * 5 : 0;
    // ジャンプ中のボディ（元の位置から移動した別位置）
    const ajcx = cx + jumpX;
    const ajcy = cy + jumpY;
    fillEllipse(buf, S, ajcx, ajcy, rx, ry, body);
    drawCircleOutline(buf, S, ajcx, ajcy, Math.max(rx, ry), out);
    if (frame === 1) {
      // 突進中: ゆがんだ形
      setPixel(buf, S, ajcx + dOff.dx * rx, ajcy + dOff.dy * ry, hexToRGBA('#ffffff', 180));
    }
  }
}

// ---------------------------------------------------------------------------
// 6. spark（スパーク）
// ---------------------------------------------------------------------------
// 高速移動する電撃型メカ。稲妻型ボディ、電気放電で攻撃。
// ---------------------------------------------------------------------------

function drawSpark(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  isLv2: boolean
): void {
  // Lv2: 電撃が青白く
  const BODY_BASE  = '#aaaa22';
  const BOLT_BASE  = '#ffff44';
  const BOLT_LV2   = '#88aaff';
  const CORE       = '#ffffff';
  const SHADOW     = '#666600';

  const bodyHex = BODY_BASE;
  const boltHex = isLv2 ? BOLT_LV2 : BOLT_BASE;

  const body = hexToRGBA(bodyHex);
  const bolt = hexToRGBA(boltHex);
  const core = hexToRGBA(CORE);
  const sh   = hexToRGBA(SHADOW);

  const isVert = dir === 'up' || dir === 'down';
  const dOff = dirOffset(dir);

  // move: 電撃フラッシュ
  const flicker = (state === 'move' || state === 'idle') && frame === 1;

  const cx = 16;
  const cy = 16;

  // dead: 放電して消える
  if (state === 'dead') {
    if (frame === 0) {
      // 強光
      fillCircle(buf, S, cx, cy, 8, hexToRGBA(boltHex, 220));
      fillCircle(buf, S, cx, cy, 4, hexToRGBA('#ffffff', 240));
    } else if (frame === 1) {
      // 分散（電撃が広がる）
      const sparkC = hexToRGBA(boltHex, 160);
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const dist = 6;
        const spx = cx + Math.round(Math.cos(angle) * dist);
        const spy = cy + Math.round(Math.sin(angle) * dist);
        setPixel(buf, S, spx, spy, sparkC);
        setPixel(buf, S, spx - 1, spy, sparkC);
        setPixel(buf, S, spx, spy - 1, sparkC);
      }
      fillCircle(buf, S, cx, cy, 2, hexToRGBA(bodyHex, 120));
    }
    // frame2: 暗転（何も描かない）
    return;
  }

  // メインボディ（稲妻型）
  // 方向によって縦長/横長が変わる
  const bw = isVert ? 6 : 16;
  const bh = isVert ? 16 : 6;
  const bx = cx - bw / 2;
  const by = cy - bh / 2;

  const bodyColor = state === 'hit' ? hexToRGBA('#886600') : body;
  fillRect(buf, S, bx, by, bw, bh, bodyColor);

  // 先端の尖り（方向別）
  if (dir === 'down') {
    for (let i = 0; i < 4; i++) {
      hLine(buf, S, cx - 2 + i, by + bh + i, Math.max(1, bw - i * 2), body);
    }
  } else if (dir === 'up') {
    for (let i = 0; i < 4; i++) {
      hLine(buf, S, cx - 2 + i, by - i, Math.max(1, bw - i * 2), body);
    }
  } else if (dir === 'left') {
    for (let i = 0; i < 4; i++) {
      vLine(buf, S, bx - i, cy - 2 + i, Math.max(1, bh - i * 2), body);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      vLine(buf, S, bx + bw + i, cy - 2 + i, Math.max(1, bh - i * 2), body);
    }
  }

  // アウトライン
  hLine(buf, S, bx, by, bw, BLACK);
  hLine(buf, S, bx, by + bh, bw, BLACK);
  vLine(buf, S, bx, by, bh, BLACK);
  vLine(buf, S, bx + bw - 1, by, bh, BLACK);

  // 稲妻パターン（ボディ内）
  const boltColor = state === 'hit' ? hexToRGBA('#446600') : bolt;
  const boltBright = flicker ? hexToRGBA('#ffffff', 240) : boltColor;
  if (isVert) {
    const pts = [[cx, by + 2], [cx + 2, by + 5], [cx - 2, by + 8], [cx + 2, by + 11], [cx, by + 14]];
    for (let i = 0; i < pts.length - 1; i++) {
      drawLine(buf, S, pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], boltBright);
    }
  } else {
    const pts = [[bx + 2, cy], [bx + 5, cy - 2], [bx + 8, cy + 2], [bx + 11, cy - 2], [bx + 14, cy]];
    for (let i = 0; i < pts.length - 1; i++) {
      drawLine(buf, S, pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], boltBright);
    }
  }

  // コア（中央光点）
  fillCircle(buf, S, cx, cy, 2, core);

  // 電気コロナ
  const coronaAlpha = flicker ? 180 : (state === 'hit' ? 40 : 100);
  drawCircleOutline(buf, S, cx, cy, isVert ? 9 : 10, hexToRGBA(boltHex, coronaAlpha));
  if (isLv2) {
    // Lv2: 二重の電撃コロナ
    drawCircleOutline(buf, S, cx, cy, isVert ? 11 : 12, hexToRGBA(boltHex, coronaAlpha / 2));
  }
  if (state === 'levelup') {
    drawCircleOutline(buf, S, cx, cy, isVert ? 11 : 12, hexToRGBA('#ffffff', frame === 0 ? 200 : 120));
    drawCircleOutline(buf, S, cx, cy, isVert ? 13 : 14, hexToRGBA(boltHex, frame === 0 ? 150 : 80));
  }

  // 先端の光点（攻撃方向）
  const tipX = cx + dOff.dx * (isVert ? 11 : 12);
  const tipY = cy + dOff.dy * (isVert ? 11 : 10);
  const eyeColor = state === 'hit' ? hexToRGBA('#443300', 150) : hexToRGBA(boltHex, 230);
  fillCircle(buf, S, tipX, tipY, 2, eyeColor);
  setPixel(buf, S, tipX, tipY, core);

  // attack: 電撃ビームが伸びる
  if (state === 'attack') {
    const beamLen = frame === 0 ? 4 : frame === 1 ? 9 : 0;
    if (frame === 2) {
      // frame2: 閃光
      fillCircle(buf, S, tipX, tipY, 5, hexToRGBA('#ffffff', 200));
    } else {
      const beamColor = frame === 1 ? hexToRGBA('#ffffff', 240) : boltColor;
      for (let i = 1; i <= beamLen; i++) {
        const bpx = tipX + dOff.dx * i;
        const bpy = tipY + dOff.dy * i;
        setPixel(buf, S, bpx, bpy, beamColor);
        if (frame === 1) {
          setPixel(buf, S, bpx + dOff.dy, bpy + dOff.dx, hexToRGBA(boltHex, 180));
          setPixel(buf, S, bpx - dOff.dy, bpy - dOff.dx, hexToRGBA(boltHex, 180));
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 7. rust_hound（ラストハウンド）
// ---------------------------------------------------------------------------
// 錆びた4足歩行の犬型メカ。赤い目、遠吠えで仲間を呼ぶ。
// ---------------------------------------------------------------------------

function drawRustHound(
  buf: Uint8Array,
  S: number,
  dir: Direction,
  state: State,
  frame: number,
  isLv2: boolean
): void {
  const BODY_BASE  = '#885533';
  const BODY_LV2   = '#aa3322'; // Lv2: 錆がひどく赤茶色
  const RUST       = '#aa7755';
  const RUST_LV2   = '#cc5544';
  const SHADOW     = '#553311';
  const EYE        = '#ff4400';

  const bodyHex  = isLv2 ? BODY_LV2 : BODY_BASE;
  const rustHex  = isLv2 ? RUST_LV2 : RUST;

  const body = hexToRGBA(bodyHex);
  const rust = hexToRGBA(rustHex);
  const sh   = hexToRGBA(SHADOW);

  const eyeColor = state === 'dead' ? hexToRGBA('#442200') :
                   state === 'hit'  ? hexToRGBA('#ffffff') :
                   hexToRGBA(EYE);

  const bounceY  = state === 'move' && frame === 1 ? -1 : 0;
  const isDead   = state === 'dead';
  const deadTiltX = isDead ? frame * 3 : 0;
  const deadTiltY = isDead ? frame * 2 : 0;

  const dOff = dirOffset(dir);

  // dead: 横向きに崩れる
  if (isDead && frame === 2) {
    // 倒れた状態（横になる）
    fillRect(buf, S, 6, 20, 20, 8, hexToRGBA(bodyHex, 180));
    hLine(buf, S, 6, 20, 20, BLACK);
    hLine(buf, S, 6, 27, 20, BLACK);
    vLine(buf, S, 6, 20, 8,  BLACK);
    vLine(buf, S, 25, 20, 8, BLACK);
    // 四本脚が横に広がる
    for (let i = 0; i < 4; i++) {
      hLine(buf, S, 7 + i * 5, 24, 4, sh);
    }
    return;
  }

  const ox = deadTiltX;
  const oy = deadTiltY + bounceY;

  // -- 四方向別描画 --
  if (dir === 'down') {
    // 正面: 頭が前（下）、尻尾が奥（上）
    // 胴体
    fillRect(buf, S, 9 + ox, 12 + oy, 14, 8, body);
    // 錆模様
    setPixel(buf, S, 12 + ox, 14 + oy, rust);
    setPixel(buf, S, 17 + ox, 15 + oy, rust);
    setPixel(buf, S, 14 + ox, 13 + oy, rust);
    // 胴体ハイライト（背）
    hLine(buf, S, 9 + ox, 12 + oy, 14, rust);

    // 頭（正面）
    fillRect(buf, S, 11 + ox, 19 + oy, 10, 7, rust);
    // 鼻先（前方向=下）
    fillRect(buf, S, 12 + ox, 25 + oy, 8, 2, hexToRGBA('#aa6644'));
    // 目
    setPixel(buf, S, 13 + ox, 21 + oy, eyeColor);
    setPixel(buf, S, 17 + ox, 21 + oy, eyeColor);
    if (state === 'levelup') {
      // 目が赤く輝く
      fillCircle(buf, S, 13 + ox, 21 + oy, 2, hexToRGBA('#ff2200', frame === 0 ? 160 : 80));
      fillCircle(buf, S, 17 + ox, 21 + oy, 2, hexToRGBA('#ff2200', frame === 0 ? 160 : 80));
      // 遠吠えエフェクト（音波ドット）
      drawCircleOutline(buf, S, 16 + ox, 16 + oy, 8 + frame * 3, hexToRGBA('#ffaa00', 100));
    }
    // attack: 頭を突き出す（噛みつき）
    const headPush = state === 'attack' && frame === 1 ? 3 : 0;
    if (state === 'attack') {
      fillRect(buf, S, 11 + ox, 19 + oy + headPush, 10, 7, rust);
      // 口が開く（frame0:少し, frame1:大きく）
      const mouthOpen = frame === 0 ? 1 : 3;
      fillRect(buf, S, 12 + ox, 25 + oy + headPush, 8, mouthOpen, hexToRGBA('#221100'));
      setPixel(buf, S, 12 + ox, 24 + oy + headPush, hexToRGBA('#eeeeee')); // 牙
      setPixel(buf, S, 18 + ox, 24 + oy + headPush, hexToRGBA('#eeeeee')); // 牙
    }

    // 尻尾（上方向）
    vLine(buf, S, 16 + ox, 9 + oy, 4, rust);
    setPixel(buf, S, 15 + ox, 9 + oy, rust);
    setPixel(buf, S, 17 + ox, 9 + oy, rust);

    // 4本脚（左2右2）
    const legPhase = state === 'move' ? frame : 0;
    for (let i = 0; i < 4; i++) {
      const lx = 10 + i * 4 + ox;
      const legDown = legPhase === (i % 2) ? 2 : 0;
      vLine(buf, S, lx, 19 + oy, 3 + legDown, sh);
    }

    // Lv2: 尻尾に金属トゲ
    if (isLv2) {
      setPixel(buf, S, 14 + ox, 8 + oy, hexToRGBA('#999999'));
      setPixel(buf, S, 18 + ox, 8 + oy, hexToRGBA('#999999'));
    }

    // アウトライン（胴体）
    hLine(buf, S, 9 + ox, 12 + oy, 14, BLACK);
    hLine(buf, S, 9 + ox, 19 + oy, 14, BLACK);
    vLine(buf, S, 9 + ox, 12 + oy, 8, BLACK);
    vLine(buf, S, 22 + ox, 12 + oy, 8, BLACK);

  } else if (dir === 'up') {
    // 背面: 尻尾が前（下）、頭が奥（上）
    // 胴体（暗め）
    fillRect(buf, S, 9 + ox, 12 + oy, 14, 8, sh);
    setPixel(buf, S, 12 + ox, 14 + oy, hexToRGBA(bodyHex, 180));
    setPixel(buf, S, 17 + ox, 15 + oy, hexToRGBA(bodyHex, 180));

    // 頭（背面：後ろ側、上部に小さく）
    fillRect(buf, S, 11 + ox, 8 + oy, 10, 5, hexToRGBA(rustHex, 180));
    // 目（背面では暗い）
    setPixel(buf, S, 13 + ox, 10 + oy, hexToRGBA('#882200'));
    setPixel(buf, S, 17 + ox, 10 + oy, hexToRGBA('#882200'));

    // 尻尾（前方向=下）
    vLine(buf, S, 16 + ox, 19 + oy, 5, rust);
    setPixel(buf, S, 15 + ox, 22 + oy, rust);
    setPixel(buf, S, 17 + ox, 22 + oy, rust);
    if (isLv2) {
      setPixel(buf, S, 14 + ox, 23 + oy, hexToRGBA('#999999'));
      setPixel(buf, S, 18 + ox, 23 + oy, hexToRGBA('#999999'));
    }

    // 4本脚
    const legPhase = state === 'move' ? frame : 0;
    for (let i = 0; i < 4; i++) {
      const lx = 10 + i * 4 + ox;
      const legDown = legPhase === (i % 2) ? 2 : 0;
      vLine(buf, S, lx, 19 + oy, 3 + legDown, sh);
    }

    hLine(buf, S, 9 + ox, 12 + oy, 14, BLACK);
    hLine(buf, S, 9 + ox, 19 + oy, 14, BLACK);
    vLine(buf, S, 9 + ox, 12 + oy, 8, BLACK);
    vLine(buf, S, 22 + ox, 12 + oy, 8, BLACK);

  } else {
    // left / right: 横シルエット
    const facingRight = dir === 'right';
    const flip = facingRight ? 1 : -1;
    const bx = 7 + ox;
    const by = 14 + oy;

    // 胴体（横長）
    fillRect(buf, S, bx + 2, by, 18, 8, body);
    // 錆模様（まだら）
    setPixel(buf, S, bx + 5, by + 2, rust);
    setPixel(buf, S, bx + 10, by + 3, rust);
    setPixel(buf, S, bx + 15, by + 1, rust);
    hLine(buf, S, bx + 2, by, 18, rust); // 背中ハイライト

    // 頭部（前進方向）
    const headX = facingRight ? bx + 20 : bx - 1;
    const headDX = facingRight ? 0 : -6;
    fillRect(buf, S, headX + headDX, by - 2, 7, 8, rust);
    // 鼻先
    const noseX = facingRight ? headX + headDX + 7 : headX + headDX - 2;
    vLine(buf, S, noseX, by + 2, 3, hexToRGBA('#aa6644'));
    // 目（横向き）
    const eyeX = facingRight ? headX + headDX + 2 : headX + headDX + 3;
    setPixel(buf, S, eyeX, by + 1, eyeColor);
    setPixel(buf, S, eyeX, by,     eyeColor);
    if (state === 'levelup') {
      fillCircle(buf, S, eyeX, by, 2, hexToRGBA('#ff2200', frame === 0 ? 160 : 80));
      drawCircleOutline(buf, S, 16 + ox, 16 + oy, 8 + frame * 3, hexToRGBA('#ffaa00', 100));
    }

    // 顎（攻撃時に開く）
    if (state === 'attack') {
      const attackPush = frame === 1 ? flip * 3 : 0;
      const jawOpen = frame === 0 ? 1 : 3;
      // 上あご
      fillRect(buf, S, headX + headDX, by - 2, 7, 5, rust);
      // 下あご
      fillRect(buf, S, headX + headDX, by + 3, 7, jawOpen + 1, hexToRGBA('#664422'));
      // 牙
      setPixel(buf, S, headX + headDX + 1, by + 3, hexToRGBA('#eeeeee'));
      setPixel(buf, S, headX + headDX + 5, by + 3, hexToRGBA('#eeeeee'));
    }

    // 尻尾（反対方向）
    const tailX = facingRight ? bx + 2 : bx + 19;
    vLine(buf, S, tailX, by - 4, 6, rust);
    setPixel(buf, S, tailX + (facingRight ? -1 : 1), by - 5, rust);
    setPixel(buf, S, tailX + (facingRight ? -2 : 2), by - 3, rust);
    if (isLv2) {
      setPixel(buf, S, tailX + (facingRight ? -1 : 1), by - 6, hexToRGBA('#999999'));
      setPixel(buf, S, tailX + (facingRight ? -3 : 3), by - 4, hexToRGBA('#999999'));
    }

    // 4本脚（左/右向きの犬のシルエット）
    const legPhase = state === 'move' ? frame : 0;
    // 前2本、後ろ2本
    const legXs = [bx + 4, bx + 8, bx + 14, bx + 18];
    for (let i = 0; i < 4; i++) {
      const legDown = legPhase === (i % 2) ? 3 : 0;
      vLine(buf, S, legXs[i], by + 7, 3 + legDown, sh);
      // 足先（前後に広がる）
      setPixel(buf, S, legXs[i] - 1, by + 9 + legDown, sh);
      setPixel(buf, S, legXs[i] + 1, by + 9 + legDown, sh);
    }

    // アウトライン（胴体）
    hLine(buf, S, bx + 2, by, 18, BLACK);
    hLine(buf, S, bx + 2, by + 7, 18, BLACK);
    vLine(buf, S, bx + 2, by, 8, BLACK);
    vLine(buf, S, bx + 19, by, 8, BLACK);
  }
}

// ---------------------------------------------------------------------------
// 敵定義リスト
// ---------------------------------------------------------------------------

const ENEMY_DEFS: EnemyDef[] = [
  { id: 'scout_drone', drawFn: drawScoutDrone },
  { id: 'mine_beetle', drawFn: drawMineBeetle },
  { id: 'guard_bot',   drawFn: drawGuardBot   },
  { id: 'slime_x',     drawFn: drawSlimeX     },
  { id: 'mini_slime',  drawFn: drawMiniSlime  },
  { id: 'spark',       drawFn: drawSpark      },
  { id: 'rust_hound',  drawFn: drawRustHound  },
];

// ---------------------------------------------------------------------------
// フレーム数定義
// ---------------------------------------------------------------------------

const STATE_FRAMES: Record<State, number> = {
  idle:    2,
  move:    2,
  attack:  3,
  hit:     2,
  levelup: 2,
  dead:    3,
};

const DIRECTIONS: Direction[] = ['down', 'up', 'left', 'right'];
const STATES: State[] = ['idle', 'move', 'attack', 'hit', 'levelup', 'dead'];

// ---------------------------------------------------------------------------
// 生成メイン
// ---------------------------------------------------------------------------

async function generateEnemySprite(
  enemy: EnemyDef,
  state: State,
  dir: Direction,
  frame: number,
  isLv2: boolean,
  outDir: string
): Promise<string> {
  const S = TILE_SIZE;
  const buf = createBuffer(S, S);

  enemy.drawFn(buf, S, dir, state, frame, isLv2);

  // ファイル名: {enemy_id}_{lv}_{state}_dir_{direction}_idle_{frame}.png
  const lvSuffix = isLv2 ? '_lv2' : '_lv1';
  const filename = `${enemy.id}${lvSuffix}_${state}_dir_${dir}_idle_${frame}.png`;
  const filePath = path.join(outDir, filename);

  await savePNG(buf, S, S, filePath);
  return filename;
}

async function main(): Promise<void> {
  console.log('=== メカローグ 1-3階 敵スプライト生成開始 ===');

  ensureDir(ENEMIES_DIR);

  const generated: string[] = [];
  let count = 0;

  for (const enemy of ENEMY_DEFS) {
    console.log(`\n[${enemy.id}] 生成中...`);

    for (const isLv2 of [false, true]) {
      for (const dir of DIRECTIONS) {
        for (const state of STATES) {
          const frameCount = STATE_FRAMES[state];
          for (let frame = 0; frame < frameCount; frame++) {
            const filename = await generateEnemySprite(
              enemy, state, dir, frame, isLv2, ENEMIES_DIR
            );
            generated.push(filename);
            count++;
          }
        }
      }
    }

    console.log(`  ${enemy.id}: 完了`);
  }

  console.log(`\n=== 生成完了: ${count} ファイル ===`);
  console.log(`出力先: ${ENEMIES_DIR}`);

  console.log('\n--- 生成ファイル一覧（先頭20件） ---');
  for (const f of generated.slice(0, 20)) {
    console.log('  ' + f);
  }
  if (generated.length > 20) {
    console.log(`  ... 他 ${generated.length - 20} ファイル`);
  }
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
