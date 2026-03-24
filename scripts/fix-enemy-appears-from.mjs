/**
 * @fileoverview enemies.json の appearsFrom を修正するスクリプト
 *
 * ルール: 各 baseEnemyId グループの Lv.1 の appearsFrom を基準として、
 * appearsFrom = base_floor + (level - 1) * 3
 * ただし Lv.1 は変更しない。
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, '../src/game/assets/data/enemies.json');

const enemies = JSON.parse(readFileSync(filePath, 'utf-8'));

// baseEnemyId ごとに Lv.1 の appearsFrom を収集
const baseFloorMap = new Map();
for (const enemy of enemies) {
  if (enemy.level === 1 && enemy.baseEnemyId) {
    baseFloorMap.set(enemy.baseEnemyId, enemy.appearsFrom);
  }
}

// appearsFrom を修正（Lv.1 は変更しない）
let modifiedCount = 0;
for (const enemy of enemies) {
  if (!enemy.baseEnemyId || enemy.level === 1) continue;

  const baseFloor = baseFloorMap.get(enemy.baseEnemyId);
  if (baseFloor === undefined) continue;

  const newAppearsFrom = baseFloor + (enemy.level - 1) * 3;
  if (enemy.appearsFrom !== newAppearsFrom) {
    console.log(
      `[修正] ${enemy.id}: appearsFrom ${enemy.appearsFrom} → ${newAppearsFrom}` +
      ` (baseFloor=${baseFloor}, level=${enemy.level})`
    );
    enemy.appearsFrom = newAppearsFrom;
    modifiedCount++;
  }
}

writeFileSync(filePath, JSON.stringify(enemies, null, 2), 'utf-8');
console.log(`\n完了: ${modifiedCount} 件の appearsFrom を修正しました。`);
