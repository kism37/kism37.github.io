const HOST_RE = /(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})/gi;
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const URL_RE = /https?:\/\/[^\s"'<>\\)]+/gi;

function ipv4ToInt(ip) {
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

function parseCidr(token) {
  const [ip, bitsRaw] = token.split("/");
  const addr = ipv4ToInt(ip);
  const bits = Number(bitsRaw);
  if (addr === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { addr: addr & mask, mask };
}

function inCidr(ip, cidr) {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return (n & cidr.mask) === cidr.addr;
}

export function parseScope(text) {
  const allow = [];
  const deny = [];
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .forEach((line) => {
      const denied = /^[-!]/.test(line);
      const token = line.replace(/^[-!]\s*/, "").trim().toLowerCase();
      if (!token) return;
      const cidr = token.includes("/") ? parseCidr(token) : null;
      const rule = cidr
        ? { type: "cidr", raw: token, cidr }
        : token.startsWith("*.")
          ? { type: "wild", raw: token, suffix: token.slice(1) }
          : { type: "exact", raw: token.replace(/^https?:\/\//, "").split("/")[0].split(":")[0] };
      (denied ? deny : allow).push(rule);
    });
  return { allow, deny };
}

export function normalizeHost(value) {
  let v = String(value || "").trim().toLowerCase();
  v = v.replace(/^[\s[(*]+/, "").replace(/[\s\])>,;]+$/, "");
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) {
      const u = new URL(v);
      const port = u.port && u.port !== "80" && u.port !== "443" ? `:${u.port}` : "";
      return u.hostname.replace(/\.$/, "") + port;
    }
  } catch {
    /* fall through */
  }
  v = v.replace(/^\/+/, "");
  const hostport = v.split("/")[0];
  const [host, port] = hostport.split(":");
  const h = host.replace(/\.$/, "");
  if (port && port !== "80" && port !== "443" && /^\d+$/.test(port)) return `${h}:${port}`;
  return h;
}

function looksLikeHost(h) {
  if (!h || h.length > 253) return false;
  if (IPV4_RE.test(h)) {
    IPV4_RE.lastIndex = 0;
    return true;
  }
  IPV4_RE.lastIndex = 0;
  if (h.includes(":")) {
    const [host] = h.split(":");
    return looksLikeHost(host);
  }
  HOST_RE.lastIndex = 0;
  const ok = HOST_RE.test(h) && !h.endsWith(".js") && !h.endsWith(".css") && !h.endsWith(".png");
  HOST_RE.lastIndex = 0;
  return ok;
}

export function extractAssets(blob) {
  const found = new Set();
  const text = String(blob || "");
  const add = (raw) => {
    const host = normalizeHost(raw);
    if (looksLikeHost(host)) found.add(host);
  };
  const urls = text.match(URL_RE) || [];
  urls.forEach(add);
  const ips = text.match(IPV4_RE) || [];
  ips.forEach(add);
  const hosts = text.match(HOST_RE) || [];
  hosts.forEach(add);
  HOST_RE.lastIndex = 0;
  IPV4_RE.lastIndex = 0;
  return [...found];
}

function hostMatchesRule(host, rule) {
  const bare = host.split(":")[0];
  if (rule.type === "cidr") return inCidr(bare, rule.cidr);
  if (rule.type === "exact") return bare === rule.raw;
  if (rule.type === "wild") {
    return bare.endsWith(rule.suffix) || bare === rule.suffix.slice(1);
  }
  return false;
}

export function classify(host, scope) {
  if (!scope.allow.length && !scope.deny.length) {
    return { ok: false, reason: "no-scope" };
  }
  if (scope.deny.some((rule) => hostMatchesRule(host, rule))) {
    return { ok: false, reason: "deny" };
  }
  if (scope.allow.some((rule) => hostMatchesRule(host, rule))) {
    return { ok: true, reason: "allow" };
  }
  return { ok: false, reason: "outside" };
}

export function ingest(blob, scope, existing) {
  const seen = new Set(existing.map((h) => h.host));
  const admitted = [];
  const rejected = [];
  const dupes = [];
  extractAssets(blob).forEach((host) => {
    if (seen.has(host)) {
      dupes.push(host);
      return;
    }
    const verdict = classify(host, scope);
    if (verdict.ok) {
      seen.add(host);
      admitted.push({ host, at: Date.now(), via: verdict.reason });
    } else {
      rejected.push({ host, at: Date.now(), reason: verdict.reason });
    }
  });
  return { admitted, rejected, dupes };
}

export async function scopeDigest(scopeText) {
  const norm = String(scopeText || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "").trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("\n");
  if (!norm) return "--------";
  const buf = new TextEncoder().encode(norm);
  if (crypto.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  let h = 2166136261;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function looksLikeRecon(text) {
  const t = String(text || "");
  if (t.length < 4 || t.length > 2_000_000) return false;
  const hits = extractAssets(t);
  if (hits.length >= 2) return true;
  if (hits.length === 1 && /https?:\/\//.test(t)) return true;
  return false;
}

const storeKey = (name) => `vitae.membrane.v1.${name || "unaddressed"}`;

export function saveMembrane(name, payload) {
  try {
    localStorage.setItem(storeKey(name), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function loadMembrane(name) {
  try {
    const raw = localStorage.getItem(storeKey(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function burnMembrane(name) {
  try {
    localStorage.removeItem(storeKey(name));
  } catch {
    /* ignore */
  }
}

export function exportBundle({ name, note, seed, digest, hosts, rejected, scopeText }) {
  const admitted = hosts.map((h) => h.host).sort();
  const oos = rejected.map((h) => `${h.host}\t${h.reason}`);
  return {
    json: {
      kind: "vitae-membrane",
      name: name || "unaddressed",
      note: note || "",
      seed,
      scopeDigest: digest,
      generatedAt: new Date().toISOString(),
      inScope: admitted,
      rejected: rejected.slice(-80).map((h) => ({ host: h.host, reason: h.reason })),
      counts: { in: admitted.length, oos: rejected.length },
    },
    hostsTxt: admitted.join("\n") + (admitted.length ? "\n" : ""),
    markdown: [
      `# VITAE membrane · ${name || "unaddressed"}`,
      "",
      `- seed: \`${seed}\``,
      `- scope digest: \`${digest}\``,
      `- intent: ${note || "none stated"}`,
      `- in-scope: ${admitted.length}`,
      `- rejected: ${rejected.length}`,
      "",
      "## In scope",
      ...admitted.map((h) => `- ${h}`),
      "",
      "## Last rejects",
      ...rejected.slice(-20).map((h) => `- ${h.host} (${h.reason})`),
      "",
      "## Scope",
      "```",
      scopeText.trim() || "(empty)",
      "```",
      "",
    ].join("\n"),
  };
}
