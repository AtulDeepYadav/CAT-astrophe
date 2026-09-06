import { Capacitor } from '@capacitor/core';

const REMOVE_ADS_ENTITLEMENT = 'remove_ads';

/**
 * TODO before Play Store release: every ID below is a placeholder.
 *
 * - The ad unit IDs are Google's own published *test* units (safe to ship against right now —
 *   they never serve real ads or earn revenue, and using them doesn't require an AdMob account).
 *   Swap them for your own once you've created an AdMob account (https://apps.admob.com) and
 *   registered this app + its ad units there — the Play Console listing needs the app's real
 *   AdMob App ID in AndroidManifest.xml too (see ANDROID_PACKAGING.md).
 * - REVENUECAT_API_KEY_ANDROID needs a real public SDK key from your own RevenueCat project
 *   (https://app.revenuecat.com — free up to $2.5k/mo tracked revenue, and it handles Play
 *   Billing's server-side receipt verification for you rather than you having to build that
 *   yourself). Create a "remove_ads" entitlement there attached to a one-time non-consumable
 *   product you configure in Play Console's in-app products.
 */
const TEST_REWARDED_AD_UNIT_ANDROID = 'ca-app-pub-3940256099942544/5224354917';
const TEST_INTERSTITIAL_AD_UNIT_ANDROID = 'ca-app-pub-3940256099942544/1033173712';
const REVENUECAT_API_KEY_ANDROID = 'YOUR_REVENUECAT_PUBLIC_SDK_KEY';

/**
 * Ads and the remove-ads purchase only ever run inside the wrapped Android app — never on the
 * plain web build at cat-astrophe-rouge.vercel.app. Two reasons: AdMob/Play Billing are native
 * plugins with no meaningful web equivalent here (a web ad network would be a wholly separate
 * integration), and the web build's privacy policy currently promises no ads/tracking at all —
 * keeping the free web demo exactly as ad-free as it's always been means that promise stays true
 * without touching it, while privacy.html gets a second section describing the Android app's
 * (opt-in, ad-supported) data collection instead of rewriting the existing one.
 *
 * Every public method below is safe to call on web or before initialize() resolves — they just
 * no-op / report "not available" rather than throw, so call sites never need their own
 * Capacitor.isNativePlatform() checks.
 */
export class MonetizationSystem {
  private initPromise: Promise<void> | null = null;
  private removeAdsPurchased = false;
  private rewardedAdReady = false;

  get isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /** True once ads should never be shown — either running on web (see class doc) or the player
   * has bought Remove Ads. Interstitial call sites should check this before showing anything. */
  get adsDisabled(): boolean {
    return !this.isNative || this.removeAdsPurchased;
  }

  /** Fire this at boot (BootScene does, fire-and-forget) and also await it anywhere that needs
   * `hasRemovedAds`/`canShowRewardedAd` to be accurate before rendering (MenuScene's Remove Ads
   * link) — every caller shares the one underlying init, so awaiting it a second time just waits
   * on the same in-flight work instead of running it twice or skipping it because boot's own
   * fire-and-forget call already flipped an "initialized" flag before finishing. Resolves quickly
   * on web (does nothing). */
  initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInitialize();
    }
    return this.initPromise;
  }

  private async doInitialize() {
    if (!this.isNative) {
      return;
    }

    try {
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.initialize({});
      await this.preloadRewardedAd();
    } catch {
      // AdMob unavailable (plugin not linked into this particular build, offline at boot, etc.)
      // — ad-gated features simply won't offer themselves; see showRewardedAd()'s own try/catch.
    }

    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY_ANDROID });
      const { customerInfo } = await Purchases.getCustomerInfo();
      this.removeAdsPurchased = Boolean(customerInfo.entitlements.active[REMOVE_ADS_ENTITLEMENT]);
    } catch {
      // Same idea — no purchase record available yet just means "not purchased," not a crash.
    }
  }

  private async preloadRewardedAd() {
    try {
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.prepareRewardVideoAd({ adId: TEST_REWARDED_AD_UNIT_ANDROID, isTesting: true });
      this.rewardedAdReady = true;
    } catch {
      this.rewardedAdReady = false;
    }
  }

  /** Whether a rewarded-ad-gated button (e.g. "Watch ad for a free revive") should currently be
   * offered at all — false on web, before an ad has finished preloading, or once one has just
   * been watched and the next isn't ready yet. */
  get canShowRewardedAd(): boolean {
    return this.isNative && this.rewardedAdReady;
  }

  /**
   * Shows the preloaded rewarded ad and resolves `true` only if the player actually watched it
   * through to the reward (closing early / a load failure resolves `false`, never rejects — call
   * sites can treat this as a plain yes/no on "did they earn it" without their own try/catch).
   * Kicks off preloading the next one regardless of outcome, since a used ad can't be shown again.
   */
  async showRewardedAd(): Promise<boolean> {
    if (!this.canShowRewardedAd) {
      return false;
    }
    this.rewardedAdReady = false;
    try {
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.showRewardVideoAd();
      return true;
    } catch {
      return false;
    } finally {
      void this.preloadRewardedAd();
    }
  }

  /** True once the player has bought Remove Ads (always false on web, where there's nothing to
   * remove — see adsDisabled for the check UI should actually gate on). */
  get hasRemovedAds(): boolean {
    return this.removeAdsPurchased;
  }

  /**
   * Buys the "remove_ads" one-time product via whatever offering RevenueCat has configured for
   * this app. Returns `true` only on a completed purchase (a user-cancelled sheet resolves
   * `false`, same non-throwing contract as showRewardedAd — a real error still logs to console
   * since a *failed* purchase, unlike a merely-declined ad, is worth knowing about if it recurs).
   */
  async purchaseRemoveAds(): Promise<boolean> {
    if (!this.isNative) {
      return false;
    }
    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      const offerings = await Purchases.getOfferings();
      // "Remove Ads" is a one-time purchase, not a subscription — the RevenueCat dashboard-side
      // setup should configure it as the offering's "lifetime" package; fall back to the first
      // available package for a simpler one-product-offering setup.
      const pkg = offerings.current?.lifetime ?? offerings.current?.availablePackages[0];
      if (!pkg) {
        return false;
      }
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
      this.removeAdsPurchased = Boolean(customerInfo.entitlements.active[REMOVE_ADS_ENTITLEMENT]);
      return this.removeAdsPurchased;
    } catch (err) {
      const cancelled = typeof err === 'object' && err !== null && 'userCancelled' in err && (err as { userCancelled?: boolean }).userCancelled;
      if (!cancelled) {
        console.error('Remove Ads purchase failed', err);
      }
      return false;
    }
  }

  /** Restores a prior Remove Ads purchase after a reinstall/new device — RevenueCat ties it to
   * the player's Google account, not local storage, so this is the recovery path for that. */
  async restorePurchases(): Promise<boolean> {
    if (!this.isNative) {
      return false;
    }
    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      const { customerInfo } = await Purchases.restorePurchases();
      this.removeAdsPurchased = Boolean(customerInfo.entitlements.active[REMOVE_ADS_ENTITLEMENT]);
      return this.removeAdsPurchased;
    } catch {
      return false;
    }
  }

  /** Interstitial, shown only at natural breaks (Game Over, never mid-drop) — see call site. */
  async showInterstitial() {
    if (this.adsDisabled) {
      return;
    }
    try {
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.prepareInterstitial({ adId: TEST_INTERSTITIAL_AD_UNIT_ANDROID, isTesting: true });
      await AdMob.showInterstitial();
    } catch {
      // Missed interstitial isn't worth surfacing to the player — just skip it this run.
    }
  }
}

/**
 * One instance for the whole app lifetime, shared by every scene — unlike CurrencySystem/
 * StreakSystem (which each scene freely re-`new`s to reload from localStorage), the native SDKs
 * this wraps must only ever be initialized once per process, and ad-preload / purchase state
 * needs to survive scene changes (Menu → Game → Menu) rather than reset with each `new`.
 */
export const monetization = new MonetizationSystem();
