import React, { useRef, useEffect, useState } from 'react';
import { vertexShaderSource } from '../shaders/vertex';
import { fragmentShaderSource } from '../shaders/fragment';
import { simulationShaderSource } from '../shaders/simulation';
import { SimState } from '../types';

interface CanvasProps {
  simState: SimState;
  onTimeUpdate: (newTime: number) => void;
}

const Canvas: React.FC<CanvasProps> = ({ simState, onTimeUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);

  // --- Magnifier lens ---
  const [lensActive, setLensActive] = useState(false);
  const [lensZoomDisplay, setLensZoomDisplay] = useState(3);
  const lensActiveRef = useRef(false);
  const lensUvRef = useRef({ x: 0.5, y: 0.5 });
  const lensZoomRef = useRef(3.0);
  useEffect(() => { lensActiveRef.current = lensActive; }, [lensActive]);

  // Programs
  const simProgramRef = useRef<WebGLProgram | null>(null);
  const renderProgramRef = useRef<WebGLProgram | null>(null);

  // Buffers (Ping-Pong)
  const framebuffersRef = useRef<WebGLFramebuffer[]>([]);
  const texturesRef = useRef<WebGLTexture[]>([]);
  const gradientTextureRef = useRef<WebGLTexture | null>(null);

  // State tracking
  const currentBufferIndex = useRef(0);
  const timeRef = useRef(simState.time);
  const lastGridScaleRef = useRef(simState.gridScale);

  // Helper: Load Texture
  const loadTexture = (gl: WebGLRenderingContext, texture: WebGLTexture, url: string) => {
    const image = new Image();
    image.crossOrigin = "Anonymous";
    image.src = url;
    image.onload = () => {
      // Determine target dimensions (Power of 2 for GL_REPEAT)
      const isPowerOf2 = (value: number) => (value & (value - 1)) === 0;
      const nextHighestPowerOf2 = (value: number) => {
        let v = value;
        v--; v |= v >> 1; v |= v >> 2; v |= v >> 4; v |= v >> 8; v |= v >> 16; v++;
        return v;
      };

      const targetWidth = isPowerOf2(image.width) ? image.width : nextHighestPowerOf2(image.width);
      const targetHeight = isPowerOf2(image.height) ? image.height : nextHighestPowerOf2(image.height);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    image.onerror = () => {
      console.warn('Failed to load texture at ' + url);
    }
  };

  // --- Initialize WebGL ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error("WebGL not supported");
      return;
    }
    glRef.current = gl;

    // IMPORTANT: Enable Float Textures
    const ext = gl.getExtension('OES_texture_float');
    if (!ext) {
      console.error("OES_texture_float not supported");
    }

    // Compile Shaders
    const createProgram = (vsSource: string, fsSource: string) => {
      const createShader = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error(gl.getShaderInfoLog(shader));
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

    // Setup Geometry (Full Screen Quad)
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    // Setup Attributes for both programs
    [simProgramRef.current, renderProgramRef.current].forEach(prog => {
      if (prog) {
        gl.useProgram(prog);
        const loc = gl.getAttribLocation(prog, "a_position");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
    });

    // Gradient Texture
    const gTex = gl.createTexture();
    gradientTextureRef.current = gTex;
    gl.bindTexture(gl.TEXTURE_2D, gTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    if (simState.imageUrl) {
      loadTexture(gl, gTex, simState.imageUrl);
    }
  }, []);

  // --- FBO Management (Resize) ---
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const canvas = canvasRef.current;

    // Clear refs
    framebuffersRef.current = [];
    texturesRef.current = [];

    const width = canvas?.clientWidth || 800;
    const height = canvas?.clientHeight || 600;

    const createdTextures: WebGLTexture[] = [];
    const createdFBOs: WebGLFramebuffer[] = [];

    for (let i = 0; i < 2; i++) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (texture) createdTextures.push(texture);
      if (fbo) createdFBOs.push(fbo);
    }

    texturesRef.current = createdTextures;
    framebuffersRef.current = createdFBOs;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }, []); // Simplification: In real app we listen to resize, here just init.

  // --- Handle Gradient Texture Change ---
  useEffect(() => {
    if (simState.imageUrl && glRef.current && gradientTextureRef.current) {
      loadTexture(glRef.current, gradientTextureRef.current, simState.imageUrl);
    }
  }, [simState.imageUrl]);

  // --- Lens Input Handlers ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      e.stopPropagation();
      if (t && t.tagName === 'BUTTON') t.blur();
      setLensActive(v => !v);
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      lensUvRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1 - (e.clientY - rect.top) / rect.height,
      };
    };

    const onWheel = (e: WheelEvent) => {
      if (!lensActiveRef.current) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      const next = Math.min(20, Math.max(1, lensZoomRef.current * factor));
      lensZoomRef.current = next;
      setLensZoomDisplay(next);
    };

    window.addEventListener('keydown', onKey, true);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  // --- Main Loop ---
  useEffect(() => {
    timeRef.current = simState.time;
    // Force reset if grid scale changed
    if (lastGridScaleRef.current !== simState.gridScale) {
      // Loop handles it via ref difference
    }
    lastGridScaleRef.current = simState.gridScale;
  }, [simState.time, simState.gridScale]);

  useEffect(() => {
    let lastFrameTime = performance.now();

    const loop = (now: number) => {
      const gl = glRef.current;
      const simProg = simProgramRef.current;
      const renderProg = renderProgramRef.current;
      const canvas = canvasRef.current;

      if (gl && simProg && renderProg && canvas && framebuffersRef.current.length >= 2) {

        const displayWidth = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          gl.viewport(0, 0, displayWidth, displayHeight);
        }

        const shouldReset = (timeRef.current === 0) || (Math.abs(lastGridScaleRef.current - simState.gridScale) > 0.001);
        if (shouldReset) {
          lastGridScaleRef.current = simState.gridScale;
        }

        // --- STEP 1: SIMULATION ---
        gl.useProgram(simProg);

        const readIdx = currentBufferIndex.current;
        const writeIdx = (currentBufferIndex.current + 1) % 2;

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffersRef.current[writeIdx]);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[readIdx]);
        gl.uniform1i(gl.getUniformLocation(simProg, "u_state"), 0);

        gl.uniform2f(gl.getUniformLocation(simProg, "u_resolution"), displayWidth, displayHeight);
        gl.uniform1f(gl.getUniformLocation(simProg, "u_grid_scale"), simState.gridScale);
        gl.uniform1f(gl.getUniformLocation(simProg, "u_gravity"), simState.gravity);
        gl.uniform1i(gl.getUniformLocation(simProg, "u_reset"), shouldReset ? 1 : 0);

        const dt = simState.isPlaying ? (1.0 / 60.0) * simState.simSpeed : 0.0;
        gl.uniform1f(gl.getUniformLocation(simProg, "u_dt"), dt);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // --- STEP 2: RENDER ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Screen
        gl.useProgram(renderProg);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texturesRef.current[writeIdx]);
        gl.uniform1i(gl.getUniformLocation(renderProg, "u_state"), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, gradientTextureRef.current);
        gl.uniform1i(gl.getUniformLocation(renderProg, "u_gradient"), 1);

        gl.uniform2f(gl.getUniformLocation(renderProg, "u_resolution"), displayWidth, displayHeight);

        // Lens uniforms
        const lensRadiusPx = Math.min(displayWidth, displayHeight) * 0.15;
        gl.uniform1i(gl.getUniformLocation(renderProg, "u_lens_active"), lensActiveRef.current ? 1 : 0);
        gl.uniform2f(gl.getUniformLocation(renderProg, "u_lens_uv"), lensUvRef.current.x, lensUvRef.current.y);
        gl.uniform1f(gl.getUniformLocation(renderProg, "u_lens_radius_px"), lensRadiusPx);
        gl.uniform1f(gl.getUniformLocation(renderProg, "u_lens_zoom"), lensZoomRef.current);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // --- UPDATE STATE ---
        currentBufferIndex.current = writeIdx;

        if (simState.isPlaying) {
          timeRef.current += dt;
          onTimeUpdate(timeRef.current);
        }
        lastFrameTime = now;
      }
      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  }, [simState.isPlaying, simState.simSpeed, simState.gridScale, simState.gravity, simState.time]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor: lensActive ? 'none' : 'auto' }}
      />
      {lensActive && (
        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded text-xs text-white/90 border border-white/10 pointer-events-none font-mono">
          Lens · {lensZoomDisplay.toFixed(1)}× · Space to exit
        </div>
      )}
    </>
  );
};

export default Canvas;
