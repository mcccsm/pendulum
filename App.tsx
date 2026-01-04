
import React, { useState, useCallback, useEffect } from 'react';
import Canvas from './components/Canvas';
import Controls from './components/Controls';
import { SimState, DEFAULT_SIM_STATE, MAX_SIM_TIME } from './types';

declare global {
  interface Window {
    menu: () => void;
    sim: {
      start: () => void;
      stop: () => void;
      reset: () => void;
      resetView: () => void;
    };
  }
}

const App: React.FC = () => {
  const [simState, setSimState] = useState<SimState>(DEFAULT_SIM_STATE);
  const [isMenuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    // Expose menu toggling to console
    window.menu = () => {
      setMenuVisible(prev => {
        const next = !prev;
        console.log(`Menu is now ${next ? 'visible' : 'hidden'}`);
        return next;
      });
    };

    // Expose simulation controls
    window.sim = {
      start: () => {
        setSimState(prev => ({ ...prev, isPlaying: true }));
        console.log("Simulation started");
      },
      stop: () => {
        setSimState(prev => ({ ...prev, isPlaying: false }));
        console.log("Simulation stopped");
      },
      reset: () => {
        setSimState(prev => ({ ...prev, time: 0, isPlaying: false }));
        console.log("Simulation reset");
      },
      resetView: () => {
        setSimState(prev => ({ ...prev, zoom: 1.0, pan: { x: 0, y: 0 }, time: 0 }));
        console.log("View reset");
      }
    };

    console.log(`
%cDouble Pendulum Simulation Controls:
------------------------------------
%cwindow.menu()      %c- Toggle UI menu
%cwindow.sim.start() %c- Start simulation (play)
%cwindow.sim.stop()  %c- Stop simulation (pause)
%cwindow.sim.reset() %c- Reset time to 0
    `,
      "font-weight: bold; font-size: 14px; color: #4ade80;",
      "color: #60a5fa; font-weight: bold;", "color: #94a3b8;",
      "color: #60a5fa; font-weight: bold;", "color: #94a3b8;",
      "color: #60a5fa; font-weight: bold;", "color: #94a3b8;",
      "color: #60a5fa; font-weight: bold;", "color: #94a3b8;"
    );

    // Cleanup
    return () => {
      // @ts-ignore
      delete window.menu;
      // @ts-ignore
      delete window.sim;
    }
  }, []);

  const handleUpdate = useCallback((partial: Partial<SimState>) => {
    setSimState(prev => ({ ...prev, ...partial }));
  }, []);

  const handleReset = useCallback(() => {
    // Stop immediately and reset time
    setSimState(prev => ({ ...prev, time: 0, isPlaying: false }));
  }, []);

  const handleTimeUpdate = useCallback((newTime: number) => {
    setSimState(prev => {
      // Auto-stop when done
      if (newTime >= MAX_SIM_TIME && prev.isPlaying) {
        return { ...prev, time: MAX_SIM_TIME, isPlaying: false };
      }

      // Optimization: Only update React state if difference is significant
      if (Math.abs(prev.time - newTime) > 0.1) {
        return { ...prev, time: newTime };
      }
      return prev;
    });
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <Canvas
        simState={simState}
        onTimeUpdate={handleTimeUpdate}
        onUpdateState={handleUpdate}
      />
      {isMenuVisible && (
        <Controls
          state={simState}
          onUpdate={handleUpdate}
          onReset={handleReset}
        />
      )}

      {/* Fallback button if window.menu fails */}
      <button
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          backgroundColor: 'rgba(255, 0, 0, 0.5)',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '5px',
          cursor: 'pointer',
          border: 'none',
          fontSize: '16px',
          fontWeight: 'bold'
        }}
        onClick={() => setMenuVisible(v => !v)}
      >
        MENU TOGGLE
      </button>
    </div>
  );
};

export default App;
