import { state } from "./state.js";

export function createAudio() {
  let ctx = null;
  let master;
  let filter;
  let droneGain;
  let breathGain;
  let pulseGain;
  let oscA;
  let oscB;
  let oscC;
  let lfo;
  let noiseSrc;
  let armed = false;

  async function unlock() {
    if (armed) {
      if (ctx.state === "suspended") await ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    master.connect(comp);
    comp.connect(ctx.destination);

    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    filter.connect(master);

    droneGain = ctx.createGain();
    droneGain.gain.value = 0.22;
    droneGain.connect(filter);

    oscA = ctx.createOscillator();
    oscB = ctx.createOscillator();
    oscC = ctx.createOscillator();
    oscA.type = "sine";
    oscB.type = "sine";
    oscC.type = "triangle";
    oscA.frequency.value = 55;
    oscB.frequency.value = 82.4;
    oscC.frequency.value = 110;
    oscB.detune.value = 7;
    oscC.detune.value = -11;
    const gA = ctx.createGain();
    const gB = ctx.createGain();
    const gC = ctx.createGain();
    gA.gain.value = 0.5;
    gB.gain.value = 0.32;
    gC.gain.value = 0.08;
    oscA.connect(gA).connect(droneGain);
    oscB.connect(gB).connect(droneGain);
    oscC.connect(gC).connect(droneGain);

    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain).connect(filter.frequency);

    const nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = nbuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = nbuf;
    noiseSrc.loop = true;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = "bandpass";
    nFilter.frequency.value = 380;
    nFilter.Q.value = 0.6;
    breathGain = ctx.createGain();
    breathGain.gain.value = 0.03;
    noiseSrc.connect(nFilter).connect(breathGain).connect(master);

    pulseGain = ctx.createGain();
    pulseGain.gain.value = 0;
    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = "sine";
    pulseOsc.frequency.value = 110;
    pulseOsc.connect(pulseGain).connect(master);

    oscA.start();
    oscB.start();
    oscC.start();
    lfo.start();
    noiseSrc.start();
    pulseOsc.start();

    armed = true;
    if (ctx.state === "suspended") await ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.6);
  }

  function setEnabled(on) {
    state.audio = on;
    if (!armed) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.linearRampToValueAtTime(on ? 0.16 : 0.0, now + 0.25);
    if (on && ctx.state === "suspended") ctx.resume();
  }

  function tick() {
    if (!armed || !state.audio) return;
    const now = ctx.currentTime;
    const scene = state.morph;
    const root = 48 + scene * 4.2;
    oscA.frequency.setTargetAtTime(root, now, 0.4);
    oscB.frequency.setTargetAtTime(root * 1.5, now, 0.4);
    oscC.frequency.setTargetAtTime(root * 2.0, now, 0.5);
    const vel = Math.min(1, Math.hypot(state.mouse.vx, state.mouse.vy) * 0.04);
    const cutoff = 280 + scene * 90 + vel * 1400 + state.attention * 500 + state.pulse * 600;
    filter.frequency.setTargetAtTime(cutoff, now, 0.08);
    breathGain.gain.setTargetAtTime(0.018 + vel * 0.05 + state.energy * 0.02, now, 0.1);
    droneGain.gain.setTargetAtTime(0.16 + state.beat * 0.08 + state.energy * 0.06, now, 0.12);
  }

  function pluck(intensity = 1) {
    if (!armed || !state.audio) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = "triangle";
    o.frequency.value = 180 + state.morph * 28 + Math.random() * 40;
    f.type = "lowpass";
    f.frequency.value = 900 + intensity * 800;
    g.gain.value = 0.0001;
    o.connect(f).connect(g).connect(master);
    g.gain.exponentialRampToValueAtTime(0.12 * intensity, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    o.start(now);
    o.stop(now + 0.75);
  }

  function reject() {
    if (!armed || !state.audio) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 70;
    g.gain.value = 0.0001;
    o.connect(g).connect(master);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o.start(now);
    o.stop(now + 0.2);
  }

  function whoosh() {
    if (!armed || !state.audio) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(80, now);
    o.frequency.exponentialRampToValueAtTime(320, now + 0.35);
    g.gain.setValueAtTime(0.04, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + 0.42);
  }

  async function toggle() {
    if (!armed) {
      await unlock();
      setEnabled(true);
      return true;
    }
    setEnabled(!state.audio);
    return state.audio;
  }

  return { unlock, setEnabled, tick, pluck, reject, whoosh, toggle, get armed() { return armed; } };
}
