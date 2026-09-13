export type Locale="en"|"tr";
export type AccessContext={state:"unmapped"|"configuration_error";referenceId?:string}|{state:"resolved";profileId:string;accountType:"customer"|"restaurant"|"admin";accountStatus:"pending"|"active"|"suspended"|"revoked";onboardingStep:string;restaurantId?:string;restaurantRole?:"owner"|"manager";restaurantStatus?:"pending"|"active"|"suspended"|"closed";acceptingOrders?:boolean};
export type OrderPage={items:Record<string,any>[];next_cursor?:string|null};
