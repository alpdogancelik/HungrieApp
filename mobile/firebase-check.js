// Quick Firebase connectivity check for Firestore "menus" collection.
// Run from the mobile directory: `node firebase-check.js`

const { initializeApp } = require("firebase/app");
const { getAuth, signInAnonymously } = require("firebase/auth");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const appConfig = require("./app.json");

const extra = (appConfig?.expo?.extra) || {};

const firebaseConfig = {
    apiKey: extra.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: extra.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: extra.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: extra.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: extra.EXPO_PUBLIC_FIREBASE_APP_ID,
    measurementId: extra.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
    databaseURL: extra.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
};

async function main() {
    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        await signInAnonymously(auth);
        const db = getFirestore(app);
        const snap = await getDocs(collection(db, "menus"));
        console.log("Firestore connected. menus count:", snap.size);
        snap.docs.slice(0, 3).forEach((docSnap, idx) => {
            console.log(`#${idx + 1}:`, docSnap.id, docSnap.data());
        });
    } catch (error) {
        console.error("Firebase check failed:", error?.message || error);
        process.exitCode = 1;
    }
}

main();
