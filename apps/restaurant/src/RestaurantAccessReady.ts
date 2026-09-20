import { createContext, useContext } from "react";

// Keep the Router stack mounted while authorization is restored, but defer
// guarded page reads until the account and Restaurant scope are verified.
export const RestaurantAccessReady = createContext(false);

export const useRestaurantAccessReady = () => useContext(RestaurantAccessReady);
