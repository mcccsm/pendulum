
import React from 'react';
import { SimState } from '../types';

interface ControlsProps {
  state: SimState;
  onUpdate: (partial: Partial<SimState>) => void;
  onReset: () => void;
}

const Controls: React.FC<ControlsProps> = ({ state, onUpdate, onReset }) => {

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onUpdate({ imageUrl: url });
    }
  };

  return (
    <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md p-6 rounded-lg border border-white/10 text-white w-80 shadow-2xl max-h-[90vh] overflow-y-auto">
      <h1 className="text-xl font-bold mb-4 text-white">
        Phase Space Fractal
      </h1>

      {/* Playback */}
      <div className="mb-6 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Playback</h2>
        <div className="flex gap-2">
          <button
            onClick={() => onUpdate({ isPlaying: !state.isPlaying })}
            className={`flex-1 py-2 rounded font-medium transition-colors ${state.isPlaying
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50'
              : 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/50'
              }`}
          >
            {state.isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded border border-white/10 transition-colors"
          >
            Reset
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>Simulation Speed</span>
            <input
              type="number"
              value={state.simSpeed}
              step="0.1"
              onChange={(e) => onUpdate({ simSpeed: parseFloat(e.target.value) })}
              className="w-16 bg-transparent text-right border-b border-white/20 focus:border-purple-500 outline-none text-white font-mono hover:border-white/40 transition-colors"
            />
          </div>
          <input
            type="range"
            min="0.1"
            max="5.0"
            step="0.1"
            value={state.simSpeed}
            onChange={(e) => onUpdate({ simSpeed: parseFloat(e.target.value) })}
            className="w-full accent-purple-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Resolution */}
      <div className="mb-6 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Resolution (Grid)</h2>
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>Grid Scale</span>
            <input
              type="number"
              value={state.gridScale}
              step="1"
              onChange={(e) => onUpdate({ gridScale: parseFloat(e.target.value) })}
              className="w-16 bg-transparent text-right border-b border-white/20 focus:border-blue-500 outline-none text-white font-mono hover:border-white/40 transition-colors"
            />
          </div>
          <input
            type="range"
            min="10"
            max="100000"
            step="1"
            value={state.gridScale}
            onChange={(e) => onUpdate({ gridScale: parseFloat(e.target.value) })}
            className="w-full accent-blue-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <p className="text-[10px] text-gray-500 pt-1">Lower = Blockier, Higher = Smoother</p>
        </div>
      </div>

      {/* Physics */}
      <div className="mb-6 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Physics</h2>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Gravity</span>
            <span>{state.gravity.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="30"
            step="0.1"
            value={state.gravity}
            onChange={(e) => onUpdate({ gravity: parseFloat(e.target.value) })}
            className="w-full accent-orange-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Aesthetics */}
      <div className="mb-2 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Texture Map</h2>
        <label className="block w-full cursor-pointer group">
          <div className="flex items-center justify-center w-full py-3 px-4 border-2 border-dashed border-gray-600 rounded-lg hover:border-white/50 transition-colors bg-white/5">
            <span className="text-sm text-gray-300 group-hover:text-white">Upload Image</span>
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        </label>
        <p className="text-[10px] text-gray-500">
          The simulation maps the final pendulum state to this image's coordinates (UV).
        </p>
      </div>

      <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
        <div className="text-[10px] text-gray-500 font-mono">
          Time: {state.time.toFixed(2)}
        </div>

        <a
          href="https://cosimomiccol.is/notepad/computing-the-edge-of-chaos/"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-2 px-4 bg-white/5 hover:bg-white/10 rounded-md text-xs text-gray-400 hover:text-white transition-colors border border-white/5 hover:border-white/20"
        >
          What is this?
        </a>
      </div>

    </div>
  );
};

export default Controls;
