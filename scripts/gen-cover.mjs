/**
 * itch.io カバー画像生成スクリプト
 * 出力: itch-upload/cover.png (630x500px)
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'itch-upload');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'cover.png');

const W = 630;
const H = 500;

// --- ベース背景: ダークネイビー〜ブラックグラデーション ---
function makeBaseBackground() {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      // 縦グラデーション: 上#0a0a1a → 下#010108
      const t = y / H;
      const r = Math.round(10 * (1 - t) + 1 * t);
      const g = Math.round(10 * (1 - t) + 1 * t);
      const b = Math.round(26 * (1 - t) + 8 * t);
      data[idx]     = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } });
}

// --- グリッドライン SVG ---
function makeGridSVG() {
  const gap = 40;
  let lines = '';
  // 縦線
  for (let x = 0; x <= W; x += gap) {
    lines += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#1a2a3a" stroke-width="1"/>`;
  }
  // 横線
  for (let y = 0; y <= H; y += gap) {
    lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#1a2a3a" stroke-width="1"/>`;
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${lines}
  </svg>`);
}

// --- 星/パーティクル SVG ---
function makeStarsSVG() {
  // 疑似乱数で星を配置（シード固定）
  const stars = [
    { x: 45,  y: 30,  r: 1.5, c: '#ffffff', o: 0.8 },
    { x: 120, y: 15,  r: 1.0, c: '#00e5ff', o: 0.6 },
    { x: 200, y: 55,  r: 1.5, c: '#ffffff', o: 0.7 },
    { x: 310, y: 10,  r: 1.0, c: '#aaddff', o: 0.5 },
    { x: 390, y: 40,  r: 1.5, c: '#00e5ff', o: 0.8 },
    { x: 480, y: 20,  r: 1.0, c: '#ffffff', o: 0.6 },
    { x: 560, y: 65,  r: 1.5, c: '#aaddff', o: 0.7 },
    { x: 600, y: 35,  r: 1.0, c: '#ffffff', o: 0.5 },
    { x: 70,  y: 85,  r: 1.0, c: '#00e5ff', o: 0.5 },
    { x: 160, y: 100, r: 1.5, c: '#ffffff', o: 0.6 },
    { x: 250, y: 80,  r: 1.0, c: '#aaddff', o: 0.4 },
    { x: 420, y: 90,  r: 1.5, c: '#00e5ff', o: 0.7 },
    { x: 530, y: 105, r: 1.0, c: '#ffffff', o: 0.5 },
    { x: 610, y: 75,  r: 1.5, c: '#aaddff', o: 0.6 },
    { x: 30,  y: 150, r: 1.0, c: '#ffffff', o: 0.4 },
    { x: 90,  y: 200, r: 1.5, c: '#00e5ff', o: 0.5 },
    { x: 580, y: 160, r: 1.0, c: '#aaddff', o: 0.5 },
    { x: 615, y: 220, r: 1.5, c: '#ffffff', o: 0.4 },
    { x: 20,  y: 380, r: 1.0, c: '#00e5ff', o: 0.4 },
    { x: 55,  y: 430, r: 1.5, c: '#ffffff', o: 0.5 },
    { x: 590, y: 400, r: 1.0, c: '#aaddff', o: 0.4 },
    { x: 620, y: 460, r: 1.5, c: '#ffffff', o: 0.5 },
    { x: 350, y: 470, r: 1.0, c: '#00e5ff', o: 0.4 },
    { x: 180, y: 450, r: 1.5, c: '#ffffff', o: 0.3 },
    { x: 450, y: 480, r: 1.0, c: '#aaddff', o: 0.4 },
  ];

  const circles = stars.map(s =>
    `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.c}" opacity="${s.o}"/>`
  ).join('');

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${circles}
  </svg>`);
}

// --- メカロボット SVG ---
function makeMechSVG() {
  // 中央下寄り配置。ロボット全体の基準点 (cx, baseY)
  const cx = W / 2;       // 315
  const baseY = H - 40;   // 460 (足元)
  const robotH = 200;
  const topY = baseY - robotH; // 260

  // 色
  const outline = '#00e5ff';
  const fill    = '#0d2a3a';
  const eyeGlow = '#ff3333';
  const glowC   = '#00e5ff';

  // 各パーツ寸法
  // --- 足元グロー ---
  const glowEllipse = `<ellipse cx="${cx}" cy="${baseY}" rx="90" ry="18" fill="${glowC}" opacity="0.18"/>`;
  const glowEllipse2 = `<ellipse cx="${cx}" cy="${baseY}" rx="60" ry="10" fill="${glowC}" opacity="0.12"/>`;

  // --- 脚 (左右) ---
  const legW = 22, legH = 50;
  const legY = baseY - legH;
  const legLX = cx - 28;
  const legRX = cx + 6;
  const legs = `
    <rect x="${legLX}" y="${legY}" width="${legW}" height="${legH}" fill="${fill}" stroke="${outline}" stroke-width="2" rx="3"/>
    <rect x="${legRX}" y="${legY}" width="${legW}" height="${legH}" fill="${fill}" stroke="${outline}" stroke-width="2" rx="3"/>
  `;

  // --- 足 (ブーツ) ---
  const bootW = 28, bootH = 14;
  const bootY = baseY - bootH;
  const bootLX = cx - 32;
  const bootRX = cx + 4;
  const boots = `
    <rect x="${bootLX}" y="${bootY}" width="${bootW}" height="${bootH}" fill="${fill}" stroke="${outline}" stroke-width="2" rx="4"/>
    <rect x="${bootRX}" y="${bootY}" width="${bootW}" height="${bootH}" fill="${fill}" stroke="${outline}" stroke-width="2" rx="4"/>
  `;

  // --- 腰 ---
  const waistW = 62, waistH = 16;
  const waistY = legY - waistH;
  const waistX = cx - waistW / 2;
  const waist = `<rect x="${waistX}" y="${waistY}" width="${waistW}" height="${waistH}" fill="${fill}" stroke="${outline}" stroke-width="2" rx="3"/>`;

  // --- 胴体 ---
  const bodyW = 80, bodyH = 70;
  const bodyY = waistY - bodyH;
  const bodyX = cx - bodyW / 2;
  const body = `<rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="${fill}" stroke="${outline}" stroke-width="2.5" rx="5"/>`;

  // 胴体内装飾（コアリアクター）
  const coreX = cx, coreY = bodyY + bodyH * 0.45;
  const core = `
    <circle cx="${coreX}" cy="${coreY}" r="14" fill="#001520" stroke="${outline}" stroke-width="1.5"/>
    <circle cx="${coreX}" cy="${coreY}" r="8"  fill="${glowC}" opacity="0.7"/>
    <circle cx="${coreX}" cy="${coreY}" r="4"  fill="#ffffff" opacity="0.9"/>
  `;

  // 胴体内ライン装飾
  const bodyLines = `
    <line x1="${bodyX + 8}" y1="${bodyY + 12}" x2="${bodyX + 24}" y2="${bodyY + 12}" stroke="${outline}" stroke-width="1" opacity="0.5"/>
    <line x1="${bodyX + bodyW - 8}" y1="${bodyY + 12}" x2="${bodyX + bodyW - 24}" y2="${bodyY + 12}" stroke="${outline}" stroke-width="1" opacity="0.5"/>
    <line x1="${bodyX + 8}" y1="${bodyY + bodyH - 12}" x2="${bodyX + 24}" y2="${bodyY + bodyH - 12}" stroke="${outline}" stroke-width="1" opacity="0.5"/>
    <line x1="${bodyX + bodyW - 8}" y1="${bodyY + bodyH - 12}" x2="${bodyX + bodyW - 24}" y2="${bodyY + bodyH - 12}" stroke="${outline}" stroke-width="1" opacity="0.5"/>
  `;

  // --- 肩アーマー ---
  const shoulderW = 26, shoulderH = 22;
  const shoulderY = bodyY - 4;
  const shoulderLX = bodyX - shoulderW + 2;
  const shoulderRX = bodyX + bodyW - 2;
  const shoulders = `
    <rect x="${shoulderLX}" y="${shoulderY}" width="${shoulderW}" height="${shoulderH}" fill="${fill}" stroke="${outline}" stroke-width="2" rx="4"/>
    <rect x="${shoulderRX}" y="${shoulderY}" width="${shoulderW}" height="${shoulderH}" fill="${fill}" stroke="${outline}" stroke-width="2" rx="4"/>
  `;

  // --- 腕 左(武器側) 右 ---
  const armW = 18, armH = 55;
  const armY = bodyY + 8;
  const armLX = shoulderLX + 4;
  const armRX = shoulderRX + 4;
  const arms = `
    <rect x="${armLX}" y="${armY}" width="${armW}" height="${armH}" fill="${fill}" stroke="${outline}" stroke-width="2" rx="3"/>
    <rect x="${armRX}" y="${armY}" width="${armW}" height="${armH}" fill="${fill}" stroke="${outline}" stroke-width="2" rx="3"/>
  `;

  // --- 左手: ブレード武器 ---
  const bladeX = armLX - 10;
  const bladeY = armY + armH - 10;
  const blade = `
    <rect x="${bladeX - 6}" y="${bladeY}" width="10" height="55" fill="${fill}" stroke="${outline}" stroke-width="2" rx="2"/>
    <polygon points="${bladeX - 6},${bladeY + 55} ${bladeX + 4},${bladeY + 55} ${bladeX - 1},${bladeY + 75}" fill="${outline}" opacity="0.9"/>
    <line x1="${bladeX - 2}" y1="${bladeY + 5}" x2="${bladeX - 2}" y2="${bladeY + 50}" stroke="${glowC}" stroke-width="1.5" opacity="0.6"/>
  `;

  // --- 頭部 ---
  const headW = 56, headH = 50;
  const headY = bodyY - headH - 4;
  const headX = cx - headW / 2;
  const neckW = 20, neckH = 8;
  const neckX = cx - neckW / 2;
  const neckY = bodyY - neckH;
  const head = `
    <rect x="${neckX}" y="${neckY}" width="${neckW}" height="${neckH}" fill="${fill}" stroke="${outline}" stroke-width="1.5"/>
    <rect x="${headX}" y="${headY}" width="${headW}" height="${headH}" fill="${fill}" stroke="${outline}" stroke-width="2.5" rx="6"/>
  `;

  // 目 (左右 赤グロー)
  const eyeY = headY + headH * 0.38;
  const eyeLX = headX + headW * 0.25;
  const eyeRX = headX + headW * 0.65;
  const eyeW = 11, eyeH = 7;
  const eyes = `
    <rect x="${eyeLX - eyeW/2}" y="${eyeY - eyeH/2}" width="${eyeW}" height="${eyeH}" fill="${eyeGlow}" rx="2" opacity="0.9"/>
    <rect x="${eyeRX - eyeW/2}" y="${eyeY - eyeH/2}" width="${eyeW}" height="${eyeH}" fill="${eyeGlow}" rx="2" opacity="0.9"/>
    <rect x="${eyeLX - eyeW/2}" y="${eyeY - eyeH/2}" width="${eyeW}" height="${eyeH}" fill="none" stroke="#ff6666" stroke-width="1" rx="2" opacity="0.5"/>
    <rect x="${eyeRX - eyeW/2}" y="${eyeY - eyeH/2}" width="${eyeW}" height="${eyeH}" fill="none" stroke="#ff6666" stroke-width="1" rx="2" opacity="0.5"/>
  `;

  // 頭部アンテナ
  const antX = headX + headW * 0.75;
  const antenna = `
    <line x1="${antX}" y1="${headY}" x2="${antX + 6}" y2="${headY - 18}" stroke="${outline}" stroke-width="2"/>
    <circle cx="${antX + 6}" cy="${headY - 20}" r="3" fill="${glowC}" opacity="0.9"/>
  `;

  // 頭部バイザーライン
  const visorY = headY + headH * 0.65;
  const visor = `
    <line x1="${headX + 6}" y1="${visorY}" x2="${headX + headW - 6}" y2="${visorY}" stroke="${outline}" stroke-width="1" opacity="0.4"/>
  `;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${glowEllipse}
    ${glowEllipse2}
    ${legs}
    ${boots}
    ${waist}
    ${body}
    ${bodyLines}
    ${core}
    ${shoulders}
    ${arms}
    ${blade}
    ${head}
    ${eyes}
    ${antenna}
    ${visor}
  </svg>`);
}

// --- タイトル & テキスト SVG ---
function makeTextSVG() {
  // タイトル上部中央配置
  const titleY = 95;
  const subY   = titleY + 52;

  // タイトルグロー背景 (ぼかし疑似: 複数オフセット同色テキスト)
  const glow = (text, x, y, size, color, opacity) => {
    const offsets = [[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[2,-2],[-2,2],[2,2]];
    return offsets.map(([dx, dy]) =>
      `<text x="${x + dx}" y="${y + dy}" font-family="'Noto Sans JP', 'Yu Gothic', sans-serif" font-size="${size}" font-weight="bold" fill="${color}" opacity="${opacity}" text-anchor="middle">${text}</text>`
    ).join('');
  };

  // 水平デコレーションライン
  const lineY = titleY + 18;
  const lineGap = 180; // タイトルテキスト幅の半分 + マージン
  const decorLines = `
    <line x1="20" y1="${lineY}" x2="${W/2 - lineGap}" y2="${lineY}" stroke="#00e5ff" stroke-width="1" opacity="0.6"/>
    <line x1="${W/2 + lineGap}" y1="${lineY}" x2="${W - 20}" y2="${lineY}" stroke="#00e5ff" stroke-width="1" opacity="0.6"/>
    <line x1="20" y1="${lineY + 5}" x2="${W/2 - lineGap}" y2="${lineY + 5}" stroke="#00e5ff" stroke-width="1" opacity="0.3"/>
    <line x1="${W/2 + lineGap}" y1="${lineY + 5}" x2="${W - 20}" y2="${lineY + 5}" stroke="#00e5ff" stroke-width="1" opacity="0.3"/>
  `;

  // 右上デジタル装飾 (菱形 + 十字)
  const dX = W - 40, dY = 40;
  const cornerDeco = `
    <polygon points="${dX},${dY - 14} ${dX + 12},${dY} ${dX},${dY + 14} ${dX - 12},${dY}" fill="none" stroke="#00e5ff" stroke-width="1.5" opacity="0.7"/>
    <line x1="${dX - 22}" y1="${dY}" x2="${dX - 16}" y2="${dY}" stroke="#00e5ff" stroke-width="1" opacity="0.5"/>
    <line x1="${dX + 16}" y1="${dY}" x2="${dX + 22}" y2="${dY}" stroke="#00e5ff" stroke-width="1" opacity="0.5"/>
    <circle cx="${dX}" cy="${dY}" r="3" fill="#00e5ff" opacity="0.8"/>
    <polygon points="${dX - 55},${dY - 8} ${dX - 47},${dY} ${dX - 55},${dY + 8} ${dX - 63},${dY}" fill="none" stroke="#00e5ff" stroke-width="1" opacity="0.4"/>
  `;

  // サブタイトルの文字間隔はSVGのletter-spacingで指定
  const subText = `<text x="${W/2}" y="${subY}" font-family="'Noto Sans JP', 'Yu Gothic', sans-serif" font-size="28" fill="#aaddff" text-anchor="middle" letter-spacing="6">機甲迷宮探索記</text>`;

  // 右下 "Roguelike"
  const rogueText = `<text x="${W - 20}" y="${H - 20}" font-family="monospace, sans-serif" font-size="18" fill="#556677" text-anchor="end">Roguelike</text>`;

  // 左下 "TURN-BASED · DUNGEON CRAWLER"
  const genreText = `<text x="20" y="${H - 20}" font-family="monospace, sans-serif" font-size="14" fill="#445566" text-anchor="start">TURN-BASED · DUNGEON CRAWLER</text>`;

  // タイトル下ラインセパレーター
  const sepY = subY + 16;
  const sepLine = `
    <line x1="${W/2 - 120}" y1="${sepY}" x2="${W/2 + 120}" y2="${sepY}" stroke="#00e5ff" stroke-width="0.8" opacity="0.35"/>
  `;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${decorLines}
    ${cornerDeco}
    ${glow('メカローグ', W/2, titleY, 72, '#00e5ff', 0.18)}
    <text x="${W/2}" y="${titleY}" font-family="'Noto Sans JP', 'Yu Gothic', sans-serif" font-size="72" font-weight="bold" fill="#00e5ff" text-anchor="middle">メカローグ</text>
    ${subText}
    ${sepLine}
    ${rogueText}
    ${genreText}
  </svg>`);
}

// --- CRTスキャンライン SVG ---
function makeScanlinesSVG() {
  let lines = '';
  for (let y = 0; y < H; y += 4) {
    lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#000000" stroke-width="2" opacity="0.07"/>`;
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${lines}
  </svg>`);
}

// --- メイン処理 ---
async function main() {
  console.log('カバー画像を生成中...');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const base = makeBaseBackground();

  const composites = [
    { input: makeGridSVG(),      top: 0, left: 0 },
    { input: makeStarsSVG(),     top: 0, left: 0 },
    { input: makeMechSVG(),      top: 0, left: 0 },
    { input: makeTextSVG(),      top: 0, left: 0 },
    { input: makeScanlinesSVG(), top: 0, left: 0 },
  ];

  await base
    .composite(composites.map(c => ({ input: c.input, top: c.top, left: c.left })))
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT_PATH);

  console.log(`生成完了: ${OUTPUT_PATH}`);

  // ファイルサイズ確認
  const stats = fs.statSync(OUTPUT_PATH);
  console.log(`ファイルサイズ: ${(stats.size / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
