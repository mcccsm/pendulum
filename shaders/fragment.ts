export const fragmentShaderSource = `
  precision highp float;

  uniform sampler2D u_state;    // The current simulation state (from FBO)
  uniform sampler2D u_gradient; // The color palette texture
  uniform vec2 u_resolution;
  
  varying vec2 v_uv;

  #define PI 3.14159265359

  void main() {
    // Read the physics state
    // x = theta1, y = theta2
    vec4 s = texture2D(u_state, v_uv);

    // Map angles [-PI, PI] to texture coordinates [0, 1]
    vec2 tex_uv = s.xy / (2.0 * PI) + 0.5;
    
    // Lookup color
    vec3 color = texture2D(u_gradient, tex_uv).rgb;

    gl_FragColor = vec4(color, 1.0);
  }
`;
