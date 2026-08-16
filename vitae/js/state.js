import { readPacket } from "./specimen.js";

const packet = readPacket();

export const SCENES = [
  { id: "signal", title: "Signal", log: "first packet" },
  { id: "surface", title: "Surface", log: "edge enumerating" },
  { id: "foothold", title: "Foothold", log: "session writing" },
  { id: "secrets", title: "Secrets", log: "loot in orbit" },
  { id: "lateral", title: "Lateral", log: "blood moving" },
  { id: "channel", title: "Channel", log: "path open" },
  { id: "impact", title: "Impact", log: "awaiting contact" },
  { id: "burn", title: "Burn", log: "no residue" },
];

export const state = {
  awake: false,
  time: 0,
  dt: 0.016,
  morph: 0,
  scene: 0,
  sceneName: "signal",
  scroll: 0,
  mouse: {
    x: 0,
    y: 0,
    nx: 0,
    ny: 0,
    sx: 0,
    sy: 0,
    vx: 0,
    vy: 0,
    down: false,
    inside: false,
  },
  pulse: 0,
  energy: 0.22,
  ripple: 0,
  rippleOrigin: { x: 0, y: 0 },
  beat: 0,
  bpm: 54,
  name: packet.name,
  note: packet.note,
  seed: packet.seed,
  seedFloat: parseInt(packet.seed, 16) / 0xffffff,
  attention: 0,
  audio: false,
  reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  quality: 1,
  fps: 60,
  width: innerWidth,
  height: innerHeight,
  dpr: Math.min(devicePixelRatio || 1, 2),
  mobile: matchMedia("(max-width: 768px), (pointer: coarse)").matches,
  webgl: true,
  hidden: document.hidden,
  feeds: 0,
  age: 0,
  scopeText: "",
  scopeDigest: "--------",
  hosts: [],
  rejected: [],
  lastIngest: { admitted: 0, rejected: 0, dupes: 0 },
  membraneOpen: false,
  serum: [],
  serumOpen: false,
};

export function applySpecimen({ name = "", note = "", seed }) {
  state.name = name;
  state.note = note;
  state.seed = seed;
  state.seedFloat = parseInt(seed, 16) / 0xffffff;
  state.feeds = 0;
  state.age = 0;
  state.energy = 0.22;
  state.pulse = 0.8;
}

export function setScene(index) {
  const i = Math.max(0, Math.min(SCENES.length - 1, index));
  state.scene = i;
  state.sceneName = SCENES[i].id;
}

export function pulseAt(nx, ny, amount = 1) {
  state.pulse = Math.min(1.6, state.pulse + amount);
  state.energy = Math.min(1.4, state.energy + 0.18 * amount);
  state.ripple = 1;
  state.rippleOrigin.x = nx;
  state.rippleOrigin.y = ny;
  state.feeds += 1;
}

export function bindMedia() {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const apply = () => {
    state.reduced = motion.matches;
    document.documentElement.classList.toggle("reduced", state.reduced);
  };
  apply();
  motion.addEventListener("change", apply);

  const mobile = window.matchMedia("(max-width: 768px), (pointer: coarse)");
  const applyMobile = () => {
    state.mobile = mobile.matches;
    document.documentElement.classList.toggle("is-mobile", state.mobile);
  };
  applyMobile();
  mobile.addEventListener("change", applyMobile);
}
