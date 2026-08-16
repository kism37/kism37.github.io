import { state } from "./state.js";

const VERT_FULL = `#version 300 es
precision highp float;
const vec2 V[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(V[gl_VertexID], 0.0, 1.0); }
`;

const FRAG_FIELD = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uMorph;
uniform vec2 uMouse;
uniform float uPulse;
uniform float uEnergy;
uniform float uRipple;
uniform vec2 uRippleOrigin;
uniform float uBeat;
uniform float uQuality;
uniform float uReduced;
uniform float uSeed;
uniform float uAttention;

float hash21(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 19.1) * 43758.5453);
}

float cheapNoise(vec3 p){
  return sin(dot(p, vec3(12.9898, 78.233, 45.164)) + uTime * 0.7) * 0.5
       + 0.5 * sin(dot(p, vec3(39.7, 11.3, 73.1)) - uTime * 0.35);
}

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

float sdSphere(vec3 p, float r){ return length(p) - r; }

float sdTorus(vec3 p, vec2 t){
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float sdBox(vec3 p, vec3 b){
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float gyroid(vec3 p, float scale, float th){
  p *= scale;
  return abs(dot(sin(p), cos(p.zxy))) / scale - th;
}

float helix(vec3 p, float t){
  float a = atan(p.z, p.x);
  float r = length(p.xz);
  vec2 q = vec2(r - 0.72, p.y);
  q *= rot(a * 3.0 - t * 1.4);
  q.x -= 0.2;
  float d1 = length(q) - 0.105;
  q = vec2(r - 0.72, p.y);
  q *= rot(a * 3.0 - t * 1.4 + 3.14159);
  q.x -= 0.2;
  float d2 = length(q) - 0.09;
  return smin(d1, d2, 0.08);
}

float lattice(vec3 p, float t){
  vec3 q = p;
  q.xy *= rot(t * 0.2);
  q.xz *= rot(t * 0.15);
  q = abs(mod(q + 0.45, 0.9) - 0.45);
  float bars = min(min(sdBox(q, vec3(0.45, 0.045, 0.045)), sdBox(q, vec3(0.045, 0.45, 0.045))), sdBox(q, vec3(0.045, 0.045, 0.45)));
  return max(sdSphere(p, 1.15), bars - 0.01);
}

float metaballs(vec3 p, float t){
  float d = 1e3;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    vec3 c = vec3(
      sin(t * 0.7 + fi * 1.7 + uSeed * 6.0),
      cos(t * 0.55 + fi * 2.1),
      sin(t * 0.4 + fi * 1.3)
    ) * (0.52 + 0.1 * sin(t + fi));
    d = smin(d, sdSphere(p - c, 0.42 + 0.07 * sin(t * 1.4 + fi)), 0.3);
  }
  return d;
}

float heartish(vec3 p, float beat){
  p.y += 0.08;
  p *= 1.05 / beat;
  float a = sdSphere(p - vec3(-0.28, 0.22, 0.0), 0.42);
  float b = sdSphere(p - vec3(0.28, 0.22, 0.0), 0.42);
  vec3 q = p - vec3(0.0, -0.18, 0.0);
  q.xy *= rot(0.7);
  float c = sdBox(q, vec3(0.34, 0.5, 0.28));
  return smin(smin(a, b, 0.2), c, 0.28);
}

float scatter(vec3 p, float t){
  float d = 1e3;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float ang = fi * 1.2566 + t * 0.25;
    vec3 c = vec3(cos(ang), sin(ang * 1.3) * 0.55, sin(ang)) * (1.05 + 0.22 * sin(t + fi));
    d = min(d, sdSphere(p - c, 0.17 + 0.04 * sin(t * 2.0 + fi)));
  }
  return d;
}

float shape(vec3 p, float t, float beat, int i, float n){
  if (i == 0) return sdSphere(p, 0.82 * beat) + n;
  if (i == 1) return metaballs(p, t) + n * 0.7;
  if (i == 2) return sdTorus(p.xzy, vec2(0.78, 0.24 + 0.05 * sin(t))) + n;
  if (i == 3) return max(sdSphere(p, 1.05), gyroid(p + t * 0.12, 3.4, 0.12)) + n;
  if (i == 4) return helix(p, t) + n * 0.5;
  if (i == 5) return lattice(p, t);
  if (i == 6) return heartish(p, beat) + n * 0.4;
  return scatter(p, t);
}

float map(vec3 p){
  float t = uTime;
  float beat = 1.0 + 0.055 * uBeat + 0.08 * uPulse;
  p.xy -= 0.18 * uAttention * uMouse * exp(-dot(p.xy, p.xy) * 0.35);

  if (uRipple > 0.02){
    float r = length(p.xy - uRippleOrigin * vec2(1.5, 1.0));
    p.z += 0.22 * uRipple * sin(r * 12.0 - t * 9.0) * exp(-r * 1.8);
  }

  if (uReduced < 0.5){
    p.xy *= rot(t * 0.07);
    p.xz *= rot(sin(t * 0.11) * 0.18);
  }

  float n = cheapNoise(p * 2.1) * 0.028 * (0.35 + uEnergy);
  float mI = clamp(uMorph, 0.0, 6.999);
  int ia = int(floor(mI));
  int ib = ia + 1;
  float f = smoothstep(0.0, 1.0, fract(mI));
  return mix(shape(p, t, beat, ia, n), shape(p, t, beat, ib, n), f);
}

vec3 calcNormal(vec3 p){
  vec3 e = vec3(0.0018, -0.0018, 0.0);
  return normalize(
    e.xyy * map(p + e.xyy) +
    e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) +
    e.xxx * map(p + e.xxx)
  );
}

vec3 palette(float m, vec3 n, float fre){
  vec3 interior = vec3(0.04, 0.16, 0.17);
  vec3 teal = vec3(0.24, 0.88, 0.78);
  vec3 plasma = vec3(0.52, 0.45, 1.0);
  vec3 amber = vec3(0.95, 0.68, 0.18);
  vec3 blood = vec3(0.72, 0.18, 0.28);
  float k = clamp(m / 7.0, 0.0, 1.0);
  vec3 base = mix(teal, plasma, smoothstep(0.15, 0.45, k));
  base = mix(base, vec3(0.15, 0.55, 0.95), smoothstep(0.4, 0.62, k));
  base = mix(base, amber, smoothstep(0.55, 0.78, k) * 0.65);
  base = mix(base, mix(plasma, blood, 0.45), smoothstep(0.75, 1.0, k));
  vec3 alb = mix(interior, base, 0.35 + 0.55 * fre);
  alb = mix(alb, amber, uBeat * 0.28);
  alb += n.y * 0.06;
  return alb;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  vec3 ro = vec3(0.0, 0.08, 3.15);
  if (uReduced < 0.5){
    ro.x += sin(t * 0.13) * 0.18;
    ro.y += cos(t * 0.1) * 0.08;
  }
  vec3 ta = vec3(uMouse * 0.12, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
  vec3 vv = cross(ww, uu);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

  float steps = mix(22.0, 48.0, clamp(uQuality, 0.0, 1.0));
  if (uReduced > 0.5) steps = 20.0;

  float dist = 0.0;
  float glow = 0.0;
  float hit = -1.0;
  vec3 p = ro;
  for (int i = 0; i < 48; i++){
    if (float(i) > steps) break;
    p = ro + rd * dist;
    float d = map(p);
    glow += exp(-abs(d) * 10.0) * 0.018;
    if (d < 0.0015){ hit = dist; break; }
    if (dist > 8.0) break;
    dist += max(d, 0.012);
  }

  vec3 col = vec3(0.015, 0.018, 0.03);
  col += vec3(0.03, 0.02, 0.06) * (1.0 - length(uv) * 0.55);
  col += vec3(0.02, 0.05, 0.05) * exp(-length(uv + vec2(-0.4, 0.2)) * 1.8);

  float stars = step(0.9965, hash21(floor(uv * uRes.y * 0.55)));
  col += stars * 0.55 * vec3(0.8, 0.9, 1.0);

  if (hit > 0.0){
    vec3 pos = ro + rd * hit;
    vec3 n = calcNormal(pos);
    vec3 v = -rd;
    vec3 l1 = normalize(vec3(0.7, 0.8, 0.4));
    vec3 l2 = normalize(vec3(-0.6, 0.2, -0.5));
    float dif = clamp(dot(n, l1), 0.0, 1.0);
    float bac = clamp(dot(n, l2), 0.0, 1.0) * 0.45;
    float fre = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
    float spec = pow(clamp(dot(reflect(-l1, n), v), 0.0, 1.0), 42.0);
    float ao = clamp(0.4 + 0.6 * n.y, 0.25, 1.0);
    vec3 alb = palette(uMorph, n, fre);
    col = alb * (0.12 + dif * 0.9 + bac) * ao;
    col += vec3(0.85, 0.95, 1.0) * spec * 0.35;
    col += alb * fre * 0.85;
    col += vec3(0.25, 0.9, 0.8) * pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.0) * 0.35;
    float sss = pow(clamp(dot(rd, l1), 0.0, 1.0), 2.0);
    col += alb * sss * 0.2 * (0.5 + uEnergy);
  }

  vec3 gcol = mix(vec3(0.15, 0.85, 0.75), vec3(0.6, 0.4, 1.0), clamp(uMorph / 7.0, 0.0, 1.0));
  gcol = mix(gcol, vec3(0.95, 0.7, 0.2), uBeat * 0.4);
  col += gcol * glow * (0.9 + uEnergy * 0.7 + uPulse * 0.5);

  float vig = smoothstep(1.35, 0.25, length(uv * vec2(1.05, 1.0)));
  col *= vig;
  col = mix(col, col * vec3(1.04, 0.98, 1.06), 0.15);
  col = pow(max(col, 0.0), vec3(0.92));
  float grain = hash21(gl_FragCoord.xy + t) * 0.04;
  col += grain - 0.018;
  fragColor = vec4(col, 1.0);
}
`;

const FRAG_FAST = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uMorph;
uniform vec2 uMouse;
uniform float uPulse;
uniform float uEnergy;
uniform float uRipple;
uniform vec2 uRippleOrigin;
uniform float uBeat;
uniform float uSeed;
uniform float uAttention;
uniform float uCells;

float hash21(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 13.7) * 43758.5453);
}

vec3 palette(float m){
  vec3 teal = vec3(0.24, 0.88, 0.78);
  vec3 plasma = vec3(0.52, 0.45, 1.0);
  vec3 amber = vec3(0.95, 0.68, 0.18);
  vec3 blood = vec3(0.72, 0.18, 0.28);
  float k = clamp(m / 7.0, 0.0, 1.0);
  vec3 base = mix(teal, plasma, smoothstep(0.12, 0.42, k));
  base = mix(base, amber, smoothstep(0.5, 0.78, k) * 0.7);
  base = mix(base, mix(plasma, blood, 0.4), smoothstep(0.74, 1.0, k));
  return mix(base, amber, uBeat * 0.28);
}

float blob(vec2 p, vec2 c, float r){
  float d = length(p - c);
  return r * r / (d * d + 0.0008);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float beat = 1.0 + 0.08 * uBeat + 0.1 * uPulse;
  vec2 m = uMouse * vec2(0.9, 0.7);
  uv -= m * uAttention * 0.08;

  float field = 0.0;
  float scene = uMorph;
  field += blob(uv, vec2(0.0), 0.2 * beat * (1.0 - 0.35 * smoothstep(0.0, 2.0, scene)) * (1.0 + uCells * 0.7));
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    float ang = fi * 1.047197 + t * 0.22;
    float spread = smoothstep(0.15, 1.6, scene);
    float rad = mix(0.04, 0.36 + 0.06 * sin(t * 0.55 + fi), spread);
    if (scene > 1.8 && scene < 3.4) rad = 0.28 + 0.04 * sin(t + fi);
    if (scene > 5.4) rad = 0.14 + 0.26 * abs(sin(t * 0.4 + fi * 1.7));
    vec2 c = vec2(cos(ang), sin(ang)) * rad;
    if (scene > 2.6 && scene < 4.6) c.y += 0.14 * sin(ang * 3.0 + t);
    if (scene > 3.6 && scene < 5.4){
      c = vec2(cos(ang * 2.0 + t * 0.4), sin(ang) * 0.55) * (0.22 + 0.12 * fi * 0.12);
    }
    if (scene > 5.7){
      c = vec2(-0.22 + float(i < 3) * 0.44, 0.1 + (fi - 2.5) * 0.05);
      if (i > 3) c = vec2(sin(fi * 2.1 + t), cos(fi * 1.4)) * 0.32;
    }
    float r = (0.11 + 0.03 * sin(t * 1.4 + fi)) * beat * (0.9 + uEnergy * 0.2);
    field += blob(uv, c, r);
  }

  if (uRipple > 0.02){
    float rr = length(uv - uRippleOrigin * vec2(0.8, 0.6));
    field += uRipple * 0.45 * sin(rr * 18.0 - t * 10.0) * exp(-rr * 2.4);
  }

  vec3 col = vec3(0.015, 0.018, 0.03);
  col += vec3(0.03, 0.02, 0.07) * (1.0 - length(uv) * 0.5);
  float stars = step(0.9968, hash21(floor(uv * uRes.y * 0.5)));
  col += stars * 0.5;

  vec3 pigment = palette(scene);
  field = field / (1.0 + field * 0.42);
  float core = smoothstep(0.28, 0.72, field);
  float halo = smoothstep(0.08, 0.4, field);
  col += pigment * halo * 0.55;
  col += pigment * core * 0.7;
  col += mix(pigment, vec3(0.92, 0.97, 0.95), 0.35) * pow(core, 3.0) * 0.28;
  col += pigment * exp(-length(uv) * 1.7) * 0.1 * (0.45 + uEnergy);

  float vig = smoothstep(1.3, 0.2, length(uv));
  col *= vig;
  col += (hash21(gl_FragCoord.xy + t) - 0.5) * 0.04;
  fragColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
}
`;

const VERT_POINTS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
uniform vec2 uRes;
uniform float uTime;
uniform float uMorph;
uniform vec2 uMouse;
uniform float uPulse;
uniform float uEnergy;
uniform float uAttention;
uniform float uReduced;
out float vAlpha;
out vec3 vCol;

float hash(float n){ return fract(sin(n) * 43758.5453123); }

void main(){
  float id = aSeed.x;
  float r1 = aSeed.y;
  float r2 = aSeed.z;
  float r3 = aSeed.w;
  float t = uTime;
  float scene = uMorph;

  float rad = 0.35 + r1 * 1.55;
  float speed = 0.15 + r2 * 0.55;
  float elev = (r3 - 0.5) * 1.2;
  float ang = t * speed + id * 6.28318;

  vec3 p;
  if (scene < 3.5){
    p = vec3(cos(ang) * rad, elev + 0.12 * sin(t * 0.7 + id * 8.0), sin(ang) * rad);
  } else if (scene < 5.5){
    float flow = t * 0.35 + r1 * 10.0;
    p = vec3(
      sin(flow + r2 * 6.0) * (0.6 + r3),
      cos(flow * 0.7 + r1 * 4.0) * 0.7,
      sin(flow * 1.3 + r2) * 0.8
    );
  } else {
    float burst = 0.8 + uPulse * 1.4 + uEnergy * 0.4;
    p = normalize(vec3(r1 - 0.5, r2 - 0.5, r3 - 0.5)) * burst * (0.4 + r1);
    p += 0.08 * vec3(sin(t + id), cos(t * 1.2 + id), sin(t * 0.8));
  }

  p.xy += uMouse * uAttention * 0.22 * (1.0 - r1);
  if (uReduced > 0.5) p *= 0.85;

  vec3 ro = vec3(0.0, 0.08, 3.15);
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(vec3(0,1,0), ww));
  vec3 vv = cross(ww, uu);
  vec3 rel = p - ro;
  float z = dot(rel, ww);
  vec2 xy = vec2(dot(rel, uu), dot(rel, vv)) / max(z, 0.2) * 1.55;
  vec2 clip = vec2(xy.x * (uRes.y / uRes.x), xy.y);

  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = mix(1.2, 3.6, r2) * (1.0 + uPulse * 0.8) * (1100.0 / uRes.y);

  float k = clamp(scene / 7.0, 0.0, 1.0);
  vec3 c0 = vec3(0.35, 0.95, 0.86);
  vec3 c1 = vec3(0.62, 0.5, 1.0);
  vec3 c2 = vec3(0.95, 0.72, 0.28);
  vCol = mix(c0, c1, k);
  vCol = mix(vCol, c2, smoothstep(0.55, 1.0, k) * 0.5 + uPulse * 0.2);
  vAlpha = (z > 0.3 ? 0.75 : 0.0) * (0.35 + 0.65 * r3);
}
`;

const FRAG_POINTS = `#version 300 es
precision highp float;
in float vAlpha;
in vec3 vCol;
out vec4 fragColor;
void main(){
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float d = dot(pc, pc);
  if (d > 1.0) discard;
  float a = exp(-d * 2.6) * vAlpha;
  fragColor = vec4(vCol * a, a);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p));
  }
  return p;
}

function loc(gl, p) {
  const out = { u: {}, a: {} };
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++) {
    const info = gl.getActiveUniform(p, i);
    out.u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return out;
}

export function createField(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    state.webgl = false;
    document.body.classList.add("no-webgl");
    return { ok: false, resize() {}, render() {} };
  }

  let fieldProg = null;
  let fieldLoc = null;
  let fastProg;
  let pointProg;
  try {
    fastProg = program(gl, VERT_FULL, FRAG_FAST);
    pointProg = program(gl, VERT_POINTS, FRAG_POINTS);
  } catch (err) {
    console.error("VITAE shader", err);
    state.webgl = false;
    document.body.classList.add("no-webgl");
    return { ok: false, resize() {}, render() {} };
  }

  const fastLoc = loc(gl, fastProg);
  const pointLoc = loc(gl, pointProg);
  state.mode3d = false;

  function ensure3d() {
    if (fieldProg || state.soft) return !!fieldProg;
    try {
      fieldProg = program(gl, VERT_FULL, FRAG_FIELD);
      fieldLoc = loc(gl, fieldProg);
      return true;
    } catch (err) {
      console.warn("VITAE 3D shader", err);
      state.soft = true;
      return false;
    }
  }

  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = [
    ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "",
    gl.getParameter(gl.RENDERER),
    gl.getParameter(gl.VENDOR),
  ].join(" ");
  state.soft = /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic/i.test(renderer);
  if (state.soft) state.quality = 0.32;
  else if (state.mobile) state.quality = 0.62;
  const count = state.soft ? 420 : state.mobile ? 900 : 2800;
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = i / count;
    seeds[i * 4 + 1] = Math.random();
    seeds[i * 4 + 2] = Math.random();
    seeds[i * 4 + 3] = Math.random();
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const emptyVao = gl.createVertexArray();

  function resize() {
    const dpr = state.mobile ? Math.min(state.dpr, 1.5) : Math.min(state.dpr, 2);
    const w = Math.max(1, Math.floor(state.width * dpr * (0.7 + 0.3 * state.quality)));
    const h = Math.max(1, Math.floor(state.height * dpr * (0.7 + 0.3 * state.quality)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function setCommon(L, prog) {
    gl.useProgram(prog);
    gl.uniform2f(L.u.uRes, canvas.width, canvas.height);
    gl.uniform1f(L.u.uTime, state.time);
    gl.uniform1f(L.u.uMorph, state.morph);
    gl.uniform2f(L.u.uMouse, state.mouse.sx, state.mouse.sy);
    gl.uniform1f(L.u.uPulse, state.pulse);
    gl.uniform1f(L.u.uEnergy, state.energy);
    if (L.u.uRipple) gl.uniform1f(L.u.uRipple, state.ripple);
    if (L.u.uRippleOrigin) gl.uniform2f(L.u.uRippleOrigin, state.rippleOrigin.x, state.rippleOrigin.y);
    if (L.u.uBeat) gl.uniform1f(L.u.uBeat, state.beat);
    if (L.u.uQuality) gl.uniform1f(L.u.uQuality, state.quality);
    if (L.u.uReduced) gl.uniform1f(L.u.uReduced, state.reduced ? 1 : 0);
    if (L.u.uSeed) gl.uniform1f(L.u.uSeed, state.seedFloat);
    gl.uniform1f(L.u.uAttention, state.attention);
    if (L.u.uCells) gl.uniform1f(L.u.uCells, Math.min(1, (state.hosts?.length || 0) / 24));
  }

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    canvas.style.visibility = "hidden";
    document.body.classList.add("no-webgl");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    canvas.style.visibility = "";
  });

  function render() {
    if (gl.isContextLost()) return;
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.024, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(emptyVao);
    const use3d = state.mode3d && !state.soft && !state.reduced && ensure3d();
    if (use3d) setCommon(fieldLoc, fieldProg);
    else setCommon(fastLoc, fastProg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!state.soft && state.fps > 34) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(vao);
      setCommon(pointLoc, pointProg);
      gl.drawArrays(gl.POINTS, 0, count);
    }
    gl.bindVertexArray(null);
  }

  return { ok: true, resize, render, gl };
}
