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
    const t1 = setTimeout(() => setVisible(false), 2500);
    const t2 = setTimeout(onFinish, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onFinish]);

  const bossName = bosses.find((b) => b.id === bossType)?.name ?? bossType;

  return (
    <div
      style={{
        position: 'absolute',
        top: '18%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
        backgroundColor: 'rgba(40, 28, 0, 0.93)',
        border: '2px solid #ffaa00',
        borderRadius: 8,
        padding: '10px 24px',
        fontFamily: 'monospace',
        textAlign: 'center',
        boxShadow: '0 0 20px rgba(255,170,0,0.5), 0 0 40px rgba(255,170,0,0.2)',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontSize: 11, color: '#ffaa44', marginBottom: 3, letterSpacing: '0.1em' }}>⚡ ボス撃破</div>
      <div style={{ fontSize: 15, color: '#ffdd44', fontWeight: 'bold', letterSpacing: '0.05em' }}>{bossName}</div>
    </div>
  );
}
