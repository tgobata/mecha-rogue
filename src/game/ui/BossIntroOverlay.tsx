'use client';

import { useEffect, useState } from 'react';
import bossesRaw from '../assets/data/bosses.json';

const bosses = bossesRaw as any[];

interface Props {
  floor: number;
  onFinish: () => void;
}

export default function BossIntroOverlay({ floor, onFinish }: Props) {
  const [phase, setPhase] = useState<'fade-in' | 'show-text' | 'fade-out'>('fade-in');

  useEffect(() => {
    // 0.5s fade-in
    const t1 = setTimeout(() => setPhase('show-text'), 500);
    // 2.5s show text
    const t2 = setTimeout(() => setPhase('fade-out'), 3000);
    // 0.5s fade-out
    const t3 = setTimeout(() => {
      onFinish();
    }, 3500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onFinish]);

  const bossData = bosses.find((b: any) => b.floor === floor);
  const bossName = bossData?.name ?? 'Unknown Entity';

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{
        backgroundColor: phase === 'fade-out' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)',
        transition: 'background-color 0.5s ease',
      }}
    >
      {(phase === 'show-text' || phase === 'fade-out') && (
        <div
          className="text-center"
          style={{
            opacity: phase === 'show-text' ? 1 : 0,
            transform: phase === 'show-text' ? 'scale(1)' : 'scale(1.5)',
            transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          <div 
            className="text-red-500 font-bold tracking-widest mb-2" 
            style={{ fontSize: '1.2rem', fontFamily: 'monospace', textShadow: '0 0 10px #ff0000' }}
          >
            WARNING: POWERFUL SIGNAL DETECTED
          </div>
          <div
            className="text-white font-black"
            style={{ fontSize: '3rem', fontFamily: 'monospace', textShadow: '0 0 20px #ff0000, 0 0 40px #ff0000' }}
          >
            {bossName}
          </div>
        </div>
      )}
    </div>
  );
}
