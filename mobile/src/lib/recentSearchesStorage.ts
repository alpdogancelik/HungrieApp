import { createRecentSearchesController } from "./recentSearchesIdentity";
import { storage } from "./storage";

export const LEGACY_RECENT_SEARCHES_KEY = "hungrie_search_recents_v3";
export const RECENT_SEARCHES_KEY = "hungrie_search_recents_v4";

const controller = createRecentSearchesController({
    read: () => storage.getItem(RECENT_SEARCHES_KEY),
    write: value => storage.setItem(RECENT_SEARCHES_KEY, value),
    remove: () => storage.removeItem(RECENT_SEARCHES_KEY),
    removeLegacy: () => storage.removeItem(LEGACY_RECENT_SEARCHES_KEY),
});

export const getRecentSearchesSnapshot = controller.getSnapshot;
export const subscribeRecentSearches = controller.subscribe;
export const bindRecentSearchesToIdentity = controller.bind;
export const invalidateRecentSearchIdentity = controller.invalidate;
export const addRecentSearch = controller.add;
export const removeRecentSearch = controller.remove;
export const clearStoredRecentSearches = controller.clear;
export const destroyRecentSearchesForSessionBoundary = controller.destroy;
