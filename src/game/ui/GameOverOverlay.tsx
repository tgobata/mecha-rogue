'use client';

import React, { useState, useEffect } from 'react';
import { playSE } from '../systems/audio';
import bossesRaw from '../assets/data/bosses.json';

interface GameOverOverlayProps {
  floor: number;
  pilotLevel: number;
  enemiesDefeated: number;
  goldEarned: number;
  bossesDefeated: string[];
  onRestart: () => void;
  onTitle: () => void;
}

const BOSS_NAME_OVERRIDES: Record<string, string> = {
  last_boss_shadow: 'ラストボスシャドウ',
  death_machine: 'デスマシン',
};

const bossList = bossesRaw as { id: string; name: string; floor: number }[];

function getBossName(id: string): string {
  if (BOSS_NAME_OVERRIDES[id]) return BOSS_NAME_OVERRIDES[id];
  const found = bossList.find((b) => b.id === id);
  return found ? found.name : id;
}

function getBossFloor(id: string): number {
  const found = bossList.find((b) => b.id === id);
  return found ? found.floor : 0;
}

function getEvaluation(
  floor: number,
  bossCount: number
): { rank: string; color: string; message: string } {
  void bossCount;
  if (floor <= 3) {
    return {
      rank: 'F',
      color: '#777777',
      message: '序盤で力尽きた。迷宮は甘くない。次こそ慎重に進め。',
    };
  } else if (floor <= 7) {
    return {
      rank: 'D',
      color: '#aa8844',
      message: '道半ばで倒れた。しかしその戦いは無駄ではない。',
    };
  } else if (floor <= 12) {
    return {
      rank: 'C',
      color: '#44aacc',
      message: '深部への意志を見せた。次こそ限界を突破せよ。',
    };
  } else if (floor <= 18) {
    return {
      rank: 'B',
      color: '#44cc88',
      message: '深層まで踏み込んだ。あと少しで届いたはずだ。',
    };
  } else if (floor <= 28) {
    return {
      rank: 'A',
      color: '#ffcc00',
      message: '強大な敵と渡り合った証だ。次こそ勝利を掴め！',
    };
  } else {
    return {
      rank: 'S',
      color: '#ff6600',
      message: '伝説的な戦いだった。次こそラストボスを倒せ！！',
    };
  }
}

const GameOverOverlay: React.FC<GameOverOverlayProps> = ({
  floor,
  pilotLevel,
  enemiesDefeated,
  goldEarned,
  bossesDefeated,
  onRestart,
  onTitle,
}) => {
  const [visible, setVisible] = useState(false);
  /** ゴーストタップ防止: オーバーレイ表示直後のタッチで誤ってボタンが押されないよう
   *  一定時間はポインターイベントを無効化する（iOS のタッチ→クリック変換遅延対策）*/
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const visTimer = setTimeout(() => setVisible(true), 200);
    // iOS のゴーストタップは最大 350ms 程度遅延するため、それより長い 500ms 後に有効化
    const intTimer = setTimeout(() => setInteractive(true), 500);
    return () => {
      clearTimeout(visTimer);
      clearTimeout(intTimer);
    };
  }, []);

  const evaluation = getEvaluation(floor, bossesDefeated.length);

  const sortedBosses = [...bossesDefeated].sort(
    (a, b) => getBossFloor(a) - getBossFloor(b)
  );

  const stats: { label: string; value: string; color: string }[] = [
    { label: '到達階層', value: `B${floor}F`, color: '#ffffff' },
    { label: 'パイロットLv', value: `Lv.${pilotLevel}`, color: '#88ddff' },
    { label: '撃破数', value: `${enemiesDefeated}体`, color: '#ff8888' },
    { label: '獲得資金', value: `${goldEarned}G`, color: '#ffcc44' },
    { label: '討伐ボス', value: `${bossesDefeated.length}体`, color: '#ff9944' },
  ];

  return (
    <div
      className="absolute inset-0 z-[100] font-mono overflow-y-auto"
      style={{
        background: `rgba(0,0,0,0.97)`,
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.015) 2px, rgba(0,255,0,0.015) 4px)',
      }}
    >
      <div
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.6s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '32px 16px 48px',
          gap: '20px',
        }}
      >
        {/* GAME OVER ロゴ */}
        <div className="animate-pulse" style={{ transform: 'scale(1.5)', marginBottom: '8px', marginTop: '16px' }}>
          <img
            src="/sprites/ui/gameover.png"
            alt="GAME OVER"
            style={{
              imageRendering: 'pixelated',
              filter: 'drop-shadow(0 0 20px rgba(255,0,51,0.9))',
            }}
            className="drop-shadow-[0_0_20px_rgba(255,0,51,0.9)]"
          />
        </div>

        {/* RANK バッジ */}
        <div
          style={{
            fontSize: 22,
            color: evaluation.color,
            border: `2px solid ${evaluation.color}`,
            borderRadius: 4,
            padding: '4px 20px',
            boxShadow: `0 0 16px ${evaluation.color}88`,
            letterSpacing: '0.1em',
          }}
        >
          RANK {evaluation.rank}
        </div>

        {/* 評価メッセージ */}
        <div
          style={{
            color: '#ccbbaa',
            fontSize: 12,
            textAlign: 'center',
            maxWidth: 280,
            lineHeight: 1.6,
          }}
        >
          {evaluation.message}
        </div>

        {/* 作戦記録パネル */}
        <div
          style={{
            width: '100%',
            maxWidth: 280,
            background: 'rgba(10,10,30,0.8)',
            border: '1px solid #2a3a4a',
            borderRadius: 4,
            padding: '12px',
          }}
        >
          <div
            style={{
              color: '#5588aa',
              fontSize: 10,
              marginBottom: 10,
              letterSpacing: '0.05em',
            }}
          >
            ◆ 作戦記録
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                <span style={{ color: '#446677', fontSize: 9 }}>{stat.label}</span>
                <span
                  style={{
                    color: stat.color,
                    fontSize: 15,
                    fontWeight: 'bold',
                  }}
                >
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 討伐ボス記録パネル */}
        {bossesDefeated.length > 0 && (
          <div
            style={{
              width: '100%',
              maxWidth: 280,
              background: 'rgba(30,10,10,0.8)',
              border: '1px solid #4a1a1a',
              borderRadius: 4,
              padding: '12px',
            }}
          >
            <div
              style={{
                color: '#cc5544',
                fontSize: 10,
                marginBottom: 10,
                letterSpacing: '0.05em',
              }}
            >
              ◆ 討伐ボス一覧
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedBosses.map((id) => {
                const bFloor = getBossFloor(id);
                return (
                  <div
                    key={id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: '#ffaa88', fontSize: 12 }}>
                      {'\u{1F480}'} {getBossName(id)}
                    </span>
                    <span style={{ color: '#664444', fontSize: 10 }}>
                      B{bFloor}F
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ボタン */}
        <div
          style={{
            width: '100%',
            maxWidth: 260,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            // ゴーストタップ防止: interactive になるまでポインターイベントを無効化
            pointerEvents: interactive ? 'auto' : 'none',
            opacity: interactive ? 1 : 0.5,
          }}
        >
          <button
            onClick={() => {
              playSE('ui_select');
              onRestart();
            }}
            style={{
              background: '#4a1a1a',
              border: '2px solid #cc3333',
              color: '#ffaaaa',
              padding: '14px',
              fontSize: 14,
              fontFamily: 'monospace',
              cursor: 'pointer',
              borderRadius: 2,
              textAlign: 'center',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            ▶ 拠点に帰還する
          </button>
          <button
            onClick={() => {
              playSE('ui_cancel');
              onTitle();
            }}
            style={{
              background: 'rgba(20,20,30,0.8)',
              border: '1px solid #334455',
              color: '#668899',
              padding: '10px',
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
              borderRadius: 2,
              textAlign: 'center',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            タイトルへ
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameOverOverlay;
