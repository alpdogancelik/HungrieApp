export type RestaurantSignOutDependencies = {
  unregisterPush: () => Promise<unknown>;
  firebaseSignOut: () => Promise<unknown>;
};

export function createRestaurantSignOut(dependencies: RestaurantSignOutDependencies) {
  let inFlight: Promise<void> | null = null;
  return function restaurantSignOut() {
    if (inFlight) return inFlight;
    const operation = (async () => {
      try {
        await dependencies.unregisterPush();
      } catch {
        // A stale or unreachable push token must never trap the account session.
      }
      await dependencies.firebaseSignOut();
    })();
    inFlight = operation;
    void operation.finally(() => {
      if (inFlight === operation) inFlight = null;
    }).catch(() => undefined);
    return operation;
  };
}
