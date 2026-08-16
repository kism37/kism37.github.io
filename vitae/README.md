# VITAE

A scope membrane. Living field. No server.

```bash
cd ~/projects/vitae
python3 -m http.server 4173 --bind 127.0.0.1
```

http://127.0.0.1:4173/

## Utility

The field is an immune system for recon.

1. Write scope. One rule per line. `*.example.com` allows. A leading `-` denies. Deny wins.
2. Paste recon (httpx, nmap, URL dumps, a sitemap). Or press **V** to ingest the clipboard.
3. Only **new, in-scope** hosts become cells. Out of scope is logged, not grown.
4. Export a bundle: JSON + markdown with the admitted set, rejects, and a scope digest.

That is the job no list tool does: a second-screen body that refuses to grow on out-of-scope surface.

The callsign hashes to the seed (the look of the body). The membrane is local to that callsign and survives refresh. Burn wipes it. Nothing is uploaded.

## Scope

```
*.example.com
example.com
-cdn.example.com
10.0.0.0/24
```

No scope means every host is rejected. The membrane will not invent permission.

## Serum

The daily tool. Paste a JWT, Set-Cookie, Authorization header, or a JS/response blob.

- JWTs decode in-place: alg, kid, iss, sub, exp. `alg=none`, missing exp, and expiry are flags.
- The nearest live exp becomes the field's pulse. Under five minutes it races. Dead tokens drop the BPM.
- Cookies report missing Secure / HttpOnly / SameSite.
- AWS, GitHub, Slack, Google, Stripe, Bearer, Basic, and PEM keys are needled out.
- Click a row to copy the **full** value. Display is redacted. Serum is never written to localStorage.

**T** opens serum and draws the clipboard if it looks like tokens.

## Keys

Sound is a hidden looping bed (`audio/bed.mp3` if present, otherwise a generated drone). M or the speaker mutes. Browsers still need a first pointer or key before unmuted playback. Commercial tracks are not stored in this repo.

T serum · V membrane · S packet · Space feed · M mute · 1-8 phases
