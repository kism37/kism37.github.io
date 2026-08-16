export const EXAMPLES = [
  {
    name: "perimeter",
    note: "external only. no phishing.",
    scope: "*.example.com\nexample.com\n-cdn.example.com\n-status.example.com",
  },
  {
    name: "ghost-host",
    note: "no persistence. burn on exit.",
    scope: "app.example.com\napi.example.com\n-admin.example.com",
  },
  {
    name: "unauth-edge",
    note: "pre-auth surface only.",
    scope: "*.example.com\nexample.com\n-id.example.com",
  },
];

export function hashName(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return null;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
}

export function randomSeed() {
  return Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, "0");
}

export function clampNote(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function clampName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function readPacket(search = location.search) {
  const params = new URLSearchParams(search);
  const name = clampName(params.get("name") || params.get("n") || "");
  const note = clampNote(params.get("note") || params.get("m") || "");
  const givenSeed = (params.get("seed") || "").toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 6);
  const seed = (givenSeed && givenSeed.length === 6)
    ? givenSeed
    : (hashName(name) || randomSeed());
  return { name, note, seed };
}

export function packetURL({ name, note, seed }) {
  const params = new URLSearchParams();
  if (name) params.set("name", name);
  if (note) params.set("note", note);
  params.set("seed", seed);
  const q = params.toString();
  return `${location.origin}${location.pathname}${q ? `?${q}` : ""}`;
}
