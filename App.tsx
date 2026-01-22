import React, { useState, useRef, useCallback } from 'react';
import { GameCanvas, GameCanvasHandle } from './components/GameCanvas';
import { GameState, GameStats } from './types';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [stats, setStats] = useState<GameStats>({ score: 0, time: 0 });
  const [gameId, setGameId] = useState(0); // Increment to reset game
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const gameRef = useRef<GameCanvasHandle>(null);
  const requestRef = useRef<number>(0);

  const startGame = () => {
    if (gameState === GameState.GAME_OVER) {
      setGameId(prev => prev + 1);
      setStats({ score: 0, time: 0 });
    }
    setGameState(GameState.PLAYING);
    // Slight delay to allow remount if resetting
    setTimeout(() => {
      gameRef.current?.lock();
    }, 50);
  };

  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    // Throttling UI updates for performance could go here if needed
    setStats({ ...newStats });
  }, []);

  const handleDeath = useCallback(() => {
    setGameState(GameState.GAME_OVER);
  }, []);

  const handleUnlock = useCallback(() => {
    // If we unlock while playing (and not dead), it's a pause/menu state
    setGameState(prev => prev === GameState.PLAYING ? GameState.MENU : prev);
  }, []);

  // Sync crosshair UI with engine mouse position for smooth UI overlay
  React.useEffect(() => {
    const updateCrosshair = () => {
      if (gameRef.current) {
        setMousePos(gameRef.current.getMouse());
      }
      requestRef.current = requestAnimationFrame(updateCrosshair);
    };
    requestRef.current = requestAnimationFrame(updateCrosshair);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-neutral-900 overflow-hidden select-none font-sans">
      
      {/* Game Layer */}
      <GameCanvas 
        ref={gameRef}
        gameId={gameId}
        callbacks={{
          onStatsUpdate: handleStatsUpdate,
          onDeath: handleDeath,
          onUnlock: handleUnlock
        }}
      />

      {/* HUD Layer (Always visible) */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none p-6 flex flex-col justify-between">
        <div className="flex justify-between items-start text-white/90 drop-shadow-lg">
            <div className="text-2xl font-bold tracking-wider">
              SCORE: <span className="text-[#4dc9ff]">{Math.floor(stats.score)}</span>
            </div>
            <div className="text-2xl font-bold tracking-wider">
              TIME: <span className="text-[#d6882c]">{stats.time.toFixed(1)}s</span>
            </div>
        </div>
        
        {/* Crosshair */}
        <div 
          className="absolute w-6 h-6 border-2 border-white/80 rounded-full transition-transform duration-75 ease-out"
          style={{
            left: `calc(50% + ${mousePos.x}px)`,
            top: `calc(50% + ${mousePos.y}px)`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="crosshair-dot" />
        </div>
      </div>

      {/* Menu / Overlay Layer */}
      {gameState !== GameState.PLAYING && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-white z-50">
          <h1 className="text-6xl md:text-8xl font-black italic text-[#4dc9ff] mb-4 drop-shadow-[4px_4px_0_#d6882c] tracking-tighter uppercase">
            Voxel Velocity
          </h1>
          
          {gameState === GameState.GAME_OVER && (
             <div className="text-5xl font-bold text-red-500 mb-8 animate-pulse drop-shadow-md">
               CRITICAL FAILURE
             </div>
          )}

          <div className="max-w-xl text-center text-neutral-300 text-lg md:text-xl leading-relaxed mb-10 space-y-2">
            <p>Navigate the procedurally generated voxel terrain.</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-left bg-white/5 p-6 rounded-lg border border-white/10">
              <div><strong className="text-white">WASD</strong> to Move</div>
              <div><strong className="text-white">SPACE</strong> to Jump</div>
              <div><strong className="text-white">SHIFT</strong> to Sprint</div>
              <div><strong className="text-white">CLICK</strong> to Destroy Blocks</div>
            </div>
          </div>

          <button 
            onClick={startGame}
            className="group relative px-12 py-4 bg-[#d6882c] hover:bg-[#ffaa45] text-white text-2xl font-black uppercase tracking-widest transition-all transform active:translate-y-1 active:border-b-0 border-b-8 border-[#a66218] rounded"
          >
            <span className="drop-shadow-md">
              {gameState === GameState.GAME_OVER ? 'RETRY MISSION' : 'INITIALIZE SYSTEM'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
