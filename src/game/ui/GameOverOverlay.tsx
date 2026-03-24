import React from 'react';
import { playSE } from '../systems/audio';

interface GameOverOverlayProps {
  floor: number;
  enemiesDefeated: number;
  goldEarned: number;
  onRestart: () => void;
  onTitle: () => void;
}

const GameOverOverlay: React.FC<GameOverOverlayProps> = ({
  floor,
  enemiesDefeated,
  goldEarned,
  onRestart,
  onTitle,
}) => {
  return (
    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-[100] font-mono p-6">
      {/* 💀 ゲームオーバーロゴ */}
      <div className="mb-8 animate-pulse relative">
        <img 
          src="/sprites/ui/gameover.png" 
          alt="GAME OVER" 
          style={{ imageRendering: 'pixelated' }}
          className="drop-shadow-[0_0_10px_rgba(255,0,51,0.8)] scale-150"
        />
        <div className="absolute inset-0 bg-red-500/10 blur-xl -z-10" />
      </div>

      {/* 📊 リザルト統計 */}
      <div className="w-full max-w-xs bg-gray-900 border-2 border-red-900 p-6 rounded shadow-lg shadow-red-900/20 mb-10">
        <h3 className="text-red-500 font-bold mb-4 border-b border-red-900 pb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
            MISSION REPORT
        </h3>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between items-center bg-black/40 p-2 rounded">
            <span className="text-gray-400">REACHED FLOOR</span>
            <span className="text-white font-bold text-lg">{floor}F</span>
          </div>
          <div className="flex justify-between items-center bg-black/40 p-2 rounded">
            <span className="text-gray-400">ENEMIES NULLIFIED</span>
            <span className="text-red-400 font-bold text-lg">{enemiesDefeated}</span>
          </div>
          <div className="flex justify-between items-center bg-black/40 p-2 rounded">
            <span className="text-gray-400">RESOURCES ACQUIRED</span>
            <span className="text-yellow-400 font-bold text-lg">{goldEarned}G</span>
          </div>
        </div>
      </div>

      {/* 🔘 アクションボタン */}
      <div className="flex flex-col gap-4 w-64">
        <button
          onClick={() => {
            playSE('ui_select');
            onRestart();
          }}
          className="py-4 bg-red-900 border-2 border-red-600 text-red-100 font-bold hover:bg-red-700 transition-all hover:scale-105 active:scale-95 shadow-[0_4px_0_rgb(127,29,29)] hover:shadow-none translate-y-0 active:translate-y-1"
        >
          RETURN TO BASE
        </button>
        <button
          onClick={() => {
            playSE('ui_cancel');
            onTitle();
          }}
          className="py-3 bg-gray-800 border-2 border-gray-600 text-gray-400 font-bold hover:bg-gray-700 hover:text-white transition-all text-sm"
        >
          TITLE SCREEN
        </button>
      </div>
    </div>
  );
};

export default GameOverOverlay;
