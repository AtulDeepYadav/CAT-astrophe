import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';
import { backgroundFrameTextureKey } from '../config/worldZones';
import { todaysModifier } from '../config/dailyChallenges';
import { ScoreSystem } from '../systems/ScoreSystem';
import { LeaderboardSystem } from '../systems/LeaderboardSystem';
import type { LeaderboardEntry } from '../systems/LeaderboardSystem';
import { DailyChallengeSystem } from '../systems/DailyChallengeSystem';
import { SettingsSystem } from '../systems/SettingsSystem';
import { CollectionSystem } from '../systems/CollectionSystem';
import { CurrencySystem } from '../systems/CurrencySystem';
import { exportSaveData, importSaveData } from '../systems/saveBackup';
import { getCatData, portraitTextureKeyForLevel } from '../config/catData';
import { shareViaWebShare } from '../systems/socialShare';
import { ensureAmbientMusic } from '../systems/MusicSystem';

/**
 * Title screen — the game used to boot straight into a live round with no beat before the
 * pressure started and no way to reach Zen Mode or the Daily Challenge at all. Every system read
 * here (ScoreSystem, LeaderboardSystem, DailyChallengeSystem) is a fresh instance that just reads
 * the same localStorage state GameScene's own instances persist — nothing needs to be shared or
 * passed between scenes.
 */
export class MenuScene extends Phaser.Scene {
  private leaderboardContainer!: Phaser.GameObjects.Container;
  private settings = new SettingsSystem();
  private muteButton!: Phaser.GameObjects.Text;

  // Mirrors GameScene's own modal/back-button bookkeeping (see its pushModalHistoryEntry doc
  // comment) so the Android back gesture closes the Leaderboard overlay instead of leaving the
  // app — a history entry is pushed only for the outermost modal open, and consumed on close.
  private modalHistoryDepth = 0;

  constructor() {
    super('Menu');
  }

  create() {
    const score = new ScoreSystem();
    const daily = new DailyChallengeSystem();
    const currency = new CurrencySystem();
    const modifier = todaysModifier();

    this.modalHistoryDepth = 0;
    // Removed first — scene.start('Menu') reuses this Scene object rather than reconstructing
    // it, so without this a return trip to Menu would register a second listener on top of the
    // first and a single back-press would fire the handler twice.
    window.removeEventListener('popstate', this.handleBackButton);
    window.addEventListener('popstate', this.handleBackButton);

    this.add.image(0, 0, backgroundFrameTextureKey('home', 1)).setOrigin(0, 0);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1a1008, 0.45).setOrigin(0, 0);

    ensureAmbientMusic(this);

    // Mute toggle, top-right — so a player can silence the game before ever tapping Play, not
    // only from inside a run's pause menu.
    this.muteButton = this.add
      .text(GAME_WIDTH - 32, 32, this.settings.muted ? '🔇' : '🔊', {
        fontSize: '22px',
        stroke: '#3a2b22',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.muteButton.on('pointerdown', () => {
      const nextMuted = !this.settings.muted;
      this.settings.setMuted(nextMuted);
      this.muteButton.setText(nextMuted ? '🔇' : '🔊');
    });

    this.add
      .text(GAME_WIDTH / 2, 110, '🐱 Cat-astrophe', {
        fontFamily: FONT_FAMILY,
        fontSize: '38px',
        fontStyle: '800',
        color: '#fff6e8',
        stroke: '#3a2b22',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 160, `Best score: ${score.best}   🐟 ${currency.balance}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#fff6e8',
      })
      .setOrigin(0.5);

    this.buildMenuButton(GAME_WIDTH / 2, 280, '▶  Play', '#ffd873', () => this.startGame('normal'));

    const dailyLabel = daily.playedToday
      ? `📅 Daily: ${modifier.name}  (best ${daily.bestScoreToday})`
      : `📅 Daily: ${modifier.name}`;
    this.buildMenuButton(GAME_WIDTH / 2, 350, dailyLabel, '#a7d8ff', () => this.startGame('daily'), 15);

    this.buildMenuButton(GAME_WIDTH / 2, 420, '🌙  Zen Mode', '#c9b6f0', () => this.startGame('zen'));

    this.buildMenuButton(GAME_WIDTH / 2, 490, '🏆  Leaderboard', '#ffe6a7', () => this.toggleLeaderboard(true));

    this.buildHeroShowcase();

    // Secondary maintenance actions, deliberately low-key (plain text, no button chrome) so they
    // don't compete with Play/Daily/Zen/Leaderboard — this is a stopgap for real cloud save
    // (needs the native wrapping this project hasn't done yet), not a headline feature.
    const backupLink = this.add
      .text(GAME_WIDTH / 2 - 70, GAME_HEIGHT - 85, '💾 Backup', {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#f2e6d3',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backupLink.on('pointerdown', () => this.backupProgress());

    const restoreLink = this.add
      .text(GAME_WIDTH / 2 + 70, GAME_HEIGHT - 85, '📥 Restore', {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#f2e6d3',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    restoreLink.on('pointerdown', () => this.restoreProgress());

    // Required reading for a Play Store listing, not just a submission-time URL — the policy
    // needs to be reachable from inside the app too. Opens in a new tab so the running game
    // (and anything mid-round) isn't disrupted by navigating away from it.
    const privacyLink = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'Privacy Policy', {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        color: '#b8a98f',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    privacyLink.on('pointerdown', () => window.open('/privacy.html', '_blank', 'noopener'));

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 40, 'Drop cats. Merge cats. Try not to cat-astrophe.', {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#f2e6d3',
      })
      .setOrigin(0.5);

    this.leaderboardContainer = this.buildLeaderboardOverlay();
  }

  /** Copies a portable backup code to the clipboard — see saveBackup.ts for why this exists
   * instead of a real cloud save. */
  private async backupProgress() {
    const code = exportSaveData();
    if (!code) {
      this.showToast('Nothing to back up yet — play a round first!');
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      this.showToast('Copied! Paste it somewhere safe.');
    } catch {
      this.showToast('Could not copy — try again.');
    }
  }

  /** window.prompt/alert rather than a custom Phaser text-input UI — Phaser has no native text
   * field, and these work everywhere without building one just for this stopgap feature. */
  private restoreProgress() {
    const code = window.prompt('Paste your backup code:');
    if (!code) {
      return;
    }
    if (importSaveData(code)) {
      window.alert('Restored! Reloading…');
      window.location.reload();
    } else {
      this.showToast("That code didn't look right.");
    }
  }

  private showToast(message: string) {
    const toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 100, message, {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#fff6e8',
        backgroundColor: '#3a2b22',
        padding: { x: 12, y: 6 },
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: toast,
      alpha: 1,
      duration: 200,
      onComplete: () => {
        this.tweens.add({ targets: toast, alpha: 0, duration: 400, delay: 1600, onComplete: () => toast.destroy() });
      },
    });
  }

  private startGame(mode: GameMode) {
    this.scene.start('Game', { mode });
  }

  /**
   * Shows off the player's own best-ever cat in the open space below the menu buttons — the
   * title screen used to be just a logo and a button stack with no personality of its own, and
   * no reason to look twice before tapping Play. A brand-new player with nothing discovered yet
   * still sees the Kitten here (CollectionSystem.highestDiscoveredLevel defaults to 1), so the
   * spot is never empty.
   */
  private buildHeroShowcase() {
    const collection = new CollectionSystem();
    const heroLevel = collection.highestDiscoveredLevel();
    const heroData = getCatData(heroLevel);
    const centerX = GAME_WIDTH / 2;
    const centerY = 630;
    const targetHeight = 190;

    const portrait = this.add.image(centerX, centerY, portraitTextureKeyForLevel(heroLevel));
    const scale = targetHeight / portrait.height;
    portrait.setScale(scale * 0.5).setAlpha(0);

    const caption = this.add
      .text(centerX, centerY + targetHeight / 2 + 22, `Your best: ${heroData.name}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        fontStyle: '700',
        color: '#fff6e8',
        stroke: '#3a2b22',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    // A bounce-in entrance rather than just appearing — the one bit of "ta-da" this screen gets,
    // since it's the first thing a player sees every single session.
    this.tweens.add({
      targets: portrait,
      scaleX: scale,
      scaleY: scale,
      alpha: 1,
      duration: 520,
      delay: 150,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Gentle continuous bob once settled — makes the title screen read as alive rather than
        // a static poster, without competing with the buttons above for attention.
        this.tweens.add({
          targets: portrait,
          y: centerY - 10,
          duration: 1400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      },
    });
    this.tweens.add({ targets: caption, alpha: 1, duration: 400, delay: 500 });
  }

  private buildMenuButton(
    x: number,
    y: number,
    label: string,
    color: string,
    onTap: () => void,
    fontSize = 19,
  ) {
    const button = this.add
      .text(x, y, label, {
        fontFamily: FONT_FAMILY,
        fontSize: `${fontSize}px`,
        fontStyle: '700',
        color: '#3a2b22',
        backgroundColor: color,
        padding: { x: 26, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    // Guard rather than an interactive full-screen rect on the leaderboard overlay to swallow
    // taps — the same pattern GameScene's own overlays use (see collectionBookContainer.visible
    // checks) to stop a tap on the modal from also hitting whatever's underneath it.
    button.on('pointerdown', () => {
      if (this.leaderboardContainer.visible) {
        return;
      }
      onTap();
    });
  }

  private toggleLeaderboard(visible: boolean, fromBackButton = false) {
    this.leaderboardContainer.setVisible(visible);
    if (visible) {
      this.pushModalHistoryEntry();
    } else if (!fromBackButton) {
      this.consumeModalHistoryEntry();
    }
  }

  private pushModalHistoryEntry() {
    if (this.modalHistoryDepth === 0) {
      window.history.pushState({ catAstropheModal: true }, '');
    }
    this.modalHistoryDepth += 1;
  }

  private consumeModalHistoryEntry() {
    if (this.modalHistoryDepth === 0) return;
    this.modalHistoryDepth -= 1;
    if (this.modalHistoryDepth === 0) {
      window.history.back();
    }
  }

  private handleBackButton = () => {
    if (!this.scene.isActive()) return;
    if (this.leaderboardContainer?.visible) {
      this.toggleLeaderboard(false, true);
    }
    this.modalHistoryDepth = 0;
  };

  private buildLeaderboardOverlay(): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0, 0);

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 360, 460, 0xfff6e8).setStrokeStyle(3, 0xb8860b);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 205, '🏆 Top Runs', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: '800',
        color: '#3a2b22',
      })
      .setOrigin(0.5);

    const entries = new LeaderboardSystem().getTop();

    // Top-right of the panel, next to the title, rather than in the row list below — that list's
    // length varies with how many runs exist, but this button's position shouldn't move around
    // depending on it. Shares the player's own #1 run as a brag, same shape as GameScene's own
    // Share Score — there's no real global leaderboard to share *to* yet (see the local-only note
    // in LeaderboardSystem), just this player's own best.
    const shareButton = this.add
      .text(GAME_WIDTH / 2 + 145, GAME_HEIGHT / 2 - 205, '📤', { fontSize: '20px' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    shareButton.on('pointerdown', () => this.shareLeaderboardBest(entries));
    const rows: Phaser.GameObjects.Text[] = [];
    if (entries.length === 0) {
      rows.push(
        this.add
          .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'No runs yet — play a round!', {
            fontFamily: FONT_FAMILY,
            fontSize: '15px',
            color: '#6f6152',
          })
          .setOrigin(0.5),
      );
    } else {
      entries.forEach((entry, i) => {
        const modeTag = entry.mode === 'daily' ? ' (daily)' : '';
        rows.push(
          this.add
            .text(
              GAME_WIDTH / 2,
              GAME_HEIGHT / 2 - 160 + i * 34,
              `${i + 1}. ${entry.score} — ${entry.catName}${modeTag}`,
              { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#3a2b22' },
            )
            .setOrigin(0.5),
        );
      });
    }

    const closeButton = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 205, 'Close', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: '700',
        color: '#3a2b22',
        backgroundColor: '#ffd873',
        padding: { x: 20, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    closeButton.on('pointerdown', () => this.toggleLeaderboard(false));

    const container = this.add.container(0, 0, [bg, panel, title, shareButton, ...rows, closeButton]);
    container.setDepth(1000);
    container.setVisible(false);
    return container;
  }

  /** Shares the player's own #1 local run as a brag — see the doc comment on the leaderboard's
   * share button for why this is "your best," not the leaderboard itself. Web Share API's native
   * sheet already lists WhatsApp/X/Facebook/etc. on a real phone, so unlike Game Over's dedicated
   * per-platform icon row (there's real spare room there), this stays a single button here where
   * the panel is already tight on vertical space. */
  private async shareLeaderboardBest(entries: LeaderboardEntry[]) {
    if (entries.length === 0) {
      this.showToast('Play a round first — nothing to share yet!');
      return;
    }
    const best = entries[0];
    const modeTag = best.mode === 'daily' ? ' (Daily Challenge)' : '';
    const result = await shareViaWebShare({
      title: 'Cat-astrophe',
      text: `My top run in Cat-astrophe: ${best.score} points as a ${best.catName}${modeTag}! 🐱 Can you beat me?`,
      url: window.location.href,
    });
    if (result === 'copied') {
      this.showToast('Copied to clipboard!');
    } else if (result === 'failed') {
      this.showToast('Could not share right now.');
    }
  }
}
