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
  let kicked = false;
  let bedOk = false;
  const bed = () => document.getElementById("bed");

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  async function resume() {
    if (!ensureCtx()) return false;
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  }

  function buildDrone() {
    if (armed || !ctx) return;
    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

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
    breathGain.gain.value = 0.04;
    noiseSrc.connect(nFilter).connect(breathGain).connect(master);

    oscA.start();
    oscB.start();
    oscC.start();
    lfo.start();
    noiseSrc.start();
    armed = true;
  }

  function setDroneGain(value) {
    if (!master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value || 0.0001), now);
    master.gain.linearRampToValueAtTime(Math.max(0.0001, value), now + 0.25);
  }

  function playBed() {
    const el = bed();
    if (!el) return false;
    el.loop = true;
    el.volume = 0.32;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        bedOk = true;
      }).catch(() => {
        bedOk = false;
      });
    }
    return true;
  }

  function stopBed() {
    const el = bed();
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    bedOk = false;
  }

  function kick() {
    if (kicked) return;
    kicked = true;
    state.audio = true;
    playBed();
    resume().then((ok) => {
      if (!ok) return;
      buildDrone();
      const el = bed();
      const fileAlive = el && !el.error && el.readyState >= 2 && !el.paused;
      setDroneGain(fileAlive ? 0.0001 : 0.22);
    });
  }

  function autostart() {
    state.audio = true;
    const el = bed();
    if (el) {
      el.addEventListener("error", () => {
        bedOk = false;
      });
      el.addEventListener("playing", () => {
        bedOk = true;
        if (armed) setDroneGain(0.0001);
      });
    }
    playBed();
    resume().then((ok) => {
      if (ok) buildDrone();
    });
    const once = () => kick();
    ["pointerdown", "pointermove", "wheel", "keydown", "touchstart", "scroll"].forEach((ev) => {
      window.addEventListener(ev, once, { once: true, capture: true, passive: true });
    });
  }

  async function unlock() {
    state.audio = true;
    kicked = false;
    kick();
    return true;
  }

  async function setEnabled(on) {
    state.audio = on;
    if (on) {
      kicked = false;
      kick();
      return true;
    }
    stopBed();
    setDroneGain(0.0001);
    return false;
  }

  function tick() {
    if (!state.audio) return;
    const el = bed();
    if (el && bedOk && !el.paused) {
      el.volume = Math.max(0.12, Math.min(0.55, 0.26 + state.energy * 0.18 + state.attention * 0.12));
      return;
    }
    if (!armed || !ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const root = 110 + state.morph * 8;
    oscA.frequency.setTargetAtTime(root, now, 0.4);
    oscB.frequency.setTargetAtTime(root * 1.5, now, 0.4);
    oscC.frequency.setTargetAtTime(root * 2.0, now, 0.5);
    const vel = Math.min(1, Math.hypot(state.mouse.vx, state.mouse.vy) * 0.04);
    filter.frequency.setTargetAtTime(480 + state.morph * 70 + vel * 1600 + state.pulse * 700, now, 0.08);
    breathGain.gain.setTargetAtTime(0.03 + vel * 0.06, now, 0.1);
    droneGain.gain.setTargetAtTime(0.22 + state.beat * 0.1, now, 0.12);
  }

  function beep(freq, type, peak, dur) {
    if (!armed || !state.audio || !ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  function pluck(intensity = 1) {
    beep(330 + state.morph * 24, "triangle", 0.08 * intensity, 0.35);
  }

  function reject() {
    beep(90, "square", 0.05, 0.14);
  }

  function whoosh() {
    beep(180 + state.morph * 12, "sawtooth", 0.04, 0.22);
  }

  async function toggle() {
    if (!state.audio) return setEnabled(true);
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
    autostart,
    get armed() {
      return armed || bedOk;
    },
    get running() {
      return !!(state.audio && (bedOk || armed));
    },
  };
}
