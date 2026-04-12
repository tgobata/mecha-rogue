/**
 * @fileoverview 敵AI（7パターン）
 *
 * GDD 7.2 の aiType に対応した行動決定ロジック。
 * 純粋関数。副作用なし。
 *
 * | aiType    | 行動 |
 * |-----------|------|
 * | straight  | BFS最短経路でプレイヤーへ直進 |
 * | patrol    | 巡回ルートを往復 |
 * | guard     | 初期位置付近を守り、近づくと攻撃 |
 * | sniper    | 視線が通れば遠距離攻撃、通らなければ接近 |
 * | support   | 他の敵HPが低いと回復 |
 * | ambush    | 一定確率でターンをスキップ（待ち伏せ） |
 * | flee      | プレイヤーから逃走 |
 * | group     | 仲間の視野を共有して追跡 |
 * | explode   | 隣接で自爆 |
 */

import type { Enemy, Player, GameState, EnemyAiType } from './game-state';
import type { Position } from './types';
import { getTileAt, isWalkable, manhattanDistance } from './floorUtils';
import { nextStep, findPath } from './pathfinding';
import { TILE_OIL, TILE_FIRE, TILE_ITEM, TILE_WEAPON, FIRE_TILE_DURATION } from './constants';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 敵の1アクション */
export type EnemyAction =
  | { type: 'move'; to: Position }
  | { type: 'attack'; targetId: 'player' | string }
  | { type: 'heal'; targetId: string; amount: number }
  | { type: 'skip' }
  | { type: 'explode' }
  | { type: 'absorb_wall'; wallPos: Position }
  | { type: 'cannon_aoe'; centerPos: Position; radius: number; damage: number }
  | { type: 'slash_attack' }
  | { type: 'iaido'; range: number; damage: number }
  | { type: 'spread_oil'; positions: Position[] }
  | { type: 'ignite_oil'; pos: Position }
  | { type: 'ignite_item'; pos: Position }
  | { type: 'lob_grenade'; targetPos: Position; radius: number; damage: number }
  | { type: 'call_allies'; pos: Position }
  | { type: 'pack_howl'; pos: Position }
  | { type: 'lay_mine'; pos: Position }
  | { type: 'ranged_attack'; targetId: 'player'; from: Position; to: Position; damage: number }
  | { type: 'spawn_swarm_unit'; pos: Position }
  | { type: 'teleport'; to: Position };

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 視線チェックで許容する最大射程（タイル数） */
const MAX_LOS_RANGE = 10;
/** guard AI の守備半径 */
const GUARD_RADIUS = 4;
/** ambush（待ち伏せ）型のスキップ確率 */
const AMBUSH_SKIP_CHANCE = 0.4;
/** support AI の回復量 */
const SUPPORT_HEAL_AMOUNT = 10;
/** support AI が回復対象とする HP% しきい値 */
const SUPPORT_HEAL_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// 視線チェック（LOS: Line of Sight）
// ---------------------------------------------------------------------------

/**
 * from から to への視線が壁で遮られていないか判定する。
 * Bresenham のライン描画で経路上のタイルを確認する。
 *
 * @param from - 視点座標
 * @param to - 対象座標
 * @param state - GameState（マップ参照用）
 * @returns 視線が通っていれば true
 */
function hasLineOfSight(from: Position, to: Position, state: GameState): boolean {
  const map = state.map;
  if (!map) return false;

  const dist = manhattanDistance(from, to);
  if (dist > MAX_LOS_RANGE) return false;

  // Bresenham
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = Math.abs(to.y - y);
  const sx = to.x > x ? 1 : -1;
  const sy = to.y > y ? 1 : -1;
  let err = dx - dy;

  while (!(x === to.x && y === to.y)) {
    // 出発点と目標点以外の中間点のみ壁チェック
    if (!(x === from.x && y === from.y)) {
      const tile = getTileAt(map, { x, y });
      if (!isWalkable(tile)) return false;
    }

    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx)  { err += dx; y += sy; }
  }

  return true;
}

// ---------------------------------------------------------------------------
// 移動候補計算
// ---------------------------------------------------------------------------

/**
 * 指定した目標から「離れる方向」への移動先を返す（逃走用）。
 */
function getFleeMovePosition(
  enemy: Enemy,
  target: Position,
  state: GameState,
  otherEnemies: Enemy[],
): Position {
  const map = state.map!;
  const candidates: Position[] = [
    { x: enemy.pos.x,     y: enemy.pos.y - 1 },
    { x: enemy.pos.x,     y: enemy.pos.y + 1 },
    { x: enemy.pos.x - 1, y: enemy.pos.y     },
    { x: enemy.pos.x + 1, y: enemy.pos.y     },
  ];

  let bestPos = enemy.pos;
  let bestDist = manhattanDistance(enemy.pos, target);

  for (const pos of candidates) {
    const tile = getTileAt(map, pos);
    if (!isWalkable(tile)) continue;
    if (pos.x === target.x && pos.y === target.y) continue;
    if (otherEnemies.some((e) => e.id !== enemy.id && e.pos.x === pos.x && e.pos.y === pos.y)) continue;

    const d = manhattanDistance(pos, target);
    if (d > bestDist) {
      bestDist = d;
      bestPos = pos;
    }
  }

  return bestPos;
}

/**
 * BFS で求めた最短経路の次のステップを返す。
 * 他の敵と衝突しない最初の移動先を選ぶ。
 */
function getBFSMove(
  enemy: Enemy,
  target: Position,
  state: GameState,
  otherEnemies: Enemy[],
): Position {
  const map = state.map!;
  const step = nextStep(enemy.pos, target, map);

  // 衝突チェック
  if (step.x !== enemy.pos.x || step.y !== enemy.pos.y) {
    const blocked = otherEnemies.some(
      (e) => e.id !== enemy.id && e.pos.x === step.x && e.pos.y === step.y,
    );
    if (!blocked) return step;
  }

  return enemy.pos;
}

// ---------------------------------------------------------------------------
// AI 別の行動決定
// ---------------------------------------------------------------------------

function decideChase(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  const dist = manhattanDistance(enemy.pos, playerPos);
  if (dist === 1) return { type: 'attack', targetId: 'player' };

  const nextPos = getBFSMove(enemy, playerPos, state, otherEnemies);
  if (nextPos.x !== enemy.pos.x || nextPos.y !== enemy.pos.y) {
    return { type: 'move', to: nextPos };
  }
  return { type: 'skip' };
}

function decidePatrol(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  const dist = manhattanDistance(enemy.pos, playerPos);

  // プレイヤーが視界内なら追跡
  if (dist <= 5 && hasLineOfSight(enemy.pos, playerPos, state)) {
    return decideChase(enemy, playerPos, state, otherEnemies);
  }

  // 巡回ポイントがあれば往復
  const path = enemy.patrolPath;
  if (!path || path.length === 0) return { type: 'skip' };

  const idx = enemy.patrolIndex ?? 0;
  const target = path[idx];
  const dist2 = manhattanDistance(enemy.pos, target);

  if (dist2 === 0) {
    // 目的地に着いた → 方向転換（往復）
    return { type: 'skip' };
  }

  const map = state.map!;
  const step = nextStep(enemy.pos, target, map);
  const blocked = otherEnemies.some(
    (e) => e.id !== enemy.id && e.pos.x === step.x && e.pos.y === step.y,
  );
  if (!blocked && (step.x !== enemy.pos.x || step.y !== enemy.pos.y)) {
    return { type: 'move', to: step };
  }
  return { type: 'skip' };
}

function decideGuard(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  const guardCenter = enemy.guardPos ?? enemy.pos;
  const distToPlayer = manhattanDistance(enemy.pos, playerPos);

  // プレイヤーが隣接していれば攻撃
  if (distToPlayer === 1) {
    return { type: 'attack', targetId: 'player' };
  }

  // プレイヤーが守備半径内に入ったら追いかける
  const distPlayerToGuard = manhattanDistance(playerPos, guardCenter);
  if (distPlayerToGuard <= GUARD_RADIUS) {
    const nextPos = getBFSMove(enemy, playerPos, state, otherEnemies);
    if (nextPos.x !== enemy.pos.x || nextPos.y !== enemy.pos.y) {
      return { type: 'move', to: nextPos };
    }
    return { type: 'skip' };
  }

  // 守備位置に戻る
  const distToGuard = manhattanDistance(enemy.pos, guardCenter);
  if (distToGuard > 1) {
    const map = state.map!;
    const step = nextStep(enemy.pos, guardCenter, map);
    const blocked = otherEnemies.some(
      (e) => e.id !== enemy.id && e.pos.x === step.x && e.pos.y === step.y,
    );
    if (!blocked && (step.x !== enemy.pos.x || step.y !== enemy.pos.y)) {
      return { type: 'move', to: step };
    }
  }

  return { type: 'skip' };
}

function decideSniper(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  const dist = manhattanDistance(enemy.pos, playerPos);
  const range = (enemy as any).attackRange ?? 2;

  // 射程内かつ視線が通れば攻撃
  if (dist <= range && hasLineOfSight(enemy.pos, playerPos, state)) {
    return { type: 'attack', targetId: 'player' };
  }

  // 射程外または視線が通らなければ接近
  return decideChase(enemy, playerPos, state, otherEnemies);
}

function decideSupport(
  enemy: Enemy,
  _playerPos: Position,
  _state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  // HPが低い仲間を探す
  const wounded = otherEnemies
    .filter(
      (e) => e.id !== enemy.id && e.hp < e.maxHp * SUPPORT_HEAL_THRESHOLD,
    )
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);

  if (wounded.length > 0) {
    const target = wounded[0];
    const dist = manhattanDistance(enemy.pos, target.pos);
    if (dist <= 1) {
      return { type: 'heal', targetId: String(target.id), amount: SUPPORT_HEAL_AMOUNT };
    }
    // 回復対象に近づく
    const map = _state.map;
    if (map) {
      const step = nextStep(enemy.pos, target.pos, map);
      const blocked = otherEnemies.some(
        (e) => e.id !== enemy.id && e.pos.x === step.x && e.pos.y === step.y,
      );
      if (!blocked && (step.x !== enemy.pos.x || step.y !== enemy.pos.y)) {
        return { type: 'move', to: step };
      }
    }
  }

  return { type: 'skip' };
}

function decideAmbush(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
  rng: () => number,
): EnemyAction {
  // 一定確率でスキップ（ステルス待ち伏せ）
  if (rng() < AMBUSH_SKIP_CHANCE) {
    return { type: 'skip' };
  }
  // スキップしなければ通常追跡
  return decideChase(enemy, playerPos, state, otherEnemies);
}

function decideFlee(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  const nextPos = getFleeMovePosition(enemy, playerPos, state, otherEnemies);
  if (nextPos.x !== enemy.pos.x || nextPos.y !== enemy.pos.y) {
    return { type: 'move', to: nextPos };
  }
  return { type: 'skip' };
}

function decideGroup(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  // 群体型: 仲間の誰かがプレイヤーを視認していれば全員が追跡
  const groupVisible = otherEnemies.some(
    (e) => e.enemyType === enemy.enemyType && hasLineOfSight(e.pos, playerPos, state),
  );
  const selfVisible = hasLineOfSight(enemy.pos, playerPos, state);

  if (groupVisible || selfVisible) {
    return decideChase(enemy, playerPos, state, otherEnemies);
  }

  // 視認できていない場合はパトロール相当（ランダム移動）
  return { type: 'skip' };
}

function decideExplode(
  enemy: Enemy,
  playerPos: Position,
): EnemyAction {
  const dist = manhattanDistance(enemy.pos, playerPos);
  if (dist <= 1) {
    return { type: 'explode' };
  }
  // 隣接していなければ通常の直進（別途 straight で処理）
  return { type: 'skip' };
}

// ---------------------------------------------------------------------------
// 敵VS敵 攻撃可否判定
// ---------------------------------------------------------------------------

/**
 * attacker が target を攻撃できるかどうか判定する。
 *
 * @param attacker - 攻撃側の敵
 * @param target - ターゲットの敵
 * @returns 攻撃できる場合 true
 */
export function canEnemyAttackEnemy(attacker: Enemy, target: Enemy): boolean {
  // berserker は全員を攻撃できる
  if (attacker.canAttackAllies) return true;
  // 同じ派閥（faction_a）は攻撃しない
  if (
    attacker.factionType === 'faction_a' &&
    target.factionType === 'faction_a'
  ) {
    return false;
  }
  // それ以外は敵も攻撃可能（偶発的衝突）
  return true;
}

// ---------------------------------------------------------------------------
// berserker AI: 全方向攻撃
// ---------------------------------------------------------------------------

/**
 * berserker の行動を決定する。
 * 隣接する最も近い存在（プレイヤー or 他の敵）を優先攻撃する。
 */
function decideBerserk(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  const distToPlayer = manhattanDistance(enemy.pos, playerPos);

  // 隣接する全ターゲットを収集（プレイヤー + 他の敵）
  type NearTarget = { distVal: number; action: EnemyAction };
  const nearTargets: NearTarget[] = [];

  // プレイヤーが隣接していれば攻撃候補に追加
  if (distToPlayer === 1) {
    nearTargets.push({ distVal: distToPlayer, action: { type: 'attack', targetId: 'player' } });
  }

  // 隣接する敵を攻撃候補に追加
  for (const other of otherEnemies) {
    const d = manhattanDistance(enemy.pos, other.pos);
    if (d === 1 && canEnemyAttackEnemy(enemy, other)) {
      nearTargets.push({ distVal: d, action: { type: 'attack', targetId: String(other.id) } });
    }
  }

  if (nearTargets.length > 0) {
    // 最も近いターゲットを攻撃（同距離の場合はプレイヤー優先のため先頭を使う）
    nearTargets.sort((a, b) => a.distVal - b.distVal);
    return nearTargets[0].action;
  }

  // 隣接していなければ最も近い存在へ向かって移動
  let closestPos = playerPos;
  let closestDist = distToPlayer;
  for (const other of otherEnemies) {
    const d = manhattanDistance(enemy.pos, other.pos);
    if (d < closestDist && canEnemyAttackEnemy(enemy, other)) {
      closestDist = d;
      closestPos = other.pos;
    }
  }

  const nextPos = getBFSMove(enemy, closestPos, state, otherEnemies);
  if (nextPos.x !== enemy.pos.x || nextPos.y !== enemy.pos.y) {
    return { type: 'move', to: nextPos };
  }
  return { type: 'skip' };
}

// ---------------------------------------------------------------------------
// メイン: decideEnemyAction
// ---------------------------------------------------------------------------

/**
 * 1体の敵の行動を決定する。
 *
 * @param enemy - 行動させる敵
 * @param state - 現在の GameState
 * @param rng - 0〜1 乱数関数（再現性のあるものを渡す）
 * @returns 決定されたアクション
 */
export function decideEnemyAction(
  enemy: Enemy,
  state: GameState,
  rng: () => number,
): EnemyAction {
  const player = state.player;
  if (!player) return { type: 'skip' };

  const otherEnemies = state.enemies.filter((e) => e.id !== enemy.id);
  const playerPos = player.pos;

  // berserker は専用ロジック（factionType または canAttackAllies で判定）
  if (enemy.factionType === 'berserker' || enemy.canAttackAllies === true) {
    return decideBerserk(enemy, playerPos, state, otherEnemies);
  }

  // neutral / faction_a: 基本はプレイヤーを狙う。
  // フロアが浅い（1-3F）ほど友軍誤射は稀。4F以降は10%。
  const friendlyFireChance = state.floor <= 3 ? 0.01 : 0.1;
  if (rng() < friendlyFireChance) {
    const adjacentEnemy = otherEnemies.find(
      (e) => manhattanDistance(enemy.pos, e.pos) === 1 && canEnemyAttackEnemy(enemy, e),
    );
    if (adjacentEnemy) {
      return { type: 'attack', targetId: String(adjacentEnemy.id) };
    }
  }

  // 特殊能力チェック（aiType に関係なく発動するパッシブ/アクティブ特殊行動）
  const special = enemy.special;
  const dist = manhattanDistance(enemy.pos, playerPos);

  // mine_beetle: 隣接時に自爆 (explode_on_adjacent)
  if (special === 'explode_on_adjacent' && dist <= 1) {
    return { type: 'explode' };
  }

  // bomb_lobber: 射程内（5マス以内）でグレネード投擲 (lob_grenade)
  if (special === 'lob_grenade') {
    if (dist <= 5 && dist >= 2) {
      if (hasLineOfSight(enemy.pos, playerPos, state)) {
        const grenadeRadius = 1;
        const grenadeDmg = Math.floor(enemy.atk * 1.5);
        return { type: 'lob_grenade', targetPos: playerPos, radius: grenadeRadius, damage: grenadeDmg };
      }
    }
  }

  // scout_drone: 一定確率で仲間を呼ぶ (call_allies)
  if (special === 'call_allies' && dist <= 6) {
    const turn = state.exploration?.turn ?? 0;
    if (turn % 3 === 0) { // 3ターンに1回
      return { type: 'call_allies', pos: enemy.pos };
    }
  }

  // rust_hound: 仲間と隣接しているとき咆哮 (pack_howl)
  if (special === 'pack_howl') {
    const packMates = otherEnemies.filter(
      (e) => e.baseEnemyId === enemy.baseEnemyId && manhattanDistance(enemy.pos, e.pos) <= 2
    );
    const turn = state.exploration?.turn ?? 0;
    if (packMates.length >= 1 && turn % 4 === 0) {
      return { type: 'pack_howl', pos: enemy.pos };
    }
  }

  // mine_layer: 3ターンに1回地雷設置 (lay_mines)
  if (special === 'lay_mines') {
    const turn = state.exploration?.turn ?? 0;
    if (turn % 3 === 1) {
      return { type: 'lay_mine', pos: enemy.pos };
    }
  }

  // assault_mecha: 視線が通れば遠距離攻撃 (ranged_attack)
  if (special === 'ranged_attack' && dist >= 2 && dist <= 8) {
    if (hasLineOfSight(enemy.pos, playerPos, state)) {
      const rangedDmg = Math.floor(enemy.atk * 1.2);
      return { type: 'ranged_attack', targetId: 'player', from: enemy.pos, to: playerPos, damage: rangedDmg };
    }
  }

  switch (enemy.aiType as EnemyAiType) {
    case 'straight':
      return decideChase(enemy, playerPos, state, otherEnemies);

    case 'patrol':
      return decidePatrol(enemy, playerPos, state, otherEnemies);

    case 'guard':
      return decideGuard(enemy, playerPos, state, otherEnemies);

    case 'sniper':
      return decideSniper(enemy, playerPos, state, otherEnemies);

    case 'support':
      return decideSupport(enemy, playerPos, state, otherEnemies);

    case 'ambush':
      return decideAmbush(enemy, playerPos, state, otherEnemies, rng);

    case 'flee':
      return decideFlee(enemy, playerPos, state, otherEnemies);

    case 'group':
      return decideGroup(enemy, playerPos, state, otherEnemies);

    case 'explode':
      return decideExplode(enemy, playerPos);

    case 'oil_drum':
      return decideOilDrum(enemy, playerPos, state, otherEnemies);

    case 'igniter':
      return decideIgniter(enemy, playerPos, state, otherEnemies);

    case 'fire_body':
      return decideFireBody(enemy, playerPos, state, otherEnemies);

    default:
      return decideChase(enemy, playerPos, state, otherEnemies);
  }
}

// ---------------------------------------------------------------------------
// オイルドラムAI: 周囲にオイルを撒き、プレイヤーへ近づく
// ---------------------------------------------------------------------------

function decideOilDrum(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  const map = state.map;
  if (!map) return { type: 'skip' };

  // 1ターンおきにオイルを撒く（偶数ターンのみ）
  const turn = state.exploration?.turn ?? 0;
  const level = enemy.level ?? 1;
  // レベルに応じてオイルを撒く量（半径）: Lv1=1, Lv2=2, Lv3=3...
  const spreadRadius = Math.min(level, 3);

  if (turn % 2 === 0) {
    const oilPositions: Position[] = [];
    for (let dy = -spreadRadius; dy <= spreadRadius; dy++) {
      for (let dx = -spreadRadius; dx <= spreadRadius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = enemy.pos.x + dx;
        const ny = enemy.pos.y + dy;
        if (ny < 0 || ny >= map.height || nx < 0 || nx >= map.width) continue;
        const tile = map.cells[ny][nx].tile;
        if (tile === '.' || tile === 'S') { // TILE_FLOOR or TILE_START
          oilPositions.push({ x: nx, y: ny });
        }
      }
    }
    if (oilPositions.length > 0) {
      return { type: 'spread_oil', positions: oilPositions };
    }
  }

  // オイルを撒かないターンはプレイヤーへ接近
  const dist = manhattanDistance(enemy.pos, playerPos);
  if (dist === 1) return { type: 'attack', targetId: 'player' };
  return decideChase(enemy, playerPos, state, otherEnemies);
}

// ---------------------------------------------------------------------------
// 着火ロボAI: 近くのオイルマスを探して着火し、それ以外はプレイヤーへ接近
// ---------------------------------------------------------------------------

function decideIgniter(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  const map = state.map;
  if (!map) return { type: 'skip' };

  const level = enemy.level ?? 1;
  // 周囲3マス以内のオイルマスを探す
  const searchRadius = 3;
  let nearestOil: Position | null = null;
  let nearestOilDist = Infinity;

  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const nx = enemy.pos.x + dx;
      const ny = enemy.pos.y + dy;
      if (ny < 0 || ny >= map.height || nx < 0 || nx >= map.width) continue;
      if (map.cells[ny][nx].tile === TILE_OIL) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < nearestOilDist) {
          nearestOilDist = d;
          nearestOil = { x: nx, y: ny };
        }
      }
    }
  }

  // 隣接オイルマスがあれば即着火
  if (nearestOil && nearestOilDist === 1) {
    return { type: 'ignite_oil', pos: nearestOil };
  }

  // 近くにオイルがあれば向かう（プレイヤーより優先）
  if (nearestOil && nearestOilDist <= searchRadius) {
    const step = nextStep(enemy.pos, nearestOil, map);
    if (step && (step.x !== enemy.pos.x || step.y !== enemy.pos.y)) {
      return { type: 'move', to: step };
    }
  }

  // Lv2以上: 周囲のアイテム・装備マスを探して着火
  if (level >= 2) {
    const itemSearchRadius = 4;
    // まれに（30%）武器も対象にする
    const includeWeapons = Math.random() < 0.3;
    let nearestItem: Position | null = null;
    let nearestItemDist = Infinity;

    for (let dy = -itemSearchRadius; dy <= itemSearchRadius; dy++) {
      for (let dx = -itemSearchRadius; dx <= itemSearchRadius; dx++) {
        const nx = enemy.pos.x + dx;
        const ny = enemy.pos.y + dy;
        if (ny < 0 || ny >= map.height || nx < 0 || nx >= map.width) continue;
        const tile = map.cells[ny][nx].tile;
        const isTarget = tile === TILE_ITEM || (includeWeapons && tile === TILE_WEAPON);
        if (isTarget) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < nearestItemDist) {
            nearestItemDist = d;
            nearestItem = { x: nx, y: ny };
          }
        }
      }
    }

    if (nearestItem && nearestItemDist === 1) {
      return { type: 'ignite_item', pos: nearestItem };
    }
    if (nearestItem && nearestItemDist <= itemSearchRadius) {
      const step = nextStep(enemy.pos, nearestItem, map);
      if (step && (step.x !== enemy.pos.x || step.y !== enemy.pos.y)) {
        return { type: 'move', to: step };
      }
    }
  }

  // オイル・アイテムがなければプレイヤーへ接近
  const dist = manhattanDistance(enemy.pos, playerPos);
  if (dist === 1) return { type: 'attack', targetId: 'player' };
  return decideChase(enemy, playerPos, state, otherEnemies);
}

// ---------------------------------------------------------------------------
// ファイヤーピーポーAI: オイルマス上で着火、炎ダメージ無効、プレイヤーへ接近
// ---------------------------------------------------------------------------

function decideFireBody(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
  otherEnemies: Enemy[],
): EnemyAction {
  const map = state.map;
  if (!map) return { type: 'skip' };

  // 自分が今オイルマスの上にいる場合は着火
  const currentTile = map.cells[enemy.pos.y]?.[enemy.pos.x]?.tile;
  if (currentTile === TILE_OIL) {
    return { type: 'ignite_oil', pos: enemy.pos };
  }

  // Lv3以上: 周囲のアイテム・装備マスを探して着火
  const level = enemy.level ?? 1;
  if (level >= 3) {
    const itemSearchRadius = 4;
    const includeWeapons = Math.random() < 0.3;
    let nearestItem: Position | null = null;
    let nearestItemDist = Infinity;

    for (let dy = -itemSearchRadius; dy <= itemSearchRadius; dy++) {
      for (let dx = -itemSearchRadius; dx <= itemSearchRadius; dx++) {
        const nx = enemy.pos.x + dx;
        const ny = enemy.pos.y + dy;
        if (ny < 0 || ny >= map.height || nx < 0 || nx >= map.width) continue;
        const tile = map.cells[ny][nx].tile;
        const isTarget = tile === TILE_ITEM || (includeWeapons && tile === TILE_WEAPON);
        if (isTarget) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < nearestItemDist) {
            nearestItemDist = d;
            nearestItem = { x: nx, y: ny };
          }
        }
      }
    }

    if (nearestItem && nearestItemDist === 1) {
      return { type: 'ignite_item', pos: nearestItem };
    }
    if (nearestItem && nearestItemDist <= itemSearchRadius) {
      const step = nextStep(enemy.pos, nearestItem, map);
      if (step && (step.x !== enemy.pos.x || step.y !== enemy.pos.y)) {
        return { type: 'move', to: step };
      }
    }
  }

  // 通常はプレイヤーへ接近
  const dist = manhattanDistance(enemy.pos, playerPos);
  if (dist === 1) return { type: 'attack', targetId: 'player' };
  return decideChase(enemy, playerPos, state, otherEnemies);
}

// ---------------------------------------------------------------------------
// 巡回パス生成ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 敵の初期位置を基準に単純な往復巡回パスを生成する。
 * 右に range タイル移動して戻る往路・復路を返す。
 *
 * @param origin - 初期座標
 * @param range - 巡回距離（タイル数）
 * @param floor - マップ（歩行可能チェック用）
 * @returns 巡回ポイントの配列
 */
export function generateSimplePatrolPath(
  origin: Position,
  range: number,
  floor: import('./types').Floor,
): Position[] {
  const path: Position[] = [origin];

  // 右方向へ range タイル歩けるか確認
  for (let i = 1; i <= range; i++) {
    const pos = { x: origin.x + i, y: origin.y };
    const tile = getTileAt(floor, pos);
    if (!isWalkable(tile)) break;
    path.push(pos);
  }

  return path;
}
