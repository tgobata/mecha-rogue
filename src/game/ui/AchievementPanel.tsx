import React from 'react';
import { playSE } from '../systems/audio';
import achievementsData from '../assets/data/achievements.json';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface AchievementPanelProps {
  unlockedIds: string[];
  onClose: () => void;
}

const AchievementPanel: React.FC<AchievementPanelProps> = ({ unlockedIds, onClose }) => {
  const achievements = achievementsData as Achievement[];

  return (
    <div className="absolute inset-0 bg-black/95 flex flex-col items-center z-50 font-mono overflow-y-auto p-4 gap-4">
      <div className="w-full max-w-2xl bg-gray-900 border-2 border-blue-900/50 rounded-lg flex flex-col shadow-2xl shadow-blue-900/20 flex-1 min-h-0" style={{ minHeight: 300 }}>
        {/* Header */}
        <div className="p-6 border-b border-blue-900/50 flex justify-between items-center bg-blue-900/10">
          <h2 className="text-2xl font-bold text-blue-400 tracking-wider">RECORDS & RECORDS</h2>
          <button 
            onClick={() => {
              playSE('ui_cancel');
              onClose();
            }}
            className="text-gray-500 hover:text-white transition-colors text-2xl"
          >
            ×
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {achievements.map((ach) => {
            const isUnlocked = unlockedIds.includes(ach.id);
            return (
              <div 
                key={ach.id}
                className={`flex items-center gap-6 p-4 border-2 transition-all ${
                  isUnlocked 
                    ? 'bg-blue-900/20 border-blue-500/50' 
                    : 'bg-black/40 border-gray-800 opacity-40'
                }`}
              >
                <div className={`text-4xl w-16 h-16 flex items-center justify-center rounded-full bg-black/60 border ${isUnlocked ? 'border-blue-400' : 'border-gray-700'}`}>
                  {isUnlocked ? ach.icon : '❓'}
                </div>
                <div className="flex-1">
                  <h4 className={`font-bold text-lg ${isUnlocked ? 'text-blue-300' : 'text-gray-500'}`}>
                    {isUnlocked ? ach.name : ' LOCKED DATA '}
                  </h4>
                  <p className="text-sm text-gray-400">{ach.description}</p>
                </div>
                {isUnlocked && (
                  <div className="text-[10px] bg-blue-500 text-white px-2 py-1 rounded font-bold animate-pulse">
                    UNLOCKED
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-blue-900/50 text-center text-xs text-gray-600">
           TOTAL ACHIEVEMENTS: {unlockedIds.length} / {achievements.length}
        </div>
      </div>

      <button
        onClick={() => {
          playSE('ui_cancel');
          onClose();
        }}
        className="mt-2 px-8 py-3 bg-gray-800 border-2 border-gray-600 text-gray-300 font-bold hover:bg-gray-700 hover:text-white transition-all flex-shrink-0"
      >
        BACK TO TITLE
      </button>

    </div>
  );
};

export default AchievementPanel;
