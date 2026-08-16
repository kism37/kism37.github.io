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
  let usingTrack = true;
  let iframe = null;
  let kicked = false;

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

  function embedSrc() {
    return `https://www.youtube.com/embed/${TRACK.id}?autoplay=1&mute=0&start=${TRACK.start}&loop=1&playlist=${TRACK.id}&playsinline=1&rel=0&modestbranding=1`;
  }

  function mountIframe() {
    const box = host();
    const dock = document.getElementById("breath-dock");
    if (!box || !dock) return false;
    dock.hidden = false;
    iframe = document.getElementById("yt-embed");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "yt-embed";
      iframe.title = TRACK.title;
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.setAttribute("allowfullscreen", "");
      box.replaceChildren(iframe);
    }
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.src = embedSrc();
    usingTrack = true;
    state.audio = true;
    return true;
  }

  function stopTrack() {
    iframe = document.getElementById("yt-embed");
    if (iframe) iframe.src = "about:blank";
    usingTrack = false;
  }

  function kick() {
    if (kicked || !state.audio) return;
    kicked = true;
    mountIframe();
    resume().then(() => buildTicks()).catch(() => {});
  }

  function autostart() {
    state.audio = true;
    mountIframe();
    resume().then(() => buildTicks()).catch(() => {});
    const once = () => kick();
    ["pointerdown", "pointermove", "wheel", "keydown", "touchstart", "scroll"].forEach((ev) => {
      window.addEventListener(ev, once, { once: true, capture: true, passive: true });
    });
  }

  async function unlock() {
    state.audio = true;
    kicked = false;
    mountIframe();
    try {
      await resume();
      buildTicks();
    } catch {
      /* optional */
    }
    return true;
  }

  async function setEnabled(on) {
    if (on) {
      kicked = false;
      return unlock();
    }
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
    autostart,
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
