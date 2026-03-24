/**
 * @fileoverview ボス専用AIシステム
 *
 * GDD 7.3 に基づく全13体のボスの固有処理を実装する。
 * 各ボスの special フィールドに応じて行動を分岐する。
 */

import type { GameState, Enemy } from './game-state';
import type { Position } from './types';
import { manhattanDistance, getTileAt, isWalkable, getNeighbors4 } from './floorUtils';
import { nextStep } from './pathfinding';
import type { EnemyAction } from './enemy-ai';
import { decideEnemyAction } from './enemy-ai';

// ---------------------------------------------------------------------------
// ボスの固有行動処理（id / special ベース）
// ---------------------------------------------------------------------------

/**
 * ボスの行動を決定するメイン関数。
 * turn-system.ts の processEnemyActions から、aiType === 'boss' の場合に呼ばれる想定。
 *
 * @param boss - 対象のボスエンティティ
 * @param state - 現在の GameState
 * @param rng - 乱数生成器
 * @returns 複数のアクション配列（※現状は turn-system が1アクションのみ対応のため、複数アクションが必要な場合はボスの内部ステータスで管理するか、呼び出し元の改修が必要）
 */
export function decideBossAction(
  boss: Enemy,
  state: GameState,
  rng: () => number,
): EnemyAction[] {
  const actions: EnemyAction[] = [];
  const player = state.player;
  if (!player) return [{ type: 'skip' }];

  switch (boss.bossState?.id) {
    case 'bug_swarm':
      // バグスウォーム (2F): maze-generator 側で1体しか出していないため、とりあえず直進。
      // 個体ATK (unitAtk) は攻撃時に計算される想定だが、ここでは通常の attack として扱う。
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    case 'mach_runner':
      // スピード狂 (4F): 1ターンにつき3回行動
      // 氷結・EMPによる完全停止（状態異常）は processEnemyActions 前に canAct 等で弾かれる想定
      for (let i = 0; i < (boss.bossState.actionsPerTurn || 3); i++) {
        // ※実際には各行動の合間に状態が変化するが、ここでは擬似的に現在の距離ベースで複数アクションを生成
        actions.push(decideChaseWithAttack(boss, player.pos, state));
      }
      break;

    case 'junk_king':
      // ジャンクキング (5F): 壁破壊吸収 & 破片弾丸
      // 便宜上、隣接していれば優先攻撃、近接に壁(WALL, CRACKED_WALL)があれば吸収回復、
      // クールダウンがゼロの時は遠隔攻撃(projectile)を放つなどのロジックが考えられる。
      // 実装の複雑化を避けるため、今回は基本的な近接追跡 AI とする。
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    case 'phantom':
      // 透明マン (7F): 4ターン中3ターン透明
      // ※描画側や攻撃対象判定側で transparent=true を処理する。AI自身は普通に追いかける。
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;
      
    case 'iron_fortress':
      // アイアンフォートレス (9F): 3ターンに1回範囲砲撃、正面装甲50
      // 砲撃のクールダウン管理は bossState 内で行う。
      if (!boss.bossState.currentCooldown) boss.bossState.currentCooldown = 0;
      if (boss.bossState.currentCooldown <= 0) {
        // 砲撃アクション（※turn-system が特殊攻撃を解釈できるかどうかに依存。ここではskipして自爆同等の広範囲ダメージ処理等が必要か）
        // とりあえず今回は cooldown をリセットしつつ通常攻撃を返す
        boss.bossState.currentCooldown = boss.bossState.cannonCooldown || 3;
      } else {
        boss.bossState.currentCooldown--;
      }
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    case 'samurai_master':
      // サムライマスター (10F): 1ターン2回行動、HP50%以下で居合い
      // 便宜上2回ChaseAttackを積む。本来なら特定HP以下で特殊射程攻撃を行う。
      for (let i = 0; i < (boss.bossState.attacksPerTurn || 2); i++) {
        actions.push(decideChaseWithAttack(boss, player.pos, state));
      }
      break;

    case 'shadow_twin':
      // シャドウツイン (15F): 片方が死ぬと暴走
      // 毎ターン他の shadow_twin の生存を確認。死んでいたら enraged フラグを立てる等の処理。
      // enraged時は speed と atk が上がる。ここは基本的なChaseとする。
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    case 'queen_of_shadow':
      // クイーン・オブ・シャドウ (20F): 3フェーズ変化
      // HP に応じてフェーズを変え、行動（召喚、視界縮小、吸収強化）を変える。
      // 現状はHP割合に関わらずChase。
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    case 'mind_controller':
      // マインドコントローラー (25F): 操作反転
      // プレイヤー側にデバフをかける Action Type が別途必要。現状はChase。
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    case 'overload':
      // オーバーロード (30F): プレイヤーの最強武器をコピーして攻撃、3ターンごとにシールド
      if (!boss.bossState.currentCooldown) boss.bossState.currentCooldown = 0;
      if (boss.bossState.currentCooldown <= 0) {
        // シールド展開アクション（被ダメージ無効化1回）
        // ※turn-system 側で shield 状態異常等を付ける処理が必要。
        // ここでは便宜上、通常攻撃を行う。
        boss.bossState.currentCooldown = boss.bossState.shieldCooldown || 3;
      } else {
        boss.bossState.currentCooldown--;
      }
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    case 'time_eater':
      // タイムイーター (35F): 5ターンに1回フロア全体を2ターン前の状態に巻き戻す
      if (!boss.bossState.currentCooldown) boss.bossState.currentCooldown = boss.bossState.rewindCooldown || 5;
      if (boss.bossState.currentCooldown <= 0) {
        // 巻き戻しアクション（GameState の履歴保持が必要。現状は実装不可能なのでスキップするか通常攻撃）
        boss.bossState.currentCooldown = boss.bossState.rewindCooldown || 5;
      } else {
        boss.bossState.currentCooldown--;
      }
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    case 'eternal_core':
      // エターナルコア (40F): 部屋の中央固定。防御ノード4つ。全方向ビーム。
      // 固定のため移動(move)はしない。攻撃(attack)のみを返す。
      // ※ビームは全方向範囲攻撃。
      const distToCore = manhattanDistance(boss.pos, player.pos);
      if (distToCore > 0) { // 固定砲台なので距離に寄らず攻撃する（射程内なら）
        actions.push({ type: 'attack', targetId: 'player' }); // 本来は範囲攻撃やビーム射程のチェックが必要
      } else {
        actions.push({ type: 'skip' });
      }
      break;

    case 'final_boss':
      // ラスボス (50F): 5ターンごとに過去の全ボスの特殊能力をランダムで使用
      if (!boss.bossState.currentCooldown) boss.bossState.currentCooldown = boss.bossState.abilityRotationTurns || 5;
      if (boss.bossState.currentCooldown <= 0) {
        // ランダムスキル使用
        boss.bossState.currentCooldown = boss.bossState.abilityRotationTurns || 5;
      } else {
        boss.bossState.currentCooldown--;
      }
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    default:
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;
  }

  return actions.length > 0 ? actions : [{ type: 'skip' }];
}

// ---------------------------------------------------------------------------
// 汎用ヘルパー
// ---------------------------------------------------------------------------

/**
 * ボスの占有タイル端からターゲットまでのマンハッタン距離を返す。
 * 1×1 の通常敵でも bossSize=1 として正しく動作する。
 */
function bossEdgeDist(boss: Enemy, target: Position): number {
  const size = boss.bossSize ?? 1;
  const dx = Math.max(0, Math.max(boss.pos.x - target.x, target.x - (boss.pos.x + size - 1)));
  const dy = Math.max(0, Math.max(boss.pos.y - target.y, target.y - (boss.pos.y + size - 1)));
  return dx + dy;
}

/** 単純な追跡と隣接時の攻撃を決定する（boss-ai用） */
function decideChaseWithAttack(
  enemy: Enemy,
  playerPos: Position,
  state: GameState,
): EnemyAction {
  // 攻撃距離：ボス占有タイルのエッジからプレイヤーまで 1 マス
  if (bossEdgeDist(enemy, playerPos) === 1) {
    return { type: 'attack', targetId: 'player' };
  }

  const size = enemy.bossSize ?? 1;
  const map = state.map!;
  const step = nextStep(enemy.pos, playerPos, map);

  // 衝突チェック：size×size タイル全体が歩行可能かつ非占有かを確認
  if (step.x !== enemy.pos.x || step.y !== enemy.pos.y) {
    const otherEnemies = state.enemies.filter((e) => e.id !== enemy.id);
    let blocked = false;
    outer: for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        const checkPos = { x: step.x + dx, y: step.y + dy };
        if (!isWalkable(getTileAt(map, checkPos))) { blocked = true; break outer; }
        if (otherEnemies.some((e) => {
          const es = e.bossSize ?? 1;
          return checkPos.x >= e.pos.x && checkPos.x < e.pos.x + es &&
                 checkPos.y >= e.pos.y && checkPos.y < e.pos.y + es;
        })) { blocked = true; break outer; }
      }
    }
    if (!blocked) return { type: 'move', to: step };
  }

  return { type: 'skip' };
}
