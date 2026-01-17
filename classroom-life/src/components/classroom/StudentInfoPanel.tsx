import { useState, useEffect } from 'react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { mockDialogue } from './mockData';

interface StudentInfo {
  name: string;
  grade: string;
  subject: string;
  topic: string;
  understandingLevel: number; // 0-100
}

const defaultStudentInfo: StudentInfo = {
  name: "Tim Weber",
  grade: "Grade 8",
  subject: "Geography",
  topic: "Plate Tectonics",
  understandingLevel: 65,
};

export function StudentInfoPanel() {
  const [info] = useState<StudentInfo>(defaultStudentInfo);
  const [displayLevel, setDisplayLevel] = useState(info.understandingLevel);
  const { isPlaying, currentSpeaker, playDialogue, stopPlayback } = useTextToSpeech();

  // Simulate slight fluctuation in understanding estimate
  useEffect(() => {
    const interval = setInterval(() => {
      const fluctuation = Math.random() * 6 - 3; // -3 to +3
      setDisplayLevel(Math.round(Math.max(0, Math.min(100, info.understandingLevel + fluctuation))));
    }, 2000);
    return () => clearInterval(interval);
  }, [info.understandingLevel]);

  const handlePlayClick = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      playDialogue(mockDialogue);
    }
  };

  return (
    <div className="absolute bottom-4 left-4 z-10 select-none">
      {/* Main panel container - Sims 1 style */}
      <div 
        className="relative"
        style={{
          background: 'linear-gradient(180deg, #8BC34A 0%, #689F38 100%)',
          borderRadius: '12px',
          padding: '4px',
          boxShadow: '4px 4px 0px rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.3)',
        }}
      >
        {/* Inner panel */}
        <div 
          className="relative"
          style={{
            background: 'linear-gradient(180deg, #FFF8DC 0%, #F5DEB3 100%)',
            borderRadius: '8px',
            padding: '12px 16px',
            minWidth: '220px',
            border: '2px solid #8B7355',
            boxShadow: 'inset 0 2px 4px rgba(139,115,85,0.2)',
          }}
        >
          {/* Header with plumbob-style icon */}
          <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: '2px dashed #C4A484' }}>
            <div 
              className="w-5 h-5 animate-pulse"
              style={{
                background: 'linear-gradient(135deg, #4CAF50 0%, #81C784 50%, #2E7D32 100%)',
                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                boxShadow: '0 0 8px rgba(76,175,80,0.6)',
              }}
            />
            <span 
              className="font-bold tracking-wide"
              style={{
                fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
                fontSize: '16px',
                color: '#5D4037',
                textShadow: '1px 1px 0px rgba(255,255,255,0.5)',
              }}
            >
              {info.name}
            </span>
          </div>

          {/* Info rows */}
          <div className="space-y-2">
            <InfoRow icon="📚" label="Grade" value={info.grade} />
            <InfoRow icon="🌍" label="Subject" value={info.subject} />
            <InfoRow icon="📖" label="Topic" value={info.topic} />
          </div>

          {/* Understanding meter */}
          <div className="mt-3 pt-2" style={{ borderTop: '2px dashed #C4A484' }}>
            <div className="flex items-center justify-between mb-1">
              <span 
                style={{
                  fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
                  fontSize: '11px',
                  color: '#795548',
                }}
              >
                Understanding
              </span>
              <span 
                className="animate-pulse"
                style={{
                  fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
                  fontSize: '10px',
                  color: '#9E9E9E',
                  fontStyle: 'italic',
                }}
              >
                ~estimate
              </span>
            </div>
            
            {/* Progress bar - Sims style */}
            <div 
              className="relative h-4 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #4a4a4a 0%, #2a2a2a 100%)',
                borderRadius: '4px',
                border: '2px solid #1a1a1a',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
              }}
            >
              <div 
                className="h-full transition-all duration-500 relative overflow-hidden"
                style={{
                  width: `${displayLevel}%`,
                  background: displayLevel > 70 
                    ? 'linear-gradient(180deg, #4CAF50 0%, #388E3C 50%, #2E7D32 100%)'
                    : displayLevel > 40
                    ? 'linear-gradient(180deg, #FFC107 0%, #FFA000 50%, #FF8F00 100%)'
                    : 'linear-gradient(180deg, #f44336 0%, #d32f2f 50%, #c62828 100%)',
                  borderRadius: '2px',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
                }}
              >
                {/* Shine effect */}
                <div 
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
                  }}
                />
              </div>
              
              {/* Percentage text */}
              <span 
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
                  fontSize: '10px',
                  color: '#fff',
                  textShadow: '1px 1px 1px rgba(0,0,0,0.8)',
                  fontWeight: 'bold',
                }}
              >
                {displayLevel}%
              </span>
            </div>
            
            {/* Disclaimer */}
            <p 
              className="mt-1 text-center"
              style={{
                fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
                fontSize: '8px',
                color: '#9E9E9E',
                fontStyle: 'italic',
              }}
            >
              ※ Subject to change
            </p>
          </div>

          {/* Play Dialogue Button - Sims style */}
          <div className="mt-3 pt-2" style={{ borderTop: '2px dashed #C4A484' }}>
            <button
              onClick={handlePlayClick}
              disabled={false}
              className="w-full transition-all active:scale-95"
              style={{
                background: isPlaying 
                  ? 'linear-gradient(180deg, #f44336 0%, #d32f2f 100%)'
                  : 'linear-gradient(180deg, #2196F3 0%, #1976D2 100%)',
                borderRadius: '6px',
                padding: '8px 12px',
                border: '2px solid',
                borderColor: isPlaying ? '#b71c1c' : '#0D47A1',
                boxShadow: '2px 2px 0px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)',
                cursor: 'pointer',
              }}
            >
              <div className="flex items-center justify-center gap-2">
                {isPlaying ? (
                  <>
                    <span 
                      className="animate-pulse"
                      style={{
                        fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
                        fontSize: '14px',
                      }}
                    >
                      ⏹️
                    </span>
                    <span 
                      style={{
                        fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
                        fontSize: '12px',
                        color: '#fff',
                        textShadow: '1px 1px 1px rgba(0,0,0,0.5)',
                        fontWeight: 'bold',
                      }}
                    >
                      {currentSpeaker === 'student' ? '👦 Student...' : '👨‍🏫 Tutor...'}
                    </span>
                  </>
                ) : (
                  <>
                    <span 
                      style={{
                        fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
                        fontSize: '14px',
                      }}
                    >
                      🔊
                    </span>
                    <span 
                      style={{
                        fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
                        fontSize: '12px',
                        color: '#fff',
                        textShadow: '1px 1px 1px rgba(0,0,0,0.5)',
                        fontWeight: 'bold',
                      }}
                    >
                      Play Dialogue
                    </span>
                  </>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <span 
        style={{
          fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
          fontSize: '11px',
          color: '#795548',
        }}
      >
        {label}:
      </span>
      <span 
        className="font-medium"
        style={{
          fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
          fontSize: '12px',
          color: '#4E342E',
        }}
      >
        {value}
      </span>
    </div>
  );
}
