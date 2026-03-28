/**
 * gen-screenshots.mjs
 * itch.io用スクリーンショット5枚をsharp + SVGで生成するスクリプト。
 * 実行: node scripts/gen-screenshots.mjs
 */

import sharp from 'sharp';
import { mkdir, writeFile, stat } from 'fs/promises';
import path from 'path';

const OUT_DIR = path.join(process.cwd(), 'itch-upload');

// ---------------------------------------------------------------------------
// パレット定義
// ---------------------------------------------------------------------------
const PALETTE = {
  coldSteel: {
    wallBase: '#283555', wallHL: '#7aadff', wallInner: '#1e2a45',
    wallShadow: '#111e33', wallAccent: '#3a4d6a',
    floorBase: '#0d1530', floorGrid: '#18233a',
  },
  electricCyan: {
    wallBase: '#0a3a42', wallHL: '#40ffee', wallInner: '#082e36',
    wallShadow: '#041018', wallAccent: '#1a5060',
    floorBase: '#061828', floorGrid: '#0e2830',
  },
};

// ---------------------------------------------------------------------------
// SVGヘルパー
// ---------------------------------------------------------------------------
function px(n) { return Math.round(n); }

/** 壁タイル1枚のSVGグループ */
function wallTile(x, y, p, tileSize = 32) {
  const s = tileSize;
  const inset = Math.max(1, Math.round(s * 0.0625)); // 2px for 32px
  return `
    <rect x="${px(x)}" y="${px(y)}" width="${s}" height="${s}" fill="${p.wallBase}"/>
    <rect x="${px(x+inset)}" y="${px(y+inset)}" width="${s-inset*2}" height="${s-inset*2}" fill="${p.wallInner}"/>
    <line x1="${px(x)}" y1="${px(y)}" x2="${px(x+s)}" y2="${px(y)}" stroke="${p.wallHL}" stroke-width="2"/>
    <line x1="${px(x)}" y1="${px(y)}" x2="${px(x)}" y2="${px(y+s)}" stroke="${p.wallHL}" stroke-width="2"/>
    <line x1="${px(x)}" y1="${px(y+s-1)}" x2="${px(x+s)}" y2="${px(y+s-1)}" stroke="${p.wallShadow}" stroke-width="1"/>
    <line x1="${px(x+s-1)}" y1="${px(y)}" x2="${px(x+s-1)}" y2="${px(y+s)}" stroke="${p.wallShadow}" stroke-width="1"/>
    <line x1="${px(x+inset)}" y1="${px(y+s/2)}" x2="${px(x+s-inset)}" y2="${px(y+s/2)}" stroke="${p.wallAccent}" stroke-width="1"/>
  `;
}

/** 床タイル1枚のSVGグループ */
function floorTile(x, y, p, tileSize = 32) {
  const s = tileSize;
  return `
    <rect x="${px(x)}" y="${px(y)}" width="${s}" height="${s}" fill="${p.floorBase}"/>
    <line x1="${px(x)}" y1="${px(y)}" x2="${px(x+s)}" y2="${px(y)}" stroke="${p.floorGrid}" stroke-width="1"/>
    <line x1="${px(x)}" y1="${px(y)}" x2="${px(x)}" y2="${px(y+s)}" stroke="${p.floorGrid}" stroke-width="1"/>
    <line x1="${px(x+s/2)}" y1="${px(y)}" x2="${px(x+s/2)}" y2="${px(y+s)}" stroke="${p.floorGrid}" stroke-width="1" opacity="0.4"/>
    <line x1="${px(x)}" y1="${px(y+s/2)}" x2="${px(x+s)}" y2="${px(y+s/2)}" stroke="${p.floorGrid}" stroke-width="1" opacity="0.4"/>
  `;
}

/** プレイヤー(メカロボ) */
function playerSprite(cx, cy, s = 32) {
  const hs = s / 2;
  return `
    <g transform="translate(${px(cx - hs)}, ${px(cy - hs)})">
      <!-- ボディ -->
      <rect x="${px(s*0.15)}" y="${px(s*0.25)}" width="${px(s*0.7)}" height="${px(s*0.55)}" rx="2" fill="#1a2a4a" stroke="#00e5ff" stroke-width="1.5"/>
      <!-- 頭部 -->
      <rect x="${px(s*0.2)}" y="${px(s*0.05)}" width="${px(s*0.6)}" height="${px(s*0.25)}" rx="3" fill="#1a2a4a" stroke="#00e5ff" stroke-width="1.5"/>
      <!-- 目 -->
      <rect x="${px(s*0.27)}" y="${px(s*0.1)}" width="${px(s*0.15)}" height="${px(s*0.12)}" fill="#ff3333"/>
      <rect x="${px(s*0.58)}" y="${px(s*0.1)}" width="${px(s*0.15)}" height="${px(s*0.12)}" fill="#ff3333"/>
      <!-- アーム左 -->
      <rect x="${px(s*0.02)}" y="${px(s*0.28)}" width="${px(s*0.15)}" height="${px(s*0.35)}" rx="2" fill="#1a2a4a" stroke="#00e5ff" stroke-width="1"/>
      <!-- アーム右 -->
      <rect x="${px(s*0.83)}" y="${px(s*0.28)}" width="${px(s*0.15)}" height="${px(s*0.35)}" rx="2" fill="#1a2a4a" stroke="#00e5ff" stroke-width="1"/>
      <!-- 脚 -->
      <rect x="${px(s*0.2)}" y="${px(s*0.78)}" width="${px(s*0.25)}" height="${px(s*0.18)}" rx="1" fill="#1a2a4a" stroke="#00e5ff" stroke-width="1"/>
      <rect x="${px(s*0.55)}" y="${px(s*0.78)}" width="${px(s*0.25)}" height="${px(s*0.18)}" rx="1" fill="#1a2a4a" stroke="#00e5ff" stroke-width="1"/>
      <!-- コアグロー -->
      <circle cx="${px(s*0.5)}" cy="${px(s*0.52)}" r="${px(s*0.08)}" fill="#00e5ff" opacity="0.8"/>
    </g>
  `;
}

/** 敵ドローン（小型） */
function enemyDrone(cx, cy, s = 28) {
  const hs = s / 2;
  return `
    <g transform="translate(${px(cx - hs)}, ${px(cy - hs)})">
      <!-- 本体六角形風 -->
      <polygon points="${px(s*0.5)},${px(0)} ${px(s)},${px(s*0.3)} ${px(s)},${px(s*0.7)} ${px(s*0.5)},${px(s)} ${px(0)},${px(s*0.7)} ${px(0)},${px(s*0.3)}" fill="#444a55" stroke="#888888" stroke-width="1.5"/>
      <!-- 目 -->
      <circle cx="${px(s*0.35)}" cy="${px(s*0.45)}" r="${px(s*0.1)}" fill="#ff4444"/>
      <circle cx="${px(s*0.65)}" cy="${px(s*0.45)}" r="${px(s*0.1)}" fill="#ff4444"/>
      <!-- アンテナ -->
      <line x1="${px(s*0.5)}" y1="${px(0)}" x2="${px(s*0.5)}" y2="${px(-s*0.2)}" stroke="#888888" stroke-width="1"/>
      <circle cx="${px(s*0.5)}" cy="${px(-s*0.2)}" r="2" fill="#ff8844"/>
    </g>
  `;
}

/** ボスエンティティ */
function bossSprite(cx, cy, s = 48) {
  const hs = s / 2;
  return `
    <g transform="translate(${px(cx - hs)}, ${px(cy - hs)})">
      <!-- 本体 -->
      <rect x="0" y="0" width="${s}" height="${s}" rx="4" fill="#2a0a2a" stroke="#cc2244" stroke-width="2"/>
      <!-- コア -->
      <rect x="${px(s*0.2)}" y="${px(s*0.2)}" width="${px(s*0.6)}" height="${px(s*0.6)}" rx="3" fill="#1a0818" stroke="#aa1133" stroke-width="1.5"/>
      <!-- 目(大) -->
      <circle cx="${px(s*0.35)}" cy="${px(s*0.4)}" r="${px(s*0.1)}" fill="#ff0044"/>
      <circle cx="${px(s*0.65)}" cy="${px(s*0.4)}" r="${px(s*0.1)}" fill="#ff0044"/>
      <!-- コアグロー -->
      <circle cx="${px(s*0.5)}" cy="${px(s*0.62)}" r="${px(s*0.12)}" fill="#ff2266" opacity="0.7"/>
      <!-- 上部角 -->
      <polygon points="${px(s*0.3)},0 ${px(s*0.5)},${px(-s*0.15)} ${px(s*0.7)},0" fill="#cc2244"/>
      <!-- 側面スパイク -->
      <polygon points="0,${px(s*0.4)} ${px(-s*0.15)},${px(s*0.5)} 0,${px(s*0.6)}" fill="#cc2244"/>
      <polygon points="${s},${px(s*0.4)} ${px(s*1.15)},${px(s*0.5)} ${s},${px(s*0.6)}" fill="#cc2244"/>
    </g>
  `;
}

/** 攻撃エフェクト(シアン十字) */
function attackEffect(cx, cy) {
  return `
    <line x1="${cx-10}" y1="${cy}" x2="${cx+10}" y2="${cy}" stroke="#00e5ff" stroke-width="2" opacity="0.9"/>
    <line x1="${cx}" y1="${cy-10}" x2="${cx}" y2="${cy+10}" stroke="#00e5ff" stroke-width="2" opacity="0.9"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="#00e5ff" opacity="0.5"/>
    <circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="#00e5ff" stroke-width="1" opacity="0.3"/>
  `;
}

/** ダメージ数値 */
function damageNumber(cx, cy, text, color = '#ff4444') {
  return `<text x="${cx}" y="${cy}" font-family="monospace" font-size="10" font-weight="bold" fill="${color}" text-anchor="middle" stroke="#000" stroke-width="2" paint-order="stroke">${text}</text>`;
}

/** HPバー */
function hpBar(x, y, w, h, ratio, label = '') {
  const color = ratio > 0.5 ? '#44dd44' : ratio > 0.25 ? '#ddcc00' : '#dd2222';
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="#1a1a1a" stroke="#333" stroke-width="1"/>
    <rect x="${x+1}" y="${y+1}" width="${px((w-2)*ratio)}" height="${h-2}" rx="1" fill="${color}"/>
    ${label ? `<text x="${x}" y="${y-2}" font-family="monospace" font-size="9" fill="#aaa">${label}</text>` : ''}
  `;
}

/** ミニマップ */
function miniMap(x, y, size = 60) {
  const cells = [
    // row, col, type(0=floor,1=wall,2=player)
    [0,0,1],[0,1,1],[0,2,1],[0,3,1],[0,4,1],
    [1,0,1],[1,1,0],[1,2,0],[1,3,0],[1,4,1],
    [2,0,1],[2,1,0],[2,2,2],[2,3,0],[2,4,1],
    [3,0,1],[3,1,0],[3,2,0],[3,3,0],[3,4,1],
    [4,0,1],[4,1,1],[4,2,1],[4,3,1],[4,4,1],
  ];
  const cellSize = size / 5;
  const colors = { 1: '#283555', 0: '#1a2030', 2: '#00e5ff' };
  let cells_svg = cells.map(([r, c, t]) =>
    `<rect x="${x + c*cellSize}" y="${y + r*cellSize}" width="${cellSize}" height="${cellSize}" fill="${colors[t]}"/>`
  ).join('');
  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#0a0a14" stroke="#334466" stroke-width="1"/>
    ${cells_svg}
  `;
}

/** バトルログ帯 */
function battleLog(x, y, w, lines) {
  const lineH = 14;
  const h = lines.length * lineH + 8;
  const linesSvg = lines.map((l, i) =>
    `<text x="${x+6}" y="${y + 12 + i*lineH}" font-family="monospace" font-size="10" fill="${l.color}">${l.text}</text>`
  ).join('');
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(0,0,0,0.8)"/>
    ${linesSvg}
  `;
}

/** キーボードガイド */
function keyGuide(x, y, w) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="18" fill="#080810"/>
    <text x="${x + w/2}" y="${y+12}" font-family="monospace" font-size="9" fill="#5588aa" text-anchor="middle">WASD/矢印=移動  Z=攻撃  Space=待機  I=アイテム  E=装備</text>
  `;
}

// ---------------------------------------------------------------------------
// マップレイアウト生成
// ---------------------------------------------------------------------------
/**
 * cols x rows のマップデータ(0=floor, 1=wall)を返す。
 * 簡易な固定レイアウト。
 */
function buildMap(cols, rows) {
  const map = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      (r === 0 || r === rows-1 || c === 0 || c === cols-1) ? 1 : 0
    )
  );
  // 通路壁を追加
  for (let r = 3; r < rows-3; r++) { map[r][5] = 1; map[r][9] = 1; }
  for (let c = 3; c < cols-3; c++) { map[3][c] = 1; map[9][c] = 1; }
  // 通路を開ける
  map[3][7] = 0; map[9][7] = 0; map[6][5] = 0; map[6][9] = 0;
  // 角部屋に追加壁
  map[1][2] = 1; map[2][1] = 1;
  return map;
}

/** マップSVG文字列を返す */
function renderMap(map, palette, tileSize, offsetX = 0, offsetY = 0) {
  let svg = '';
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      const x = offsetX + c * tileSize;
      const y = offsetY + r * tileSize;
      if (map[r][c] === 1) svg += wallTile(x, y, palette, tileSize);
      else svg += floorTile(x, y, palette, tileSize);
    }
  }
  return svg;
}

// ---------------------------------------------------------------------------
// 各スクリーンショット生成関数
// ---------------------------------------------------------------------------

/** screenshot_01: PC版 探索シーン */
async function genExplorePC(outPath) {
  const W = 1280, H = 720;
  const COLS = 15, ROWS = 13, TILE = 32;
  const CW = COLS * TILE; // 480
  const CH = ROWS * TILE; // 416
  const canvasX = Math.round((W - CW) / 2);
  const canvasY = Math.round((H - CH) / 2) - 20;
  const p = PALETTE.coldSteel;
  const map = buildMap(COLS, ROWS);

  // エンティティ位置
  const playerTX = 7, playerTY = 6;
  const playerCX = canvasX + (playerTX + 0.5) * TILE;
  const playerCY = canvasY + (playerTY + 0.5) * TILE;
  const enemy1TX = 10, enemy1TY = 6;
  const enemy1CX = canvasX + (enemy1TX + 0.5) * TILE;
  const enemy1CY = canvasY + (enemy1TY + 0.5) * TILE;
  const enemy2TX = 4, enemy2TY = 10;
  const enemy2CX = canvasX + (enemy2TX + 0.5) * TILE;
  const enemy2CY = canvasY + (enemy2TY + 0.5) * TILE;
  // 階段
  const stairX = canvasX + 12.5 * TILE;
  const stairY = canvasY + 11.5 * TILE;
  // アイテム
  const itemX = canvasX + 2.5 * TILE;
  const itemY = canvasY + 1.5 * TILE;

  const hudX = canvasX;
  const hudY = canvasY;
  const logY = canvasY + CH - 44;
  const keyY = canvasY + CH;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <!-- 背景 -->
  <rect width="${W}" height="${H}" fill="#050508"/>

  <!-- ゲームCanvasクリップ -->
  <defs>
    <clipPath id="canvas-clip">
      <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}"/>
    </clipPath>
  </defs>

  <!-- マップ -->
  <g clip-path="url(#canvas-clip)">
    ${renderMap(map, p, TILE, canvasX, canvasY)}

    <!-- 階段 -->
    <text x="${stairX}" y="${stairY+5}" font-family="monospace" font-size="20" fill="#ffdd00" text-anchor="middle">▼</text>

    <!-- アイテム箱 -->
    <rect x="${itemX-7}" y="${itemY-7}" width="14" height="14" rx="2" fill="#1a3a1a" stroke="#44cc44" stroke-width="1.5"/>
    <text x="${itemX}" y="${itemY+4}" font-family="monospace" font-size="10" fill="#44cc44" text-anchor="middle">✦</text>

    <!-- 敵 -->
    ${enemyDrone(enemy1CX, enemy1CY, 26)}
    ${enemyDrone(enemy2CX, enemy2CY, 24)}

    <!-- プレイヤー -->
    ${playerSprite(playerCX, playerCY, 30)}
  </g>

  <!-- Canvasボーダー -->
  <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}" fill="none" stroke="#334466" stroke-width="1"/>

  <!-- HUD: 左上 -->
  <rect x="${hudX}" y="${hudY-28}" width="200" height="28" fill="rgba(0,0,0,0.85)"/>
  <text x="${hudX+6}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffdd00">Lv.3</text>
  <text x="${hudX+46}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffffff">HP</text>
  <text x="${hudX+62}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#44cc44">85/100</text>
  <text x="${hudX+118}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffdd00">G 200</text>
  ${hpBar(hudX+6, hudY-9, 140, 6, 0.85)}

  <!-- HUD: 右上 (フロア + ミニマップ) -->
  <rect x="${canvasX+CW-70}" y="${hudY-28}" width="70" height="28" fill="rgba(0,0,0,0.85)"/>
  <text x="${canvasX+CW-38}" y="${hudY-14}" font-family="monospace" font-size="14" fill="#7aadff" text-anchor="middle">1F</text>
  ${miniMap(canvasX+CW-66, hudY+4, 62)}

  <!-- バトルログ -->
  ${battleLog(canvasX, logY, CW, [
    { text: 'スカウトドローン Lv.2 が現れた！', color: '#ffffff' },
  ])}

  <!-- キーボードガイド -->
  ${keyGuide(canvasX, keyY, CW)}
</svg>`;

  await sharpFromSvg(svg, W, H, outPath);
}

/** screenshot_02: PC版 バトルシーン */
async function genBattlePC(outPath) {
  const W = 1280, H = 720;
  const COLS = 15, ROWS = 13, TILE = 32;
  const CW = COLS * TILE;
  const CH = ROWS * TILE;
  const canvasX = Math.round((W - CW) / 2);
  const canvasY = Math.round((H - CH) / 2) - 20;
  const p = PALETTE.coldSteel;
  const map = buildMap(COLS, ROWS);

  const playerTX = 6, playerTY = 6;
  const playerCX = canvasX + (playerTX + 0.5) * TILE;
  const playerCY = canvasY + (playerTY + 0.5) * TILE;
  const enemy1TX = 7, enemy1TY = 6;
  const enemy1CX = canvasX + (enemy1TX + 0.5) * TILE;
  const enemy1CY = canvasY + (enemy1TY + 0.5) * TILE;
  const enemy2TX = 10, enemy2TY = 5;
  const enemy2CX = canvasX + (enemy2TX + 0.5) * TILE;
  const enemy2CY = canvasY + (enemy2TY + 0.5) * TILE;
  const effectCX = (playerCX + enemy1CX) / 2;
  const effectCY = (playerCY + enemy1CY) / 2;
  const logY = canvasY + CH - 56;
  const hudX = canvasX;
  const hudY = canvasY;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#050508"/>
  <defs>
    <clipPath id="canvas-clip">
      <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#canvas-clip)">
    ${renderMap(map, p, TILE, canvasX, canvasY)}
    <!-- 敵2 -->
    ${enemyDrone(enemy2CX, enemy2CY, 24)}
    <!-- 敵1(ダメージ状態) -->
    <g opacity="0.85">
      ${enemyDrone(enemy1CX, enemy1CY, 26)}
    </g>
    <!-- プレイヤー -->
    ${playerSprite(playerCX, playerCY, 30)}
    <!-- 攻撃エフェクト -->
    ${attackEffect(px(effectCX), px(effectCY))}
    ${attackEffect(px(effectCX + 6), px(effectCY - 4))}
    ${attackEffect(px(effectCX - 5), px(effectCY + 5))}
    <!-- ダメージ数値 -->
    ${damageNumber(enemy1CX, enemy1CY - 20, '-18', '#ff4444')}
  </g>
  <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}" fill="none" stroke="#334466" stroke-width="1"/>

  <!-- HUD 左上 -->
  <rect x="${hudX}" y="${hudY-28}" width="220" height="28" fill="rgba(0,0,0,0.85)"/>
  <text x="${hudX+6}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffdd00">Lv.5</text>
  <text x="${hudX+46}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffffff">HP</text>
  <text x="${hudX+62}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#44cc44">95/120</text>
  <text x="${hudX+122}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffdd00">G 430</text>
  ${hpBar(hudX+6, hudY-9, 140, 6, 0.79)}

  <!-- HUD 右上 -->
  <rect x="${canvasX+CW-70}" y="${hudY-28}" width="70" height="28" fill="rgba(0,0,0,0.85)"/>
  <text x="${canvasX+CW-38}" y="${hudY-14}" font-family="monospace" font-size="14" fill="#7aadff" text-anchor="middle">3F</text>
  ${miniMap(canvasX+CW-66, hudY+4, 62)}

  <!-- バトルログ -->
  ${battleLog(canvasX, logY, CW, [
    { text: 'スカウトドローン Lv.3 に 18 ダメージ！', color: '#44dd44' },
    { text: 'ドローン の攻撃！ 12 ダメージを受けた', color: '#ff6666' },
    { text: 'ブレードアームで攻撃', color: '#cccccc' },
  ])}
</svg>`;

  await sharpFromSvg(svg, W, H, outPath);
}

/** screenshot_03: PC版 ボス戦 */
async function genBossPC(outPath) {
  const W = 1280, H = 720;
  const COLS = 15, ROWS = 13, TILE = 32;
  const CW = COLS * TILE;
  const CH = ROWS * TILE;
  const canvasX = Math.round((W - CW) / 2);
  const canvasY = Math.round((H - CH) / 2) - 30;
  const p = PALETTE.coldSteel;
  const map = buildMap(COLS, ROWS);

  const playerTX = 3, playerTY = 6;
  const playerCX = canvasX + (playerTX + 0.5) * TILE;
  const playerCY = canvasY + (playerTY + 0.5) * TILE;
  const bossCX = canvasX + 10 * TILE;
  const bossCY = canvasY + 6.5 * TILE;

  // 虫ユニット座標(ボスの周囲にランダム配置風)
  const bugs = [
    [bossCX - 40, bossCY - 30], [bossCX + 45, bossCY - 25],
    [bossCX - 50, bossCY + 10], [bossCX + 50, bossCY + 15],
    [bossCX - 20, bossCY + 45], [bossCX + 25, bossCY + 48],
    [bossCX - 35, bossCY - 50], [bossCX + 38, bossCY - 52],
  ];

  const logY = canvasY + CH - 56;
  const hudX = canvasX;
  const hudY = canvasY;
  const bossBarCX = W / 2;
  const bossBarY = hudY - 30;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#050508"/>
  <!-- ボス戦の緊張感: 赤みがかった背景グロー -->
  <radialGradient id="bossGlow" cx="67%" cy="50%" r="40%">
    <stop offset="0%" stop-color="#2a0a0a" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#050508" stop-opacity="0"/>
  </radialGradient>
  <rect width="${W}" height="${H}" fill="url(#bossGlow)"/>
  <defs>
    <clipPath id="canvas-clip">
      <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#canvas-clip)">
    ${renderMap(map, p, TILE, canvasX, canvasY)}
    <!-- 虫ユニット -->
    ${bugs.map(([bx, by]) => `<circle cx="${px(bx)}" cy="${px(by)}" r="5" fill="#ff4444" stroke="#ff8888" stroke-width="1"/>`).join('')}
    <!-- ボス -->
    ${bossSprite(bossCX, bossCY, 52)}
    <!-- プレイヤー攻撃エフェクト -->
    ${playerSprite(playerCX, playerCY, 30)}
    ${attackEffect(playerCX + 20, playerCY)}
    ${attackEffect(playerCX + 28, playerCY - 6)}
  </g>
  <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}" fill="none" stroke="#554444" stroke-width="1"/>

  <!-- HUD 左上 -->
  <rect x="${hudX}" y="${hudY-28}" width="220" height="28" fill="rgba(0,0,0,0.85)"/>
  <text x="${hudX+6}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffdd00">Lv.5</text>
  <text x="${hudX+46}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffffff">HP</text>
  <text x="${hudX+62}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#44cc44">70/120</text>
  <text x="${hudX+122}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffdd00">G 430</text>
  ${hpBar(hudX+6, hudY-9, 140, 6, 0.58)}

  <!-- HUD 右上 -->
  <rect x="${canvasX+CW-70}" y="${hudY-28}" width="70" height="28" fill="rgba(0,0,0,0.85)"/>
  <text x="${canvasX+CW-38}" y="${hudY-14}" font-family="monospace" font-size="14" fill="#7aadff" text-anchor="middle">4F</text>
  ${miniMap(canvasX+CW-66, hudY+4, 62)}

  <!-- ボスHPバー (画面上部中央) -->
  <rect x="${bossBarCX - 120}" y="${bossBarY - 22}" width="240" height="28" rx="3" fill="rgba(0,0,0,0.9)" stroke="#551122" stroke-width="1"/>
  <text x="${bossBarCX}" y="${bossBarY-8}" font-family="monospace" font-size="11" font-weight="bold" fill="#ff4466" text-anchor="middle">BOSS: バグスウォーム</text>
  <rect x="${bossBarCX-100}" y="${bossBarY+2}" width="200" height="10" rx="2" fill="#1a0a0a" stroke="#441122" stroke-width="1"/>
  <rect x="${bossBarCX-99}" y="${bossBarY+3}" width="99" height="8" rx="2" fill="#cc2244"/>
  <text x="${bossBarCX}" y="${bossBarY+18}" font-family="monospace" font-size="9" fill="#ff8888" text-anchor="middle">40 / 80</text>

  <!-- バトルログ -->
  ${battleLog(canvasX, logY, CW, [
    { text: 'バグスウォームが現れた！', color: '#ff4444' },
    { text: '虫ユニット に 5 ダメージ！', color: '#44dd44' },
    { text: 'バグスウォームの攻撃！ 8 ダメージ', color: '#ff6666' },
  ])}
</svg>`;

  await sharpFromSvg(svg, W, H, outPath);
}

/** screenshot_04: スマホ版 バトルシーン */
async function genBattleMobile(outPath) {
  const W = 390, H = 844;
  const TILE = Math.floor(W / 15); // 26
  const COLS = 15, ROWS = 13;
  const CW = COLS * TILE; // 390
  const CH = ROWS * TILE; // 338
  const canvasX = 0;
  const hudH = 30;
  const canvasY = hudH;
  const ctrlH = 180;
  const logH = 32;
  const logY = canvasY + CH;
  const ctrlY = logY + logH;
  const p = PALETTE.electricCyan;
  const map = buildMap(COLS, ROWS);

  const playerTX = 7, playerTY = 6;
  const playerCX = canvasX + (playerTX + 0.5) * TILE;
  const playerCY = canvasY + (playerTY + 0.5) * TILE;
  const enemy1TX = 8, enemy1TY = 6;
  const enemy1CX = canvasX + (enemy1TX + 0.5) * TILE;
  const enemy1CY = canvasY + (enemy1TY + 0.5) * TILE;
  const effectCX = (playerCX + enemy1CX) / 2;

  // Dpadボタン
  const dpadCX = 80, dpadCY = ctrlY + 88;
  const btnS = 56;
  function dpadBtn(x, y, label) {
    return `
      <rect x="${x}" y="${y}" width="${btnS}" height="${btnS}" rx="8" fill="#1a2a3a" stroke="#336688" stroke-width="1.5"/>
      <text x="${x+btnS/2}" y="${y+btnS/2+5}" font-family="monospace" font-size="18" fill="#88aacc" text-anchor="middle">${label}</text>
    `;
  }
  const dpadBtns = `
    ${dpadBtn(dpadCX - btnS/2, dpadCY - btnS - 4, '▲')}
    ${dpadBtn(dpadCX - btnS/2, dpadCY + 4, '▼')}
    ${dpadBtn(dpadCX - btnS - 4 - btnS/2, dpadCY - btnS/2, '◀')}
    ${dpadBtn(dpadCX + 4 + btnS/2 - btnS/2*2, dpadCY - btnS/2, '▶')}
  `;

  // 右側アクションボタン
  const rBtnX = W - 180;
  const rBtnY = ctrlY + 10;
  function actionBtn(x, y, w, h, bg, border, label, fontSize = 14) {
    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${bg}" stroke="${border}" stroke-width="1.5"/>
      <text x="${x+w/2}" y="${y+h/2+fontSize*0.35}" font-family="'Noto Sans JP',sans-serif" font-size="${fontSize}" fill="#eee" text-anchor="middle">${label}</text>
    `;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#020d18"/>
  <defs>
    <clipPath id="canvas-clip">
      <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}"/>
    </clipPath>
  </defs>

  <!-- マップ -->
  <g clip-path="url(#canvas-clip)">
    ${renderMap(map, p, TILE, canvasX, canvasY)}
    ${enemyDrone(enemy1CX, enemy1CY, 22)}
    ${playerSprite(playerCX, playerCY, 24)}
    ${attackEffect(px(effectCX), px(playerCY))}
    ${damageNumber(enemy1CX, enemy1CY - 16, '-22', '#ff4444')}
  </g>
  <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}" fill="none" stroke="#1a4450" stroke-width="1"/>

  <!-- HUD上部帯 -->
  <rect x="0" y="0" width="${W}" height="${hudH}" fill="rgba(0,0,0,0.9)"/>
  <text x="6" y="19" font-family="monospace" font-size="10" fill="#ffdd00">Lv.8</text>
  <text x="42" y="19" font-family="monospace" font-size="10" fill="#ffffff">HP</text>
  <text x="56" y="19" font-family="monospace" font-size="10" fill="#ddcc00">60/80</text>
  <text x="106" y="19" font-family="monospace" font-size="10" fill="#ffdd00">G 780</text>
  ${hpBar(42, 21, 60, 5, 0.75)}
  <text x="${W-46}" y="19" font-family="monospace" font-size="12" fill="#40ffee" text-anchor="middle">6F</text>
  ${miniMap(W-44, 2, 40)}

  <!-- バトルログ -->
  <rect x="0" y="${logY}" width="${CW}" height="${logH}" fill="rgba(0,0,0,0.85)"/>
  <text x="6" y="${logY+12}" font-family="monospace" font-size="9" fill="#ffffff">レーザーライフルで攻撃！</text>
  <text x="6" y="${logY+24}" font-family="monospace" font-size="9" fill="#44dd44">ビーストドローン に 22 ダメージ！</text>

  <!-- バーチャルコントローラー背景 -->
  <rect x="0" y="${ctrlY}" width="${W}" height="${ctrlH}" fill="rgba(0,0,0,0.9)"/>

  <!-- Dpad -->
  ${dpadBtns}

  <!-- アクションボタン -->
  ${actionBtn(rBtnX, rBtnY, 64, 64, '#3a1010', '#883322', '攻', 18)}
  ${actionBtn(rBtnX+70, rBtnY, 64, 64, '#101a30', '#224466', '待', 18)}
  ${actionBtn(rBtnX, rBtnY+70, 64, 44, '#221a36', '#553388', 'アイ', 13)}
  ${actionBtn(rBtnX+70, rBtnY+70, 64, 44, '#0e2016', '#225533', '装備', 13)}
</svg>`;

  await sharpFromSvg(svg, W, H, outPath);
}

/** screenshot_05: PC版 ショップシーン */
async function genShopPC(outPath) {
  const W = 1280, H = 720;
  const COLS = 15, ROWS = 13, TILE = 32;
  const CW = COLS * TILE;
  const CH = ROWS * TILE;
  const canvasX = Math.round((W - CW) / 2);
  const canvasY = Math.round((H - CH) / 2) - 20;
  const p = PALETTE.electricCyan;
  const map = buildMap(COLS, ROWS);

  // ショップ位置
  const shopTX = 7, shopTY = 6;
  const shopCX = canvasX + (shopTX + 0.5) * TILE;
  const shopCY = canvasY + (shopTY + 0.5) * TILE;
  const playerTX = 6, playerTY = 6;
  const playerCX = canvasX + (playerTX + 0.5) * TILE;
  const playerCY = canvasY + (playerTY + 0.5) * TILE;

  // ショップオーバーレイのサイズと位置
  const shopPanelW = 340;
  const shopPanelH = 200;
  const shopPanelX = canvasX + CW + 20;
  const shopPanelY = canvasY + Math.round((CH - shopPanelH) / 2);

  const hudX = canvasX;
  const hudY = canvasY;
  const logY = canvasY + CH - 30;

  // 商品行
  const items = [
    { name: 'レーザーライフル', desc: 'ATK:25 耐久:50', price: '280G' },
    { name: 'チタンシールド',   desc: 'DEF+8',          price: '200G' },
    { name: 'リペアキット中',   desc: 'HP+80',           price: '120G' },
    { name: 'エネルギーパック', desc: 'EN+50',           price: ' 90G' },
  ];
  const itemRowH = 36;
  const itemsStartY = shopPanelY + 36;

  function shopItemRow(x, y, w, item, idx) {
    const bg = idx % 2 === 0 ? 'rgba(0,30,50,0.6)' : 'rgba(0,20,40,0.4)';
    return `
      <rect x="${x}" y="${y}" width="${w}" height="${itemRowH}" fill="${bg}"/>
      <text x="${x+8}" y="${y+14}" font-family="monospace" font-size="10" fill="#ffffff">${item.name}</text>
      <text x="${x+8}" y="${y+26}" font-family="monospace" font-size="9" fill="#88aacc">${item.desc}</text>
      <text x="${x+w-80}" y="${y+16}" font-family="monospace" font-size="10" fill="#ffdd66">💰 ${item.price}</text>
      <rect x="${x+w-56}" y="${y+6}" width="48" height="22}" rx="3" fill="#006688" stroke="#40ffee" stroke-width="1"/>
      <text x="${x+w-32}" y="${y+22}" font-family="monospace" font-size="10" fill="#000000" text-anchor="middle">購入</text>
    `;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#050508"/>
  <defs>
    <clipPath id="canvas-clip">
      <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}"/>
    </clipPath>
  </defs>

  <!-- マップ -->
  <g clip-path="url(#canvas-clip)">
    ${renderMap(map, p, TILE, canvasX, canvasY)}
    <!-- ショップタイル強調 -->
    <rect x="${canvasX+shopTX*TILE}" y="${canvasY+shopTY*TILE}" width="${TILE}" height="${TILE}" fill="rgba(255,200,0,0.15)" stroke="#ffcc00" stroke-width="1"/>
    <text x="${shopCX}" y="${shopCY+6}" font-family="monospace" font-size="16" fill="#ffcc00" text-anchor="middle">$</text>
    <!-- プレイヤー -->
    ${playerSprite(playerCX, playerCY, 30)}
  </g>
  <rect x="${canvasX}" y="${canvasY}" width="${CW}" height="${CH}" fill="none" stroke="#1a4450" stroke-width="1"/>

  <!-- HUD 左上 -->
  <rect x="${hudX}" y="${hudY-28}" width="220" height="28" fill="rgba(0,0,0,0.85)"/>
  <text x="${hudX+6}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffdd00">Lv.8</text>
  <text x="${hudX+46}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffffff">HP</text>
  <text x="${hudX+62}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#44cc44">80/80</text>
  <text x="${hudX+122}" y="${hudY-14}" font-family="monospace" font-size="11" fill="#ffdd00">G 430</text>
  ${hpBar(hudX+6, hudY-9, 140, 6, 1.0)}

  <!-- HUD 右上 -->
  <rect x="${canvasX+CW-70}" y="${hudY-28}" width="70" height="28" fill="rgba(0,0,0,0.85)"/>
  <text x="${canvasX+CW-38}" y="${hudY-14}" font-family="monospace" font-size="14" fill="#40ffee" text-anchor="middle">8F</text>
  ${miniMap(canvasX+CW-66, hudY+4, 62)}

  <!-- ショップオーバーレイパネル -->
  <rect x="${shopPanelX}" y="${shopPanelY-10}" width="${shopPanelW}" height="${shopPanelH+60}" rx="8" fill="rgba(0,10,20,0.92)" stroke="#336688" stroke-width="1"/>
  <text x="${shopPanelX + shopPanelW/2}" y="${shopPanelY+16}" font-family="monospace" font-size="14" fill="#40ffee" text-anchor="middle">ショップ</text>
  <line x1="${shopPanelX+10}" y1="${shopPanelY+22}" x2="${shopPanelX+shopPanelW-10}" y2="${shopPanelY+22}" stroke="#336688" stroke-width="1"/>

  <!-- 商品リスト -->
  ${items.map((item, i) => shopItemRow(shopPanelX + 8, itemsStartY + i * itemRowH, shopPanelW - 16, item, i)).join('')}

  <!-- 所持金・閉じるボタン -->
  <text x="${shopPanelX+10}" y="${itemsStartY + items.length * itemRowH + 16}" font-family="monospace" font-size="10" fill="#ffdd00">所持金: 430G</text>
  <text x="${shopPanelX+shopPanelW-10}" y="${itemsStartY + items.length * itemRowH + 16}" font-family="monospace" font-size="10" fill="#88aacc" text-anchor="end">[Esc] 閉じる</text>

  <!-- バトルログ -->
  ${battleLog(canvasX, logY, CW, [
    { text: 'ショップが開いた', color: '#ffdd00' },
  ])}
</svg>`;

  await sharpFromSvg(svg, W, H, outPath);
}

// ---------------------------------------------------------------------------
// SVGをsharpでPNG変換
// ---------------------------------------------------------------------------
async function sharpFromSvg(svgStr, width, height, outPath) {
  const buf = Buffer.from(svgStr, 'utf-8');
  await sharp(buf, { density: 96 })
    .resize(width, height, { fit: 'contain', background: { r: 5, g: 5, b: 8, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const tasks = [
    { name: 'screenshot_01_explore_pc.png',    fn: genExplorePC },
    { name: 'screenshot_02_battle_pc.png',     fn: genBattlePC },
    { name: 'screenshot_03_boss_pc.png',       fn: genBossPC },
    { name: 'screenshot_04_battle_mobile.png', fn: genBattleMobile },
    { name: 'screenshot_05_shop_pc.png',       fn: genShopPC },
  ];

  for (const task of tasks) {
    const outPath = path.join(OUT_DIR, task.name);
    process.stdout.write(`生成中: ${task.name} ... `);
    try {
      await task.fn(outPath);
      const info = await stat(outPath);
      const kb = (info.size / 1024).toFixed(1);
      console.log(`完了 (${kb} KB)`);
    } catch (err) {
      console.error(`失敗: ${err.message}`);
      console.error(err.stack);
    }
  }

  console.log('\n全スクリーンショット生成完了。');
  console.log(`出力先: ${OUT_DIR}`);
}

main();
