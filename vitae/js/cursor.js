import { state } from "./state.js";

export function createCursor(canvas) {
  const ctx = canvas.getContext("2d");
  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let rx = x;
  let ry = y;
  let tx = x;
  let ty = y;
  const trail = Array.from({ length: 8 }, () => ({ x, y }));
  let magnet = null;
  let magnets = [];
  let magStamp = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(state.width * dpr);
    canvas.height = Math.floor(state.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    magnets = [];
  }

  function refreshMagnets() {
    magnets = [...document.querySelectorAll("[data-magnetic]")].flatMap((el) => {
      if (el.closest("[hidden]")) return [];
      const r = el.getBoundingClientRect();
      return [{ x: r.left + r.width / 2, y: r.top + r.height / 2, el }];
    });
    magStamp = state.time;
  }

  function nearestMagnetic(px, py) {
    if (!magnets.length || state.time - magStamp > 0.35) refreshMagnets();
    let best = null;
    let bestD = 88;
    magnets.forEach((m) => {
      const d = Math.hypot(px - m.x, py - m.y);
      if (d < bestD) {
        bestD = d;
        best = { ...m, d };
      }
    });
    magnet = best;
    return best;
  }

  function tick() {
    if (state.mobile || state.reduced) {
      ctx.clearRect(0, 0, state.width, state.height);
      return;
    }
    const mx = state.mouse.x || state.width / 2;
    const my = state.mouse.y || state.height / 2;
    const mag = nearestMagnetic(mx, my);
    let txTarget = mx;
    let tyTarget = my;
    if (mag) {
      const pull = (1 - mag.d / 88) * 0.42;
      txTarget = mx + (mag.x - mx) * pull;
      tyTarget = my + (mag.y - my) * pull;
    }
    tx += (txTarget - tx) * 0.38;
    ty += (tyTarget - ty) * 0.38;
    x += (tx - x) * 0.28;
    y += (ty - y) * 0.28;
    rx += (x - rx) * 0.12;
    ry += (y - ry) * 0.12;

    trail.pop();
    trail.unshift({ x, y });

    const vel = Math.min(1, Math.hypot(state.mouse.vx, state.mouse.vy) * 0.035);
    const pulse = 10 + state.beat * 6 + state.pulse * 10 + vel * 14;
    const overField = Math.hypot(mx / state.width - 0.5, my / state.height - 0.48) < 0.18;

    ctx.clearRect(0, 0, state.width, state.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (state.attention > 0.35) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(state.width * 0.5, state.height * 0.48);
      ctx.strokeStyle = `rgba(62, 224, 198, ${0.08 + state.attention * 0.18})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (let i = trail.length - 1; i > 0; i--) {
      const a = trail[i];
      const b = trail[i - 1];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(243, 240, 232, ${0.04 + (1 - i / trail.length) * 0.16})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    ctx.beginPath();
    if (overField && !state.reduced) {
      const spikes = 7;
      for (let i = 0; i <= spikes; i++) {
        const a = (i / spikes) * Math.PI * 2 + state.time * 0.8;
        const r = pulse * (0.72 + 0.18 * Math.sin(state.time * 3 + i));
        const px = rx + Math.cos(a) * r;
        const py = ry + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.arc(rx, ry, pulse, 0, Math.PI * 2);
    }
    ctx.strokeStyle = magnet ? "rgba(62, 224, 198, 0.85)" : "rgba(243, 240, 232, 0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, state.mouse.down ? 3.6 : 2.2, 0, Math.PI * 2);
    ctx.fillStyle = state.mouse.down ? "#f0b429" : "#f3f0e8";
    ctx.fill();

    if (state.ripple > 0.02) {
      const rr = (1 - state.ripple) * 140 + 16;
      ctx.beginPath();
      ctx.arc(
        (state.rippleOrigin.x * 0.5 + 0.5) * state.width,
        (-state.rippleOrigin.y * 0.5 + 0.5) * state.height,
        rr,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = `rgba(62, 224, 198, ${state.ripple * 0.45})`;
      ctx.stroke();
    }
  }

  return { resize, tick, get magnet() { return magnet; } };
}
