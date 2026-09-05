/**
 * Frame-swap animations for cat levels that have real hand-drawn pose art (see
 * public/assets/sprites/cats/anim/). Every frame for a given level MUST share the exact same
 * canvas size: Cat.ts derives its visual scale once from the texture's height, and swapping to a
 * differently-sized frame mid-animation would make the sprite visibly jump in size.
 */
export type AnimFrame = 'idle' | 'blink' | 'tilt' | 'pawup' | 'happy' | 'tailwag';

/**
 * Which frames actually exist per level. The Kitten got the full 6-pose treatment as the
 * prototype; every other level (2-10) keeps it simple per the doc — idle + blink only, no
 * happy-bounce beat.
 */
const FRAMES_BY_LEVEL: Record<number, AnimFrame[]> = {
  1: ['idle', 'blink', 'tilt', 'pawup', 'happy', 'tailwag'],
  2: ['idle', 'blink'],
  3: ['idle', 'blink'],
  4: ['idle', 'blink'],
  5: ['idle', 'blink'],
  6: ['idle', 'blink'],
  7: ['idle', 'blink'],
  8: ['idle', 'blink'],
  9: ['idle', 'blink'],
  10: ['idle', 'blink'],
};

export function hasAnimationFrames(level: number): boolean {
  return level in FRAMES_BY_LEVEL;
}

export function framesForLevel(level: number): AnimFrame[] {
  return FRAMES_BY_LEVEL[level] ?? [];
}

export function animFrameTextureKey(level: number, frame: AnimFrame): string {
  return `cat-${level}-anim-${frame}`;
}

interface IdleLoopStep {
  frame: AnimFrame;
  holdMs: number;
}

/** The Kitten's richer loop (doc: "Frame1 -> Frame2(blink) -> Frame1 -> Frame5(happy) -> Frame1", ~2s, seamless). */
const RICH_IDLE_LOOP: IdleLoopStep[] = [
  { frame: 'idle', holdMs: 900 },
  { frame: 'blink', holdMs: 150 },
  { frame: 'idle', holdMs: 700 },
  { frame: 'happy', holdMs: 250 },
];

/** Everyone else: idle -> blink -> idle, same total 2s rhythm so the whole board "breathes" in sync. */
const SIMPLE_IDLE_LOOP: IdleLoopStep[] = [
  { frame: 'idle', holdMs: 900 },
  { frame: 'blink', holdMs: 150 },
  { frame: 'idle', holdMs: 950 },
];

export function idleLoopForLevel(level: number): IdleLoopStep[] {
  return framesForLevel(level).includes('happy') ? RICH_IDLE_LOOP : SIMPLE_IDLE_LOOP;
}

export function idleLoopTotalMs(level: number): number {
  return idleLoopForLevel(level).reduce((sum, step) => sum + step.holdMs, 0);
}
