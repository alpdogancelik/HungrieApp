export type FirebaseRuntimeInput = Record<string, string | undefined>;

export const CUSTOMER_NON_PRODUCTION_FIREBASE_PROJECT_ID = "hungrieapp-a2288";
const required = ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "MESSAGING_SENDER_ID", "APP_ID"] as const;

export const resolveFirebaseRuntimeConfig = (processValues: FirebaseRuntimeInput, extras: FirebaseRuntimeInput = {}) => {
  const get = (name: string) => String(processValues[name] ?? extras[name] ?? "").trim();
  const environment = get("EXPO_PUBLIC_APP_ENV") || "development";
  if (!new Set(["development", "staging", "production"]).has(environment)) throw new Error("Invalid Customer environment.");
  const values = Object.fromEntries(required.map((suffix) => [suffix, get(`EXPO_PUBLIC_FIREBASE_${suffix}`)]));
  if (environment === "production") {
    for (const suffix of required) {
      if (!String(processValues[`EXPO_PUBLIC_FIREBASE_${suffix}`] || "").trim()) throw new Error(`Production requires explicit EXPO_PUBLIC_FIREBASE_${suffix}.`);
    }
    const expected = String(processValues.EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID || "").trim();
    if (!expected || values.PROJECT_ID !== expected) throw new Error("Production Firebase project does not match its expected binding.");
    if (values.PROJECT_ID === CUSTOMER_NON_PRODUCTION_FIREBASE_PROJECT_ID) throw new Error("Production cannot use the Development/Staging Firebase project.");
  }
  return {
    environment,
    apiKey: values.API_KEY,
    authDomain: values.AUTH_DOMAIN,
    projectId: values.PROJECT_ID,
    messagingSenderId: values.MESSAGING_SENDER_ID,
    appId: values.APP_ID,
    storageBucket: get("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    measurementId: get("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID"),
    databaseURL: get("EXPO_PUBLIC_FIREBASE_DATABASE_URL"),
  };
};
