const KEY_PREFIX = "nanofill:summary:";
const TTL_MS = 24 * 60 * 60 * 1000;
const TRACKING_PARAM =
  /^(utm_|gclid$|fbclid$|mc_eid$|mc_cid$|_hs|ref$|ref_src$|igshid$|yclid$|msclkid$)/i;

export type CachedSummary = {
  summary: string;
  contentHash: string;
  ts: number;
};

export function normalizeUrl(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    const keep: [string, string][] = [];
    for (const [k, v] of u.searchParams) {
      if (TRACKING_PARAM.test(k)) continue;
      keep.push([k, v]);
    }
    keep.sort(([a], [b]) => a.localeCompare(b));
    u.search = new URLSearchParams(keep).toString();
    return u.toString();
  } catch {
    return href;
  }
}

export async function hashContent(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

function cacheKey(url: string): string {
  return KEY_PREFIX + normalizeUrl(url);
}

export async function getCachedEntry(url: string): Promise<CachedSummary | null> {
  const key = cacheKey(url);
  const obj = await chrome.storage.session.get(key);
  const v = obj[key] as CachedSummary | undefined;
  if (!v || Date.now() - v.ts > TTL_MS) return null;
  return v;
}

export async function setSummary(
  url: string,
  summary: string,
  contentHash: string,
): Promise<void> {
  const value: CachedSummary = { summary, contentHash, ts: Date.now() };
  try {
    await chrome.storage.session.set({ [cacheKey(url)]: value });
  } catch {
    // ignore QUOTA_BYTES exceeded
  }
}

