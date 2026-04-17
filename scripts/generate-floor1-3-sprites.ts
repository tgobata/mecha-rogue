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
  // ---------------------------------------------------------------------------
  // パレット（明るく鮮やかな水色系 / Lv2は緑系）
  // ---------------------------------------------------------------------------
  const OUTLINE     = hexToRGBA('#223344');       // 輪郭・影（濃い紺）
  const BODY_COLOR  = isLv2 ? hexToRGBA('#55cc88') : hexToRGBA('#88bbdd'); // ボディ
  const BODY_MID    = isLv2 ? hexToRGBA('#33aa66') : hexToRGBA('#5599cc'); // ボディ中間色
  const BODY_HI     = isLv2 ? hexToRGBA('#aaffcc') : hexToRGBA('#cceeff'); // ハイライト
  const ANTENNA_COL = isLv2 ? hexToRGBA('#88ffaa') : hexToRGBA('#aaddff'); // アンテナ
  const PROP_BASE   = isLv2 ? hexToRGBA('#22bb66') : hexToRGBA('#4499cc'); // プロペラ（濃いアクセント）
  const PROP_TIP    = isLv2 ? hexToRGBA('#66ffaa') : hexToRGBA('#88ddff'); // プロペラ先端（明るい）

  const dOff = dirOffset(dir);

  // ---------------------------------------------------------------------------
  // 座標基準（32×32 グリッドの中心）
  // ボディ中心: cx=16, cy=16（固定）
  // idle のみ frame1 で 1px だけ上にホバリング（最小限の差）
  // ---------------------------------------------------------------------------
  const cx = 16;
  const hoverY = (state === 'idle' && frame === 1) ? -1 : 0;
  const baseCY = 16 + hoverY;

  // ---------------------------------------------------------------------------
  // dead アニメーション用オフセット（ボディ傾き）
  // frame0: 少し右傾き, frame1: 煙追加, frame2: 爆発
  // ---------------------------------------------------------------------------
  const deadTiltX = state === 'dead' ? (frame === 0 ? 1 : frame >= 1 ? 2 : 0) : 0;
  const deadTiltY = state === 'dead' ? (frame === 0 ? 1 : frame >= 1 ? 3 : 0) : 0;

  const cx2 = cx + deadTiltX;
  const cy2 = baseCY + deadTiltY;

  // ---------------------------------------------------------------------------
  // dead frame2: 爆発エフェクト（ボディなし）
  // ---------------------------------------------------------------------------
  if (state === 'dead' && frame === 2) {
    fillCircle(buf, S, cx + 2, 19, 9, hexToRGBA('#ff6600', 140));
    fillCircle(buf, S, cx + 2, 19, 6, hexToRGBA('#ffcc00', 200));
    fillCircle(buf, S, cx + 2, 19, 3, hexToRGBA('#ffffff', 240));
    // 爆発の破片
    setPixel(buf, S, cx - 4, 11, hexToRGBA('#ff8800', 200));
    setPixel(buf, S, cx + 7, 12, hexToRGBA('#ff8800', 200));
    setPixel(buf, S, cx - 5, 22, hexToRGBA('#ffcc00', 160));
    setPixel(buf, S, cx + 8, 23, hexToRGBA('#ffcc00', 160));
    return;
  }

  // ---------------------------------------------------------------------------
  // dead frame1: 煙エフェクト（ボディは描く）
  // ---------------------------------------------------------------------------
  if (state === 'dead' && frame === 1) {
    setPixel(buf, S, cx2,     cy2 - 9,  hexToRGBA('#aaaaaa', 180));
    setPixel(buf, S, cx2 - 1, cy2 - 10, hexToRGBA('#888888', 150));
    setPixel(buf, S, cx2 + 1, cy2 - 10, hexToRGBA('#888888', 150));
    setPixel(buf, S, cx2,     cy2 - 11, hexToRGBA('#666666', 110));
    setPixel(buf, S, cx2 - 1, cy2 - 12, hexToRGBA('#555555', 80));
  }

  // ---------------------------------------------------------------------------
  // アンテナ 2本（ボディ上部左右）
  // dead 時は折れた色に
  // ---------------------------------------------------------------------------
  const antColor = (state === 'dead') ? hexToRGBA('#664444') : ANTENNA_COL;
  const antOutline = OUTLINE;
  // 左アンテナ: cx2-5 に基部、上に3px
  vLine(buf, S, cx2 - 5, cy2 - 9, 4, antOutline);   // 輪郭
  vLine(buf, S, cx2 - 4, cy2 - 9, 4, antColor);      // 本体
  setPixel(buf, S, cx2 - 4, cy2 - 10, antColor);      // 先端球
  // 右アンテナ
  vLine(buf, S, cx2 + 4, cy2 - 9, 4, antColor);
  vLine(buf, S, cx2 + 5, cy2 - 9, 4, antOutline);
  setPixel(buf, S, cx2 + 4, cy2 - 10, antColor);

  // ---------------------------------------------------------------------------
  // プロペラ翼（左右）
  // move: プロペラ角度を示す「ぼかし」— 位置は変えず色の明暗のみ変える
  // frame0: 通常, frame1: 少し明るい（回転感）
  // ---------------------------------------------------------------------------
  const propFrame1 = (state === 'move' && frame === 1);
  const propColorA = propFrame1 ? PROP_TIP  : PROP_BASE;
  const propColorB = propFrame1 ? PROP_BASE : PROP_TIP;
  const propHit    = state === 'hit';
  const propDeadDim = state === 'dead' ? hexToRGBA('#664444') : null;

  const leftWingX  = cx2 - 12;
  const rightWingX = cx2 + 7;
  const wingY      = cy2 - 1;  // 翼の Y 座標（固定）

  // 左翼（5×2px）
  if (propDeadDim) {
    fillRect(buf, S, leftWingX, wingY, 5, 2, propDeadDim);
  } else if (propHit) {
    fillRect(buf, S, leftWingX, wingY, 5, 2, hexToRGBA('#ff9999'));
  } else {
    fillRect(buf, S, leftWingX,     wingY, 3, 1, propColorA);
    fillRect(buf, S, leftWingX + 2, wingY + 1, 3, 1, propColorB);
    fillRect(buf, S, leftWingX,     wingY, 5, 2, { ...propColorA, a: 0 }); // noop sentinel
    // シンプルに: 前3px=A色, 後ろ2px=B色
    fillRect(buf, S, leftWingX,     wingY, 3, 2, propColorA);
    fillRect(buf, S, leftWingX + 3, wingY, 2, 2, propColorB);
  }
  setPixel(buf, S, leftWingX - 1,    wingY,     OUTLINE);
  setPixel(buf, S, leftWingX - 1,    wingY + 1, OUTLINE);
  setPixel(buf, S, leftWingX + 4,    wingY - 1, OUTLINE);

  // 右翼（5×2px）
  if (propDeadDim) {
    fillRect(buf, S, rightWingX, wingY, 5, 2, propDeadDim);
  } else if (propHit) {
    fillRect(buf, S, rightWingX, wingY, 5, 2, hexToRGBA('#ff9999'));
  } else {
    fillRect(buf, S, rightWingX,     wingY, 3, 2, propColorA);
    fillRect(buf, S, rightWingX + 3, wingY, 2, 2, propColorB);
  }
  setPixel(buf, S, rightWingX + 5, wingY,     OUTLINE);
  setPixel(buf, S, rightWingX + 5, wingY + 1, OUTLINE);
  setPixel(buf, S, rightWingX - 1, wingY - 1, OUTLINE);

  // ---------------------------------------------------------------------------
  // 円形ボディ（半径6px）
  // hit: ボディが赤みがかる（色変化のみ、形は不変）
  // ---------------------------------------------------------------------------
  const bodyMain = state === 'hit' ? hexToRGBA('#dd6666')
                  : state === 'dead' ? hexToRGBA('#557788')
                  : BODY_COLOR;
  const bodyMid  = state === 'hit' ? hexToRGBA('#bb4444')
                  : state === 'dead' ? hexToRGBA('#334455')
                  : BODY_MID;

  // ボディ外周（輪郭）
  drawCircleOutline(buf, S, cx2, cy2, 7, OUTLINE);
  // ボディ内側（半径6 = メイン色）
  fillCircle(buf, S, cx2, cy2, 6, bodyMain);
  // 下半分を少し暗く（立体感）
  for (let dy = 1; dy <= 6; dy++) {
    const hw = Math.floor(Math.sqrt(Math.max(0, 36 - dy * dy)));
    for (let dx = -hw; dx <= hw; dx++) {
      setPixel(buf, S, cx2 + dx, cy2 + dy, bodyMid);
    }
  }

  // ハイライト（上部左に明るい点2px）
  setPixel(buf, S, cx2 - 2, cy2 - 4, BODY_HI);
  setPixel(buf, S, cx2 - 3, cy2 - 3, BODY_HI);
  setPixel(buf, S, cx2 - 2, cy2 - 3, { ...BODY_HI, a: 160 });

  // ボディ中央帯（横ライン: 機械的ディテール）
  hLine(buf, S, cx2 - 4, cy2,     9, OUTLINE);
  hLine(buf, S, cx2 - 4, cy2 + 1, 9, { ...BODY_MID, a: 180 });

  // ---------------------------------------------------------------------------
  // levelup: 黄白色フラッシュ
  // ---------------------------------------------------------------------------
  if (state === 'levelup') {
    const flashAlpha = frame === 0 ? 180 : 90;
    fillCircle(buf, S, cx2, cy2, 6, hexToRGBA('#ffffcc', flashAlpha));
    drawCircleOutline(buf, S, cx2, cy2, 8, hexToRGBA('#ffee88', frame === 0 ? 180 : 100));
    setPixel(buf, S, cx2,     cy2 - 9, hexToRGBA('#ffff88', 200));
    setPixel(buf, S, cx2 - 8, cy2,     hexToRGBA('#ffff88', 180));
    setPixel(buf, S, cx2 + 8, cy2,     hexToRGBA('#ffff88', 180));
  }

  // ---------------------------------------------------------------------------
  // カメラ眼（方向に応じた位置）
  // attack frame0,1: 眼が赤く光る（色変化のみ）
  // attack frame2: 眼の周囲に閃光
  // ---------------------------------------------------------------------------
  const eyeOffX = dOff.dx * 3;
  const eyeOffY = dOff.dy * 3;
  const eyeX = cx2 + eyeOffX;
  const eyeY = cy2 + eyeOffY;

  const isAttackGlow = (state === 'attack' && frame <= 1);
  const eyeColor = state === 'hit'   ? hexToRGBA('#ff3333')
                 : isAttackGlow      ? hexToRGBA('#ff4400')
                 : isLv2             ? hexToRGBA('#44ffaa')
                 :                    hexToRGBA('#44ccff');

  // 眼のリング（外周）
  drawCircleOutline(buf, S, eyeX, eyeY, 3, OUTLINE);
  // 眼本体
  fillCircle(buf, S, eyeX, eyeY, 2, eyeColor);
  // 眼の輝き点
  const eyeGlint = state === 'hit' ? hexToRGBA('#ffaaaa') : hexToRGBA('#ffffff', 200);
  setPixel(buf, S, eyeX - 1, eyeY - 1, eyeGlint);

  // Lv2: 2つ目の眼（隣接位置に小さな眼）
  if (isLv2) {
    let eye2X: number, eye2Y: number;
    if (dir === 'down' || dir === 'up') {
      eye2X = cx2 + 3;
      eye2Y = cy2 + dOff.dy * 2;
    } else {
      eye2X = cx2 + dOff.dx * 2;
      eye2Y = cy2 + 3;
    }
    fillCircle(buf, S, eye2X, eye2Y, 2, eyeColor);
    setPixel(buf, S, eye2X - 1, eye2Y - 1, eyeGlint);
    drawCircleOutline(buf, S, eye2X, eye2Y, 2, OUTLINE);
  }

  // ---------------------------------------------------------------------------
  // attack: レーザービーム
  // frame0: 短いビーム(5px), frame1: 長いビーム(10px), frame2: 閃光
  // ---------------------------------------------------------------------------
  if (state === 'attack') {
    if (frame === 2) {
      // 閃光（眼の周囲）
      fillCircle(buf, S, eyeX, eyeY, 5, hexToRGBA('#ffffff', 180));
      fillCircle(buf, S, eyeX + dOff.dx * 4, eyeY + dOff.dy * 4, 3, hexToRGBA('#ffeeaa', 160));
    } else {
      const beamLen = frame === 0 ? 5 : 10;
      const beamCore  = hexToRGBA('#ffffff', 240);
      const beamInner = isLv2 ? hexToRGBA('#44ffaa', 220) : hexToRGBA('#44ccff', 220);
      const beamOuter = isLv2 ? hexToRGBA('#22aa66', 150) : hexToRGBA('#2299cc', 150);
      for (let i = 1; i <= beamLen; i++) {
        const bx = eyeX + dOff.dx * i;
        const by = eyeY + dOff.dy * i;
        setPixel(buf, S, bx, by, i <= 2 ? beamCore : beamInner);
        if (i >= 2 && i <= beamLen - 1) {
          setPixel(buf, S, bx + dOff.dy, by + dOff.dx, beamOuter);
          setPixel(buf, S, bx - dOff.dy, by - dOff.dx, beamOuter);
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
  // ---- パレット（明るく鮮やか）----
  const SHELL_BASE  = '#cc7744'; // 琥珀/赤茶
  const SHELL_HI    = '#ee9955'; // ハイライト
  const SHELL_SH    = '#aa5533'; // 影
  const SHELL_LV2   = '#dd4433'; // Lv2 甲羅
  const SHELL_HI_L2 = '#ff6655'; // Lv2 ハイライト
  const LEG_COL     = '#664422'; // 脚（濃い茶）
  const LAMP_BASE   = '#ff3300'; // ランプ基本色
  const LAMP_BRIGHT = '#ffaa00'; // ランプ明色

  const shellHex = isLv2 ? SHELL_LV2 : SHELL_BASE;
  const shellHiHex = isLv2 ? SHELL_HI_L2 : SHELL_HI;

  const shell   = hexToRGBA(shellHex);
  const shellHi = hexToRGBA(shellHiHex);
  const shellSh = hexToRGBA(SHELL_SH);
  const leg     = hexToRGBA(LEG_COL);

  // 固定中心座標（フレームで変えない → 点滅防止）
  const cx = 16;
  const cy = 17;

  // dead frame2: 爆発（全面描画して return）
  if (state === 'dead' && frame === 2) {
    fillCircle(buf, S, cx, cy, 11, hexToRGBA('#ff6600', 200));
    fillCircle(buf, S, cx, cy, 7,  hexToRGBA('#ffcc00', 230));
    fillCircle(buf, S, cx, cy, 3,  hexToRGBA('#ffffff', 255));
    return;
  }

  // hit: 甲羅が赤みがかる（形状は変えない）
  const shellColor = state === 'hit'
    ? hexToRGBA('#ee5544')
    : shell;
  const shellHiColor = state === 'hit'
    ? hexToRGBA('#ff8877')
    : shellHi;

  // ---- 方向別描画 ----
  if (dir === 'down') {
    // 正面：楕円甲羅 + 6本脚（左右に張り出し）

    // 脚（甲羅の下に描いて奥行き感）
    for (let i = 0; i < 3; i++) {
      const legBaseY = cy - 1 + i * 2;
      // move 時だけ奇数/偶数の脚で1px動かす（胴体は動かさない）
      const legOff = (state === 'move' && (frame % 2) === (i % 2)) ? 1 : 0;
      // 左脚
      hLine(buf, S, cx - 13, legBaseY + legOff, 5, leg);
      setPixel(buf, S, cx - 13, legBaseY + legOff + 1, BLACK);
      setPixel(buf, S, cx - 9,  legBaseY + legOff + 1, BLACK);
      // 右脚
      hLine(buf, S, cx + 8, legBaseY + legOff, 5, leg);
      setPixel(buf, S, cx + 8,  legBaseY + legOff + 1, BLACK);
      setPixel(buf, S, cx + 12, legBaseY + legOff + 1, BLACK);
    }

    // 甲羅（楕円）
    fillEllipse(buf, S, cx, cy, 8, 6, shellColor);

    // ハイライト（上部2行）
    for (let dy = -5; dy <= -3; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 6) ** 2)));
      hLine(buf, S, cx - hw + 1, cy + dy, hw * 2 - 1, shellHiColor);
    }
    // 影（下部）
    for (let dy = 3; dy <= 6; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 6) ** 2)));
      hLine(buf, S, cx - hw + 1, cy + dy, hw * 2 - 1, shellSh);
    }

    // アウトライン
    for (let dy = -6; dy <= 6; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 6) ** 2)));
      setPixel(buf, S, cx - hw, cy + dy, BLACK);
      setPixel(buf, S, cx + hw, cy + dy, BLACK);
    }
    hLine(buf, S, cx - 7, cy - 6, 15, BLACK);
    hLine(buf, S, cx - 7, cy + 6, 15, BLACK);

    // 爆弾ランプ（甲羅中央）
    drawLamps(buf, S, cx, cy, state, frame, isLv2, LAMP_BASE, LAMP_BRIGHT);

  } else if (dir === 'up') {
    // 背面：甲羅が見える（ランプ目立つ）

    // 脚
    for (let i = 0; i < 3; i++) {
      const legBaseY = cy - 1 + i * 2;
      const legOff = (state === 'move' && (frame % 2) === (i % 2)) ? 1 : 0;
      hLine(buf, S, cx - 13, legBaseY + legOff, 5, leg);
      setPixel(buf, S, cx - 13, legBaseY + legOff + 1, BLACK);
      setPixel(buf, S, cx - 9,  legBaseY + legOff + 1, BLACK);
      hLine(buf, S, cx + 8, legBaseY + legOff, 5, leg);
      setPixel(buf, S, cx + 8,  legBaseY + legOff + 1, BLACK);
      setPixel(buf, S, cx + 12, legBaseY + legOff + 1, BLACK);
    }

    // 甲羅
    fillEllipse(buf, S, cx, cy, 8, 6, shellColor);

    // 背面はやや暗め（影多め）
    for (let dy = -6; dy <= 0; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 6) ** 2)));
      hLine(buf, S, cx - hw + 1, cy + dy, hw * 2 - 1, shellSh);
    }
    // 上部に薄いハイライト
    for (let dy = -5; dy <= -4; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 6) ** 2)));
      hLine(buf, S, cx - hw + 2, cy + dy, hw * 2 - 3, shellHiColor);
    }

    // アウトライン
    for (let dy = -6; dy <= 6; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 6) ** 2)));
      setPixel(buf, S, cx - hw, cy + dy, BLACK);
      setPixel(buf, S, cx + hw, cy + dy, BLACK);
    }
    hLine(buf, S, cx - 7, cy - 6, 15, BLACK);
    hLine(buf, S, cx - 7, cy + 6, 15, BLACK);

    // ランプ（背面でよく見える）
    drawLamps(buf, S, cx, cy, state, frame, isLv2, LAMP_BASE, LAMP_BRIGHT);

  } else {
    // left / right: 側面

    const flipX = dir === 'right' ? 1 : -1;

    // 3本脚（下側）
    for (let i = 0; i < 3; i++) {
      const legX = cx - 4 + i * 4;
      const legOff = (state === 'move' && (frame % 2) === (i % 2)) ? 1 : 0;
      vLine(buf, S, legX, cy + 5, 4 + legOff, leg);
      setPixel(buf, S, legX - 1, cy + 8 + legOff, BLACK);
      setPixel(buf, S, legX + 1, cy + 8 + legOff, BLACK);
    }

    // 胴体（横長楕円）
    fillEllipse(buf, S, cx, cy, 8, 5, shellColor);

    // ハイライト（上部）
    for (let dy = -4; dy <= -2; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 5) ** 2)));
      hLine(buf, S, cx - hw + 1, cy + dy, hw * 2 - 1, shellHiColor);
    }
    // 影（下部）
    for (let dy = 2; dy <= 4; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 5) ** 2)));
      hLine(buf, S, cx - hw + 1, cy + dy, hw * 2 - 1, shellSh);
    }

    // アウトライン
    for (let dy = -5; dy <= 5; dy++) {
      const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - (dy / 5) ** 2)));
      setPixel(buf, S, cx - hw, cy + dy, BLACK);
      setPixel(buf, S, cx + hw, cy + dy, BLACK);
    }
    hLine(buf, S, cx - 7, cy - 5, 15, BLACK);
    hLine(buf, S, cx - 7, cy + 5, 15, BLACK);

    // 頭部（向いている方向の端に小さな突起）
    const headX = cx + flipX * 8;
    fillCircle(buf, S, headX, cy, 3, shellHiColor);
    setPixel(buf, S, headX + flipX, cy - 1, shellColor);
    setPixel(buf, S, headX + flipX, cy,     shellColor);
    // 目（小さな赤点）
    setPixel(buf, S, headX + flipX * 2, cy, hexToRGBA('#ff4400'));
    // 頭部輪郭
    drawCircleOutline(buf, S, headX, cy, 3, BLACK);

    // ランプ（甲羅上）
    drawLamps(buf, S, cx, cy - 1, state, frame, isLv2, LAMP_BASE, LAMP_BRIGHT);
  }

  // dead frame0: 甲羅にひび割れ線（黒線2本）
  if (state === 'dead' && frame === 0) {
    drawLine(buf, S, cx - 2, cy - 5, cx + 3, cy + 5, BLACK);
    drawLine(buf, S, cx + 2, cy - 4, cx - 3, cy + 4, BLACK);
  }
  // dead frame1: 煙（半透明灰円）
  if (state === 'dead' && frame === 1) {
    fillCircle(buf, S, cx - 2, cy - 3, 3, hexToRGBA('#aaaaaa', 160));
    fillCircle(buf, S, cx + 3, cy - 4, 2, hexToRGBA('#cccccc', 140));
    fillCircle(buf, S, cx,     cy - 2, 4, hexToRGBA('#888888', 120));
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
  // ランプ色の決定（色変化のみ、形状・位置は変えない）
  const lampColor =
    state === 'dead'                   ? hexToRGBA('#552200') :
    state === 'hit'                    ? hexToRGBA('#cc4400') :
    state === 'attack' && frame === 0  ? hexToRGBA(lampBaseHex) :
    state === 'attack' && frame === 1  ? hexToRGBA(lampBrightHex) :
    state === 'attack' && frame === 2  ? hexToRGBA('#ffdd00') :
    state === 'levelup' && frame === 0 ? hexToRGBA('#ffdd00') :
    state === 'levelup' && frame === 1 ? hexToRGBA('#ffff88') :
    hexToRGBA(lampBaseHex);

  // 内部光の色（明るさのみ変わる）
  const innerColor =
    state === 'dead'                   ? hexToRGBA('#aa3300', 180) :
    state === 'attack' && frame === 1  ? hexToRGBA('#ffffff', 240) :
    state === 'attack' && frame === 2  ? hexToRGBA('#ffffff', 200) :
    state === 'levelup'                ? hexToRGBA('#ffffff', 220) :
    hexToRGBA('#ffeecc', 200);

  // ランプの外枠（黒）→ 本体 → 内部光の順に描く
  const drawOneLamp = (lx: number, ly: number) => {
    fillCircle(buf, S, lx, ly, 3, BLACK);         // 黒縁
    fillCircle(buf, S, lx, ly, 2, lampColor);      // ランプ本体
    setPixel(buf, S, lx - 1, ly - 1, innerColor); // 内部光（左上1px）
  };

  if (isLv2) {
    // Lv2: ランプ2個（左右対称）
    drawOneLamp(cx - 3, cy);
    drawOneLamp(cx + 3, cy);
  } else {
    // Lv1: ランプ1個（中央）
    drawOneLamp(cx, cy);
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
  // ---------------------------------------------------------------------------
  // パレット（明るく鮮やかな青灰色系）
  // Lv1: 明るい青灰色ボディ  Lv2: より青く明るいボディ＋肩当て追加
  // ---------------------------------------------------------------------------
  const OUTLINE    = hexToRGBA('#112233');
  const BODY_COLOR = isLv2 ? hexToRGBA('#4477cc') : hexToRGBA('#6699bb');
  const BODY_HI    = isLv2 ? hexToRGBA('#66aaee') : hexToRGBA('#88bbdd');
  const BODY_SH    = isLv2 ? hexToRGBA('#2255aa') : hexToRGBA('#3366aa');
  const SHIELD_COL = isLv2 ? hexToRGBA('#cceeff') : hexToRGBA('#aaccdd');
  const SHIELD_HI  = isLv2 ? hexToRGBA('#eeffff') : hexToRGBA('#cce8f0');
  const BATON_COL  = hexToRGBA('#ffdd00');
  const BATON_HI   = hexToRGBA('#ffff88');
  const BOLT_COL   = hexToRGBA('#ffee44', 230);
  const ARMOR_COL  = isLv2 ? hexToRGBA('#3366bb') : hexToRGBA('#5588aa');
  const ARMOR_HI   = isLv2 ? hexToRGBA('#55aaee') : hexToRGBA('#77aacc');
  const LEG_COL    = isLv2 ? hexToRGBA('#2255aa') : hexToRGBA('#3366aa');
  const FOOT_COL   = isLv2 ? hexToRGBA('#1144aa') : hexToRGBA('#224466');

  const isHit     = state === 'hit';
  const isDead    = state === 'dead';
  const isAttack  = state === 'attack';
  const isLevelup = state === 'levelup';

  // hit: 色変化のみ（形状変化なし）
  const bodyC  = isHit ? hexToRGBA('#cc5566') : BODY_COLOR;
  const bodyHi = isHit ? hexToRGBA('#ee7788') : BODY_HI;
  const bodySh = isHit ? hexToRGBA('#993344') : BODY_SH;

  // ---------------------------------------------------------------------------
  // 固定座標（全フレームで共通。ボディ位置は動かさない）
  // ---------------------------------------------------------------------------
  const cx      = 16;
  const headTop =  5;
  const bodyTop = 12;
  const legTop  = bodyTop + 11;

  // ---------------------------------------------------------------------------
  // 目の色
  // ---------------------------------------------------------------------------
  const eyeColor =
    isDead      ? OUTLINE :
    isHit       ? hexToRGBA('#ff2200') :
    isAttack    ? hexToRGBA('#ff4400') :
    isLevelup   ? hexToRGBA('#ffffff', frame === 0 ? 255 : 200) :
                  hexToRGBA('#ff8800');
  const eyeGlow =
    isLevelup   ? hexToRGBA('#ffffff', frame === 0 ? 200 : 120) :
    isAttack    ? hexToRGBA('#ffaa00', 180) :
                  hexToRGBA('#ffcc00', 160);

  // ---------------------------------------------------------------------------
  // 内部ヘルパー: 盾
  // ---------------------------------------------------------------------------
  const drawShield = (sx: number, sy: number): void => {
    const sw = isLv2 ? 5 : 4;
    const sh = isLv2 ? 8 : 7;
    const sColor = isHit ? hexToRGBA('#aaddff') : SHIELD_COL;
    fillRect(buf, S, sx, sy, sw, sh, sColor);
    vLine(buf, S, sx,      sy, sh,     SHIELD_HI);
    hLine(buf, S, sx,      sy, sw,     SHIELD_HI);
    hLine(buf, S, sx,      sy,      sw,     OUTLINE);
    hLine(buf, S, sx,      sy + sh, sw,     OUTLINE);
    vLine(buf, S, sx,      sy,      sh + 1, OUTLINE);
    vLine(buf, S, sx + sw, sy,      sh + 1, OUTLINE);
  };

  // ---------------------------------------------------------------------------
  // 内部ヘルパー: バトン（縦持ち）
  // ---------------------------------------------------------------------------
  const drawBatonVertical = (bx: number, by: number, len: number): void => {
    fillRect(buf, S, bx, by, 2, len, BATON_COL);
    vLine(buf, S, bx, by, len, BATON_HI);
    fillRect(buf, S, bx - 1, by + len - 1, 4, 2, hexToRGBA('#ffbb00'));
    hLine(buf, S, bx - 1, by + len + 1, 4, OUTLINE);
    vLine(buf, S, bx - 1, by,           len + 2, OUTLINE);
    vLine(buf, S, bx + 2, by,           len + 2, OUTLINE);
    hLine(buf, S, bx - 1, by,           4, OUTLINE);
    if (isLevelup) {
      fillRect(buf, S, bx, by, 2, len, hexToRGBA('#ffffff', frame === 0 ? 180 : 100));
    }
  };

  // ---------------------------------------------------------------------------
  // 内部ヘルパー: バトン（横持ち）
  // ---------------------------------------------------------------------------
  const drawBatonHorizontal = (bx: number, by: number, len: number): void => {
    fillRect(buf, S, bx, by, len, 2, BATON_COL);
    hLine(buf, S, bx, by, len, BATON_HI);
    fillRect(buf, S, bx + len - 1, by - 1, 2, 4, hexToRGBA('#ffbb00'));
    hLine(buf, S, bx - 1, by - 1,       len + 3, OUTLINE);
    hLine(buf, S, bx - 1, by + 2,       len + 3, OUTLINE);
    vLine(buf, S, bx - 1, by - 1,       4, OUTLINE);
    vLine(buf, S, bx + len + 1, by - 1, 4, OUTLINE);
    if (isLevelup) {
      fillRect(buf, S, bx, by, len, 2, hexToRGBA('#ffffff', frame === 0 ? 180 : 100));
    }
  };

  // ---------------------------------------------------------------------------
  // dead アニメーション: ボディを傾けて横倒しに見せる
  // frame0=少し右傾き, frame1=大きく傾き, frame2=ほぼ横倒し
  // ボディ全体を描いた後にオーバーレイで暗くする方式
  // ---------------------------------------------------------------------------
  if (isDead) {
    // dead frame2: 完全倒壊（横倒し状態をラスタ描画）
    // ロボを横向きに描く（頭が右、足が左）
    const tiltY = frame === 0 ? 1 : frame === 1 ? 3 : 6;
    const tiltX = frame === 0 ? 1 : frame === 1 ? 3 : 5;

    // 暗くなったボディ色（死亡）。元色より20〜30%暗くして視認性を保つ
    const deadBodyC  = isLv2 ? hexToRGBA('#2255aa', 230) : hexToRGBA('#4477aa', 230);
    const deadBodySh = hexToRGBA('#223355', 200);

    // ボディ（傾きで描画）
    for (let row = 0; row < 11; row++) {
      const tiltRow = Math.round(row * tiltY / 10);
      const colShift = Math.round(row * tiltX / 10);
      fillRect(buf, S, cx - 5 + colShift, bodyTop + row + tiltRow, 10, 1, deadBodyC);
    }
    // ボディ輪郭
    hLine(buf, S, cx - 5, bodyTop, 10, OUTLINE);
    hLine(buf, S, cx - 5 + tiltX, bodyTop + 10 + tiltY, 10, OUTLINE);
    vLine(buf, S, cx - 5, bodyTop, 11, OUTLINE);
    vLine(buf, S, cx + 4, bodyTop, 4, OUTLINE);

    // 頭部（ボディの上 = dead では右側へ）
    for (let row = 0; row < 7; row++) {
      const tiltRow = Math.round(row * tiltY / 10);
      const colShift = Math.round(row * tiltX / 10) + tiltX;
      fillRect(buf, S, cx - 4 + colShift, headTop + row + tiltRow + tiltY, 8, 1, deadBodyC);
    }
    hLine(buf, S, cx - 4 + tiltX, headTop + tiltY, 8, OUTLINE);
    vLine(buf, S, cx - 4 + tiltX, headTop + tiltY, 7, OUTLINE);
    vLine(buf, S, cx + 3 + tiltX, headTop + tiltY, 7, OUTLINE);
    hLine(buf, S, cx - 4 + tiltX + Math.round(tiltX / 2), headTop + 7 + tiltY, 8, OUTLINE);

    // 目がバツ印（頭の中央付近）
    if (frame >= 1) {
      const ex = cx - 2 + tiltX;
      const ey = headTop + 2 + tiltY;
      setPixel(buf, S, ex,     ey,     OUTLINE);
      setPixel(buf, S, ex + 1, ey + 1, OUTLINE);
      setPixel(buf, S, ex + 2, ey + 2, OUTLINE);
      setPixel(buf, S, ex + 2, ey,     OUTLINE);
      setPixel(buf, S, ex + 1, ey + 1, OUTLINE);
      setPixel(buf, S, ex,     ey + 2, OUTLINE);
    }

    // 脚（倒れて短くなる）
    if (frame === 0) {
      fillRect(buf, S, cx - 5, legTop, 3, 5, LEG_COL);
      fillRect(buf, S, cx + 2, legTop, 3, 5, LEG_COL);
      fillRect(buf, S, cx - 6, legTop + 4, 4, 2, FOOT_COL);
      fillRect(buf, S, cx + 2, legTop + 4, 4, 2, FOOT_COL);
    } else if (frame === 1) {
      fillRect(buf, S, cx - 4, legTop + 2, 3, 3, LEG_COL);
      fillRect(buf, S, cx + 2, legTop + 1, 3, 3, LEG_COL);
    }
    // frame2 では脚は描かない（完全倒壊）

    return;
  }

  // ---------------------------------------------------------------------------
  // 通常描画（idle / move / attack / hit / levelup）
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // 1. 脚（ボディより先に描く）
  // move: 左右の脚の高さを1px交互にずらす（バウンドの代わり）
  // ---------------------------------------------------------------------------
  const isMove = state === 'move';
  // moveフレーム間で脚の高さを1pxだけ交互にずらす（ボディ固定・脚のみ動く）
  const legH0 = isMove ? (frame === 0 ? 6 : 5) : 5;
  const legH1 = isMove ? (frame === 0 ? 5 : 6) : 5;

  // 左脚
  fillRect(buf, S, cx - 5, legTop, 3, legH0, LEG_COL);
  fillRect(buf, S, cx - 6, legTop + legH0 - 1, 4, 2, FOOT_COL);
  hLine(buf, S, cx - 6, legTop + legH0 + 1, 4, OUTLINE);
  vLine(buf, S, cx - 6, legTop,             legH0 + 2, OUTLINE);
  vLine(buf, S, cx - 3, legTop,             legH0 + 2, OUTLINE);

  // 右脚
  fillRect(buf, S, cx + 2, legTop, 3, legH1, LEG_COL);
  fillRect(buf, S, cx + 2, legTop + legH1 - 1, 4, 2, FOOT_COL);
  hLine(buf, S, cx + 2, legTop + legH1 + 1, 4, OUTLINE);
  vLine(buf, S, cx + 2, legTop,             legH1 + 2, OUTLINE);
  vLine(buf, S, cx + 5, legTop,             legH1 + 2, OUTLINE);

  // ---------------------------------------------------------------------------
  // 2. ボディ（10x11）固定位置
  // ---------------------------------------------------------------------------
  fillRect(buf, S, cx - 5, bodyTop, 10, 11, bodyC);
  hLine(buf, S, cx - 5, bodyTop,      10, bodyHi);
  vLine(buf, S, cx - 5, bodyTop,      11, bodyHi);
  vLine(buf, S, cx + 4, bodyTop,      11, bodySh);
  hLine(buf, S, cx - 5, bodyTop + 10, 10, bodySh);
  // 装甲パネル区切り線
  hLine(buf, S, cx - 4, bodyTop + 5,  8, bodySh);
  // アウトライン
  hLine(buf, S, cx - 5, bodyTop,      10, OUTLINE);
  hLine(buf, S, cx - 5, bodyTop + 11, 10, OUTLINE);
  vLine(buf, S, cx - 5, bodyTop,      12, OUTLINE);
  vLine(buf, S, cx + 4, bodyTop,      12, OUTLINE);

  // Lv2: 肩当て
  if (isLv2) {
    // 左肩当て
    fillRect(buf, S, cx - 8, bodyTop, 3, 4, ARMOR_COL);
    hLine(buf, S, cx - 8, bodyTop,     3, ARMOR_HI);
    hLine(buf, S, cx - 8, bodyTop,     3, OUTLINE);
    hLine(buf, S, cx - 8, bodyTop + 4, 3, OUTLINE);
    vLine(buf, S, cx - 8, bodyTop,     5, OUTLINE);
    vLine(buf, S, cx - 6, bodyTop,     5, OUTLINE);
    // 右肩当て
    fillRect(buf, S, cx + 5, bodyTop, 3, 4, ARMOR_COL);
    hLine(buf, S, cx + 5, bodyTop,     3, ARMOR_HI);
    hLine(buf, S, cx + 5, bodyTop,     3, OUTLINE);
    hLine(buf, S, cx + 5, bodyTop + 4, 3, OUTLINE);
    vLine(buf, S, cx + 5, bodyTop,     5, OUTLINE);
    vLine(buf, S, cx + 7, bodyTop,     5, OUTLINE);
  }

  // ---------------------------------------------------------------------------
  // 3. 頭部（8x7）固定位置
  // ---------------------------------------------------------------------------
  fillRect(buf, S, cx - 4, headTop, 8, 7, bodyC);
  hLine(buf, S, cx - 4, headTop,     8, bodyHi);
  vLine(buf, S, cx - 4, headTop,     7, bodyHi);
  vLine(buf, S, cx + 3, headTop,     7, bodySh);
  hLine(buf, S, cx - 4, headTop + 6, 8, bodySh);
  // アウトライン
  hLine(buf, S, cx - 4, headTop,     8, OUTLINE);
  vLine(buf, S, cx - 4, headTop,     7, OUTLINE);
  vLine(buf, S, cx + 3, headTop,     7, OUTLINE);
  hLine(buf, S, cx - 4, headTop + 7, 8, OUTLINE);

  // アンテナ（頭頂）
  setPixel(buf, S, cx - 1, headTop - 1, BODY_HI);
  setPixel(buf, S, cx - 1, headTop - 2, OUTLINE);
  setPixel(buf, S, cx + 1, headTop - 1, BODY_HI);
  setPixel(buf, S, cx + 1, headTop - 2, OUTLINE);

  // 目（方向別・固定位置）
  if (dir === 'down') {
    fillRect(buf, S, cx - 3, headTop + 3, 2, 2, eyeColor);
    fillRect(buf, S, cx + 1, headTop + 3, 2, 2, eyeColor);
    setPixel(buf, S, cx - 3, headTop + 3, eyeGlow);
    setPixel(buf, S, cx + 1, headTop + 3, eyeGlow);
  } else if (dir === 'up') {
    // 背面: 目はほぼ見えないが後頭部にわずかに反映
    setPixel(buf, S, cx - 2, headTop + 3, BODY_SH);
    setPixel(buf, S, cx + 1, headTop + 3, BODY_SH);
  } else if (dir === 'left') {
    fillRect(buf, S, cx - 3, headTop + 3, 2, 2, eyeColor);
    setPixel(buf, S, cx - 3, headTop + 3, eyeGlow);
  } else {
    fillRect(buf, S, cx + 1, headTop + 3, 2, 2, eyeColor);
    setPixel(buf, S, cx + 2, headTop + 3, eyeGlow);
  }

  // ---------------------------------------------------------------------------
  // 4. 武器・盾（方向別）
  // 攻撃時はバトンを前方に突き出す（frame1のみ +2px）
  // 形状変化は武器のみ、ボディ・頭部は変化なし
  // ---------------------------------------------------------------------------
  const attackPush = isAttack && frame === 1 ? 2 : 0;

  if (dir === 'down') {
    // 正面: 左腕=盾（左側）、右腕=バトン（右側・下向き）
    drawShield(cx - 11, bodyTop + 1);
    const batonLen = 7 + attackPush;
    drawBatonVertical(cx + 6, bodyTop + 1, batonLen);
    // 電撃エフェクト（attack時のみ・バトン先端）
    if (isAttack) {
      const tipY = bodyTop + 1 + batonLen + 2;
      setPixel(buf, S, cx + 5, tipY,     BOLT_COL);
      setPixel(buf, S, cx + 7, tipY,     BOLT_COL);
      setPixel(buf, S, cx + 6, tipY + 1, BOLT_COL);
      if (frame === 1) {
        setPixel(buf, S, cx + 5, tipY + 2, BOLT_COL);
        setPixel(buf, S, cx + 7, tipY + 2, BOLT_COL);
        setPixel(buf, S, cx + 6, tipY + 3, BOLT_COL);
      }
    }

  } else if (dir === 'up') {
    // 背面: 盾とバトンが後ろ側（半透明で見える）
    const sw = isLv2 ? 5 : 4;
    const sh = isLv2 ? 8 : 7;
    fillRect(buf, S, cx - 10, bodyTop + 2, sw, sh, hexToRGBA('#6688aa', 200));
    hLine(buf, S, cx - 10, bodyTop + 2,      sw, OUTLINE);
    hLine(buf, S, cx - 10, bodyTop + 2 + sh, sw, OUTLINE);
    vLine(buf, S, cx - 10, bodyTop + 2,      sh + 1, OUTLINE);
    vLine(buf, S, cx - 10 + sw, bodyTop + 2, sh + 1, OUTLINE);
    fillRect(buf, S, cx + 6, bodyTop + 2, 2, 6, hexToRGBA('#ccaa00'));
    vLine(buf, S, cx + 5, bodyTop + 2, 6, OUTLINE);
    vLine(buf, S, cx + 7, bodyTop + 2, 6, OUTLINE);

  } else if (dir === 'left') {
    // 左向き: 盾が前（左側）、バトンが後ろ（右側）
    const shieldPush = isAttack && frame === 1 ? 2 : 0;
    drawShield(cx - 11 - shieldPush, bodyTop + 1);
    // バトン（後ろ側: 右、暗い黄色）
    fillRect(buf, S, cx + 5, bodyTop + 3, 2, 5, hexToRGBA('#ccaa00'));
    vLine(buf, S, cx + 4, bodyTop + 3, 5, OUTLINE);
    vLine(buf, S, cx + 6, bodyTop + 3, 5, OUTLINE);
    // 電撃（attack時: 盾の左端）
    if (isAttack) {
      const boltX = cx - 11 - shieldPush - 1;
      setPixel(buf, S, boltX,     bodyTop + 3, BOLT_COL);
      setPixel(buf, S, boltX - 1, bodyTop + 4, BOLT_COL);
      setPixel(buf, S, boltX,     bodyTop + 5, BOLT_COL);
      if (frame === 1) {
        setPixel(buf, S, boltX - 2, bodyTop + 3, BOLT_COL);
        setPixel(buf, S, boltX - 2, bodyTop + 5, BOLT_COL);
        setPixel(buf, S, boltX - 3, bodyTop + 4, BOLT_COL);
      }
    }

  } else {
    // right: バトンが前（右側・横向き）、盾が後ろ（左側）
    const sw = isLv2 ? 5 : 4;
    const sh = isLv2 ? 8 : 7;
    fillRect(buf, S, cx - 9, bodyTop + 2, sw, sh, hexToRGBA('#6688aa', 200));
    hLine(buf, S, cx - 9, bodyTop + 2,      sw, OUTLINE);
    hLine(buf, S, cx - 9, bodyTop + 2 + sh, sw, OUTLINE);
    vLine(buf, S, cx - 9, bodyTop + 2,      sh + 1, OUTLINE);
    vLine(buf, S, cx - 9 + sw, bodyTop + 2, sh + 1, OUTLINE);
    // バトン（横向き: 右に突き出す）
    const batonLen = 6 + attackPush;
    drawBatonHorizontal(cx + 5, bodyTop + 3, batonLen);
    // 電撃（バトン右端）
    if (isAttack) {
      const boltX = cx + 5 + batonLen + 2;
      setPixel(buf, S, boltX,     bodyTop + 2, BOLT_COL);
      setPixel(buf, S, boltX + 1, bodyTop + 4, BOLT_COL);
      setPixel(buf, S, boltX,     bodyTop + 5, BOLT_COL);
      if (frame === 1) {
        setPixel(buf, S, boltX + 2, bodyTop + 2, BOLT_COL);
        setPixel(buf, S, boltX + 2, bodyTop + 5, BOLT_COL);
        setPixel(buf, S, boltX + 3, bodyTop + 4, BOLT_COL);
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
