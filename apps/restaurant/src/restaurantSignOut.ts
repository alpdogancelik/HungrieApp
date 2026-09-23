import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { unregisterRestaurantPush } from "./push";
import { createRestaurantSignOut } from "./restaurantSignOutCore";

export { createRestaurantSignOut } from "./restaurantSignOutCore";

export const restaurantSignOut = createRestaurantSignOut({
  unregisterPush: unregisterRestaurantPush,
  firebaseSignOut: () => signOut(auth),
});
