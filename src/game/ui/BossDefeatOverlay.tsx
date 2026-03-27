'use client';

import { useEffect, useState } from 'react';
import bossesRaw from '../assets/data/bosses.json';

const bosses = bossesRaw as { id: string; name: string }[];

interface Props {
  bossType: string;
  onFinish: () => void;
}

export default function BossDefeatOverlay({ bossType, onFinish }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 1200);
    const t2 = setTimeout(onFinish, 1700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onFinish]);

  const bossName = bosses.find((b) => b.id === bossType)?.name ?? bossType;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}
    >
      <div
        className="text-center"
        style={{
          transform: visible ? 'scale(1)' : 'scale(0.85)',
          transition: 'transform 0.5s ease',
        }}
      >
        <div
          style={{
            fontSize: '1rem',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            letterSpacing: '0.3em',
            color: '#44ff88',
            textShadow: '0 0 10px #00ff44, 0 0 20px #00ff44',
            marginBottom: '0.5rem',
          }}
        >
          TARGET NEUTRALIZED
        </div>
        <div
          style={{
            fontSize: '2.2rem',
            fontFamily: 'monospace',
            fontWeight: 900,
            color: '#ffdd44',
            textShadow: '0 0 20px #ffaa00, 0 0 40px #ff8800',
            marginBottom: '0.4rem',
          }}
        >
          {bossName}
        </div>
        <div
          style={{
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            color: '#88ccaa',
            letterSpacing: '0.25em',
          }}
        >
          ─── THREAT ELIMINATED ───
        </div>
      </div>
    </div>
  );
}
