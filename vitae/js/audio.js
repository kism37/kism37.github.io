import { state } from "./state.js";

export function createAudio() {
  let ctx = null;
  let master;
  let filter;
  let droneGain;
  let breathGain;
  let oscA;
  let oscB;
  let oscC;
  let lfo;
  let noiseSrc;
  let armed = false;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("AudioContext missing");
    ctx = new AC();
    return ctx;
  }

  async function resume() {
    ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  }

  function buildGraph() {
    if (armed) return;
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 2.5;
    master.connect(comp);
    comp.connect(ctx.destination);

    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 720;
    filter.Q.value = 0.55;
    filter.connect(master);

    droneGain = ctx.createGain();
    droneGain.gain.value = 0.28;
    droneGain.connect(filter);

    oscA = ctx.createOscillator();
    oscB = ctx.createOscillator();
    oscC = ctx.createOscillator();
    oscA.type = "sine";
    oscB.type = "triangle";
    oscC.type = "sine";
    oscA.frequency.value = 110;
    oscB.frequency.value = 165;
    oscC.frequency.value = 220;
    oscB.detune.value = 6;
    oscC.detune.value = -8;
    const gA = ctx.createGain();
    const gB = ctx.createGain();
    const gC = ctx.createGain();
    gA.gain.value = 0.55;
    gB.gain.value = 0.18;
    gC.gain.value = 0.12;
    oscA.connect(gA).connect(droneGain);
    oscB.connect(gB).connect(droneGain);
    oscC.connect(gC).connect(droneGain);

    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(filter.frequency);

    const nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = nbuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = nbuf;
    noiseSrc.loop = true;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = "bandpass";
    nFilter.frequency.value = 520;
    nFilter.Q.value = 0.5;
    breathGain = ctx.createGain();
    breathGain.gain.value = 0.045;
    noiseSrc.connect(nFilter).connect(breathGain).connect(master);

    oscA.start();
    oscB.start();
    oscC.start();
    lfo.start();
    noiseSrc.start();
    armed = true;
  }

  function confirm() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(440, now);
    o.frequency.exponentialRampToValueAtTime(220, now + 0.28);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + 0.4);
  }

  function setGain(value, seconds = 0.2) {
    if (!master) return;
    const now = ctx.currentTime;
    const next = Math.max(0.0001, value);
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value || 0.0001), now);
    master.gain.linearRampToValueAtTime(next, now + seconds);
  }

  async function unlock() {
    ensureCtx();
    const running = await resume();
    buildGraph();
    if (ctx.state === "suspended") await ctx.resume();
    state.audio = true;
    setGain(0.24, 0.35);
    confirm();
    return running || ctx.state === "running";
  }

  async function setEnabled(on) {
    state.audio = on;
    if (on) {
      const ok = await unlock();
      if (!ok) state.audio = false;
      return state.audio;
    }
    if (armed) setGain(0.0001, 0.2);
    return false;
  }

  function tick() {
    if (!armed || !state.audio || !ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const scene = state.morph;
    const root = 110 + scene * 8;
    oscA.frequency.setTargetAtTime(root, now, 0.4);
    oscB.frequency.setTargetAtTime(root * 1.5, now, 0.4);
    oscC.frequency.setTargetAtTime(root * 2.0, now, 0.5);
    const vel = Math.min(1, Math.hypot(state.mouse.vx, state.mouse.vy) * 0.04);
    const cutoff = 480 + scene * 70 + vel * 1600 + state.attention * 500 + state.pulse * 700;
    filter.frequency.setTargetAtTime(cutoff, now, 0.08);
    breathGain.gain.setTargetAtTime(0.03 + vel * 0.06 + state.energy * 0.03, now, 0.1);
    droneGain.gain.setTargetAtTime(0.22 + state.beat * 0.1 + state.energy * 0.08, now, 0.12);
  }

  function pluck(intensity = 1) {
    if (!armed || !state.audio) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = "triangle";
    o.frequency.value = 330 + state.morph * 24 + Math.random() * 50;
    f.type = "lowpass";
    f.frequency.value = 1400 + intensity * 800;
    g.gain.value = 0.0001;
    o.connect(f).connect(g).connect(master);
    g.gain.exponentialRampToValueAtTime(0.16 * intensity, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    o.start(now);
    o.stop(now + 0.6);
  }

  function reject() {
    if (!armed || !state.audio) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 90;
    g.gain.value = 0.0001;
    o.connect(g).connect(master);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    o.start(now);
    o.stop(now + 0.18);
  }

  function whoosh() {
    if (!armed || !state.audio) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(420, now + 0.28);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + 0.34);
  }

  async function toggle() {
    if (!state.audio || !armed) return setEnabled(true);
    return setEnabled(false);
  }

  return {
    unlock,
    setEnabled,
    resume,
    tick,
    pluck,
    reject,
    whoosh,
    toggle,
    get armed() {
      return armed;
    },
    get running() {
      return !!(ctx && ctx.state === "running" && state.audio);
    },
  };
}
