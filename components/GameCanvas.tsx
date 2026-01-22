import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { VoxelEngine } from '../services/voxelEngine';
import { GameCallbacks } from '../types';

interface GameCanvasProps {
  callbacks: GameCallbacks;
  gameId: number; // Used to reset the engine
}

export interface GameCanvasHandle {
  lock: () => void;
  getMouse: () => { x: number, y: number };
}

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(({ callbacks, gameId }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);

  useImperativeHandle(ref, () => ({
    lock: () => engineRef.current?.lock(),
    getMouse: () => engineRef.current?.getMouse() || { x: 0, y: 0 }
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Engine
    const engine = new VoxelEngine(containerRef.current, callbacks);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]); // Re-init on gameId change

  return <div ref={containerRef} className="w-full h-full block" />;
});
