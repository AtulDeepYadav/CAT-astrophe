import { todayKey, hashString, createSeededRNG } from '../config/dailyChallenges';

const STORAGE_KEY = 'cat-kingdom:daily-quests';
const QUESTS_PER_DAY = 3;

export type QuestType =
  | 'merge_count'
  | 'combo_reached'
  | 'golden_merged'
  | 'games_played'
  | 'level_reached'
  | 'vaporize'
  | 'yarn_ball'
  | 'ads_watched';

export interface QuestTemplate {
  id: string;
  type: QuestType;
  icon: string;
  name: string;
  description: string;
  target: number;
  rewardFish: number;
}

export interface ActiveQuest extends QuestTemplate {
  progress: number;
  completed: boolean;
}

/** The full pool a day's 3 are drawn from — a mix of quick wins and a couple of real stretch
 * goals, all driven by events the game already fires (see GameScene's recordX call sites) rather
 * than anything needing new tracking infrastructure. */
export const QUEST_POOL: QuestTemplate[] = [
  { id: 'merge_10', type: 'merge_count', icon: '🐾', name: 'Merge Party', description: 'Merge 10 cats.', target: 10, rewardFish: 15 },
  { id: 'merge_25', type: 'merge_count', icon: '🐾', name: 'Merge Marathon', description: 'Merge 25 cats.', target: 25, rewardFish: 25 },
  { id: 'combo_3', type: 'combo_reached', icon: '🔗', name: 'Chain Reaction', description: 'Reach a x3 combo chain.', target: 3, rewardFish: 15 },
  { id: 'combo_5', type: 'combo_reached', icon: '🔥', name: 'On Fire', description: 'Reach a x5 combo chain.', target: 5, rewardFish: 25 },
  { id: 'golden_1', type: 'golden_merged', icon: '✨', name: 'Golden Touch', description: 'Merge a Golden Cat.', target: 1, rewardFish: 20 },
  { id: 'runs_2', type: 'games_played', icon: '🎮', name: 'Warm Up', description: 'Play 2 runs.', target: 2, rewardFish: 10 },
  { id: 'runs_4', type: 'games_played', icon: '🎮', name: 'Regular', description: 'Play 4 runs.', target: 4, rewardFish: 20 },
  { id: 'tiger_1', type: 'level_reached', icon: '🐯', name: 'Big Game', description: 'Reach a Tiger.', target: 9, rewardFish: 25 },
  { id: 'vaporize_1', type: 'vaporize', icon: '🌪️', name: 'Clean Sweep', description: 'Trigger Vaporize once.', target: 1, rewardFish: 20 },
  { id: 'yarn_1', type: 'yarn_ball', icon: '🧶', name: 'Playtime', description: 'Fill the Purr Meter for a Yarn Ball.', target: 1, rewardFish: 10 },
  // Android-only — a rewarded ad never actually shows on the web build (see
  // MonetizationSystem's class doc), so this is excluded from the daily draw entirely unless
  // QuestSystem is constructed with includeAdQuests: true. Counts any rewarded ad watched to
  // completion (a revive, Double Fish, whichever comes first), not a dedicated "watch an ad for
  // no other reason" flow — this game has no separate ad-only placement to point at.
  { id: 'watch_ads_3', type: 'ads_watched', icon: '📺', name: 'Ad Break', description: 'Watch 3 rewarded ads.', target: 3, rewardFish: 20 },
];

const AD_QUEST_TYPE: QuestType = 'ads_watched';

interface QuestRecord {
  date: string;
  questIds: string[];
  progress: Record<string, number>;
}

/**
 * Today's 3 quests, seeded by date the same way DailyChallengeSystem/todaysModifier are — every
 * player gets the same 3 on the same day with no server, and they roll over at local midnight.
 * Progress resets with the day; a quest's reward is granted exactly once, the moment its progress
 * first crosses its target (see recordProgress's before/after check) — there's no separate "claim"
 * step, matching how every other in-run reward (achievements, Yarn Ball) already works here.
 */
export class QuestSystem {
  private record: QuestRecord;

  /** `includeAdQuests` should be `monetization.isNative` — false on the web build, where a
   * rewarded ad never shows at all, so an ad-watching quest would be a dead end for every web
   * player. Defaults to false so every other call site (and any test code) keeps working
   * unchanged without needing to know about ad-quests at all. */
  constructor(includeAdQuests = false) {
    this.record = QuestSystem.load(includeAdQuests);
  }

  getTodaysQuests(): ActiveQuest[] {
    return this.record.questIds.map((id) => {
      const template = QUEST_POOL.find((q) => q.id === id)!;
      const progress = this.record.progress[id] ?? 0;
      return { ...template, progress: Math.min(progress, template.target), completed: progress >= template.target };
    });
  }

  recordMerge(): ActiveQuest | null {
    return this.recordProgress('merge_count', 1, true);
  }

  recordCombo(combo: number): ActiveQuest | null {
    return this.recordProgress('combo_reached', combo, false);
  }

  recordGolden(): ActiveQuest | null {
    return this.recordProgress('golden_merged', 1, true);
  }

  recordGameStarted(): ActiveQuest | null {
    return this.recordProgress('games_played', 1, true);
  }

  recordLevelReached(level: number): ActiveQuest | null {
    return this.recordProgress('level_reached', level, false);
  }

  recordVaporize(): ActiveQuest | null {
    return this.recordProgress('vaporize', 1, true);
  }

  recordYarnBall(): ActiveQuest | null {
    return this.recordProgress('yarn_ball', 1, true);
  }

  recordAdWatched(): ActiveQuest | null {
    return this.recordProgress(AD_QUEST_TYPE, 1, true);
  }

  /** Applies `value` to every active quest of this type — added for cumulative types (merge
   * counts, one-off events), or taken as a running max for "reach N" types (combo/level, where
   * the event value is the height reached this one time, not a count of times it happened).
   * Returns the first quest that newly crosses its target this call, or null — GameScene grants
   * the Fish and shows the toast, this class only owns the progress data. */
  private recordProgress(type: QuestType, value: number, cumulative: boolean): ActiveQuest | null {
    let justCompleted: ActiveQuest | null = null;
    for (const id of this.record.questIds) {
      const template = QUEST_POOL.find((q) => q.id === id);
      if (!template || template.type !== type) {
        continue;
      }
      const before = this.record.progress[id] ?? 0;
      const after = cumulative ? before + value : Math.max(before, value);
      this.record.progress[id] = after;
      if (after >= template.target && before < template.target) {
        justCompleted = { ...template, progress: after, completed: true };
      }
    }
    this.save();
    return justCompleted;
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.record));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — today's progress just won't persist.
    }
  }

  private static load(includeAdQuests: boolean): QuestRecord {
    const today = todayKey();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as QuestRecord;
        if (parsed.date === today && Array.isArray(parsed.questIds)) {
          return parsed;
        }
      }
    } catch {
      // Fall through to a fresh day below.
    }
    return QuestSystem.freshRecord(today, includeAdQuests);
  }

  /** Picks QUESTS_PER_DAY distinct templates via the same seeded-RNG approach as the Daily
   * Challenge's modifier — a Fisher-Yates-style draw-without-replacement from the pool, seeded off
   * today's date (plus a distinguishing suffix, so this doesn't happen to draw in lockstep with
   * anything else that also seeds off the bare date string). Ad-quests are filtered out of the
   * pool entirely first when `includeAdQuests` is false, rather than drawn-then-skipped — keeps
   * every player's remaining quest count and odds identical to what they'd be if ad-quests didn't
   * exist for them at all, instead of quietly shrinking their day to 2 quests. */
  private static freshRecord(today: string, includeAdQuests: boolean): QuestRecord {
    const rng = createSeededRNG(`${today}:quests:${hashString(today)}`);
    const pool = QUEST_POOL.filter((q) => includeAdQuests || q.type !== AD_QUEST_TYPE);
    const questIds: string[] = [];
    const count = Math.min(QUESTS_PER_DAY, pool.length);
    for (let i = 0; i < count; i += 1) {
      const index = Math.floor(rng() * pool.length);
      questIds.push(pool[index].id);
      pool.splice(index, 1);
    }
    return { date: today, questIds, progress: {} };
  }
}
