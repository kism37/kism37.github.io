import { state } from "./state.js";

function split(el) {
  const words = [...el.querySelectorAll(".word")];
  const letters = [];
  words.forEach((word) => {
    const text = word.textContent;
    word.textContent = "";
    [...text].forEach((ch) => {
      const span = document.createElement("span");
      span.className = "letter";
      span.textContent = ch;
      word.appendChild(span);
      letters.push({
        el: span,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    });
  });
  return letters;
}

export function createType() {
  let systems = [];

  function cacheHomes(sys) {
    sys.letters.forEach((l) => {
      const r = l.el.getBoundingClientRect();
      l.homeX = r.left + r.width / 2 - l.x;
      l.homeY = r.top + r.height / 2 - l.y;
    });
    sys.cached = true;
  }

  function collect() {
    systems = [...document.querySelectorAll("[data-physics]")].map((root) => ({
      root,
      letters: split(root),
      cached: false,
    }));
  }

  function recache() {
    systems.forEach((sys) => {
      sys.cached = false;
    });
  }

  function impulse(amount = 1) {
    systems.forEach((sys) => {
      sys.letters.forEach((l, i) => {
        const a = i * 0.7 + state.time;
        l.vx += Math.cos(a) * 18 * amount;
        l.vy += Math.sin(a * 1.3) * 14 * amount;
      });
    });
  }

  function tick() {
    if (state.reduced || state.mobile || state.fps < 36) {
      systems.forEach((sys) => {
        sys.letters.forEach((l) => {
          l.el.style.transform = "";
        });
      });
      return;
    }

    const mx = state.mouse.x;
    const my = state.mouse.y;
    const sceneRoot = document.querySelector(".chapter.is-active [data-physics]");

    systems.forEach((sys) => {
      const active = sys.root === sceneRoot;
      if (active && !sys.cached) cacheHomes(sys);
      sys.letters.forEach((l) => {
        if (!active) {
          if (Math.abs(l.x) < 0.1 && Math.abs(l.y) < 0.1) return;
          l.x *= 0.8;
          l.y *= 0.8;
          l.el.style.transform = `translate3d(${l.x}px, ${l.y}px, 0)`;
          return;
        }
        const dx = l.homeX + l.x - mx;
        const dy = l.homeY + l.y - my;
        const d2 = dx * dx + dy * dy;
        const rad = 130;
        if (d2 < rad * rad && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = (1 - d / rad) * 14;
          l.vx += (dx / d) * f;
          l.vy += (dy / d) * f;
        }
        l.vx += -l.x * 0.22;
        l.vy += -l.y * 0.22;
        l.vx *= 0.72;
        l.vy *= 0.72;
        l.x += l.vx;
        l.y += l.vy;
        l.x = Math.max(-16, Math.min(16, l.x));
        l.y = Math.max(-12, Math.min(12, l.y));
        l.el.style.transform = `translate3d(${l.x.toFixed(2)}px, ${l.y.toFixed(2)}px, 0)`;
      });
    });
  }

  return { collect, tick, impulse, recache };
}
