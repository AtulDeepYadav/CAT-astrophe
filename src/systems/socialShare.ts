/**
 * Shared by GameScene's Game Over share button and MenuScene's Leaderboard share button so the
 * two don't each reimplement the same Web Share / clipboard-fallback / explicit-platform-link
 * logic slightly differently.
 */
export interface ShareContent {
  text: string;
  url: string;
  title?: string;
}

type NavigatorWithShare = Navigator & {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
};

/**
 * Tries the native OS share sheet first (which on a real phone already lists WhatsApp/X/Facebook/
 * Messages/etc. alongside anything else installed) with an optional attached file, falling back to
 * a clipboard copy on platforms with no Web Share API at all (most desktop browsers). Returns
 * which path actually happened so the caller can show the right toast; a cancelled share sheet
 * (AbortError) counts as 'shared' — the player saw it and chose to close it, not an error.
 */
export async function shareViaWebShare(
  content: ShareContent,
  files?: File[],
): Promise<'shared' | 'copied' | 'failed'> {
  const nav = navigator as NavigatorWithShare;
  const shareData: ShareData = { title: content.title ?? 'Cat-astrophe', text: content.text, url: content.url };
  if (files && nav.canShare?.({ files })) {
    shareData.files = files;
  }

  if (nav.share) {
    try {
      await nav.share(shareData);
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        return 'shared';
      }
      // Fall through to the clipboard fallback below.
    }
  }

  try {
    await navigator.clipboard.writeText(`${content.text} ${content.url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * Explicit per-platform deep links — always available as direct buttons rather than only living
 * inside the OS share sheet, since that sheet doesn't exist at all on desktop browsers and even on
 * mobile some players would rather tap "WhatsApp" directly than scroll a sheet to find it.
 */
export function openWhatsAppShare(content: ShareContent) {
  const text = encodeURIComponent(`${content.text} ${content.url}`);
  window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
}

export function openTwitterShare(content: ShareContent) {
  const text = encodeURIComponent(content.text);
  const url = encodeURIComponent(content.url);
  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener');
}

export function openFacebookShare(content: ShareContent) {
  const url = encodeURIComponent(content.url);
  const quote = encodeURIComponent(content.text);
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${quote}`, '_blank', 'noopener');
}
