
export const fragmentShaderSource = `#version 300 es
precision highp float;

uniform sampler2D u_state;    // Physics State (Theta1, Theta2)
uniform sampler2D u_analysis; // Analysis State (Flip Counts)
uniform sampler2D u_gradient; // Color Map
uniform vec2 u_resolution;
uniform int u_viewMode;       // 0 = Phase, 1 = Heatmap

in vec2 v_uv;
out vec4 fragColor;

#define PI 3.14159265359

void main() {
  if (u_viewMode == 0) {
    // --- PHASE SPACE MODE (Classic) ---
    vec4 state = texture(u_state, v_uv);
    float t1 = state.r; 
    float t2 = state.g; 
    
    float u = (t1 + PI) / (2.0 * PI);
    float v = (t2 + PI) / (2.0 * PI);
    
    fragColor = texture(u_gradient, vec2(u, v));
    
  } else {
    // --- HEATMAP MODE (Instantaneous Flip Rate) ---
    // Since we output delta-flips (0 or 1) in simulation, 
    // we visualize where flips are happening RIGHT NOW.
    // It will look like sparkling edges of chaos.
    
    vec4 analysis = texture(u_analysis, v_uv);
    float flipActivity = analysis.r + analysis.g; // 0, 1, or 2
    
    vec3 color = vec3(0.0);
    if (flipActivity > 0.0) {
        // Active Flip: Yellow/Red sparkle
        color = vec3(1.0, 0.8, 0.2) * flipActivity;
    } else {
        // Stable: Deep Blue
        color = vec3(0.0, 0.0, 0.1);
    }
    
    fragColor = vec4(color, 1.0);
  }
}`;
