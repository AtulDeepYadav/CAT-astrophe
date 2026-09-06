import Phaser from 'phaser';
import { FONT_FAMILY, UI_FONT_FAMILY } from '../config/gameConfig';

/**
 * Shared building blocks for every button/panel/icon in the game — introduced in one pass to
 * replace flat, hard-cornered `add.text({backgroundColor})` buttons and plain-fill
 * `add.rectangle()` panels everywhere (Menu, HUD, pause, Game Over, Collection Book, Leaderboard)
 * with a consistent rounded, gradient, soft-shadowed look plus real press feedback. That flat
 * single-color-rectangle-with-a-hard-corner look, repeated identically on every single button
 * with no depth or hierarchy anywhere, was the single biggest thing making the whole app read as
 * a decade-old prototype rather than a 2026 casual game — this file is the fix, applied once here
 * and then used everywhere instead of hand-rolling a new flat rectangle per screen.
 */

/**
 * A `Container.setVisible(false)` on an overlay does NOT disable input on its interactive
 * children — each child's own `.visible` flag stays true regardless of its parent's, and Phaser's
 * input plugin hit-tests against that child-local flag, not the ancestor chain. Confirmed live:
 * with several overlay containers built once in create() and only ever toggled via setVisible
 * (Pause, Revive offer, Game Over, Collection Book, Onboarding, Leaderboard), a HIDDEN overlay's
 * button sitting at the same screen position as a currently-*visible* overlay's button could
 * silently swallow the tap meant for the visible one — the Pause screen's Sound toggle stopped
 * responding after the very first tap because of exactly this, with the (invisible) Revive-offer
 * Continue button beneath it still fully interactive. Call this alongside every setVisible() on
 * one of these overlay containers, in both directions, so only the actually-shown overlay's
 * buttons can ever receive a tap.
 */
export function setContainerInteractive(container: Phaser.GameObjects.Container, enabled: boolean) {
  const walk = (obj: Phaser.GameObjects.GameObject & { list?: Phaser.GameObjects.GameObject[] }) => {
    if (obj.input) {
      obj.input.enabled = enabled;
    }
    if (obj.list) {
      for (const child of obj.list) {
        walk(child as Phaser.GameObjects.GameObject & { list?: Phaser.GameObjects.GameObject[] });
      }
    }
  };
  walk(container);
}

export interface ButtonTheme {
  /** Gradient runs light (top) to this (bottom) — a believable "lit from above" surface instead
   * of a flat fill. */
  top: number;
  bottom: number;
  border: number;
  textColor: string;
}

/** One theme per semantic role, reused across every screen instead of each screen picking its
 * own ad hoc hex value — this is what makes "the blue button" and "the gold button" mean the same
 * thing everywhere in the app. */
export const THEME = {
  primary: { top: 0xffe9ab, bottom: 0xffb632, border: 0xc97f10, textColor: '#4a2c0d' } as ButtonTheme,
  info: { top: 0xc9edff, bottom: 0x74c6f2, border: 0x2f83ad, textColor: '#0e3a52' } as ButtonTheme,
  calm: { top: 0xecdcff, bottom: 0xc196f5, border: 0x7d47b8, textColor: '#3a1a5c' } as ButtonTheme,
  gold: { top: 0xfff2c4, bottom: 0xffcf4d, border: 0xb8860b, textColor: '#4a2c0d' } as ButtonTheme,
  neutral: { top: 0xfff8ec, bottom: 0xe9d9bc, border: 0xb69c73, textColor: '#3a2b22' } as ButtonTheme,
  danger: { top: 0xffd3c4, bottom: 0xf58a68, border: 0xb84a26, textColor: '#4a1a0d' } as ButtonTheme,
  dark: { top: 0x4a3d30, bottom: 0x2b2018, border: 0x1a130d, textColor: '#fff6e8' } as ButtonTheme,
};

export interface ButtonOptions {
  fontSize?: number;
  paddingX?: number;
  paddingY?: number;
  minWidth?: number;
  /** Corner radius, capped to half the button's own height so it never exceeds a pill. */
  radius?: number;
  depth?: number;
  onTap?: () => void;
}

/**
 * A rounded, gradient-filled, drop-shadowed button sized to fit its own label — press feedback
 * (scale + shadow compression) built in. Returns the container plus its label Text (for callers
 * that need to update the text later, e.g. a daily-challenge button whose label changes).
 */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  theme: ButtonTheme,
  options: ButtonOptions = {},
): { container: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; setLabel: (s: string) => void } {
  const fontSize = options.fontSize ?? 19;
  const paddingX = options.paddingX ?? 28;
  const paddingY = options.paddingY ?? 14;

  const text = scene.add
    .text(0, 1, label, {
      fontFamily: FONT_FAMILY,
      fontSize: `${fontSize}px`,
      fontStyle: '700',
      color: theme.textColor,
    })
    .setOrigin(0.5)
    .setShadow(0, 2, 'rgba(0,0,0,0.18)', 0, false, true);

  const w = Math.max(options.minWidth ?? 0, text.width + paddingX * 2);
  const h = text.height + paddingY * 2;
  const radius = Math.min(options.radius ?? 18, h / 2);

  const shadow = scene.add.graphics();
  shadow.fillStyle(0x1a0f06, 0.25);
  shadow.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, radius);

  const bg = scene.add.graphics();
  drawButtonFace(bg, w, h, radius, theme);

  // Not auto-added via scene.add.container() — every overlay in this app builds a button via
  // createButton() and then places the returned container as a child of its *own* outer container
  // (`this.add.container(0, 0, [..., button.container])`); callers are responsible for parenting
  // it exactly once (top-level call sites must call `scene.add.existing(container)` themselves).
  const container = new Phaser.GameObjects.Container(scene, x, y, [shadow, bg, text]);
  container.setSize(w, h);
  // Rectangle(0, 0, w, h) — NOT a centered (-w/2, -h/2, w, h) rect, even though the button's
  // children are drawn centered on (0,0). Phaser's InputManager.pointWithinHitArea() *always*
  // adds the Container's displayOriginX/Y (= width/2, height/2 for a Container — see Container.js)
  // to the pointer's local coordinate before testing it against hitArea, for every Container
  // regardless of what hitArea it was given. A hitArea already centered on (0,0) then gets that
  // same half-width/half-height added again, shifting the *actual* clickable region a full half a
  // button-width up-and-left of the visible button — e.g. only its left half was clickable, with
  // the right half dead and a phantom clickable strip extending into the empty space beyond the
  // button's left edge. (0, 0, w, h) is the offset this addition is designed for — it's also
  // exactly what Container.setSize() alone would generate as the *default* hit area with no
  // explicit hitArea at all. Confirmed by reading InputManager.js's pointWithinHitArea and by a
  // live real-click test that landed 0.47px outside the old rect's boundary, matching the math
  // exactly. This one-line rectangle origin was the entire cause of "only the text is clickable" —
  // the label sits at local (0,0), the one point the old, wrongly-shifted rect's corner still
  // covered.
  container.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(0, 0, w, h),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });
  if (options.depth !== undefined) {
    container.setDepth(options.depth);
  }

  wirePressFeedback(scene, container, shadow, h);

  if (options.onTap) {
    container.on(
      'pointerdown',
      (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        options.onTap!();
      },
    );
  }

  const setLabel = (next: string) => {
    text.setText(next);
    const newW = Math.max(options.minWidth ?? 0, text.width + paddingX * 2);
    if (Math.abs(newW - w) > 0.5) {
      bg.clear();
      drawButtonFace(bg, newW, h, radius, theme);
      shadow.clear();
      shadow.fillStyle(0x1a0f06, 0.25);
      shadow.fillRoundedRect(-newW / 2, -h / 2 + 5, newW, h, radius);
      container.setSize(newW, h);
      // Keep the hitArea in the same (0, 0, w, h) space as the constructor's — see the
      // setInteractive() call above for why that's the correct rect, not a centered one.
      (container.input!.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, newW, h);
    }
  };

  return { container, text, setLabel };
}

function drawButtonFace(g: Phaser.GameObjects.Graphics, w: number, h: number, radius: number, theme: ButtonTheme) {
  g.fillGradientStyle(theme.top, theme.top, theme.bottom, theme.bottom, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.lineStyle(2.5, theme.border, 1);
  g.strokeRoundedRect(-w / 2 + 1.25, -h / 2 + 1.25, w - 2.5, h - 2.5, Math.max(0, radius - 1.25));
  // Glossy top sheen — a lighter, semi-transparent cap over the upper ~45%, rounded to match the
  // button's own top corners. This one detail (a believable highlight, not just a flat fill) is
  // most of what separates "gradient rectangle" from "a glossy button" at a glance.
  g.fillStyle(0xffffff, 0.3);
  g.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.42, { tl: radius - 2, tr: radius - 2, bl: 4, br: 4 });
}

/** Scale-down-and-spring press feedback, plus the shadow compressing toward the button on press
 * so it reads as physically being pushed down, not just shrinking in place. */
function wirePressFeedback(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  shadow: Phaser.GameObjects.Graphics,
  h: number,
) {
  const settle = () => {
    scene.tweens.add({ targets: container, scale: 1, duration: 140, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: shadow, y: 0, duration: 140, ease: 'Back.easeOut' });
  };
  container.on('pointerdown', () => {
    scene.tweens.add({ targets: container, scale: 0.94, duration: 70, ease: 'Sine.easeOut' });
    scene.tweens.add({ targets: shadow, y: -3, duration: 70, ease: 'Sine.easeOut' });
  });
  container.on('pointerup', settle);
  container.on('pointerout', settle);
  void h;
}

export interface PanelOptions {
  radius?: number;
  fill?: number;
  fillAlpha?: number;
  borderColor?: number;
  depth?: number;
}

/**
 * A rounded, softly-shadowed card — replaces the flat `add.rectangle()` panels every overlay
 * (pause, Game Over, Collection Book, Leaderboard) used before, which had square corners and a
 * single flat fill with no shadow separating them from the dimmed backdrop behind them.
 */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  options: PanelOptions = {},
): Phaser.GameObjects.Container {
  const radius = options.radius ?? 26;
  const fill = options.fill ?? 0xfff6e8;
  const fillAlpha = options.fillAlpha ?? 1;
  const borderColor = options.borderColor ?? 0xb8860b;

  const shadow = scene.add.graphics();
  shadow.fillStyle(0x1a0f06, 0.35);
  shadow.fillRoundedRect(-w / 2, -h / 2 + 8, w, h, radius);

  const bg = scene.add.graphics();
  bg.fillStyle(fill, fillAlpha);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  bg.lineStyle(2, borderColor, 0.9);
  bg.strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, radius - 1);
  // Faint top sheen, same trick as the button face — keeps every card in the app feeling like
  // part of one consistent material rather than a flat color swatch.
  bg.fillStyle(0xffffff, 0.14);
  bg.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.3, { tl: radius - 2, tr: radius - 2, bl: 0, br: 0 });

  const container = scene.add.container(x, y, [shadow, bg]);
  if (options.depth !== undefined) {
    container.setDepth(options.depth);
  }
  return container;
}

export type IconName =
  | 'pause'
  | 'play'
  | 'speakerOn'
  | 'speakerOff'
  | 'close'
  | 'home'
  | 'restart'
  | 'trophy'
  | 'book';

/**
 * A small circular "glass" chrome button with a hand-drawn vector icon — replaces plain emoji
 * (⏸ 🔊 🔇) used directly as button labels before, which render as a full-color OS emoji glyph
 * (inconsistent across devices, and reads as "a text character," not a designed control) rather
 * than a control that matches the rest of the UI.
 */
export function createIconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  icon: IconName,
  options: { radius?: number; onTap?: () => void; depth?: number; theme?: 'light' | 'dark' } = {},
): { container: Phaser.GameObjects.Container; setIcon: (next: IconName) => void } {
  const radius = options.radius ?? 20;
  const dark = options.theme !== 'light';

  const shadow = scene.add.graphics();
  shadow.fillStyle(0x1a0f06, 0.25);
  shadow.fillCircle(0, 3, radius);

  const bg = scene.add.graphics();
  bg.fillStyle(dark ? 0x3a2b22 : 0xfff6e8, dark ? 0.55 : 0.9);
  bg.fillCircle(0, 0, radius);
  bg.lineStyle(1.5, dark ? 0xfff6e8 : 0xb69c73, dark ? 0.35 : 0.8);
  bg.strokeCircle(0, 0, radius - 0.75);

  const iconGfx = scene.add.graphics();
  drawIcon(iconGfx, icon, radius, dark ? '#fff6e8' : '#3a2b22');

  // Not auto-added to the scene — see createButton's doc comment on parenting responsibility.
  const container = new Phaser.GameObjects.Container(scene, x, y, [shadow, bg, iconGfx]);
  container.setSize(radius * 2, radius * 2);
  // (0, 0, size, size), not a centered rect — see createButton's setInteractive() comment for why
  // a Container hitArea must be given in this un-shifted space (Phaser always adds
  // displayOriginX/Y = width/2, height/2 on top of it during hit testing). A square touch target
  // for a round icon is otherwise a normal, common trade-off over a Circle hitArea.
  container.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(0, 0, radius * 2, radius * 2),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });
  if (options.depth !== undefined) {
    container.setDepth(options.depth);
  }
  wirePressFeedback(scene, container, shadow, radius * 2);

  if (options.onTap) {
    container.on(
      'pointerdown',
      (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        options.onTap!();
      },
    );
  }

  const setIcon = (next: IconName) => {
    iconGfx.clear();
    drawIcon(iconGfx, next, radius, dark ? '#fff6e8' : '#3a2b22');
  };

  return { container, setIcon };
}

/**
 * The same glass-circle-plus-vector-icon visual as createIconButton, but with no interactivity of
 * its own — for spots (GameScene's header pause/Collection Book buttons) that already have a
 * single hand-rolled, carefully-ordered pointerdown handler doing bounds checks across several
 * competing hit targets (purr bar, collection tabs, pause, drop-to-commit); adding a second,
 * independent Phaser-interactive layer on top there would double-handle the same tap rather than
 * cleanly replacing that existing dispatch.
 */
export function drawIconGlyph(
  scene: Phaser.Scene,
  x: number,
  y: number,
  icon: IconName,
  options: { radius?: number; theme?: 'light' | 'dark' } = {},
): Phaser.GameObjects.Container {
  const radius = options.radius ?? 20;
  const dark = options.theme !== 'light';

  const shadow = scene.add.graphics();
  shadow.fillStyle(0x1a0f06, 0.25);
  shadow.fillCircle(0, 3, radius);

  const bg = scene.add.graphics();
  bg.fillStyle(dark ? 0x3a2b22 : 0xfff6e8, dark ? 0.55 : 0.9);
  bg.fillCircle(0, 0, radius);
  bg.lineStyle(1.5, dark ? 0xfff6e8 : 0xb69c73, dark ? 0.35 : 0.8);
  bg.strokeCircle(0, 0, radius - 0.75);

  const iconGfx = scene.add.graphics();
  drawIcon(iconGfx, icon, radius, dark ? '#fff6e8' : '#3a2b22');

  return scene.add.container(x, y, [shadow, bg, iconGfx]);
}

function drawIcon(g: Phaser.GameObjects.Graphics, icon: IconName, r: number, colorHex: string) {
  const color = Phaser.Display.Color.HexStringToColor(colorHex).color;
  g.fillStyle(color, 1);
  g.lineStyle(Math.max(2, r * 0.16), color, 1);

  const s = r * 0.62; // icon glyph half-extent, leaving a consistent margin inside the circle
  switch (icon) {
    case 'pause': {
      const barW = s * 0.42;
      g.fillRoundedRect(-s * 0.75, -s, barW, s * 2, barW * 0.3);
      g.fillRoundedRect(s * 0.75 - barW, -s, barW, s * 2, barW * 0.3);
      break;
    }
    case 'play': {
      g.fillTriangle(-s * 0.6, -s, -s * 0.6, s, s * 0.85, 0);
      break;
    }
    case 'speakerOn':
    case 'speakerOff': {
      g.fillRect(-s, -s * 0.4, s * 0.5, s * 0.8);
      g.fillTriangle(-s * 0.5, -s * 0.4, -s * 0.5, s * 0.4, s * 0.15, s);
      g.fillTriangle(-s * 0.5, -s * 0.4, -s * 0.5, s * 0.4, s * 0.15, -s);
      if (icon === 'speakerOn') {
        g.lineStyle(Math.max(2, r * 0.14), color, 1);
        g.beginPath();
        g.arc(s * 0.15, 0, s * 0.55, Phaser.Math.DegToRad(-45), Phaser.Math.DegToRad(45));
        g.strokePath();
        g.beginPath();
        g.arc(s * 0.15, 0, s * 0.95, Phaser.Math.DegToRad(-45), Phaser.Math.DegToRad(45));
        g.strokePath();
      } else {
        g.lineStyle(Math.max(2, r * 0.16), color, 1);
        g.lineBetween(s * 0.25, -s * 0.55, s * 1.05, s * 0.55);
        g.lineBetween(s * 1.05, -s * 0.55, s * 0.25, s * 0.55);
      }
      break;
    }
    case 'close': {
      g.lineStyle(Math.max(2.5, r * 0.18), color, 1);
      g.lineBetween(-s * 0.7, -s * 0.7, s * 0.7, s * 0.7);
      g.lineBetween(s * 0.7, -s * 0.7, -s * 0.7, s * 0.7);
      break;
    }
    case 'home': {
      g.fillTriangle(-s, -s * 0.05, s, -s * 0.05, 0, -s * 0.95);
      g.fillRect(-s * 0.65, -s * 0.05, s * 1.3, s * 1.0);
      break;
    }
    case 'restart': {
      g.lineStyle(Math.max(2.5, r * 0.18), color, 1);
      g.beginPath();
      g.arc(0, 0, s * 0.85, Phaser.Math.DegToRad(-40), Phaser.Math.DegToRad(220));
      g.strokePath();
      g.fillTriangle(s * 0.55, -s * 0.85, s * 1.05, -s * 0.4, s * 0.35, -s * 0.25);
      break;
    }
    case 'trophy': {
      g.fillRoundedRect(-s * 0.5, -s * 0.7, s, s * 0.9, 3);
      g.lineStyle(Math.max(2, r * 0.14), color, 1);
      g.beginPath();
      g.arc(-s * 0.5, -s * 0.5, s * 0.35, Phaser.Math.DegToRad(90), Phaser.Math.DegToRad(270));
      g.strokePath();
      g.beginPath();
      g.arc(s * 0.5, -s * 0.5, s * 0.35, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(90));
      g.strokePath();
      g.fillRect(-s * 0.18, s * 0.2, s * 0.36, s * 0.35);
      g.fillRoundedRect(-s * 0.5, s * 0.5, s, s * 0.18, 3);
      break;
    }
    case 'book': {
      // Two open pages meeting at a center spine — reads clearly at icon size without needing
      // any text/detail lines.
      g.fillRoundedRect(-s, -s * 0.75, s * 0.95, s * 1.5, { tl: 3, tr: 0, bl: 3, br: 0 });
      g.fillRoundedRect(s * 0.05, -s * 0.75, s * 0.95, s * 1.5, { tl: 0, tr: 3, bl: 0, br: 3 });
      g.lineStyle(Math.max(1.5, r * 0.08), 0x000000, 0.2);
      g.lineBetween(0, -s * 0.75, 0, s * 0.75);
      break;
    }
  }
}

/** Quiet, small-print UI text (hints, captions, footers) — Nunito rather than the heavy Baloo 2
 * display face every piece of text used before, which is what gave the whole app a flat, single
 * type-size-and-weight feel with no hierarchy. */
export function bodyTextStyle(overrides: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) {
  return {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '14px',
    color: '#f7ecd9',
    ...overrides,
  };
}
