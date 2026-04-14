/**
 * generate-mach-runner-sprites.js
 * マッハランナー（mach_runner）ボス敵スプライト生成スクリプト。
 * 流線型低姿勢メカ。電気ブルー+シルバーボディ、黄橙ロケットスラスター、赤バイザー目。
 *
 * 実行: node scripts/generate-mach-runner-sprites.js
 */

'use strict';

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const S = 32; // スプライトサイズ 32x32

const SPRITES_DIR = path.join(__dirname, '..', 'public', 'sprites', 'enemies');

// ---------------------------------------------------------------------------
// パレット（16色以内）
// ---------------------------------------------------------------------------

// 電気ブルー系
const C_BODY_DARK   = { r: 20,  g: 60,  b: 140, a: 255 }; // 濃紺
const C_BODY_MID    = { r: 40,  g: 120, b: 210, a: 255 }; // 電気ブルー本体
const C_BODY_LIGHT  = { r: 100, g: 180, b: 255, a: 255 }; // ハイライトブルー
const C_BODY_GLOW   = { r: 160, g: 220, b: 255, a: 255 }; // グロウ

// シルバー系
const C_SILVER_DARK = { r: 80,  g: 90,  b: 100, a: 255 }; // 暗シルバー
const C_SILVER      = { r: 160, g: 175, b: 185, a: 255 }; // シルバー
const C_SILVER_HI   = { r: 220, g: 230, b: 235, a: 255 }; // シルバーハイライト

// ロケットスラスター（黄橙）
const C_THRUSTER    = { r: 255, g: 140, b: 20,  a: 255 }; // 黄橙
const C_EXHAUST     = { r: 255, g: 200, b: 60,  a: 255 }; // 排気炎
const C_EXHAUST2    = { r: 255, g: 80,  b: 20,  a: 200 }; // 排気炎濃

// 赤バイザー
const C_VISOR       = { r: 220, g: 30,  b: 30,  a: 255 }; // 赤バイザー
const C_VISOR_HI    = { r: 255, g: 100, b: 80,  a: 255 }; // バイザーハイライト

// エフェクト
const C_ICE         = { r: 150, g: 220, b: 255, a: 255 }; // 氷ビーム
const C_ICE_DARK    = { r: 80,  g: 160, b: 220, a: 255 }; // 氷ビーム濃
const C_SPARK       = { r: 255, g: 255, b: 200, a: 255 }; // 火花
const C_SPARK2      = { r: 255, g: 180, b: 0,   a: 255 }; // 火花橙

// 共通
const C_BLACK       = { r: 0,   g: 0,   b: 0,   a: 255 }; // 黒アウトライン
const C_WHITE       = { r: 255, g: 255, b: 255, a: 255 }; // 白
const C_TRANS       = { r: 0,   g: 0,   b: 0,   a: 0   }; // 透明

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function createBuffer() {
  return new Uint8Array(S * S * 4); // 全透明で初期化
}

function setPixel(buf, x, y, c) {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  const idx = (y * S + x) * 4;
  buf[idx]     = c.r;
  buf[idx + 1] = c.g;
  buf[idx + 2] = c.b;
  buf[idx + 3] = c.a;
}

function fillRect(buf, x, y, w, h, c) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(buf, x + dx, y + dy, c);
}

function hLine(buf, x, y, len, c) {
  for (let i = 0; i < len; i++) setPixel(buf, x + i, y, c);
}

function vLine(buf, x, y, len, c) {
  for (let i = 0; i < len; i++) setPixel(buf, x, y + i, c);
}

function fillCircle(buf, cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r)
        setPixel(buf, cx + dx, cy + dy, c);
}

function drawLine(buf, x1, y1, x2, y2, c) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  if (steps === 0) { setPixel(buf, x1, y1, c); return; }
  for (let s = 0; s <= steps; s++) {
    setPixel(buf, Math.round(x1 + (x2 - x1) * s / steps), Math.round(y1 + (y2 - y1) * s / steps), c);
  }
}

/** 左右反転バッファを作成 */
function flipHorizontal(src) {
  const dst = new Uint8Array(src.length);
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

async function savePNG(buf, filePath) {
  await sharp(Buffer.from(buf), { raw: { width: S, height: S, channels: 4 } })
    .png()
    .toFile(filePath);
}

// ---------------------------------------------------------------------------
// 描画ヘルパー
// ---------------------------------------------------------------------------

/**
 * スラスター噴射炎を描画
 * @param {Uint8Array} buf
 * @param {number} x   噴射口X
 * @param {number} y   噴射口Y
 * @param {string} dir 'left'=左向き噴射, 'right'=右向き噴射, 'down'=下向き, 'up'=上向き
 * @param {boolean} boosted  強噴射（move frame1）
 */
function drawThruster(buf, x, y, dir, boosted) {
  const len = boosted ? 5 : 3;
  const spread = boosted ? 2 : 1;
  if (dir === 'left') {
    // 右側が噴射口（左向き移動なので右から噴出）
    for (let i = 0; i < len; i++) {
      const frac = i / (len - 1);
      const col = i < 2 ? C_EXHAUST : C_EXHAUST2;
      setPixel(buf, x + i + 1, y, col);
      if (spread >= 1 && i < len - 1) {
        setPixel(buf, x + i + 1, y - 1, { ...C_EXHAUST2, a: 180 });
        setPixel(buf, x + i + 1, y + 1, { ...C_EXHAUST2, a: 180 });
      }
    }
  } else if (dir === 'right') {
    for (let i = 0; i < len; i++) {
      const col = i < 2 ? C_EXHAUST : C_EXHAUST2;
      setPixel(buf, x - i - 1, y, col);
      if (spread >= 1 && i < len - 1) {
        setPixel(buf, x - i - 1, y - 1, { ...C_EXHAUST2, a: 180 });
        setPixel(buf, x - i - 1, y + 1, { ...C_EXHAUST2, a: 180 });
      }
    }
  } else if (dir === 'down') {
    // 上向きに噴射（下向き走行の背面）
    for (let i = 0; i < len; i++) {
      const col = i < 2 ? C_EXHAUST : C_EXHAUST2;
      setPixel(buf, x, y - i - 1, col);
      if (spread >= 1 && i < len - 1) {
        setPixel(buf, x - 1, y - i - 1, { ...C_EXHAUST2, a: 180 });
        setPixel(buf, x + 1, y - i - 1, { ...C_EXHAUST2, a: 180 });
      }
    }
  } else if (dir === 'up') {
    for (let i = 0; i < len; i++) {
      const col = i < 2 ? C_EXHAUST : C_EXHAUST2;
      setPixel(buf, x, y + i + 1, col);
      if (spread >= 1 && i < len - 1) {
        setPixel(buf, x - 1, y + i + 1, { ...C_EXHAUST2, a: 180 });
        setPixel(buf, x + 1, y + i + 1, { ...C_EXHAUST2, a: 180 });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// メインキャラクター描画関数
// ---------------------------------------------------------------------------

/**
 * mach_runner スプライト描画
 * キャラクター設定：
 *   流線型低姿勢メカ。横向き時は長細い胴体。
 *   正面(down)：顔（赤バイザー）が見える
 *   背面(up)：背中のスラスターが目立つ
 *   left/right：横向き（水平に長い胴）
 *
 * @param {Uint8Array} buf
 * @param {'down'|'up'|'left'|'right'} dir
 * @param {'move'|'atk'|'dmg'|'dead'} state
 * @param {number} frame
 */
function drawMachRunner(buf, dir, state, frame) {
  const isDmg  = state === 'dmg';
  const isDead = state === 'dead';
  const isAtk  = state === 'atk';
  const isMove = state === 'move';

  // 被ダメ時はシルバーを白フラッシュ
  const bodyColor  = isDmg ? C_WHITE       : C_BODY_MID;
  const silverCol  = isDmg ? C_WHITE       : C_SILVER;
  const bodyDark   = isDmg ? C_BODY_LIGHT  : C_BODY_DARK;

  // 方向別描画分岐
  if (dir === 'down') {
    drawDown(buf, state, frame, bodyColor, silverCol, bodyDark);
  } else if (dir === 'up') {
    drawUp(buf, state, frame, bodyColor, silverCol, bodyDark);
  } else if (dir === 'right') {
    drawRight(buf, state, frame, bodyColor, silverCol, bodyDark);
  }
  // left は right を左右反転して生成するため、ここでは呼ばない
}

// ---------------------------------------------------------------------------
// down（正面向き）
// ---------------------------------------------------------------------------

function drawDown(buf, state, frame, bodyColor, silverCol, bodyDark) {
  const isMove = state === 'move';
  const isAtk  = state === 'atk';
  const isDmg  = state === 'dmg';
  const isDead = state === 'dead';

  // バウンス（移動フレーム1でわずかに上）
  const bounceY = isMove && frame === 1 ? -1 : 0;

  // 撃破フレーム2：消滅（わずかな残骸のみ）
  if (isDead && frame === 2) {
    // 残骸の破片
    setPixel(buf, 13, 22, C_SILVER_DARK);
    setPixel(buf, 18, 24, C_SILVER_DARK);
    setPixel(buf, 10, 26, C_BODY_DARK);
    setPixel(buf, 22, 21, C_BODY_DARK);
    setPixel(buf, 15, 28, C_SILVER);
    return;
  }

  // 撃破フレーム0：爆発火花
  if (isDead && frame === 0) {
    // 本体を少し描く（傾いた状態）
    _drawDownBody(buf, 16 + 2, 18 + bounceY, bodyColor, silverCol, bodyDark, false, false, false, false);
    // 火花
    setPixel(buf, 10, 13, C_SPARK);
    setPixel(buf, 22, 11, C_SPARK);
    setPixel(buf, 16, 9,  C_SPARK2);
    setPixel(buf, 8,  17, C_SPARK2);
    setPixel(buf, 25, 15, C_SPARK);
    setPixel(buf, 19, 10, C_SPARK2);
    // 爆発円
    fillCircle(buf, 16, 15, 4, { r: 255, g: 140, b: 30, a: 140 });
    return;
  }

  // 撃破フレーム1：分解
  if (isDead && frame === 1) {
    // 上半分が離れている
    _drawDownBody(buf, 16, 16 + bounceY, bodyColor, silverCol, bodyDark, false, false, false, false);
    // 脚部が分離して下にずれる
    _drawDownLegs(buf, 16, 22, bodyDark, silverCol, false);
    // 分離の隙間に火花
    setPixel(buf, 14, 21, C_SPARK);
    setPixel(buf, 17, 21, C_SPARK2);
    return;
  }

  const cx = 16;
  const cy = 18 + bounceY;

  _drawDownBody(buf, cx, cy, bodyColor, silverCol, bodyDark, isMove, isAtk, isDmg, frame);
  _drawDownLegs(buf, cx, cy + 3, bodyDark, silverCol, isMove && frame === 1);

  // 攻撃エフェクト（氷ビーム）
  if (isAtk) {
    _drawAtkEffect(buf, cx, cy, 'down', frame);
  }

  // 被ダメエフェクト
  if (isDmg) {
    _drawDmgEffect(buf, cx, cy - 8, frame);
  }
}

function _drawDownBody(buf, cx, cy, bodyColor, silverCol, bodyDark, isMove, isAtk, isDmg, frame) {
  // 低姿勢流線型胴体（幅14、高さ8）
  // 上部が丸みを帯びた楕円形ボディ
  fillRect(buf, cx - 7, cy - 7, 14, 8, bodyColor);
  // 上辺を丸く（左右を1px削る）
  setPixel(buf, cx - 7, cy - 7, C_TRANS);
  setPixel(buf, cx + 6, cy - 7, C_TRANS);

  // シルバーのボディプレート（中央横帯）
  fillRect(buf, cx - 5, cy - 5, 10, 3, silverCol);

  // 赤バイザー（目）
  fillRect(buf, cx - 4, cy - 6, 8, 2, C_VISOR);
  // バイザーハイライト（上辺）
  hLine(buf, cx - 3, cy - 7, 6, C_VISOR_HI);

  // 中央ライン（胴体区切り）
  vLine(buf, cx, cy - 5, 3, bodyDark);

  // スラスター（左右の突起）
  setPixel(buf, cx - 8, cy - 4, C_THRUSTER);
  setPixel(buf, cx - 8, cy - 3, C_THRUSTER);
  setPixel(buf, cx + 7, cy - 4, C_THRUSTER);
  setPixel(buf, cx + 7, cy - 3, C_THRUSTER);

  // 攻撃チャージ時は腕を上げるエフェクト（frame0: チャージ）
  if (isAtk && frame === 0) {
    fillRect(buf, cx - 10, cy - 6, 3, 4, silverCol);
    fillRect(buf, cx + 7,  cy - 6, 3, 4, silverCol);
  }

  // アウトライン
  hLine(buf, cx - 6, cy - 8, 12, C_BLACK);
  hLine(buf, cx - 7, cy,     14, C_BLACK);
  vLine(buf, cx - 8, cy - 7,  8, C_BLACK);
  vLine(buf, cx + 7, cy - 7,  8, C_BLACK);

  // バイザーアウトライン
  hLine(buf, cx - 4, cy - 7, 8, C_BLACK);
}

function _drawDownLegs(buf, cx, cy, bodyDark, silverCol, boosted) {
  // 細い4本脚（左右2本ずつ）
  const legY = cy;

  // 左脚2本
  fillRect(buf, cx - 7, legY, 2, 5, silverCol);
  fillRect(buf, cx - 4, legY, 2, 4, silverCol);

  // 右脚2本
  fillRect(buf, cx + 2, legY, 2, 4, silverCol);
  fillRect(buf, cx + 5, legY, 2, 5, silverCol);

  // 脚先（接地部）
  hLine(buf, cx - 8, legY + 5, 3, C_BODY_DARK);
  hLine(buf, cx - 5, legY + 4, 3, C_BODY_DARK);
  hLine(buf, cx + 2, legY + 4, 3, C_BODY_DARK);
  hLine(buf, cx + 5, legY + 5, 3, C_BODY_DARK);

  // スラスター炎（背面/後部スラスター: down方向なので背面は上）
  if (boosted) {
    drawThruster(buf, cx - 6, legY + 2, 'down', true);
    drawThruster(buf, cx + 5, legY + 2, 'down', true);
  } else {
    drawThruster(buf, cx - 6, legY + 1, 'down', false);
    drawThruster(buf, cx + 5, legY + 1, 'down', false);
  }

  // 脚アウトライン
  vLine(buf, cx - 8, legY, 6, C_BLACK);
  vLine(buf, cx - 6, legY, 6, C_BLACK);
  vLine(buf, cx - 5, legY, 5, C_BLACK);
  vLine(buf, cx - 3, legY, 5, C_BLACK);
  vLine(buf, cx + 2, legY, 5, C_BLACK);
  vLine(buf, cx + 4, legY, 5, C_BLACK);
  vLine(buf, cx + 5, legY, 6, C_BLACK);
  vLine(buf, cx + 7, legY, 6, C_BLACK);
}

// ---------------------------------------------------------------------------
// up（背面向き）
// ---------------------------------------------------------------------------

function drawUp(buf, state, frame, bodyColor, silverCol, bodyDark) {
  const isMove = state === 'move';
  const isAtk  = state === 'atk';
  const isDmg  = state === 'dmg';
  const isDead = state === 'dead';

  const bounceY = isMove && frame === 1 ? -1 : 0;

  if (isDead && frame === 2) {
    setPixel(buf, 13, 22, C_SILVER_DARK);
    setPixel(buf, 18, 24, C_SILVER_DARK);
    setPixel(buf, 15, 28, C_SILVER);
    return;
  }

  if (isDead && frame === 0) {
    _drawUpBody(buf, 18, 18, bodyColor, silverCol, bodyDark, false, false, false, 0);
    setPixel(buf, 10, 13, C_SPARK);
    setPixel(buf, 22, 11, C_SPARK2);
    setPixel(buf, 16, 9,  C_SPARK);
    fillCircle(buf, 16, 15, 4, { r: 255, g: 140, b: 30, a: 140 });
    return;
  }

  if (isDead && frame === 1) {
    _drawUpBody(buf, 16, 16, bodyColor, silverCol, bodyDark, false, false, false, 0);
    _drawUpLegs(buf, 16, 22, bodyDark, silverCol, false);
    setPixel(buf, 14, 21, C_SPARK);
    setPixel(buf, 17, 21, C_SPARK2);
    return;
  }

  const cx = 16;
  const cy = 18 + bounceY;

  _drawUpBody(buf, cx, cy, bodyColor, silverCol, bodyDark, isMove, isAtk, isDmg, frame);
  _drawUpLegs(buf, cx, cy + 3, bodyDark, silverCol, isMove && frame === 1);

  if (isAtk) {
    _drawAtkEffect(buf, cx, cy, 'up', frame);
  }
  if (isDmg) {
    _drawDmgEffect(buf, cx, cy - 6, frame);
  }
}

function _drawUpBody(buf, cx, cy, bodyColor, silverCol, bodyDark, isMove, isAtk, isDmg, frame) {
  // 背面：大型スラスター2基が目立つ
  fillRect(buf, cx - 7, cy - 7, 14, 8, bodyColor);
  setPixel(buf, cx - 7, cy - 7, C_TRANS);
  setPixel(buf, cx + 6, cy - 7, C_TRANS);

  // 背中のシルバープレート（上部帯）
  fillRect(buf, cx - 5, cy - 7, 10, 3, silverCol);

  // 大型スラスター2基（背面から見える）
  // 左スラスター
  fillRect(buf, cx - 7, cy - 5, 4, 6, C_THRUSTER);
  fillRect(buf, cx - 6, cy - 4, 2, 4, C_BODY_DARK); // スラスター内穴
  // 右スラスター
  fillRect(buf, cx + 3, cy - 5, 4, 6, C_THRUSTER);
  fillRect(buf, cx + 4, cy - 4, 2, 4, C_BODY_DARK);

  // 中央背部パネル
  fillRect(buf, cx - 2, cy - 6, 4, 5, C_SILVER_DARK);
  setPixel(buf, cx, cy - 4, C_BODY_LIGHT);

  // スラスター炎（背面なので後部 = 下向きに噴射）
  const boosted = isMove && frame === 1;
  // 左スラスター炎
  for (let i = 0; i < (boosted ? 5 : 3); i++) {
    setPixel(buf, cx - 5, cy + 1 + i, i < 2 ? C_EXHAUST : C_EXHAUST2);
    if (boosted && i < 3) {
      setPixel(buf, cx - 6, cy + 1 + i, { ...C_EXHAUST2, a: 160 });
      setPixel(buf, cx - 4, cy + 1 + i, { ...C_EXHAUST2, a: 160 });
    }
  }
  // 右スラスター炎
  for (let i = 0; i < (boosted ? 5 : 3); i++) {
    setPixel(buf, cx + 5, cy + 1 + i, i < 2 ? C_EXHAUST : C_EXHAUST2);
    if (boosted && i < 3) {
      setPixel(buf, cx + 4, cy + 1 + i, { ...C_EXHAUST2, a: 160 });
      setPixel(buf, cx + 6, cy + 1 + i, { ...C_EXHAUST2, a: 160 });
    }
  }

  // アウトライン
  hLine(buf, cx - 6, cy - 8, 12, C_BLACK);
  hLine(buf, cx - 7, cy,     14, C_BLACK);
  vLine(buf, cx - 8, cy - 7,  8, C_BLACK);
  vLine(buf, cx + 7, cy - 7,  8, C_BLACK);
}

function _drawUpLegs(buf, cx, cy, bodyDark, silverCol, boosted) {
  // 脚（背面から見える）
  fillRect(buf, cx - 7, cy, 2, 5, silverCol);
  fillRect(buf, cx - 4, cy, 2, 4, silverCol);
  fillRect(buf, cx + 2, cy, 2, 4, silverCol);
  fillRect(buf, cx + 5, cy, 2, 5, silverCol);

  hLine(buf, cx - 8, cy + 5, 3, C_BODY_DARK);
  hLine(buf, cx - 5, cy + 4, 3, C_BODY_DARK);
  hLine(buf, cx + 2, cy + 4, 3, C_BODY_DARK);
  hLine(buf, cx + 5, cy + 5, 3, C_BODY_DARK);

  vLine(buf, cx - 8, cy, 6, C_BLACK);
  vLine(buf, cx - 6, cy, 6, C_BLACK);
  vLine(buf, cx - 5, cy, 5, C_BLACK);
  vLine(buf, cx - 3, cy, 5, C_BLACK);
  vLine(buf, cx + 2, cy, 5, C_BLACK);
  vLine(buf, cx + 4, cy, 5, C_BLACK);
  vLine(buf, cx + 5, cy, 6, C_BLACK);
  vLine(buf, cx + 7, cy, 6, C_BLACK);
}

// ---------------------------------------------------------------------------
// right（右向き）
// ---------------------------------------------------------------------------

function drawRight(buf, state, frame, bodyColor, silverCol, bodyDark) {
  const isMove = state === 'move';
  const isAtk  = state === 'atk';
  const isDmg  = state === 'dmg';
  const isDead = state === 'dead';

  const bounceY = isMove && frame === 1 ? -1 : 0;

  if (isDead && frame === 2) {
    setPixel(buf, 12, 22, C_SILVER_DARK);
    setPixel(buf, 18, 24, C_SILVER_DARK);
    setPixel(buf, 8,  26, C_BODY_DARK);
    setPixel(buf, 22, 21, C_BODY_DARK);
    return;
  }

  if (isDead && frame === 0) {
    _drawRightBody(buf, 16, 18, bodyColor, silverCol, bodyDark, false, false, false, 0);
    setPixel(buf, 8,  14, C_SPARK);
    setPixel(buf, 24, 12, C_SPARK2);
    setPixel(buf, 16, 10, C_SPARK);
    setPixel(buf, 6,  20, C_SPARK2);
    fillCircle(buf, 16, 16, 4, { r: 255, g: 140, b: 30, a: 130 });
    return;
  }

  if (isDead && frame === 1) {
    _drawRightBody(buf, 14, 17, bodyColor, silverCol, bodyDark, false, false, false, 0);
    _drawRightLegs(buf, 16, 21, bodyDark, silverCol, false);
    setPixel(buf, 12, 20, C_SPARK);
    setPixel(buf, 16, 20, C_SPARK2);
    return;
  }

  const cx = 16;
  const cy = 18 + bounceY;

  _drawRightBody(buf, cx, cy, bodyColor, silverCol, bodyDark, isMove, isAtk, isDmg, frame);
  _drawRightLegs(buf, cx, cy + 3, bodyDark, silverCol, isMove && frame === 1);

  if (isAtk) {
    _drawAtkEffect(buf, cx, cy, 'right', frame);
  }
  if (isDmg) {
    _drawDmgEffect(buf, cx, cy - 5, frame);
  }
}

function _drawRightBody(buf, cx, cy, bodyColor, silverCol, bodyDark, isMove, isAtk, isDmg, frame) {
  // 横向き：流線型胴体（幅18×高さ7）
  // 前部（右端）が尖った形状
  fillRect(buf, cx - 9, cy - 6, 17, 7, bodyColor);

  // 前部（右：進行方向）を尖らせる
  setPixel(buf, cx + 7, cy - 6, C_TRANS);
  setPixel(buf, cx + 7, cy,     C_TRANS);
  setPixel(buf, cx + 8, cy - 5, bodyColor);
  setPixel(buf, cx + 8, cy - 4, bodyColor);
  setPixel(buf, cx + 8, cy - 3, bodyColor);

  // 後部（左）を平坦に（スラスター側）
  // スラスター2基
  fillRect(buf, cx - 10, cy - 5, 3, 6, C_THRUSTER);
  fillRect(buf, cx - 9,  cy - 4, 1, 4, C_BODY_DARK); // 穴

  // シルバーボディ上部帯
  fillRect(buf, cx - 6, cy - 6, 12, 2, silverCol);

  // 赤バイザー（目）—— 右端付近
  setPixel(buf, cx + 6, cy - 3, C_VISOR);
  setPixel(buf, cx + 6, cy - 2, C_VISOR_HI);
  setPixel(buf, cx + 7, cy - 3, C_VISOR);

  // 中央ライン
  hLine(buf, cx - 5, cy - 3, 10, bodyDark);

  // 攻撃：腕を前に伸ばす
  if (isAtk && frame === 0) {
    fillRect(buf, cx + 7, cy - 5, 3, 3, silverCol);
  }

  // アウトライン
  hLine(buf, cx - 9, cy - 7, 17, C_BLACK);
  hLine(buf, cx - 9, cy,     17, C_BLACK);
  vLine(buf, cx - 10, cy - 6, 7, C_BLACK);
  // 前端（斜め）
  setPixel(buf, cx + 8, cy - 6, C_BLACK);
  setPixel(buf, cx + 9, cy - 5, C_BLACK);
  setPixel(buf, cx + 9, cy - 4, C_BLACK);
  setPixel(buf, cx + 9, cy - 3, C_BLACK);
  setPixel(buf, cx + 8, cy,     C_BLACK);
}

function _drawRightLegs(buf, cx, cy, bodyDark, silverCol, boosted) {
  // 横向きの脚（4本、上から見ると前後2組）
  // 前脚
  fillRect(buf, cx + 3, cy, 2, 5, silverCol);
  fillRect(buf, cx + 6, cy, 2, 4, silverCol);
  // 後脚
  fillRect(buf, cx - 6, cy, 2, 4, silverCol);
  fillRect(buf, cx - 3, cy, 2, 5, silverCol);

  // 接地部
  hLine(buf, cx + 2, cy + 5, 4, C_BODY_DARK);
  hLine(buf, cx + 5, cy + 4, 3, C_BODY_DARK);
  hLine(buf, cx - 7, cy + 4, 3, C_BODY_DARK);
  hLine(buf, cx - 4, cy + 5, 4, C_BODY_DARK);

  // スラスター炎（左向き、後部右側から噴射）
  // 後部スラスターは左（right方向移動の後ろ = 左）
  for (let i = 0; i < (boosted ? 5 : 3); i++) {
    setPixel(buf, cx - 11 - i, cy - 2, i < 2 ? C_EXHAUST : C_EXHAUST2);
    if (boosted && i < 3) {
      setPixel(buf, cx - 11 - i, cy - 3, { ...C_EXHAUST2, a: 160 });
      setPixel(buf, cx - 11 - i, cy - 1, { ...C_EXHAUST2, a: 160 });
    }
  }

  // 脚アウトライン
  vLine(buf, cx + 3,  cy, 6, C_BLACK);
  vLine(buf, cx + 5,  cy, 6, C_BLACK);
  vLine(buf, cx + 6,  cy, 5, C_BLACK);
  vLine(buf, cx + 8,  cy, 5, C_BLACK);
  vLine(buf, cx - 7,  cy, 5, C_BLACK);
  vLine(buf, cx - 5,  cy, 5, C_BLACK);
  vLine(buf, cx - 4,  cy, 6, C_BLACK);
  vLine(buf, cx - 2,  cy, 6, C_BLACK);
}

// ---------------------------------------------------------------------------
// 攻撃エフェクト（氷ビーム）
// ---------------------------------------------------------------------------

function _drawAtkEffect(buf, cx, cy, dir, frame) {
  if (frame === 0) {
    // チャージ：目の周囲に小さい氷の結晶
    setPixel(buf, cx - 2, cy - 10, C_ICE);
    setPixel(buf, cx + 2, cy - 10, C_ICE);
    setPixel(buf, cx,     cy - 11, C_ICE_DARK);
    setPixel(buf, cx - 4, cy - 9,  C_ICE);
    setPixel(buf, cx + 4, cy - 9,  C_ICE);
  } else if (frame === 1) {
    // ビーム発射
    if (dir === 'down') {
      // 下向きにビーム（幅3px、長さ12px）
      fillRect(buf, cx - 1, cy + 2, 3, 10, C_ICE);
      hLine(buf, cx - 2, cy + 2, 5, C_ICE_DARK);
      hLine(buf, cx - 2, cy + 11, 5, C_ICE_DARK);
      // ビーム先端のエフェクト
      fillCircle(buf, cx, cy + 12, 3, { r: 180, g: 230, b: 255, a: 200 });
    } else if (dir === 'up') {
      fillRect(buf, cx - 1, cy - 12, 3, 10, C_ICE);
      hLine(buf, cx - 2, cy - 12, 5, C_ICE_DARK);
      fillCircle(buf, cx, cy - 13, 3, { r: 180, g: 230, b: 255, a: 200 });
    } else if (dir === 'right') {
      fillRect(buf, cx + 9, cy - 3, 10, 3, C_ICE);
      vLine(buf, cx + 9,  cy - 4, 5, C_ICE_DARK);
      vLine(buf, cx + 19, cy - 4, 5, C_ICE_DARK);
      fillCircle(buf, cx + 20, cy - 1, 3, { r: 180, g: 230, b: 255, a: 200 });
    }
  } else if (frame === 2) {
    // 反動：少し後退、チャージが薄くなる
    if (dir === 'down') {
      hLine(buf, cx - 1, cy + 2, 3, { r: 150, g: 200, b: 240, a: 160 });
    } else if (dir === 'up') {
      hLine(buf, cx - 1, cy - 4, 3, { r: 150, g: 200, b: 240, a: 160 });
    } else if (dir === 'right') {
      vLine(buf, cx + 9, cy - 2, 3, { r: 150, g: 200, b: 240, a: 160 });
    }
    // 反動で揺れる輝き
    setPixel(buf, cx - 3, cy - 8, C_BODY_GLOW);
    setPixel(buf, cx + 3, cy - 8, C_BODY_GLOW);
  }
}

// ---------------------------------------------------------------------------
// 被ダメエフェクト
// ---------------------------------------------------------------------------

function _drawDmgEffect(buf, cx, cy, frame) {
  // 白青フラッシュ + 火花
  if (frame === 0) {
    // 目がバツになる（白目 + ×）
    setPixel(buf, cx - 2, cy + 6, C_WHITE);
    setPixel(buf, cx - 1, cy + 7, C_WHITE);
    setPixel(buf, cx,     cy + 6, C_WHITE);
    setPixel(buf, cx - 2, cy + 8, C_WHITE);
    setPixel(buf, cx,     cy + 8, C_WHITE);
    // 右目
    setPixel(buf, cx + 2, cy + 6, C_WHITE);
    setPixel(buf, cx + 3, cy + 7, C_WHITE);
    setPixel(buf, cx + 4, cy + 6, C_WHITE);
    setPixel(buf, cx + 2, cy + 8, C_WHITE);
    setPixel(buf, cx + 4, cy + 8, C_WHITE);
    // 火花
    setPixel(buf, cx - 6, cy + 2, C_SPARK);
    setPixel(buf, cx + 7, cy + 3, C_SPARK2);
    setPixel(buf, cx,     cy + 1, C_SPARK);
  } else {
    // のけぞり後（青白フラッシュ薄い）
    setPixel(buf, cx - 5, cy + 2, C_ICE);
    setPixel(buf, cx + 6, cy + 3, C_ICE);
    setPixel(buf, cx,     cy,     C_SPARK);
  }
}

// ---------------------------------------------------------------------------
// メイン生成処理
// ---------------------------------------------------------------------------

const DIRECTIONS = ['down', 'up', 'right', 'left'];
const STATES = ['move', 'atk', 'dmg', 'dead'];
const FRAME_COUNTS = { move: 2, atk: 3, dmg: 2, dead: 3 };

async function main() {
  fs.mkdirSync(SPRITES_DIR, { recursive: true });

  const generated = [];
  const errors    = [];

  for (const state of STATES) {
    const frames = FRAME_COUNTS[state];
    for (let frame = 0; frame < frames; frame++) {
      // right スプライトを生成してから left は反転で生成する
      for (const dir of DIRECTIONS) {
        const fileName = `mach_runner_dir_${dir}_${state}_${frame}.png`;
        const outPath  = path.join(SPRITES_DIR, fileName);

        try {
          if (dir === 'left') {
            // right バッファを流用して左右反転
            const rightBuf = new Uint8Array(S * S * 4);
            drawMachRunner(rightBuf, 'right', state, frame);
            const flipped = flipHorizontal(rightBuf);
            await savePNG(flipped, outPath);
          } else {
            const buf = createBuffer();
            drawMachRunner(buf, dir, state, frame);
            await savePNG(buf, outPath);
          }
          console.log(`[OK] ${fileName}`);
          generated.push(fileName);
        } catch (err) {
          console.error(`[ERROR] ${fileName}: ${err.message}`);
          errors.push(fileName);
        }
      }
    }
  }

  console.log('\n=== 生成完了 ===');
  console.log(`生成: ${generated.length} ファイル`);
  if (errors.length > 0) {
    console.log(`エラー: ${errors.length} ファイル`);
    errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log('\n生成ファイル一覧:');
  generated.forEach((f) => console.log(`  public/sprites/enemies/${f}`));
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
