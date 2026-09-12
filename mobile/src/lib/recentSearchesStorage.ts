import { storage } from "@/src/lib/storage";

export const RECENT_SEARCHES_KEY = "hungrie_search_recents_v3";

export const clearStoredRecentSearches = () => storage.removeItem(RECENT_SEARCHES_KEY);
