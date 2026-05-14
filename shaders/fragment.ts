export const fragmentShaderSource = `
  precision highp float;

  uniform sampler2D u_state;    // The current simulation state (from FBO)
  uniform sampler2D u_gradient; // The color palette texture
  uniform vec2 u_resolution;

  // Magnifier lens
  uniform int u_lens_active;
  uniform vec2 u_lens_uv;          // mouse position in [0,1] UV space (y up)
  uniform float u_lens_radius_px;
  uniform float u_lens_zoom;

  varying vec2 v_uv;

  #define PI 3.14159265359

  void main() {
    vec2 sample_uv = v_uv;
    float ring = 0.0;

    if (u_lens_active == 1) {
      vec2 frag_px = v_uv * u_resolution;
      vec2 lens_px = u_lens_uv * u_resolution;
      float d = distance(frag_px, lens_px);

      float inside = smoothstep(u_lens_radius_px, u_lens_radius_px - 1.5, d);

      vec2 zoomed_uv = u_lens_uv + (v_uv - u_lens_uv) / u_lens_zoom;
      zoomed_uv = clamp(zoomed_uv, 0.0, 1.0);
      sample_uv = mix(v_uv, zoomed_uv, inside);

      // thin antialiased ring at the lens edge
      float r = u_lens_radius_px;
      ring = smoothstep(r - 1.5, r - 0.5, d) - smoothstep(r - 0.5, r + 0.5, d);
    }

    vec4 s = texture2D(u_state, sample_uv);
    vec2 tex_uv = s.xy / (2.0 * PI) + 0.5;
    vec3 color = texture2D(u_gradient, tex_uv).rgb;

    color = mix(color, vec3(1.0), ring * 0.6);

    gl_FragColor = vec4(color, 1.0);
  }
`;
