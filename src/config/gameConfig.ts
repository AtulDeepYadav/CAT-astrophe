/**
 * Portrait canvas at ~0.51 width:height — real phones range roughly 0.46 (tall flagships) to 0.56
 * (an iPhone SE), so this sits in the middle to minimize letterboxing across that whole range
 * rather than razor-matching one extreme. Font/UI sizes are tuned against GAME_WIDTH, so they read
 * fine regardless of this value — this number only trades off arena length vs. letterbox amount.
 */
export const GAME_WIDTH = 440;
export const GAME_HEIGHT = 870;

/**
 * Layout, per the sketch: a bordered panel (score bar + arena) floats inset inside a full-canvas
 * backdrop. That backdrop is a placeholder for the world background (Cosy Room -> Jungle ->
 * Savannah, per the plan) — FRAME_MARGIN is the backdrop showing on the sides/bottom of the panel,
 * HEADER_TEXT_HEIGHT is the backdrop space above it reserved for a logo/title.
 */
export const FRAME_MARGIN = 20;
export const HEADER_TEXT_HEIGHT = 64;

export const PANEL_LEFT = FRAME_MARGIN;
export const PANEL_RIGHT = GAME_WIDTH - FRAME_MARGIN;
export const PANEL_TOP = HEADER_TEXT_HEIGHT;
export const PANEL_BOTTOM = GAME_HEIGHT - FRAME_MARGIN;

/** Score/Best + Purr Meter section at the top of the panel — no next-cat preview needed anymore, the hovering drop cat in the arena already shows what's coming. */
export const STATS_BAR_HEIGHT = 60;
/** Where the panel's score section ends and the arena section begins. */
export const PANEL_DIVIDER_Y = PANEL_TOP + STATS_BAR_HEIGHT;

/** Physics wall thickness — walls are invisible now; the panel's own border/fill reads as the container. */
export const WALL_THICKNESS = 16;
export const CONTAINER_LEFT = PANEL_LEFT + WALL_THICKNESS;
export const CONTAINER_RIGHT = PANEL_RIGHT - WALL_THICKNESS;
export const CONTAINER_TOP = PANEL_DIVIDER_Y;
export const CONTAINER_FLOOR = PANEL_BOTTOM - WALL_THICKNESS;

/** Danger line y-position — cats resting above this for too long end the game. */
export const DANGER_LINE_Y = CONTAINER_TOP + 30;

export const MATTER_CONFIG = {
  gravity: { x: 0, y: 1 },
  debug: false,
};

/**
 * Rounded, playful display face (loaded via Google Fonts in index.html) in place of the generic
 * system sans-serif every text object used before — matches the game's illustrated-character art
 * a lot better. "Comic Sans MS" sits as an intermediate fallback (still playful/rounded) in case
 * the webfont hasn't finished loading somehow; BootScene waits on it before building any UI text.
 */
export const FONT_FAMILY = '"Baloo 2", "Comic Sans MS", sans-serif';
