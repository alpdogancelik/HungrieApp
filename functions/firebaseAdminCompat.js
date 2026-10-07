// Modular Firebase Admin v14 adapter for legacy maintenance scripts. Keeping the
// small compatibility surface here avoids duplicating SDK migration code across
// scripts while all calls are backed by the supported v14 public APIs.
const {
  cert,
  getApp,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const {
  DocumentReference,
  FieldPath,
  FieldValue,
  GeoPoint,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");

const firestore = () => getFirestore();
Object.assign(firestore, {
  DocumentReference,
  FieldPath,
  FieldValue,
  GeoPoint,
  Timestamp,
});

const firebaseAdmin = {
  app: getApp,
  auth: getAuth,
  credential: { cert },
  firestore,
  initializeApp,
};

Object.defineProperty(firebaseAdmin, "apps", {
  enumerable: true,
  get: getApps,
});

module.exports = firebaseAdmin;
