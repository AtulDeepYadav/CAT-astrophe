# Android Packaging — TWA vs. Capacitor

This is the decision the store-readiness audit flagged as blocking everything else
(package ID, icons, manifest — all downstream of this one call). It also covers the
two Critical-tier items that are **not** something I can finish from here: this
document plus real hardware and a Google account are what's needed to close them out.

## Recommendation: Trusted Web Activity (TWA), not Capacitor

`GAME_PLAN.md` originally scoped Capacitor for this. I'm recommending TWA instead —
here's the actual trade-off, so the reversal is a decision, not a surprise:

| | **TWA (Bubblewrap)** | **Capacitor** |
|---|---|---|
| What it is | A thin native shell that opens the existing Vercel URL in a chromeless Chrome instance | A real native project (Android Studio/Gradle) with the web build copied into `assets/` |
| Setup time | ~30–60 min, mostly automated by the `bubblewrap` CLI | Half a day+: install Android Studio, configure Gradle, wire native plugins |
| Ship updates | **Instant** — push to Vercel like today, players get it on next launch, no store review | Every change needs a new build, a new signed APK/AAB, and a new store review |
| Native APIs (haptics, share, etc.) | Whatever the web already does (`navigator.vibrate`, Web Share — both already implemented) | Same web APIs still work, *plus* access to native plugins if ever needed |
| Play Store eligibility | Fully eligible — Google explicitly supports and documents this path | Fully eligible |
| Maintenance surface | One codebase (the website). No native project to keep in sync. | Two things drifting apart over time: the web build and the native shell config |

Given this game has **no native-only requirement** (no camera, no Bluetooth, no
background native services — everything it does today is already achievable from a
web page), Capacitor's extra maintenance burden buys nothing. TWA is the standard,
Google-recommended path for exactly this situation, and it means every future
gameplay change (new cat, balance tweak, bug fix) ships the moment it's pushed to
Vercel — no rebuild, no re-signing, no waiting on Play Store review a second time.

**If a native-only feature becomes a real requirement later** (e.g. a native ad SDK,
Bluetooth multiplayer, background notifications), Capacitor is still available then —
switching later costs a day; switching now costs nothing, since it's Step 1 either way.

---

## What TWA needs from the web app (already done)

- [x] `manifest.json` with icons, `display: standalone`, theme color — [manifest.json](public/manifest.json)
- [x] Real app icons (not the default Vite logo) — [public/icons/](public/icons/)
- [x] Privacy policy reachable inside the app — [public/privacy.html](public/privacy.html)
- [x] Back-button/gesture handling for in-app overlays — wired in `GameScene.ts` and
      `MenuScene.ts` via the History API, so it works correctly once wrapped

## What's left — steps only you can run

I don't have an Android SDK, a keystore, or a Google account in this environment, so
everything below is a set of instructions, not something I can execute for you.

### 1. Install prerequisites (one-time, on your own machine)

```bash
# Node 18+ already required by this project. Also needs a JDK for Bubblewrap.
npm install -g @bubblewrap/cli
```

Bubblewrap will prompt to download its own bundled JDK + Android SDK on first run if
you don't already have Android Studio installed — let it.

### 2. Add Digital Asset Links (proves you own both the site and the app)

Create `public/.well-known/assetlinks.json` in this repo:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.catastrophe.game",
    "sha256_cert_fingerprints": ["<FILLED IN AFTER STEP 3>"]
  }
}]
```

`package_name` is your permanent Android package ID — **this cannot change after
first publish**, so decide it deliberately now. `com.catastrophe.game` is a
reasonable default if you don't already own a domain-based reverse-DNS name; change
it before running Bubblewrap if you'd rather use something else.

This file needs to be live on `cat-astrophe-rouge.vercel.app` (or your final domain)
before the Play Store will treat the wrapped app as verified — deploy it, don't just
commit it locally.

### 3. Generate the Android project

```bash
bubblewrap init --manifest https://cat-astrophe-rouge.vercel.app/manifest.json
```

This walks through an interactive prompt (application ID, app name, signing key).
When it asks for a signing key:

- **First time**: let Bubblewrap generate one (`android.keystore`). **Back this file
  up somewhere durable outside this repo** (password manager, encrypted drive) — if
  it's lost, you can never update this app listing again under the same package ID,
  ever. Never commit the keystore or its password to git.
- Bubblewrap prints the SHA-256 fingerprint at the end — paste that into
  `assetlinks.json` from Step 2, redeploy, then continue.

```bash
bubblewrap build
```

This produces a signed `.aab` (Android App Bundle) — the file the Play Console
upload wants.

### 4. Google Play Console account (needs your own Google account + $25 one-time fee)

1. Go to https://play.google.com/console/signup and pay the one-time registration fee.
2. Create a new app, fill in the store listing (title, short/full description,
   screenshots — at least one phone screenshot in 16:9 or 9:16 required).
3. Complete the **Data Safety** form — this app collects nothing, so every question
   is answered "No" / "Data isn't collected"; link to `/privacy.html` for the
   required privacy policy URL.
4. Upload the `.aab` from Step 3 under Production (or Internal Testing first — see
   below).
5. Submit for review. First review is typically a few hours to a few days.

### 5. Real-device testing (the other open Critical item)

Play Console's **Internal Testing** track is the right first stop — it skips full
review and lets you install the build on your own phone (or a few testers' phones)
within minutes via a private opt-in link, before it ever reaches the public listing.

Everything in this project has only ever been checked in the browser-automation
pane used during development — real touch latency, a mid-range GPU, and an actual
notch/gesture-bar layout are still unverified. Install the Internal Testing build on
at least one real Android phone (ideally a low/mid-range one, not just a flagship)
and play a full round before promoting anything to Production. This step needs
physical hardware and can't be done from here.

---

## Suggested order

1. Read this doc, confirm the `com.catastrophe.game` package ID (or pick your own)
   — it's permanent.
2. Deploy `assetlinks.json` (Step 2) once you have the signing fingerprint from Step 3.
3. Run `bubblewrap init` + `bubblewrap build` (Steps 2–3).
4. Create the Play Console account and app listing (Step 4), upload to **Internal
   Testing** first, not Production.
5. Install on a real phone via the Internal Testing link and play through a full
   round (Step 5).
6. Only then promote to Production.
