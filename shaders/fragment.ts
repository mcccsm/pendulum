export const fragmentShaderSource = `
  precision highp float;

  uniform sampler2D u_state;    // The current simulation state (from FBO)
  uniform sampler2D u_gradient; // The color palette texture
  uniform vec2 u_resolution;

  // Magnifier lens
  uniform int u_lens_active;
  uniform vec2 u_lens_uv;
  uniform float u_lens_radius_px;
  uniform float u_lens_zoom;
  uniform float u_wireframe_alpha; // 0..1, fades pendulum wireframe in/out

  varying vec2 v_uv;

  #define PI 3.14159265359

  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 sample_uv = v_uv;
    float ring = 0.0;
    float inside_lens = 0.0;

    if (u_lens_active == 1) {
      vec2 frag_px = v_uv * u_resolution;
      vec2 lens_px = u_lens_uv * u_resolution;
      float d = distance(frag_px, lens_px);

      inside_lens = smoothstep(u_lens_radius_px, u_lens_radius_px - 1.5, d);

      vec2 zoomed_uv = u_lens_uv + (v_uv - u_lens_uv) / u_lens_zoom;
      zoomed_uv = clamp(zoomed_uv, 0.0, 1.0);
      sample_uv = mix(v_uv, zoomed_uv, inside_lens);

      float r = u_lens_radius_px;
      ring = smoothstep(r - 1.5, r - 0.5, d) - smoothstep(r - 0.5, r + 0.5, d);
    }

    vec4 s = texture2D(u_state, sample_uv);
    vec2 tex_uv = s.xy / (2.0 * PI) + 0.5;
    vec3 color = texture2D(u_gradient, tex_uv).rgb;

    // Pendulum wireframe overlay (only inside lens, only when alpha > 0)
    if (u_wireframe_alpha > 0.001 && inside_lens > 0.5) {
      vec2 frag_px = v_uv * u_resolution;
      vec2 lens_center_px = u_lens_uv * u_resolution;
      vec2 sample_px = sample_uv * u_resolution;       // phase-space pixel coords
      vec2 cell_id = floor(sample_px);
      vec2 cell_center_phase = cell_id + 0.5;
      vec2 cell_center_screen = lens_center_px + (cell_center_phase - lens_center_px) * u_lens_zoom;
      vec2 p = frag_px - cell_center_screen;            // cell-local screen pixels

      float arm = u_lens_zoom * 0.2;
      float theta1 = s.x;
      float theta2 = s.y;
      vec2 pivot = vec2(0.0, 0.0);
      vec2 joint = pivot + arm * vec2(sin(theta1), -cos(theta1));
      vec2 bob   = joint + arm * vec2(sin(theta2), -cos(theta2));

      float d_rod = min(sdSegment(p, pivot, joint), sdSegment(p, joint, bob));
      float d_piv = length(p - pivot);
      float d_jnt = length(p - joint);
      float d_bob = length(p - bob);

      float aa = 1.0;
      float rod   = smoothstep(1.5 + aa, 1.5 - aa, d_rod);
      float piv   = smoothstep(2.0 + aa, 2.0 - aa, d_piv);
      float jnt   = smoothstep(2.0 + aa, 2.0 - aa, d_jnt);
      float bobd  = smoothstep(3.0 + aa, 3.0 - aa, d_bob);

      float wire = max(max(rod, piv), max(jnt, bobd));
      color = mix(color, vec3(1.0), wire * u_wireframe_alpha);
    }

    color = mix(color, vec3(1.0), ring * 0.6);

    gl_FragColor = vec4(color, 1.0);
  }
`;
