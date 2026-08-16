const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const AWS_RE = /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g;
const GITHUB_RE = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g;
const GITHUB_FINE_RE = /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g;
const SLACK_RE = /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g;
const GOOGLE_RE = /\bAIza[0-9A-Za-z_-]{30,}\b/g;
const STRIPE_RE = /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/g;
const BEARER_RE = /(?:Bearer|bearer)\s+([A-Za-z0-9._~+/=-]{16,})/g;
const BASIC_RE = /(?:Authorization:\s*)?Basic\s+([A-Za-z0-9+/=]{8,})/gi;
const PRIV_RE = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g;
const COOKIE_SET_RE = /set-cookie:\s*([^\r\n]+)/gi;
const COOKIE_HDR_RE = /(?:^|\n)cookie:\s*([^\r\n]+)/gi;

function b64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  try {
    return decodeURIComponent(
      [...atob(b64)].map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
    );
  } catch {
    try {
      return atob(b64);
    } catch {
      return null;
    }
  }
}

function redact(value) {
  const v = String(value || "");
  if (v.length <= 10) return "········";
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

function fp(type, value) {
  const v = String(value);
  return `${type}:${v.slice(0, 10)}:${v.slice(-8)}:${v.length}`;
}

function jwtRecord(token, now) {
  const parts = token.split(".");
  const header = JSON.parse(b64url(parts[0]) || "null");
  const payload = JSON.parse(b64url(parts[1]) || "null");
  if (!header || !payload) return null;
  const exp = Number(payload.exp) || 0;
  const nbf = Number(payload.nbf) || 0;
  const flags = [];
  const alg = String(header.alg || "");
  if (!alg || alg.toLowerCase() === "none") flags.push("alg-none");
  if (!exp) flags.push("no-exp");
  if (exp && exp * 1000 < now) flags.push("expired");
  if (nbf && nbf * 1000 > now) flags.push("nbf-future");
  if (header.kid) flags.push("has-kid");
  const ttl = exp ? exp * 1000 - now : null;
  const sub = payload.sub || payload.email || payload.preferred_username || payload.upn || "";
  return {
    type: "jwt",
    label: `JWT ${alg || "?"} ${sub || payload.iss || "session"}`,
    value: token,
    preview: redact(token),
    flags,
    exp,
    ttl,
    detail: {
      alg,
      kid: header.kid || "",
      iss: payload.iss || "",
      aud: Array.isArray(payload.aud) ? payload.aud.join(",") : (payload.aud || ""),
      sub: payload.sub || "",
      exp: exp || "",
    },
  };
}

function cookieRecords(line) {
  const out = [];
  const first = line.split(";")[0];
  const eq = first.indexOf("=");
  if (eq < 1) return out;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  const flags = [];
  if (!/; *secure/i.test(line)) flags.push("no-secure");
  if (!/; *httponly/i.test(line)) flags.push("no-httponly");
  if (!/; *samesite=/i.test(line)) flags.push("no-samesite");
  if (/samesite=none/i.test(line) && !/; *secure/i.test(line)) flags.push("none-without-secure");
  out.push({
    type: "cookie",
    label: `cookie ${name}`,
    value,
    preview: `${name}=${redact(value)}`,
    flags,
    exp: 0,
    ttl: null,
    detail: { name, attrs: line.split(";").slice(1).map((s) => s.trim()).filter(Boolean).join("; ") },
  });
  return out;
}

function cookieHeaderRecords(header) {
  return header.split(";").flatMap((part) => {
    const eq = part.indexOf("=");
    if (eq < 1) return [];
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name || !value) return [];
    const flags = [];
    if (value.split(".").length === 3 && value.startsWith("eyJ")) flags.push("looks-jwt");
    return [{
      type: "cookie",
      label: `cookie ${name}`,
      value,
      preview: `${name}=${redact(value)}`,
      flags,
      exp: 0,
      ttl: null,
      detail: { name, attrs: "request cookie (flags unknown)" },
    }];
  });
}

function secretRecord(type, label, value, flags = []) {
  return {
    type,
    label,
    value,
    preview: redact(value),
    flags,
    exp: 0,
    ttl: null,
    detail: {},
  };
}

export function extractSerum(blob) {
  const text = String(blob || "");
  const now = Date.now();
  const found = [];
  const seen = new Set();
  const add = (rec) => {
    if (!rec || !rec.value) return;
    const id = fp(rec.type, rec.value);
    if (seen.has(id)) return;
    seen.add(id);
    rec.id = id;
    found.push(rec);
  };

  for (const m of text.match(JWT_RE) || []) {
    try {
      add(jwtRecord(m, now));
    } catch {
      add(secretRecord("jwt", "JWT (malformed)", m, ["malformed"]));
    }
  }

  (text.match(AWS_RE) || []).forEach((v) => add(secretRecord("aws", "AWS access key", v, ["cloud-key"])));
  (text.match(GITHUB_RE) || []).forEach((v) => add(secretRecord("github", "GitHub token", v, ["pat"])));
  (text.match(GITHUB_FINE_RE) || []).forEach((v) => add(secretRecord("github", "GitHub fine-grained PAT", v, ["pat"])));
  (text.match(SLACK_RE) || []).forEach((v) => add(secretRecord("slack", "Slack token", v, ["chat"])));
  (text.match(GOOGLE_RE) || []).forEach((v) => add(secretRecord("google", "Google API key", v, ["api-key"])));
  (text.match(STRIPE_RE) || []).forEach((v) => add(secretRecord("stripe", "Stripe secret", v, ["payment"])));
  (text.match(PRIV_RE) || []).forEach((v) => add(secretRecord("key", "Private key", v, ["private-key"])));

  let m;
  BEARER_RE.lastIndex = 0;
  while ((m = BEARER_RE.exec(text))) {
    if (m[1].startsWith("eyJ")) continue;
    add(secretRecord("bearer", "Bearer token", m[1], ["opaque"]));
  }
  BASIC_RE.lastIndex = 0;
  while ((m = BASIC_RE.exec(text))) {
    const decoded = b64url(m[1].replace(/\+/g, "-").replace(/\//g, "_")) || "";
    add(secretRecord("basic", "HTTP Basic", m[1], decoded.includes(":") ? ["decoded"] : ["opaque"]));
    if (decoded.includes(":")) {
      const user = decoded.split(":")[0];
      add({
        ...secretRecord("basic", `Basic user ${user}`, decoded, ["credentials"]),
        preview: `${user}:········`,
      });
    }
  }

  COOKIE_SET_RE.lastIndex = 0;
  while ((m = COOKIE_SET_RE.exec(text))) cookieRecords(m[1]).forEach(add);
  COOKIE_HDR_RE.lastIndex = 0;
  while ((m = COOKIE_HDR_RE.exec(text))) cookieHeaderRecords(m[1]).forEach(add);

  return found;
}

export function looksLikeSerum(text) {
  const t = String(text || "");
  if (t.length < 8 || t.length > 2_000_000) return false;
  if (JWT_RE.test(t)) {
    JWT_RE.lastIndex = 0;
    return true;
  }
  JWT_RE.lastIndex = 0;
  return /set-cookie:|authorization:|eyJ|AKIA|ghp_|BEGIN [A-Z ]*PRIVATE KEY|sk_live_/i.test(t);
}

export function nearestExpiry(items, now = Date.now()) {
  let best = null;
  items.forEach((it) => {
    if (!it.exp) return;
    const ttl = it.exp * 1000 - now;
    if (best === null || ttl < best.ttl) best = { ...it, ttl };
  });
  return best;
}

export function refreshTtl(items, now = Date.now()) {
  return items.map((it) => {
    if (!it.exp) return it;
    const ttl = it.exp * 1000 - now;
    const flags = it.flags.filter((f) => f !== "expired");
    if (ttl <= 0) flags.push("expired");
    return { ...it, ttl, flags };
  });
}

export function formatTtl(ms) {
  if (ms === null || ms === undefined) return "no exp";
  if (ms <= 0) return "dead";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}
