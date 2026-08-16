import { state } from "./state.js";

const TRACK = {
  id: "lIp-OwMozKI",
  title: "Asake · Red Bull Symphonic",
  url: "https://www.youtube.com/watch?v=lIp-OwMozKI",
  start: 52,
};

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  return new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };
    if (!document.querySelector("script[src*='youtube.com/iframe_api']")) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => reject(new Error("YouTube API blocked"));
      document.head.appendChild(s);
    }
    setTimeout(() => {
      if (window.YT && window.YT.Player) resolve(window.YT);
    }, 4000);
  });
}

export function createAudio() {
  let ctx = null;
  let master;
  let player = null;
  let armed = false;
  let usingTrack = false;
  const dock = () => document.getElementById("breath-dock");

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

  function setTrackVolume() {
    if (!player || typeof player.setVolume !== "function") return;
    const vol = Math.round(58 + state.energy * 22 + state.attention * 16);
    try {
      player.setVolume(Math.max(28, Math.min(92, vol)));
    } catch {
      /* player not ready */
    }
  }

  async function startTrack() {
    showDock(true);
    const YT = await loadYouTubeAPI();
    if (player && typeof player.playVideo === "function") {
      player.unMute();
      player.playVideo();
      setTrackVolume();
      usingTrack = true;
      return true;
    }
    const host = document.getElementById("yt-player");
    if (!host) return false;
    await new Promise((resolve) => {
      player = new YT.Player("yt-player", {
        videoId: TRACK.id,
        width: host.clientWidth || 200,
        height: host.clientHeight || 112,
        playerVars: {
          autoplay: 1,
          start: TRACK.start,
          loop: 1,
          playlist: TRACK.id,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: location.origin,
          enablejsapi: 1,
        },
        events: {
          onReady(e) {
            try {
              e.target.unMute();
              e.target.setVolume(70);
              e.target.playVideo();
              usingTrack = true;
            } catch {
              usingTrack = false;
            }
            resolve();
          },
          onError() {
            usingTrack = false;
            resolve();
          },
          onStateChange(e) {
            if (e.data === YT.PlayerState.ENDED) {
              e.target.seekTo(TRACK.start, true);
              e.target.playVideo();
            }
          },
        },
      });
    });
    return usingTrack;
  }

  function stopTrack() {
    if (player && typeof player.pauseVideo === "function") {
      try {
        player.mute();
        player.pauseVideo();
      } catch {
        /* ignore */
      }
    }
    showDock(false);
  }

  async function unlock() {
    ensureCtx();
    await resume();
    buildTicks();
    state.audio = true;
    const ok = await startTrack();
    if (!ok) {
      showDock(false);
    }
    return ctx.state === "running";
  }

  async function setEnabled(on) {
    state.audio = on;
    if (on) {
      const ok = await unlock();
      if (!ok) state.audio = false;
      return state.audio;
    }
    stopTrack();
    return false;
  }

  function tick() {
    if (!state.audio) return;
    if (usingTrack) setTrackVolume();
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
    track: TRACK,
    get armed() {
      return armed || usingTrack;
    },
    get running() {
      return !!(state.audio && usingTrack);
    },
  };
}

loadYouTubeAPI().catch(() => {});
