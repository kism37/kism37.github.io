import { SCENES, state, setScene, pulseAt, bindMedia, applySpecimen } from "./state.js";
import { createField } from "./webgl.js";
import { createAudio } from "./audio.js";
import { createCursor } from "./cursor.js";
import { createType } from "./type.js";
import { EXAMPLES, hashName, randomSeed, clampName, clampNote, packetURL } from "./specimen.js";
import {
  parseScope,
  ingest,
  scopeDigest,
  looksLikeRecon,
  saveMembrane,
  loadMembrane,
  burnMembrane,
  exportBundle,
} from "./surface.js";
import { extractSerum, looksLikeSerum, nearestExpiry, refreshTtl, formatTtl } from "./serum.js";

bindMedia();

const fieldCanvas = document.getElementById("field");
const cursorCanvas = document.getElementById("cursor");
const field = createField(fieldCanvas);
const audio = createAudio();
const cursor = createCursor(cursorCanvas);
const type = createType();

const gate = document.getElementById("gate");
const story = document.getElementById("story");
const help = document.getElementById("help");
const live = document.getElementById("scene-live");
const progressBar = document.getElementById("progress-bar");
const progress = document.querySelector(".progress");
const statusLine = document.getElementById("status-line");
const fpsEl = document.getElementById("fps");
const soundBtn = document.getElementById("btn-sound");
const callsign = document.getElementById("callsign");
const intent = document.getElementById("intent");
const scopeEl = document.getElementById("scope");
const liveSeed = document.getElementById("live-seed");
const membrane = document.getElementById("membrane");
const ingestEl = document.getElementById("ingest");
const serumEl = document.getElementById("serum");
const serumIngest = document.getElementById("serum-ingest");
const packetEl = document.getElementById("packet");
const hudSpec = document.getElementById("hud-spec");
const chapters = [...document.querySelectorAll(".chapters a")];
const phaseBtns = [...document.querySelectorAll(".phase-strip button")];

let last = performance.now();
let lastScene = -1;
let frames = 0;
let fpsStamp = performance.now();
let slowFrames = 0;
let lastAnnounce = "";

function formatAge(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s % 3600 / 60);
  return `${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function currentPacket() {
  return {
    name: state.name,
    note: state.note,
    seed: state.seed,
  };
}

function syncURL() {
  const url = packetURL(currentPacket());
  history.replaceState(null, "", url);
  return url;
}

function setSoundUI(on) {
  soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
  soundBtn.setAttribute("aria-label", on ? "Mute sound" : "Enable sound");
  document.getElementById("icon-sound").setAttribute(
    "d",
    on
      ? "M4 10v4h3l5 4V6L7 10H4zm12.5 1a3 3 0 010 2M16 7a7 7 0 010 10"
      : "M4 10v4h3l5 4V6L7 10H4zm13 1.5l4 4m0-4l-4 4"
  );
}

function announce(scene) {
  const msg = `${SCENES[scene].title}. ${SCENES[scene].log}.`;
  if (msg === lastAnnounce) return;
  lastAnnounce = msg;
  live.textContent = msg;
}

function renderSerum() {
  const list = document.getElementById("serum-list");
  if (!list) return;
  state.serum = refreshTtl(state.serum);
  list.innerHTML = state.serum
    .map((it) => {
      const flags = (it.flags || [])
        .map((f) => `<span class="flag${f === "expired" ? " dead" : ""}">${f}</span>`)
        .join("");
      const extra = it.exp ? ` · ${formatTtl(it.ttl)}` : "";
      return `<li tabindex="0" data-copy="${encodeURIComponent(it.value)}"><span>${it.label}${flags}</span><em>${it.preview}</em><div class="meta">${it.type}${extra}${it.detail && it.detail.iss ? ` · ${it.detail.iss}` : ""}</div></li>`;
    })
    .join("") || "<li>empty</li>";
}

function drawSerum(blob) {
  const found = extractSerum(blob);
  const have = new Set(state.serum.map((s) => s.id));
  const added = found.filter((s) => !have.has(s.id));
  state.serum.push(...added);
  const out = document.getElementById("serum-result");
  if (out) {
    out.textContent = found.length
      ? `+${added.length} new · ${found.length} in paste · ${state.serum.length} living`
      : "No tokens, cookies, or keys in that paste.";
  }
  if (added.length) {
    pulseAt(0, 0, 0.7);
    audio.pluck(0.9);
  } else if (found.length) {
    audio.whoosh();
  } else {
    audio.reject();
  }
  renderSerum();
  updateHUD();
}

function drainSerum() {
  state.serum = [];
  if (serumIngest) serumIngest.value = "";
  const out = document.getElementById("serum-result");
  if (out) out.textContent = "Drained. Secrets were never stored.";
  renderSerum();
  updateHUD();
}

function persist() {
  saveMembrane(state.name, {
    scopeText: state.scopeText,
    hosts: state.hosts,
    rejected: state.rejected.slice(-200),
    digest: state.scopeDigest,
  });
}

function renderLists() {
  const hosts = document.getElementById("host-list");
  const rejects = document.getElementById("reject-list");
  if (!hosts) return;
  hosts.innerHTML = state.hosts
    .slice()
    .reverse()
    .slice(0, 80)
    .map((h) => `<li tabindex="0" data-copy="${h.host}"><span>${h.host}</span><em>in</em></li>`)
    .join("") || "<li>empty</li>";
  rejects.innerHTML = state.rejected
    .slice()
    .reverse()
    .slice(0, 80)
    .map((h) => `<li tabindex="0" data-copy="${h.host}"><span>${h.host}</span><em>${h.reason}</em></li>`)
    .join("") || "<li>empty</li>";
  document.getElementById("count-in").textContent = String(state.hosts.length);
  document.getElementById("count-oos").textContent = String(state.rejected.length);
  const sum = document.getElementById("membrane-summary");
  if (sum) {
    sum.textContent = `IN ${state.hosts.length} · OOS ${state.rejected.length} · digest ${state.scopeDigest}`;
  }
}

function renderPacket() {
  if (!packetEl) return;
  const rows = [
    ["specimen", state.name || "unaddressed"],
    ["seed", state.seed],
    ["digest", state.scopeDigest],
    ["in / oos", `${state.hosts.length} / ${state.rejected.length}`],
    ["intent", state.note || "none stated"],
    ["age", formatAge(state.age)],
  ];
  packetEl.innerHTML = rows
    .map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`)
    .join("");
}

function updateHUD() {
  const label = state.name || "unaddressed";
  hudSpec.textContent = label;
  document.getElementById("vital-seed").textContent = `SEED · ${state.seed}`;
  document.getElementById("vital-scene").textContent = state.awake
    ? `PHASE · ${SCENES[state.scene].title}`
    : "PHASE · GATE";
  document.getElementById("vital-in").textContent = `IN · ${state.hosts.length}`;
  document.getElementById("vital-oos").textContent = `OOS · ${state.rejected.length}`;
  const next = nearestExpiry(state.serum);
  document.getElementById("vital-serum").textContent = next
    ? `SERUM · ${state.serum.length} · ${formatTtl(next.ttl)}`
    : `SERUM · ${state.serum.length}`;
  document.title = state.name ? `VITAE · ${state.name}` : "VITAE · membrane";
  renderPacket();
  renderLists();
  renderSerum();
}

function applySceneClasses() {
  document.querySelectorAll(".chapter").forEach((el, i) => {
    el.classList.toggle("is-active", i === state.scene);
  });
  chapters.forEach((a) => {
    a.setAttribute("aria-current", Number(a.dataset.scene) === state.scene ? "true" : "false");
  });
  phaseBtns.forEach((b) => {
    b.setAttribute("aria-current", Number(b.dataset.scene) === state.scene ? "true" : "false");
  });
}

function readScroll() {
  if (!state.awake) {
    state.scroll = 0;
    state.morph = 0;
    return;
  }
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const p = Math.min(1, Math.max(0, scrollY / max));
  state.scroll = p;
  const span = SCENES.length - 1;
  state.morph = p * span;
  setScene(Math.round(state.morph));
  progressBar.style.width = `${p * 100}%`;
  progress.setAttribute("aria-valuenow", String(Math.round(p * 100)));
  if (state.scene !== lastScene) {
    lastScene = state.scene;
    applySceneClasses();
    announce(state.scene);
    audio.whoosh();
    type.recache();
  }
}

function goToScene(index) {
  const el = document.getElementById(SCENES[index].id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + scrollY;
  window.scrollTo({ top, behavior: state.reduced ? "auto" : "smooth" });
}

function feed(clientX, clientY, amount = 1) {
  const nx = (clientX / state.width) * 2 - 1;
  const ny = -((clientY / state.height) * 2 - 1);
  pulseAt(nx, ny, amount);
  type.impulse(amount);
  audio.pluck(0.7 + amount * 0.5);
  if (navigator.vibrate) navigator.vibrate(amount > 1 ? 18 : 8);
  statusLine.textContent = `fed · ${state.feeds}`;
}

function formToSpecimen() {
  const name = clampName(callsign.value);
  const note = clampNote(intent.value);
  const seed = hashName(name) || state.seed || randomSeed();
  return { name, note, seed, scopeText: scopeEl.value };
}

async function setScopeText(text) {
  state.scopeText = text;
  if (scopeEl && scopeEl.value !== text) scopeEl.value = text;
  state.scopeDigest = await scopeDigest(text);
}

async function admit(blob) {
  const scope = parseScope(state.scopeText);
  const result = ingest(blob, scope, state.hosts);
  state.hosts.push(...result.admitted);
  state.rejected.push(...result.rejected);
  state.lastIngest = {
    admitted: result.admitted.length,
    rejected: result.rejected.length,
    dupes: result.dupes.length,
  };
  const out = document.getElementById("ingest-result");
  if (!scope.allow.length && !scope.deny.length) {
    if (out) out.textContent = "No scope. Every host was rejected (no-scope).";
  } else if (out) {
    out.textContent = `+${result.admitted.length} in · ${result.rejected.length} oos · ${result.dupes.length} dup`;
  }
  if (result.admitted.length) {
    pulseAt(0, 0, Math.min(1.2, 0.35 + result.admitted.length * 0.08));
    audio.pluck(0.8);
  }
  if (result.rejected.length && !result.admitted.length) audio.reject();
  persist();
  updateHUD();
  return result;
}

function previewFromForm() {
  const name = clampName(callsign.value);
  const hashed = hashName(name);
  if (hashed) {
    applySpecimen({ name, note: clampNote(intent.value), seed: hashed });
    liveSeed.textContent = `SEED · ${hashed} · body follows the callsign`;
  } else {
    liveSeed.textContent = `SEED · ${state.seed} · type a callsign to shape it`;
  }
  updateHUD();
}

async function wake(withSound) {
  if (withSound) {
    try {
      const ok = await audio.unlock();
      setSoundUI(true);
      statusLine.textContent = ok ? "breath armed" : "audio blocked by the browser";
    } catch {
      setSoundUI(false);
      statusLine.textContent = "audio unavailable";
    }
  }
  const spec = formToSpecimen();
  applySpecimen(spec);
  await setScopeText(spec.scopeText);
  const saved = loadMembrane(spec.name);
  if (saved) {
    if (!state.hosts.length) state.hosts = saved.hosts || [];
    if (!state.rejected.length) state.rejected = saved.rejected || [];
    if (saved.scopeText && !spec.scopeText.trim()) await setScopeText(saved.scopeText);
  }
  persist();
  syncURL();
  if (state.awake) {
    if (!withSound) statusLine.textContent = "specimen retargeted";
    updateHUD();
    return;
  }
  state.awake = true;
  document.documentElement.classList.add("awake");
  document.body.classList.add("awake");
  gate.hidden = true;
  story.hidden = false;
  type.collect();
  type.recache();
  statusLine.textContent = state.audio
    ? "awake · breath armed"
    : (state.name ? `awake · ${state.name}` : "awake · unaddressed");
  updateHUD();
  applySceneClasses();
  announce(0);
  requestAnimationFrame(() => {
    readScroll();
  });
}

function burnAndReseed() {
  burnMembrane(state.name);
  const seed = randomSeed();
  applySpecimen({ name: "", note: "", seed });
  state.hosts = [];
  state.rejected = [];
  state.serum = [];
  callsign.value = "";
  intent.value = "";
  scopeEl.value = "";
  setScopeText("");
  syncURL();
  window.scrollTo({ top: 0, behavior: state.reduced ? "auto" : "smooth" });
  statusLine.textContent = "burned · new body";
  updateHUD();
  pulseAt(0, 0, 0.9);
  type.impulse(0.4);
}

async function copyPacket() {
  const url = syncURL();
  const text = [
    `VITAE specimen`,
    `name  ${state.name || "unaddressed"}`,
    `seed  ${state.seed}`,
    `intent  ${state.note || "none stated"}`,
    `digest  ${state.scopeDigest}`,
    `in      ${state.hosts.length}`,
    `oos     ${state.rejected.length}`,
    url,
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    statusLine.textContent = "packet copied";
  } catch {
    statusLine.textContent = url;
  }
}

async function sendSpecimen() {
  const url = syncURL();
  const title = state.name ? `VITAE · ${state.name}` : "VITAE specimen";
  const text = state.note || "A living hunt specimen. No server residue.";
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      statusLine.textContent = "specimen sent";
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  await copyPacket();
}

function openHelp(open) {
  help.hidden = !open;
  document.getElementById("btn-help").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) document.getElementById("help-close").focus();
}

function openSerum(open) {
  serumEl.hidden = !open;
  state.serumOpen = open;
  document.getElementById("btn-serum").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    renderSerum();
    serumIngest.focus();
  }
}

async function serumClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!looksLikeSerum(text)) {
      statusLine.textContent = "clipboard is not serum";
      return;
    }
    serumIngest.value = text;
    drawSerum(text);
    statusLine.textContent = "serum drawn";
  } catch {
    statusLine.textContent = "clipboard blocked";
  }
}

function openMembrane(open) {
  membrane.hidden = !open;
  state.membraneOpen = open;
  document.getElementById("btn-membrane").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    renderLists();
    ingestEl.focus();
  }
}

function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportNow() {
  const bundle = exportBundle({
    name: state.name,
    note: state.note,
    seed: state.seed,
    digest: state.scopeDigest,
    hosts: state.hosts,
    rejected: state.rejected,
    scopeText: state.scopeText,
  });
  const slug = state.name || "unaddressed";
  downloadFile(`vitae-${slug}.json`, JSON.stringify(bundle.json, null, 2), "application/json");
  downloadFile(`vitae-${slug}.md`, bundle.markdown, "text/markdown");
  statusLine.textContent = "bundle exported";
}

async function ingestClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!looksLikeRecon(text)) {
      statusLine.textContent = "clipboard is not recon";
      return;
    }
    ingestEl.value = text;
    await admit(text);
    statusLine.textContent = "clipboard admitted";
  } catch {
    statusLine.textContent = "clipboard blocked";
  }
}

function onPointer(e) {
  const x = e.clientX;
  const y = e.clientY;
  state.mouse.vx = x - state.mouse.x;
  state.mouse.vy = y - state.mouse.y;
  state.mouse.x = x;
  state.mouse.y = y;
  state.mouse.nx = (x / state.width) * 2 - 1;
  state.mouse.ny = -((y / state.height) * 2 - 1);
  state.mouse.inside = true;
}

function resize() {
  state.width = innerWidth;
  state.height = innerHeight;
  state.dpr = Math.min(devicePixelRatio || 1, 2);
  cursor.resize();
  field.resize();
}

function mountExamples() {
  const root = document.getElementById("examples");
  EXAMPLES.forEach((ex) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = ex.name;
    btn.title = ex.note;
    btn.addEventListener("click", () => {
      callsign.value = ex.name;
      intent.value = ex.note;
      if (ex.scope) {
        scopeEl.value = ex.scope;
        setScopeText(ex.scope);
      }
      previewFromForm();
    });
    root.appendChild(btn);
  });
}

window.__vitaePause = false;
window.__vitae = state;

function loop(now) {
  if (window.__vitaePause) {
    requestAnimationFrame(loop);
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.dt = dt;
  if (!state.hidden) {
    state.time += dt;
    if (state.awake) state.age += dt;
  }

  const nextJwt = nearestExpiry(state.serum);
  if (nextJwt && nextJwt.ttl > 0 && nextJwt.ttl < 300000) {
    state.bpm = 54 + Math.round((1 - nextJwt.ttl / 300000) * 50);
  } else if (nextJwt && nextJwt.ttl <= 0) {
    state.bpm = 38;
  } else {
    state.bpm = 54;
  }
  const beatHz = (state.bpm + state.energy * 16) / 60;
  const phase = (state.time * beatHz) % 1;
  state.beat = Math.exp(-phase * 5.5);
  state.pulse *= Math.pow(0.22, dt);
  state.ripple *= Math.pow(0.18, dt);
  state.energy += (0.22 - state.energy) * (1 - Math.pow(0.25, dt));

  const targetX = state.mouse.nx;
  const targetY = state.mouse.ny;
  state.mouse.sx += (targetX - state.mouse.sx) * (state.reduced ? 1 : 0.08);
  state.mouse.sy += (targetY - state.mouse.sy) * (state.reduced ? 1 : 0.08);

  const speed = Math.hypot(state.mouse.vx, state.mouse.vy);
  const want = Math.min(1, 0.15 + speed * 0.03 + (state.mouse.down ? 0.35 : 0));
  state.attention += (want - state.attention) * 0.06;
  state.mouse.vx *= 0.86;
  state.mouse.vy *= 0.86;

  readScroll();
  if (!state.hidden) {
    field.render();
    cursor.tick();
    type.tick();
    audio.tick();
  }

  frames += 1;
  if (now - fpsStamp > 500) {
    state.fps = (frames * 1000) / (now - fpsStamp);
    frames = 0;
    fpsStamp = now;
    const debug = new URLSearchParams(location.search).has("debug");
    fpsEl.hidden = !debug;
    fpsEl.textContent = `${Math.round(state.fps)} fps`;
    window.__vitaeQuality = state.quality;
    if (state.fps < 48) slowFrames += 2;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (state.fps < 28) state.quality = Math.max(0.22, state.quality - 0.2);
    else if (slowFrames > 3 && state.quality > 0.28) state.quality = Math.max(0.28, state.quality - 0.12);
    else if (slowFrames === 0 && state.quality < 1 && state.fps > 58) state.quality = Math.min(1, state.quality + 0.04);
    if (state.fps < 26 && state.time > 0.9) state.soft = true;
    if (!state.soft && !state.reduced && state.time > 2.2 && state.fps > 55 && !state.mode3d) {
      state.mode3d = true;
    }
    if (state.mode3d && state.fps < 36) {
      state.mode3d = false;
    }
  }

  updateHUD();
  requestAnimationFrame(loop);
}

document.getElementById("address-form").addEventListener("submit", (e) => {
  e.preventDefault();
  wake(false);
});
document.getElementById("wake-sound").addEventListener("click", () => wake(true));
document.getElementById("btn-feed").addEventListener("click", (e) => feed(e.clientX, e.clientY, 1.15));
document.getElementById("btn-again").addEventListener("click", burnAndReseed);
document.getElementById("btn-seed").addEventListener("click", copyPacket);
document.getElementById("btn-share").addEventListener("click", sendSpecimen);
document.getElementById("btn-share-end").addEventListener("click", sendSpecimen);
document.getElementById("btn-help").addEventListener("click", () => openHelp(help.hidden));
document.getElementById("help-close").addEventListener("click", () => openHelp(false));
help.addEventListener("click", (e) => {
  if (e.target === help) openHelp(false);
});
document.getElementById("btn-serum").addEventListener("click", () => openSerum(serumEl.hidden));
document.getElementById("serum-close").addEventListener("click", () => openSerum(false));
serumEl.addEventListener("click", (e) => {
  if (e.target === serumEl) openSerum(false);
});
document.getElementById("btn-draw").addEventListener("click", () => drawSerum(serumIngest.value));
document.getElementById("btn-serum-clear").addEventListener("click", drainSerum);
document.getElementById("serum-list").addEventListener("click", async (e) => {
  const row = e.target.closest("[data-copy]");
  if (!row) return;
  const value = decodeURIComponent(row.dataset.copy);
  await navigator.clipboard.writeText(value);
  statusLine.textContent = "copied (full value)";
});
document.getElementById("btn-membrane").addEventListener("click", () => openMembrane(membrane.hidden));
document.getElementById("membrane-close").addEventListener("click", () => openMembrane(false));
membrane.addEventListener("click", (e) => {
  if (e.target === membrane) openMembrane(false);
});
document.getElementById("btn-ingest").addEventListener("click", () => admit(ingestEl.value));
document.getElementById("btn-export").addEventListener("click", exportNow);
document.getElementById("btn-copy-hosts").addEventListener("click", async () => {
  const text = state.hosts.map((h) => h.host).sort().join("\n");
  try {
    await navigator.clipboard.writeText(text);
    statusLine.textContent = "hosts copied";
  } catch {
    statusLine.textContent = "copy failed";
  }
});
document.getElementById("host-list").addEventListener("click", async (e) => {
  const row = e.target.closest("[data-copy]");
  if (!row) return;
  await navigator.clipboard.writeText(row.dataset.copy);
  statusLine.textContent = `copied ${row.dataset.copy}`;
});
document.getElementById("reject-list").addEventListener("click", async (e) => {
  const row = e.target.closest("[data-copy]");
  if (!row) return;
  await navigator.clipboard.writeText(row.dataset.copy);
});

callsign.addEventListener("input", previewFromForm);
intent.addEventListener("input", previewFromForm);
scopeEl.addEventListener("input", () => setScopeText(scopeEl.value));

soundBtn.addEventListener("click", async () => {
  try {
    const on = await audio.toggle();
    setSoundUI(on);
    statusLine.textContent = on ? "breath armed" : "silent";
  } catch {
    setSoundUI(false);
    statusLine.textContent = "audio blocked by the browser";
  }
});

function bindSceneJump(el) {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    if (!state.awake) return;
    goToScene(Number(el.dataset.scene));
  });
}
chapters.forEach(bindSceneJump);
phaseBtns.forEach(bindSceneJump);

window.addEventListener("pointermove", onPointer, { passive: true });
window.addEventListener("pointerdown", (e) => {
  state.mouse.down = true;
  onPointer(e);
});
window.addEventListener("pointerup", (e) => {
  if (state.awake && e.target.closest("canvas, .chapter, .story, body")) {
    const ui = e.target.closest("button, a, input, label, textarea, .help, .hud, .chapters, .phase-strip, .address, .packet, .membrane, .serum-wrap");
    if (!ui) feed(e.clientX, e.clientY, 0.7);
  }
  state.mouse.down = false;
});
window.addEventListener("pointerleave", () => {
  state.mouse.inside = false;
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!serumEl.hidden) {
      openSerum(false);
      return;
    }
    if (!membrane.hidden) {
      openMembrane(false);
      return;
    }
    openHelp(false);
    return;
  }
  if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
    e.preventDefault();
    openHelp(help.hidden);
    return;
  }
  if (e.target.matches("input, textarea")) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (!state.awake) {
      wake(false);
      return;
    }
    feed(state.mouse.x || state.width / 2, state.mouse.y || state.height / 2, 1);
    return;
  }
  if (e.key === "m" || e.key === "M") {
    soundBtn.click();
    return;
  }
  if (e.key === "s" || e.key === "S") {
    e.preventDefault();
    copyPacket();
    return;
  }
  if (e.key === "t" || e.key === "T") {
    e.preventDefault();
    openSerum(true);
    serumClipboard();
    return;
  }
  if (e.key === "v" || e.key === "V") {
    e.preventDefault();
    openMembrane(true);
    ingestClipboard();
    return;
  }
  if (!state.awake) return;
  if (e.key === "ArrowDown" || e.key === "j") {
    e.preventDefault();
    goToScene(state.scene + 1);
  }
  if (e.key === "ArrowUp" || e.key === "k") {
    e.preventDefault();
    goToScene(state.scene - 1);
  }
  if (/^[1-8]$/.test(e.key)) goToScene(Number(e.key) - 1);
});

document.addEventListener("visibilitychange", () => {
  state.hidden = document.hidden;
  if (!document.hidden && state.audio) audio.resume();
});

window.addEventListener("resize", () => {
  resize();
  type.recache();
}, { passive: true });

if (state.mobile || state.reduced) document.body.classList.add("native-cursor");
if (state.reduced) document.documentElement.classList.add("reduced");

if (state.name) callsign.value = state.name;
if (state.note) intent.value = state.note;
mountExamples();
previewFromForm();
const boot = loadMembrane(state.name);
if (boot) {
  if (boot.scopeText) {
    scopeEl.value = boot.scopeText;
    setScopeText(boot.scopeText);
  }
  state.hosts = boot.hosts || [];
  state.rejected = boot.rejected || [];
}
resize();
updateHUD();
requestAnimationFrame(loop);
