/**
 * @fileoverview ボス専用AIシステム
 *
 * GDD 7.3 に基づく全13体のボスの固有処理を実装する。
 * 各ボスの special フィールドに応じて行動を分岐する。
 */

import type { GameState, Enemy } from './game-state';
import type { Position } from './types';
import { manhattanDistance, getTileAt, isWalkable, getNeighbors4, getDirection } from './floorUtils';
import { nextStep } from './pathfinding';
import type { EnemyAction } from './enemy-ai';
import { decideEnemyAction } from './enemy-ai';
import { TILE_CRACKED_WALL, TILE_FLOOR } from './constants';

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
      // バグスウォーム (2F): 8体の小虫として生成済み（swarmUnitIndex を持つ）。通常の追跡。
      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;

    case 'mach_runner': {
      // スピード狂 (4F): 1ターンにつき3回行動。前回の移動位置を次の計算に使う。
      // フリーズ状態による完全停止は canAct() で処理される想定。
      let tempBoss = boss;
      for (let i = 0; i < (boss.bossState.actionsPerTurn || 3); i++) {
        const action = decideChaseWithAttack(tempBoss, player.pos, state);
        actions.push(action);
        if (action.type === 'move') {
          tempBoss = { ...tempBoss, pos: action.to };
        } else if (action.type === 'attack') {
          break; // 攻撃したら以降の行動はキャンセル
        }
      }
      break;
    }

    case 'junk_king': {
      // ジャンクキング (5F): 周囲のひび割れ壁を吸収→HP+10/ATK+3。3ターンごとに弾丸発射。
      // 初期化
      if (boss.bossState.currentCooldown === undefined) {
        boss.bossState.currentCooldown = boss.bossState.projectileCooldown ?? 3;
        boss.bossState.absorbCount = 0;
      }

      // 周囲のひび割れ壁を探す（ボスサイズ+2タイル以内）
      const checkRange = (boss.bossSize ?? 2) + 2;
      let foundWall: Position | null = null;
      if (state.map) {
        outer: for (let dx = -checkRange; dx <= checkRange; dx++) {
          for (let dy = -checkRange; dy <= checkRange; dy++) {
            const wp = { x: boss.pos.x + dx, y: boss.pos.y + dy };
            if (wp.x >= 0 && wp.y >= 0 && wp.y < state.map.height && wp.x < state.map.width) {
              if (getTileAt(state.map, wp) === TILE_CRACKED_WALL) {
                foundWall = wp;
                break outer;
              }
            }
          }
        }
      }

      if (foundWall) {
        // 壁を吸収（このターンは吸収のみ）
        actions.push({ type: 'absorb_wall', wallPos: foundWall });
      } else {
        // クールダウン更新
        boss.bossState.currentCooldown--;
        if (boss.bossState.currentCooldown <= 0) {
          boss.bossState.currentCooldown = boss.bossState.projectileCooldown ?? 3;
          if ((boss.bossState.absorbCount ?? 0) > 0) {
            // 吸収した破片を弾丸として発射
            boss.bossState.absorbCount = 0;
            actions.push({ type: 'attack', targetId: 'player' });
          } else {
            actions.push(decideChaseWithAttack(boss, player.pos, state));
          }
        } else {
          actions.push(decideChaseWithAttack(boss, player.pos, state));
        }
      }
      break;
    }

    case 'phantom': {
      // 透明マン (7F): 4ターン中3ターンは透明（isInvisible フラグ管理）
      // 透明時も攻撃してくる。姿が見える1ターンのみ攻撃可能。
      // 初期化
      if (boss.bossState.visibilityTimer === undefined) {
        boss.bossState.visibilityTimer = 0;
        boss.bossState.isInvisible = false;
      }

      // smoke_bomb 等による強制可視化のカウントダウン
      if ((boss.bossState.revealedTurns ?? 0) > 0) {
        boss.bossState.revealedTurns--;
      }

      // 透明サイクル更新: 0=可視, 1〜3=不可視
      boss.bossState.visibilityTimer = ((boss.bossState.visibilityTimer ?? 0) + 1) % 4;
      boss.bossState.isInvisible = boss.bossState.visibilityTimer !== 0;

      actions.push(decideChaseWithAttack(boss, player.pos, state));
      break;
    }
      
    case 'iron_fortress': {
      // アイアンフォートレス (9F): 3ターンに1回3×3範囲砲撃、正面装甲50/背面装甲0
      // 初期化（初回ターンはクールダウンを設定するのみ、砲撃・デクリメントは次ターンから）
      if (boss.bossState.currentCooldown === undefined) {
        boss.bossState.currentCooldown = boss.bossState.cannonCooldown ?? 3;
        actions.push(decideChaseWithAttack(boss, player.pos, state));
        break;
      }

      // ボスは常にプレイヤーの方向を向く（装甲方向管理のため）
      const size = boss.bossSize ?? 4;
      const bossCenterX = boss.pos.x + Math.floor(size / 2);
      const bossCenterY = boss.pos.y + Math.floor(size / 2);
      boss.facing = getDirection(
        { x: bossCenterX, y: bossCenterY },
        { x: player.pos.x, y: player.pos.y }
      );

      // クールダウン更新
      boss.bossState.currentCooldown--;
      if (boss.bossState.currentCooldown <= 0) {
        boss.bossState.currentCooldown = boss.bossState.cannonCooldown ?? 3;
        // 3×3 範囲砲撃
        actions.push({
          type: 'cannon_aoe',
          centerPos: { x: player.pos.x, y: player.pos.y },
          radius: boss.bossState.cannonRadius ?? 1,
          damage: boss.bossState.cannonDamage ?? 25,
        });
      } else {
        actions.push(decideChaseWithAttack(boss, player.pos, state));
      }
      break;
    }

    case 'samurai_master': {
      // サムライマスター (10F): 1ターン2回の斬撃、HP50%以下で居合い
      const hpRatio = boss.hp / boss.maxHp;
      const iaidoThreshold = boss.bossState.iaidoHpThreshold ?? 0.5;

      if (hpRatio <= iaidoThreshold) {
        // 居合い：直線5タイル貫通攻撃
        // まずプレイヤーの方向に向く
        boss.facing = getDirection(boss.pos, player.pos);
        actions.push({
          type: 'iaido',
          range: boss.bossState.iaidoRange ?? 5,
          damage: boss.bossState.iaidoAtk ?? 80,
        });
      } else {
        // 通常: 1ターン2回の斬撃（前方3方向）
        let tempBoss = boss;
        for (let i = 0; i < (boss.bossState.attacksPerTurn ?? 2); i++) {
          const distToPlayer = bossEdgeDist(tempBoss, player.pos);
          if (distToPlayer <= 2) {
            // 斬撃範囲内（2タイル以内）
            boss.facing = getDirection(tempBoss.pos, player.pos);
            actions.push({ type: 'slash_attack' });
          } else {
            const action = decideChaseWithAttack(tempBoss, player.pos, state);
            actions.push(action);
            if (action.type === 'move') {
              tempBoss = { ...tempBoss, pos: action.to };
            } else if (action.type === 'attack') {
              break;
            }
          }
        }
      }
      break;
    }

    case 'shadow_twin': {
      // シャドウツイン (15F): 2体同時出現、片方が死ぬと暴走（ATK×2・2回行動）
      // パートナー（同じenemyType）の存在・生存確認
      const partnerExists = state.enemies.some(
        (e) => e.enemyType === 'shadow_twin' && e.id !== boss.id
      );
      const partnerAlive = state.enemies.some(
        (e) => e.enemyType === 'shadow_twin' && e.id !== boss.id && e.hp > 0
      );

      // 暴走処理（パートナーが存在して死んだ場合のみ、一度だけ発動）
      if (partnerExists && !partnerAlive && !boss.bossState.isEnraged) {
        boss.bossState.isEnraged = true;
        // ATK を2倍にする
        boss.atk = Math.round(boss.atk * (boss.bossState.enragedAtkMult ?? 2));
      }

      // 暴走時は2回行動
      const actionsPerTurn = boss.bossState.isEnraged ? 2 : 1;
      let tempBoss = boss;
      for (let i = 0; i < actionsPerTurn; i++) {
        const action = decideChaseWithAttack(tempBoss, player.pos, state);
        actions.push(action);
        if (action.type === 'move') {
          tempBoss = { ...tempBoss, pos: action.to };
        } else if (action.type === 'attack') {
          break;
        }
      }
      break;
    }

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

    case 'big_oil_drum': {
      // ビッグ！オイルドラム (8F/16F/24F/32F)
      // 行動1: 毎ターンオイルを撒く
      // 行動2: rollCooldown ターンごとにドラムロール（高速突進）
      // 行動3: 隣接時に通常攻撃

      if (!boss.bossState) (boss as any).bossState = {};
      const bossState = boss.bossState;
      const oilRadius = bossState.oilSpreadRadius ?? 4;
      const rollDist = bossState.rollDistance ?? 3;
      const rollCooldown = bossState.rollCooldown ?? 3;
      if (bossState.rollCooldownLeft === undefined) bossState.rollCooldownLeft = rollCooldown;
      let rollCooldownLeft: number = bossState.rollCooldownLeft;

      // オイル撒き（毎ターン周囲にオイルを配置）
      const map = state.map;
      if (map) {
        const oilPositions: Position[] = [];
        for (let dy = -oilRadius; dy <= oilRadius; dy++) {
          for (let dx = -oilRadius; dx <= oilRadius; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = boss.pos.x + dx;
            const ny = boss.pos.y + dy;
            if (ny < 0 || ny >= map.height || nx < 0 || nx >= map.width) continue;
            if (map.cells[ny][nx].tile === TILE_FLOOR) {
              oilPositions.push({ x: nx, y: ny });
            }
          }
        }
        if (oilPositions.length > 0) {
          actions.push({ type: 'spread_oil', positions: oilPositions });
        }
      }

      // ドラムロールクールダウン管理
      rollCooldownLeft--;
      if (rollCooldownLeft <= 0) {
        // ドラムロール: プレイヤー方向に一直線に突進
        const dx = player.pos.x - boss.pos.x;
        const dy = player.pos.y - boss.pos.y;
        // 主方向を決める
        const moveDir = Math.abs(dx) >= Math.abs(dy)
          ? { x: dx > 0 ? 1 : -1, y: 0 }
          : { x: 0, y: dy > 0 ? 1 : -1 };

        let rollPos = { ...boss.pos };
        let moved = 0;
        const bmap = state.map;
        while (moved < rollDist && bmap) {
          const nx = rollPos.x + moveDir.x;
          const ny = rollPos.y + moveDir.y;
          const nextTile = bmap.cells[ny]?.[nx]?.tile;
          if (!nextTile || !isWalkable(nextTile)) break;
          // プレイヤーに当たったら攻撃
          if (nx === player.pos.x && ny === player.pos.y) {
            actions.push({ type: 'attack', targetId: 'player' });
            break;
          }
          rollPos = { x: nx, y: ny };
          moved++;
        }
        if (moved > 0) {
          actions.push({ type: 'move', to: rollPos });
        }
        bossState.rollCooldownLeft = rollCooldown;
      } else {
        // 通常移動または攻撃
        bossState.rollCooldownLeft = rollCooldownLeft;
        const dist = bossEdgeDist(boss, player.pos);
        if (dist <= 1) {
          actions.push({ type: 'attack', targetId: 'player' });
        } else {
          actions.push(decideChaseWithAttack(boss, player.pos, state));
        }
      }
      break;
    }

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
