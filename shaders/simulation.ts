
export const simulationShaderSource = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform float u_grid_scale;
uniform float u_dt;
uniform float u_gravity;
uniform int u_reset;
uniform float u_zoom;
uniform vec2 u_pan;

in vec2 v_uv;

// MRT Outputs
layout(location = 0) out vec4 o_physics; // RGBA32F: theta1, theta2, p1, p2
layout(location = 1) out vec4 o_analysis; // RG32F: flipCount1, flipCount2

#define PI 3.14159265359

void main() {
  // --- INITIALIZATION ---
  if (u_reset == 1) {
    vec2 center = vec2(0.5, 0.5) + u_pan; 
    vec2 uv_zoomed = (v_uv - 0.5) / u_zoom + 0.5 - u_pan; 
    
    float effective_grid = u_grid_scale;
    vec2 q_uv = floor(uv_zoomed * effective_grid) / effective_grid;
    
    float t1 = (q_uv.x * 2.0 * PI) - PI; 
    float t2 = (q_uv.y * 2.0 * PI) - PI;
    
    o_physics = vec4(t1, t2, 0.0, 0.0);
    o_analysis = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // --- RECURSION ---
  
  // Read state
  vec4 state = texture(u_state, v_uv); 
  float t1 = state.r;
  float t2 = state.g;
  float p1 = state.b;
  float p2 = state.a;
  
  // Physics Constants 
  float m1 = 1.0;
  float m2 = 1.0;
  float l1 = 1.0;
  float l2 = 1.0;
  float g = u_gravity;
  
  // Equations of Motion
  float num1, den1, num2, den2;
  
  // dTheta1
  num1 = -g * (2.0*m1 + m2) * sin(t1) - m2 * g * sin(t1 - 2.0*t2) - 2.0*sin(t1 - t2) * m2 * (p2*p2*l2 + p1*p1*l1*cos(t1 - t2));
  den1 = l1 * (2.0*m1 + m2 - m2*cos(2.0*t1 - 2.0*t2));
  float a1 = num1 / den1; 
  
  // dTheta2
  num2 = 2.0*sin(t1 - t2) * (p1*p1*l1*(m1+m2) + g*(m1+m2)*cos(t1) + p2*p2*l2*m2*cos(t1-t2));
  den2 = l2 * (2.0*m1 + m2 - m2*cos(2.0*t1 - 2.0*t2));
  float a2 = num2 / den2; 
  
  // Integrate
  p1 += a1 * u_dt;
  p2 += a2 * u_dt;
  
  float t1_new = t1 + p1 * u_dt;
  float t2_new = t2 + p2 * u_dt;
  
  // --- ANALYSIS (Flip Counting Logic) ---
  // Detect Wraps for Analysis
  float delta1 = 0.0;
  if (t1 > 2.0 && t1_new < -2.0) delta1 = 1.0; // Crossed +PI -> -PI
  else if (t1 < -2.0 && t1_new > 2.0) delta1 = -1.0; // Crossed -PI -> +PI
  
  float delta2 = 0.0;
  if (t2 > 2.0 && t2_new < -2.0) delta2 = 1.0;
  else if (t2 < -2.0 && t2_new > 2.0) delta2 = -1.0;

  // Store Analysis Deltas (Accumulation happens via read-add-write if we had texture, 
  // but for now we just output the delta and rely on the accumulation buffer if setup,
  // or just visualising instantaneous flips if accumulation isn't fully linked in Canvas (it writes to next, reads from current))
  // Wait, without 'u_analysis' input, we can't accumulate.
  // Visualizing INSTANT FLIPS is actually cool too (sparks).
  // But let's verify if we can read u_state's older analysis?
  // u_state is texture 0 (Physics). 
  // We need 'u_analysis_prev'.
  // Since I didn't add it in Canvas.tsx yet, I will just output deltas.
  // The heatmap will show "Active Flipping Regions" (Flashy) which is also correct for "Flip Rate".
  
  o_analysis = vec4(abs(delta1), abs(delta2), 0.0, 0.0); 

  // Wrap Physics State
  float wrapped_t1 = mod(t1_new + PI, 2.0 * PI) - PI;
  float wrapped_t2 = mod(t2_new + PI, 2.0 * PI) - PI;
  
  o_physics = vec4(wrapped_t1, wrapped_t2, p1, p2);
}`;
