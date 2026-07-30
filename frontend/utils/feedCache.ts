export interface FeedItem {
  fid: string;
  uid: string;
  content: string;
  post_date: string;
  location: {
    long: number;
    lat: number;
  };
  images: string[];
  nickname?: string;
  private: boolean;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Default TTL: 5 minutes (300,000 ms)
const DEFAULT_TTL_MS = 5 * 60 * 1000;

// In-memory cache with timestamps for feed details and user profile nicknames
const feedDetailCache = new Map<string, CacheEntry<FeedItem>>();
const userProfileCache = new Map<string, CacheEntry<string>>();

/**
 * Get cached feed item if available and not expired
 */
export function getCachedFeed(
  fid: string,
  ttlMs = DEFAULT_TTL_MS
): FeedItem | undefined {
  const entry = feedDetailCache.get(fid);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > ttlMs) {
    feedDetailCache.delete(fid);
    return undefined;
  }
  return entry.data;
}

/**
 * Save feed item to cache with current timestamp
 */
export function setCachedFeed(feed: FeedItem): void {
  if (feed && feed.fid) {
    feedDetailCache.set(feed.fid, { data: feed, timestamp: Date.now() });
  }
}

/**
 * Get cached user nickname if available and not expired
 */
export function getCachedNickname(
  uid: string,
  ttlMs = DEFAULT_TTL_MS
): string | undefined {
  const entry = userProfileCache.get(uid);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > ttlMs) {
    userProfileCache.delete(uid);
    return undefined;
  }
  return entry.data;
}

/**
 * Save user nickname to cache with current timestamp
 */
export function setCachedNickname(uid: string, nickname: string): void {
  if (uid && nickname) {
    userProfileCache.set(uid, { data: nickname, timestamp: Date.now() });
  }
}

/**
 * Fetch a single feed detail with frontend caching (with TTL) for feed & user profile
 */
export async function fetchSingleFeedDetailCached(
  fid: string,
  authToken: string,
  apiUrl: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<FeedItem | null> {
  // Check if fully detailed feed is already in memory cache and valid
  const cachedFeed = getCachedFeed(fid, ttlMs);
  if (cachedFeed && cachedFeed.content) {
    return cachedFeed;
  }

  try {
    const response = await fetch(`${apiUrl}/feed/get/${fid}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return null;
    const data = await response.json();

    if (data.result === "success" && data.feed) {
      const feed: FeedItem = data.feed;

      // Check user nickname cache
      const cachedNickname = getCachedNickname(feed.uid, ttlMs);
      if (cachedNickname) {
        feed.nickname = cachedNickname;
      } else {
        try {
          const userResponse = await fetch(
            `${apiUrl}/user/profile/${feed.uid}`,
            {
              headers: { Authorization: `Bearer ${authToken}` },
            }
          );
          if (userResponse.ok) {
            const userData = await userResponse.json();
            if (userData.nickname) {
              feed.nickname = userData.nickname;
              setCachedNickname(feed.uid, userData.nickname);
            }
          }
        } catch (e) {
          // Ignore profile fetch error
        }
      }

      setCachedFeed(feed);
      return feed;
    }
  } catch (e) {
    console.error(`Failed to load detail for feed ${fid}:`, e);
  }
  return null;
}

/**
 * Invalidate a specific feed in cache (e.g. after edit/delete)
 */
export function invalidateCachedFeed(fid: string): void {
  feedDetailCache.delete(fid);
}

/**
 * Clear all cached items
 */
export function clearFeedCache(): void {
  feedDetailCache.clear();
  userProfileCache.clear();
}
