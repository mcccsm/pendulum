export interface SimState {
  isPlaying: boolean;
  time: number; // accumulated simulation time
  simSpeed: number;
  gravity: number;
  gridScale: number; // For the "blocky" aesthetic
  imageUrl: string;
}

export const DEFAULT_SIM_STATE: SimState = {
  isPlaying: true,
  time: 0,
  simSpeed: 0.314,
  gravity: 9.8,
  gridScale: 200.0,
  imageUrl: 'gradient.png',
};

export const MAX_SIM_TIME = 1000;
