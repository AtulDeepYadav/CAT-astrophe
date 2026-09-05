# Cat Kingdom — Build Plan

**Tagline:** Drop. Merge. Roar.
**Genre:** Physics-based vertical merge game (Suika-like) with an evolving world.
**Platform:** Phaser 3 + TypeScript web build → wrapped with Capacitor for iOS/Android app stores. Also playable directly as a mobile-web/PWA build with zero extra work.
**Art pipeline:** Placeholder shape-sprites first (prove the loop feels good) → swap in illustrated cats once the core game is fun.

---

## 1. Scope Decision — What "MVP" Actually Means

Building the whole doc (5 worlds, branching evolution, 7 power-ups, collection book, cosmetics, boss events) up front is how these projects stall. We're building in 4 versions, each one a real playable milestone, not a partial build.

| Version | Goal | Ships when... |
|---|---|---|
| **V1 — MVP** | Prove the core loop is fun | You can drop cats, they merge, score counts up, game ends on overflow |
| **V2 — Feel** | Make it satisfying | Combos, Purr Meter, 3 power-ups, sounds, cat personality touches |
| **V3 — Identity** | Make it *Cat Kingdom* | Background world evolves with biggest cat, Collection Book, real art |
| **V4 — Retention** | Make people come back | Daily challenge, Zen mode, leaderboard, cosmetic unlocks |

We build V1 first, play it, and only move to V2 once V1 is actually fun on a phone. This is the single most important rule of the plan — physics-merge games live or die on game-feel (bounce, weight, drop timing), and that can't be judged from a doc.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Engine | **Phaser 3** | Has Matter.js physics built in and pre-wired to its renderer — avoids hand-gluing PixiJS + Matter.js together, which is extra work with no payoff for this game. Excellent mobile touch/pointer support out of the box. |
| Physics | **Matter.js** (via Phaser's `matter` physics plugin) | Circular bodies, gravity, restitution (bounce), collision events — exactly what merge-detection needs. |
| Language | **TypeScript** | Cat/level data, merge rules, and power-up state are all easy to get subtly wrong in plain JS; types catch it early. |
| Build tool | **Vite** | Fast dev server with hot reload — critical for iterating on physics "feel," where you want to tweak a bounce value and see it in <1s. |
| Native wrapper | **Capacitor** | Wraps the same web build into a real iOS/Android app (native splash screen, app icon, store submission) without a second codebase. Added in Phase 5, not before — no point wrapping a game that isn't fun yet. |
| UI overlay (menus/HUD) | Phaser's own DOM/UI layer (no React) | The doc mentions React, but for a single-screen game with a HUD, score, and a few menus, Phaser's built-in UI is less machinery than bolting on React for a canvas-first game. If the Collection Book / cosmetics screens in V3-V4 get complex, we can revisit adding a thin React layer then — not a day-one requirement. |
| Audio | Phaser's built-in sound manager (Web Audio) | No extra library needed for one-shot SFX + background loops. |
| Version control | Git (already initialized at project root) | Commit per milestone, tag each version (v1-mvp, v2-feel, etc.) |

---

## 3. Project Structure

```
Cats/
├── GAME_PLAN.md
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── assets/
│       ├── sprites/          # cat placeholder shapes → later real art
│       ├── backgrounds/
│       └── audio/
└── src/
    ├── main.ts                # Phaser game bootstrap
    ├── config/
    │   ├── gameConfig.ts       # canvas size, physics config
    │   └── catData.ts          # the level → cat data table (single source of truth)
    ├── scenes/
    │   ├── BootScene.ts        # preload assets
    │   ├── MenuScene.ts
    │   └── GameScene.ts        # core gameplay
    ├── systems/
    │   ├── MergeSystem.ts      # collision → merge logic
    │   ├── ComboSystem.ts      # V2
    │   ├── PowerUpSystem.ts    # V2
    │   ├── ScoreSystem.ts
    │   └── DangerLineSystem.ts
    ├── entities/
    │   └── Cat.ts              # cat sprite + physics body wrapper
    └── ui/
        ├── HUD.ts
        └── GameOverScreen.ts
```

`catData.ts` is the important one early — it's the table of `{level, name, radius, mass, points, sprite, sound}` for all 10 MVP cats, and every system (merge, spawn, scoring) reads from it instead of hardcoding cat numbers. Changing game balance later means editing one file, not hunting through code.

---

## 4. Roadmap

### Phase 0 — Project Setup (½ day)
- Scaffold Vite + Phaser + TypeScript project in this folder
- Get a blank Phaser canvas rendering in the browser, confirm it runs on a phone browser (via local network / dev tunnel)
- Set up placeholder circle sprites for 10 cat levels (flat colors, size scaling by level, simple face) — no art dependency to start coding physics

### Phase 1 — V1: Core Loop (the make-or-break phase)
- Container/walls as static Matter bodies
- Spawner: shows "next cat" preview, lets player move left/right, drop on tap
- Cat entities as circular Matter bodies matching the 10-level `catData` table
- Collision detection → merge: same level touching → remove both, spawn level+1 at midpoint, small bounce impulse
- Score counter (points from `catData`)
- Danger line + game-over check (cat rests above line for N seconds → game over)
- Restart flow
- **Checkpoint: play it on an actual phone. Tune gravity/bounce/friction until dropping and merging feels good.** Don't proceed to Phase 2 until this checkpoint passes — this is the whole game's feel.

### Phase 2 — V2: Feel & Reward
- Combo detection (chain merges within a short window) + multiplier + on-screen "COMBO x3" feedback
- Purr Meter (fills on merge, triggers a chosen power-up when full)
- 3 power-ups: Golden Cat (spawns a golden variant that merges up a level), Yarn Ball (attracts nearby cats), Laser Pointer (drag to nudge cats)
- **Cat audio, two triggers per level tier (defined in `catData.ts` alongside sprite/points):**
  - **Merge sound** — plays when that level is created: small cats = light "pop"/meow, mid cats = "boing"/deeper mrrow, big cats = "boom"/growl, Lion = full roar. Scales with the combo system so chained merges layer instead of overlapping into noise.
  - **Idle sound** — a cat that's been resting untouched for a few seconds occasionally plays a soft idle loop/one-shot (purr, sleepy yawn, tiny meow) at low volume, randomized per-cat so a crowded board doesn't turn into a chorus. Pairs with the idle *animation* (ear twitch, half-closed eyes) already planned — audio and animation fire from the same idle-timer per cat, not two separate systems.
  - Both use Phaser's sound manager with per-tier audio pools; a simple volume/cooldown cap prevents 20 idle cats from all meowing at once.
- Basic cat "personality" touches: idle animation (ear twitch / blink), sleepy-cat idle after resting, angry face on hard collision

### Phase 3 — V3: World & Identity
- Background swaps based on the largest cat currently on the board (Cosy Room → Backyard → Forest → Jungle → Savannah), driven off the same `catData` table
- Real illustrated art pass replaces placeholder shapes (2D rounded style per the doc's art direction) — swapped in without touching game logic, since sprites are already data-driven
- Collection Book screen: silhouette → revealed per cat level discovered, persisted locally
- Lion "cinematic moment" on first creation (screen shake, roar SFX, particle burst)

### Phase 4 — V4: Retention Layer
- Daily Challenge (seeded modifiers: tiny-cats-only, golden-day, no-power-ups, etc.)
- Zen Mode (no game-over, ambient audio)
- Local leaderboard (best score) — online leaderboard only if/when a backend is added
- Cosmetic unlocks (cat skins, merge-effect skins) using coins earned from normal play — cosmetic only, never gameplay-affecting, per the doc's own rule

### Phase 5 — Ship to Phone
- Add Capacitor, generate iOS/Android projects from the existing web build
- App icon, splash screen, permissions review
- Test on a real device build (not just browser) — touch input, performance, screen notches/safe areas
- Store listing prep (screenshots, description) when ready for submission

---

## 5. What's Deliberately Cut From the Doc (for now)

These are good ideas but explicitly deferred past V4 so scope stays sane:

- Branching evolution tree (doc itself recommends linear for MVP — agreed)
- Boss events (Dog, Vacuum Monster)
- Legendary meme-skin cats (Galaxy/Rainbow/Ninja/Banana Cat) — becomes a V4+ cosmetic-unlock addition
- Vacuum Cleaner / Cardboard Box power-ups — 3 power-ups is enough for V2; add more only if the Purr Meter loop needs more variety later

Nothing here is abandoned — it's just not blocking a playable game.

---

## 6. Immediate Next Step

Phase 0: scaffold the Vite + Phaser + TypeScript project and get a blank canvas running, then placeholder cats falling with physics but no merge logic yet — the fastest way to confirm the tech stack feels right before building game rules on top of it.

Say go and I'll start Phase 0.
