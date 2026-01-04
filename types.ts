
export type ViewMode = 'PHASE' | 'HEATMAP';

export interface SimState {
  isPlaying: boolean;
  time: number; // accumulated simulation time
  simSpeed: number;
  gravity: number;
  gridScale: number; // For the "blocky" aesthetic
  imageUrl: string;
  // Deep Zoom & Analysis
  zoom: number;
  pan: { x: number; y: number };
  viewMode: ViewMode;
}

export const DEFAULT_SIM_STATE: SimState = {
  isPlaying: true,
  time: 0,
  simSpeed: 0.314,
  gravity: 9.8,
  gridScale: 200.0,
  imageUrl: 'gradient.png',
  zoom: 1.0,
  pan: { x: 0, y: 0 },
  viewMode: 'PHASE',
};

export const MAX_SIM_TIME = 1000;
