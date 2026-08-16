import { state } from "./state.js";

const TRACK = {
  id: "lIp-OwMozKI",
  title: "Asake · Red Bull Symphonic",
  url: "https://www.youtube.com/watch?v=lIp-OwMozKI",
  start: 52,
};

export function createAudio() {
  let ctx = null;
  let master;
  let armed = false;
  let usingTrack = false;
  let iframe = null;

  const dock = () => document.getElementById("breath-dock");
  const host = () => document.getElementById("yt-player");

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

  function buildTicks() {
    if (armed || !ctx) return;
    master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);
    armed = true;
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

  function showDock(on) {
    const el = dock();
    if (el) el.hidden = !on;
  }

  function embedSrc() {
    const origin = encodeURIComponent(location.origin);
    return `https://www.youtube.com/embed/${TRACK.id}?autoplay=1&mute=0&start=${TRACK.start}&loop=1&playlist=${TRACK.id}&playsinline=1&rel=0&modestbranding=1&origin=${origin}`;
  }

  function mountIframe() {
    const box = host();
    const panel = dock();
    if (!box || !panel) return false;
    panel.hidden = false;
    box.replaceChildren();
    iframe = document.createElement("iframe");
    iframe.src = embedSrc();
    iframe.title = TRACK.title;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("frameborder", "0");
    box.appendChild(iframe);
    usingTrack = true;
    return true;
  }

  function stopTrack() {
    const box = host();
    if (iframe) {
      iframe.src = "about:blank";
      iframe.remove();
    }
    iframe = null;
    if (box) box.replaceChildren();
    usingTrack = false;
    showDock(false);
  }

  async function unlock() {
    state.audio = true;
    const mounted = mountIframe();
    try {
      ensureCtx();
      await resume();
      buildTicks();
    } catch {
      /* ticks are optional */
    }
    return mounted;
  }

  async function setEnabled(on) {
    if (on) return unlock();
    state.audio = false;
    stopTrack();
    return false;
  }

  function tick() {}

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
    remount: mountIframe,
    track: TRACK,
    get armed() {
      return usingTrack || armed;
    },
    get running() {
      return !!(state.audio && usingTrack);
    },
  };
}
