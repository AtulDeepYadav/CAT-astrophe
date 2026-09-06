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
import { THEME, bodyTextStyle, createButton, createIconButton, createPanel } from '../ui/uiKit';

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
  private muteIcon!: { container: Phaser.GameObjects.Container; setIcon: (n: 'speakerOn' | 'speakerOff') => void };

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
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1a1008, 0.4).setOrigin(0, 0);
    // A soft vertical gradient wash behind the title/buttons column — grounds that whole stack
    // against the busy illustrated room behind it without hiding the art, the way a frosted panel
    // would but without a hard-edged rectangle.
    const wash = this.add.graphics();
    wash.fillGradientStyle(0x1a1008, 0x1a1008, 0x1a1008, 0x1a1008, 0.55, 0.55, 0, 0);
    wash.fillRect(0, 0, GAME_WIDTH, 520);

    ensureAmbientMusic(this);

    // Mute toggle, top-right — so a player can silence the game before ever tapping Play, not
    // only from inside a run's pause menu.
    this.muteIcon = createIconButton(this, GAME_WIDTH - 34, 34, this.settings.muted ? 'speakerOff' : 'speakerOn', {
      radius: 19,
      depth: 50,
      onTap: () => {
        const nextMuted = !this.settings.muted;
        this.settings.setMuted(nextMuted);
        this.muteIcon.setIcon(nextMuted ? 'speakerOff' : 'speakerOn');
      },
    });

    this.add
      .text(GAME_WIDTH / 2, 108, '🐱 Cat-astrophe', {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        fontStyle: '800',
        color: '#fff6e8',
        stroke: '#4a2c0d',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setShadow(0, 5, 'rgba(20,12,4,0.45)', 8, false, true);

    this.buildStatChips(score.best, currency.balance);

    createButton(this, GAME_WIDTH / 2, 280, '▶  Play', THEME.primary, {
      fontSize: 21,
      minWidth: 220,
      depth: 10,
      onTap: () => this.onMenuButtonTap(() => this.startGame('normal')),
    });

    const dailyLabel = daily.playedToday
      ? `📅 Daily: ${modifier.name}  (best ${daily.bestScoreToday})`
      : `📅 Daily: ${modifier.name}`;
    createButton(this, GAME_WIDTH / 2, 350, dailyLabel, THEME.info, {
      fontSize: 15,
      minWidth: 220,
      depth: 10,
      onTap: () => this.onMenuButtonTap(() => this.startGame('daily')),
    });

    createButton(this, GAME_WIDTH / 2, 420, '🌙  Zen Mode', THEME.calm, {
      fontSize: 19,
      minWidth: 220,
      depth: 10,
      onTap: () => this.onMenuButtonTap(() => this.startGame('zen')),
    });

    createButton(this, GAME_WIDTH / 2, 490, '🏆  Leaderboard', THEME.gold, {
      fontSize: 19,
      minWidth: 220,
      depth: 10,
      onTap: () => this.onMenuButtonTap(() => this.toggleLeaderboard(true)),
    });

    this.buildHeroShowcase();

    // Secondary maintenance actions, deliberately low-key (plain text, no button chrome) so they
    // don't compete with Play/Daily/Zen/Leaderboard — this is a stopgap for real cloud save
    // (needs the native wrapping this project hasn't done yet), not a headline feature.
    const backupLink = this.add
      .text(GAME_WIDTH / 2 - 70, GAME_HEIGHT - 85, '💾 Backup', bodyTextStyle({ fontSize: '13px', color: '#f2e6d3' }))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backupLink.on('pointerdown', () => this.backupProgress());

    const restoreLink = this.add
      .text(
        GAME_WIDTH / 2 + 70,
        GAME_HEIGHT - 85,
        '📥 Restore',
        bodyTextStyle({ fontSize: '13px', color: '#f2e6d3' }),
      )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    restoreLink.on('pointerdown', () => this.restoreProgress());

    // Required reading for a Play Store listing, not just a submission-time URL — the policy
    // needs to be reachable from inside the app too. Opens in a new tab so the running game
    // (and anything mid-round) isn't disrupted by navigating away from it.
    const privacyLink = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'Privacy Policy', bodyTextStyle({ fontSize: '12px', color: '#b8a98f' }))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    privacyLink.on('pointerdown', () => window.open('/privacy.html', '_blank', 'noopener'));

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 40,
        'Drop cats. Merge cats. Try not to cat-astrophe.',
        bodyTextStyle({ fontSize: '13px', color: '#f2e6d3' }),
      )
      .setOrigin(0.5);

    this.leaderboardContainer = this.buildLeaderboardOverlay();
  }

  /** Two small side-by-side "stat chip" pills (Best Score, Fish) rather than one plain line of
   * text — reads as a mini dashboard instead of a caption, and gives the Fish balance its own
   * visual weight now that it's a real spendable currency. */
  private buildStatChips(best: number, fish: number) {
    const y = 158;
    const chipH = 30;
    const gap = 10;

    const makeChip = (label: string, cx: number): number => {
      const text = this.add
        .text(0, 0, label, bodyTextStyle({ fontSize: '14px', fontStyle: '700', color: '#4a2c0d' }))
        .setOrigin(0.5);
      const w = text.width + 26;
      const bg = this.add.graphics();
      bg.fillStyle(0xfff6e8, 0.92);
      bg.fillRoundedRect(-w / 2, -chipH / 2, w, chipH, chipH / 2);
      bg.lineStyle(1.5, 0xb69c73, 0.8);
      bg.strokeRoundedRect(-w / 2 + 0.75, -chipH / 2 + 0.75, w - 1.5, chipH - 1.5, chipH / 2 - 0.75);
      this.add.container(cx, y, [bg, text]);
      return w;
    };

    const bestLabel = `🏅 ${best}`;
    const fishLabel = `🐟 ${fish}`;
    // Measure both first (off-screen trick isn't needed — text width is known immediately after
    // creation) so the pair can be centered as a unit rather than guessing a fixed offset.
    const probeBest = this.add.text(0, 0, bestLabel, { fontSize: '14px', fontStyle: '700' }).setVisible(false);
    const probeFish = this.add.text(0, 0, fishLabel, { fontSize: '14px', fontStyle: '700' }).setVisible(false);
    const wBest = probeBest.width + 26;
    const wFish = probeFish.width + 26;
    probeBest.destroy();
    probeFish.destroy();

    const totalW = wBest + gap + wFish;
    const leftX = GAME_WIDTH / 2 - totalW / 2 + wBest / 2;
    const rightX = GAME_WIDTH / 2 + totalW / 2 - wFish / 2;

    makeChip(bestLabel, leftX);
    makeChip(fishLabel, rightX);
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
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 100,
        message,
        bodyTextStyle({
          fontSize: '13px',
          color: '#fff6e8',
          backgroundColor: '#3a2b22',
          padding: { x: 12, y: 6 },
          align: 'center',
          wordWrap: { width: GAME_WIDTH - 60 },
        }),
      )
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

  /** Guards every top-level menu button the same way — a tap that lands on one of these while the
   * Leaderboard overlay is open (createButton has no notion of scene-specific overlay state on
   * its own) is a no-op rather than starting a run or re-opening the overlay out from under it. */
  private onMenuButtonTap(action: () => void) {
    if (this.leaderboardContainer?.visible) {
      return;
    }
    action();
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

    // A soft glass "shelf" behind the portrait — grounds it against the busy room art the same
    // way the wash does for the button column above, so the showcase reads as one designed unit.
    createPanel(this, centerX, centerY, 260, 250, { radius: 32, fill: 0xfff6e8, fillAlpha: 0.16, depth: 0 });

    const portrait = this.add.image(centerX, centerY, portraitTextureKeyForLevel(heroLevel));
    const scale = targetHeight / portrait.height;
    portrait.setScale(scale * 0.5).setAlpha(0);
    portrait.setDepth(1);

    const caption = this.add
      .text(
        centerX,
        centerY + targetHeight / 2 + 22,
        `Your best: ${heroData.name}`,
        bodyTextStyle({ fontSize: '14px', fontStyle: '700', color: '#fff6e8' }),
      )
      .setOrigin(0.5)
      .setAlpha(0)
      .setShadow(0, 2, 'rgba(0,0,0,0.5)', 3, false, true)
      .setDepth(1);

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
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const bg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0, 0);

    const panel = createPanel(this, centerX, centerY, 340, 470, { radius: 28 });

    const title = this.add
      .text(centerX, centerY - 208, '🏆 Top Runs', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: '800',
        color: '#3a2b22',
      })
      .setOrigin(0.5);

    const entries = new LeaderboardSystem().getTop();

    // Top-right corner icon rather than a bottom text button — matches how every modern modal
    // dismisses (X in the corner), and frees the bottom of the panel entirely.
    const closeIcon = createIconButton(this, centerX + 148, centerY - 208, 'close', {
      radius: 16,
      theme: 'light',
      onTap: () => this.toggleLeaderboard(false),
    });

    // Shares the player's own #1 run as a brag — there's no real global leaderboard to share *to*
    // yet (see the local-only note in LeaderboardSystem), just this player's own best.
    const shareIcon = this.add
      .text(centerX + 100, centerY - 208, '📤', { fontSize: '19px' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    shareIcon.on('pointerdown', () => this.shareLeaderboardBest(entries));

    const rows: Phaser.GameObjects.GameObject[] = [];
    if (entries.length === 0) {
      rows.push(
        this.add
          .text(
            centerX,
            centerY - 30,
            'No runs yet — play a round!',
            bodyTextStyle({ fontSize: '15px', color: '#6f6152' }),
          )
          .setOrigin(0.5),
      );
    } else {
      const rankColors = [0xffe6a0, 0xe8e8e8, 0xe0b088]; // gold/silver/bronze row tint for the top 3
      entries.forEach((entry, i) => {
        const rowY = centerY - 155 + i * 38;
        const rowW = 296;
        const rowH = 32;
        const rowBg = this.add.graphics();
        rowBg.fillStyle(i < 3 ? rankColors[i] : 0xf3ead8, i < 3 ? 0.85 : 0.6);
        rowBg.fillRoundedRect(centerX - rowW / 2, rowY - rowH / 2, rowW, rowH, 12);
        rows.push(rowBg);

        const badge = this.add.graphics();
        badge.fillStyle(i < 3 ? rankColors[i] : 0xd9c8a8, 1);
        badge.fillCircle(centerX - rowW / 2 + 20, rowY, 13);
        badge.lineStyle(1.5, 0xb8860b, i < 3 ? 0.9 : 0.4);
        badge.strokeCircle(centerX - rowW / 2 + 20, rowY, 13);
        rows.push(badge);

        rows.push(
          this.add
            .text(centerX - rowW / 2 + 20, rowY, `${i + 1}`, {
              fontFamily: FONT_FAMILY,
              fontSize: '13px',
              fontStyle: '800',
              color: '#3a2b22',
            })
            .setOrigin(0.5),
        );

        const modeTag = entry.mode === 'daily' ? ' (daily)' : '';
        rows.push(
          this.add
            .text(
              centerX - rowW / 2 + 42,
              rowY,
              `${entry.score} — ${entry.catName}${modeTag}`,
              bodyTextStyle({ fontSize: '14px', fontStyle: '700', color: '#3a2b22' }),
            )
            .setOrigin(0, 0.5),
        );
      });
    }

    const container = this.add.container(0, 0, [bg, panel, title, closeIcon.container, shareIcon, ...rows]);
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
