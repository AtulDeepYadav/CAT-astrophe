# Android Packaging — Capacitor (reversed from the earlier TWA recommendation)

## Why this reverses the earlier TWA recommendation

This doc used to recommend a Trusted Web Activity (Bubblewrap) over Capacitor, on the grounds
that the game had "no native-only requirement." That was true until monetization became a goal:
AdMob (rewarded ads, interstitials) and Play Billing (the Remove Ads purchase) are native SDKs
with no meaningful web equivalent, and a TWA is just a chromeless browser tab — it cannot host
them at all. The original doc's own comparison table called this out as the one thing that would
flip the decision ("if a native-only feature becomes a real requirement later... Capacitor is
still available then"). It's a requirement now, so this is that flip, not a change of mind.

TWA's other advantages (instant updates via Vercel, no re-review per change) are real trade-offs
being given up, not free wins — worth knowing if monetization is ever dropped again later.

## What's already done (this pass)

- [x] `capacitor.config.ts` — `appId: com.catastrophe.game` (matches the package ID this doc had
      already committed to for the TWA path, so it carries over unchanged), `webDir: dist`.
- [x] `android/` — the native Gradle project, generated via `npx cap add android` and synced with
      the current web build (`npx cap sync android`). Committed to git (its own `.gitignore`
      already excludes build output, `local.properties`, and the copied web assets/config).
- [x] Portrait orientation locked in `AndroidManifest.xml` (`android:screenOrientation="portrait"`),
      matching the game's fixed layout.
- [x] [`src/systems/MonetizationSystem.ts`](src/systems/MonetizationSystem.ts) — wraps
      `@capacitor-community/admob` (rewarded ads + interstitials) and
      `@revenuecat/purchases-capacitor` (the Remove Ads one-time purchase, handling Play Billing's
      receipt verification for you). Every method no-ops safely on the web build — ads and IAP
      only ever run inside this native app, never on cat-astrophe-rouge.vercel.app.
- [x] Wired into the game: a rewarded-ad "watch ad, continue free" option alongside the existing
      Fish-cost revive offer (GameScene), an interstitial at the natural break after Game Over
      (never mid-drop), and a "Remove Ads" / "Restore purchase" pair on the main menu
      (MenuScene), Android-only.
- [x] Both plugins use Google's/RevenueCat's placeholder test IDs for now — see the `TODO` comment
      at the top of `MonetizationSystem.ts` for exactly what to swap and where those come from.

## What's left — steps only you can run

I don't have an Android SDK, a JDK, a keystore, or the various developer accounts in this
environment, so everything below is a set of instructions, not something I can execute for you.

### 1. Install Android Studio (one-time, on your own machine)

Download from https://developer.android.com/studio. This gives you the JDK, Android SDK, and
Gradle that `android/` needs to actually build — none of which exist in the environment this
project was built in.

Open the `android/` folder in this repo as an existing project (Android Studio → Open). Let it
sync Gradle on first open; this can take several minutes.

### 2. Create your accounts and get real IDs

Everything in `MonetizationSystem.ts` currently points at safe placeholder/test values. Before
this can earn real money:

- **AdMob** (https://apps.admob.com) — create an account, register the app, create a Rewarded ad
  unit and an Interstitial ad unit. Replace `TEST_REWARDED_AD_UNIT_ANDROID` and
  `TEST_INTERSTITIAL_AD_UNIT_ANDROID` in `MonetizationSystem.ts` with your real ones, and add your
  AdMob App ID to `android/app/src/main/AndroidManifest.xml` (a `<meta-data>` tag AdMob's own
  setup docs specify — Android will crash on launch without it once you're off test ads).
- **RevenueCat** (https://app.revenuecat.com) — free up to $2.5k/mo tracked revenue. Create a
  project, connect it to a Play Console app (step 4 below has to exist first), create a
  `remove_ads` entitlement attached to a one-time non-consumable product, and put the project's
  public Android SDK key into `REVENUECAT_API_KEY_ANDROID` in `MonetizationSystem.ts`.
- Also create the actual one-time product for Remove Ads inside **Play Console** → Monetize → In-app
  products, once you have that account (step 4).

### 3. Regenerate the app icon and splash screen

`npx cap add android` filled in Capacitor's own placeholder launcher icon/splash — not this game's
actual art. Run:

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --android
```

pointed at a real 1024×1024 icon and a splash image (the existing `public/icons/icon-512.png` is
a reasonable source for the icon if nothing higher-res exists).

### 4. Google Play Console account (needs your own Google account + $25 one-time fee)

1. Go to https://play.google.com/console/signup and pay the one-time registration fee.
2. Create a new app, fill in the store listing (title, short/full description, screenshots — at
   least one phone screenshot in 16:9 or 9:16 required).
3. Complete the **Data Safety** form — unlike the old TWA-only plan, this app *does* now collect
   advertising data via AdMob and purchase data via RevenueCat/Play Billing once ads are live, so
   this form needs real answers, not "No" across the board. Update `public/privacy.html` to match
   before submitting (see the note in `MonetizationSystem.ts`'s class doc — the web build's promise
   of no ads/tracking stays true; the Android app's policy section needs to say otherwise).
4. In Android Studio: **Build → Generate Signed Bundle / APK**, choose Android App Bundle, and let
   it create a new keystore the first time. **Back this file up somewhere durable outside this
   repo** (password manager, encrypted drive) — if it's lost, you can never update this app
   listing again under the same package ID, ever. Never commit the keystore or its password to git.
5. Upload the resulting `.aab` under Internal Testing first (see step 5), not Production.

### 5. Real-device testing

Play Console's **Internal Testing** track skips full review and lets you install the build on
your own phone (or a few testers' phones) within minutes via a private opt-in link.

Everything in this project has only ever been checked in browser automation — real touch latency,
a mid-range GPU, an actual notch/gesture-bar layout, and (new) real AdMob test ads and a real
RevenueCat sandbox purchase are all still unverified. Install the Internal Testing build on at
least one real Android phone and play a full round — including watching a test rewarded ad and
completing a sandbox Remove Ads purchase — before promoting anything to Production.

---

## Suggested order

1. Install Android Studio, open `android/`, let Gradle sync (Step 1).
2. Create AdMob + RevenueCat accounts and swap in real IDs (Step 2).
3. Regenerate icons/splash from real art (Step 3).
4. Create the Play Console account, update the Data Safety form and privacy policy, generate a
   signed bundle, and back up the keystore (Step 4).
5. Upload to Internal Testing and play a full round — including the ad and purchase flows — on a
   real phone (Step 5).
6. Only then promote to Production.
