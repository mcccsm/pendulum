export const simulationShaderSource = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_grid_scale;
  uniform float u_gravity;
  uniform float u_dt;
  uniform sampler2D u_state; // The previous frame's state
  uniform int u_reset;      // Trigger to re-initialize

  varying vec2 v_uv;

  // Constants
  #define PI 3.14159265359

  // Physics constants matching the snippet
  const float m1 = 1.0;
  const float m2 = 1.0;
  const float l1 = 1.0;
  const float l2 = 1.0;

  // Acceleration function (returns delta-state per step)
  vec4 acc(vec4 s, float dt) {
    vec4 f;
    f.x = s.z * dt;
    f.y = s.w * dt;
    
    float d = s.x - s.y;
    float c1 = cos(d);
    float s1 = sin(d);
    
    float a = 2.0 * m1 + m2 * (1.0 - cos(2.0 * d));
    float g = u_gravity; 

    // Angular Acceleration 1
    float num1 = -g * (2.0 * m1 + m2) * sin(s.x) - m2 * g * sin(s.x - 2.0 * s.y) - 2.0 * s1 * m2 * (s.w * s.w * l2 + s.z * s.z * l1 * c1);
    float den1 = l1 * (2.0 * m1 + m2 - m2 * cos(2.0 * d));
    f.z = num1 / den1;
    f.z *= dt;
    
    // Angular Acceleration 2
    float num2 = 2.0 * s1 * (s.z * s.z * l1 * (m1 + m2) + g * (m1 + m2) * cos(s.x) + s.w * s.w * l2 * m2 * c1);
    float den2 = l2 * (2.0 * m1 + m2 - m2 * cos(2.0 * d));
    f.w = num2 / den2;
    f.w *= dt;
    
    return f;
  }

  void main() {
    // --- INITIALIZATION ---
    if (u_reset == 1) {
        // Quantize coordinates for Blocky Aesthetic (Initial Conditions)
        float aspectRatio = u_resolution.x / u_resolution.y;
        vec2 cells = vec2(u_grid_scale, u_grid_scale / aspectRatio);
        
        // Ensure we don't divide by zero if grid scale is very low, though slider min is 10
        vec2 quantized_uv = (floor(v_uv * cells) + 0.5) / cells;

        float theta1_init = (quantized_uv.x * 2.0 * PI) - PI;
        float theta2_init = (quantized_uv.y * 2.0 * PI) - PI;

        // State: theta1, theta2, omega1, omega2
        gl_FragColor = vec4(theta1_init, theta2_init, 0.0, 0.0);
        return;
    }

    // --- PHYSICS UPDATE ---
    vec4 s = texture2D(u_state, v_uv);

    // RK4 Step
    // We pass dt into acc to keep equations clean
    vec4 k1 = acc(s, u_dt);
    vec4 k2 = acc(s + k1 * 0.5, u_dt);
    vec4 k3 = acc(s + k2 * 0.5, u_dt);
    vec4 k4 = acc(s + k3, u_dt);

    vec4 d = (k1 + k4) / 6.0 + (k2 + k3) / 3.0;
    s += d;

    // Wrap angles within [-PI, PI]
    // This creates the "Phase Space Fractal" look
    s.x = mod(s.x + PI, 2.0 * PI) - PI;
    s.y = mod(s.y + PI, 2.0 * PI) - PI;

    gl_FragColor = s;
  }
`;
