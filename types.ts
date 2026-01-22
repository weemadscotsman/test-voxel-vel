export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface GameStats {
  score: number;
  time: number;
}

export interface GameCallbacks {
  onStatsUpdate: (stats: GameStats) => void;
  onDeath: () => void;
  onUnlock: () => void;
}
