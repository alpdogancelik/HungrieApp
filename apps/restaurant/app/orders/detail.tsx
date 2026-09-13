// Static order-detail shell. The order ID is read from the query string so a
// cold Web Push link or browser refresh works with Expo's static web export.
export { default } from "./[orderId]";
