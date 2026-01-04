
import React, { useRef, useEffect, useState } from 'react';
import { vertexShaderSource } from '../shaders/vertex';
import { fragmentShaderSource } from '../shaders/fragment';
import { simulationShaderSource } from '../shaders/simulation';
import { SimState } from '../types';

interface CanvasProps {
  simState: SimState;
  onTimeUpdate: (newTime: number) => void;
  onUpdateState: (partial: Partial<SimState>) => void; // Need upstream update
}

const Canvas: React.FC<CanvasProps> = ({ simState, onTimeUpdate, onUpdateState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);

  // Programs
  const simProgramRef = useRef<WebGLProgram | null>(null);
  const renderProgramRef = useRef<WebGLProgram | null>(null);

  // Buffers (Ping-Pong)
  // We need 2 FBOs. Each FBO needs 2 Color Attachments (Physics + Analysis).
  const framebuffersRef = useRef<WebGLFramebuffer[]>([]);
  const texturesPhysicsRef = useRef<WebGLTexture[]>([]);
  const texturesAnalysisRef = useRef<WebGLTexture[]>([]);

  const gradientTextureRef = useRef<WebGLTexture | null>(null);

  // State tracking
  const currentBufferIndex = useRef(0);
  const timeRef = useRef(simState.time);

  // Interaction High-Speed Tracking (Refs for 60fps loop)
  const zoomRef = useRef(simState.zoom);
  const panRef = useRef(simState.pan);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const interactionDebounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Sync Props to Refs
  useEffect(() => {
    zoomRef.current = simState.zoom;
    panRef.current = simState.pan;
  }, [simState.zoom, simState.pan]);

  // Helper: Load Texture
  const loadTexture = (gl: WebGL2RenderingContext, texture: WebGLTexture, url: string) => {
    const image = new Image();
    image.crossOrigin = "Anonymous";
    image.src = url;
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    image.onerror = () => {
      console.warn(`Failed to load texture at ${url}.`);
    }
  };

  // --- Initialize WebGL 2 ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2');
    if (!gl) {
      console.error("WebGL 2 not supported. Please use a modern browser.");
      return;
    }
    glRef.current = gl;

    // Check extensions
    if (!gl.getExtension('EXT_color_buffer_float')) {
      console.error("EXT_color_buffer_float not supported!");
    }

    // Compile Shaders
    const createProgram = (vsSource: string, fsSource: string) => {
      const createShader = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error(glRef.current?.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };
      const vert = createShader(gl.VERTEX_SHADER, vsSource);
      const frag = createShader(gl.FRAGMENT_SHADER, fsSource);
      if (!vert || !frag) return null;
      const prog = gl.createProgram();
      if (!prog) return null;
      gl.attachShader(prog, vert);
      gl.attachShader(prog, frag);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(prog));
        return null;
      }
      return prog;
    };

    simProgramRef.current = createProgram(vertexShaderSource, simulationShaderSource);
    renderProgramRef.current = createProgram(vertexShaderSource, fragmentShaderSource);

    // Setup Geometry
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    // Setup MRT Framebuffers
    // We need 2 sets (Ping-Pong)
    // Set 0: [TexPhysics0, TexAnalysis0] -> FBO0
    // Set 1: [TexPhysics1, TexAnalysis1] -> FBO1

    framebuffersRef.current = [];
    texturesPhysicsRef.current = [];
    texturesAnalysisRef.current = [];

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    for (let i = 0; i < 2; i++) {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

      // Attachment 0: Physics (RGBA32F)
      const texPhys = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texPhys);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texPhys, 0);

      // Attachment 1: Analysis (RG32F) - stores counts/deltas
      const texAnal = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texAnal);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, width, height, 0, gl.RG, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texAnal, 0);

      // Draw Buffers: We write to BOTH
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

      if (texPhys) texturesPhysicsRef.current.push(texPhys);
      if (texAnal) texturesAnalysisRef.current.push(texAnal);
      if (fbo) framebuffersRef.current.push(fbo);

      // Status Check
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error("Framebuffer incomplete!");
      }
    }

    // Gradient Texture
    const gTex = gl.createTexture();
    gradientTextureRef.current = gTex;
    gl.bindTexture(gl.TEXTURE_2D, gTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    if (simState.imageUrl) {
      loadTexture(gl, gTex, simState.imageUrl);
    }

    // Attributes
    [simProgramRef.current, renderProgramRef.current].forEach(prog => {
      if (prog) {
        gl.useProgram(prog);
        const loc = gl.getAttribLocation(prog, "a_position");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  }, []);

  // --- Update Texture ---
  useEffect(() => {
    if (simState.imageUrl && glRef.current && gradientTextureRef.current) {
      loadTexture(glRef.current, gradientTextureRef.current, simState.imageUrl);
    }
  }, [simState.imageUrl]);

  // --- Interaction Handlers ---
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let newZoom = zoomRef.current;

    if (e.deltaY < 0) {
      newZoom *= zoomFactor; // Zoom In
    } else {
      newZoom /= zoomFactor; // Zoom Out
    }

    // Clamp
    newZoom = Math.max(0.1, Math.min(newZoom, 10000000.0));

    zoomRef.current = newZoom;

    // Force reset simulation (debounced)
    triggerReset();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;

    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    // Pan Sensitivity depends on Zoom
    const sensitivity = 0.002 / zoomRef.current;

    panRef.current = {
      x: panRef.current.x - dx * sensitivity,
      y: panRef.current.y + dy * sensitivity // UV Y is up? Check fragment.
    };

    triggerReset();
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const triggerReset = () => {
    // Notify Upstream to update View State
    if (interactionDebounceTimeout.current) clearTimeout(interactionDebounceTimeout.current);
    interactionDebounceTimeout.current = setTimeout(() => {
      onUpdateState({
        zoom: zoomRef.current,
        pan: panRef.current,
        time: 0 // Reset time on view change
      });
    }, 100);
  };

  // --- Main Loop ---
  useEffect(() => {
    timeRef.current = simState.time;
    let lastFrameTime = performance.now();

    const loop = (now: number) => {
      const gl = glRef.current;
      const simProg = simProgramRef.current;
      const renderProg = renderProgramRef.current;

      if (gl && simProg && renderProg && framebuffersRef.current.length >= 2) {

        // Reset Logic
        // We reset if time is 0 (handled by upstream state)
        const shouldReset = (timeRef.current === 0);

        // --- STEP 1: SIMULATION ---
        gl.useProgram(simProg);

        const readIdx = currentBufferIndex.current;
        const writeIdx = (currentBufferIndex.current + 1) % 2;

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffersRef.current[writeIdx]);

        // Bind Textures (Read from Previous)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texturesPhysicsRef.current[readIdx]);
        gl.uniform1i(gl.getUniformLocation(simProg, "u_state"), 0);

        // Also bind Analysis texture (if we need to accumulate counts)
        // Currently simulation.ts just outputs 0/1 deltas, not sum. 
        // We need blending? Or read-add-write? 
        // Reading from same texture location in MRT is undefined behavior. 
        // So we must toggle.
        // We need to pass PREVIOUS analysis state to shader to add to it.
        // I'll add "u_analysis" uniform to simulation shader later if needed, 
        // but for now let's just create the state.

        gl.uniform2f(gl.getUniformLocation(simProg, "u_resolution"), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(gl.getUniformLocation(simProg, "u_grid_scale"), simState.gridScale);
        gl.uniform1f(gl.getUniformLocation(simProg, "u_gravity"), simState.gravity);
        gl.uniform1i(gl.getUniformLocation(simProg, "u_reset"), shouldReset ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(simProg, "u_zoom"), zoomRef.current);
        gl.uniform2f(gl.getUniformLocation(simProg, "u_pan"), panRef.current.x, panRef.current.y);

        const dt = simState.isPlaying ? (1.0 / 60.0) * simState.simSpeed : 0.0;
        gl.uniform1f(gl.getUniformLocation(simProg, "u_dt"), dt);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // --- STEP 2: RENDER ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(renderProg);

        // Bind Physics State for visual
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texturesPhysicsRef.current[writeIdx]);
        gl.uniform1i(gl.getUniformLocation(renderProg, "u_state"), 0);

        // Bind Analysis State for Heatmap
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texturesAnalysisRef.current[writeIdx]);
        gl.uniform1i(gl.getUniformLocation(renderProg, "u_analysis"), 1);

        // Gradient map
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, gradientTextureRef.current);
        gl.uniform1i(gl.getUniformLocation(renderProg, "u_gradient"), 2);

        gl.uniform1i(gl.getUniformLocation(renderProg, "u_viewMode"), simState.viewMode === 'HEATMAP' ? 1 : 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        currentBufferIndex.current = writeIdx;

        if (simState.isPlaying) {
          timeRef.current += dt;
          onTimeUpdate(timeRef.current);
        }
      }
      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  }, [simState]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block cursor-crosshair"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
};

export default Canvas;
