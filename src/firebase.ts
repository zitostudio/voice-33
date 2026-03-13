import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getDatabase, ref, get, set, child, onValue } from 'firebase/database';

// Import the Firebase configuration
import firebaseConfig from '../firebase-applet-config.json';

export { firebaseConfig };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app, firebaseConfig.databaseURL);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface RTDBErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  }
}

export function handleRTDBError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: RTDBErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firebase RTDB Error: ', JSON.stringify(errInfo));
  // Don't throw if it's just a permission denied during connection test or initial load
  if (path === 'test/connection' || !auth.currentUser) return;
  throw new Error(JSON.stringify(errInfo));
}

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = () => signOut(auth);

// Connection test using the special .info/connected path (no permissions required)
async function testConnection() {
  try {
    const connectedRef = ref(db, ".info/connected");
    onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        console.log("Connected to Firebase Realtime Database");
      } else {
        console.log("Disconnected from Firebase Realtime Database");
      }
    }, (error) => {
      handleRTDBError(error, OperationType.GET, ".info/connected");
    });
  } catch (error: any) {
    handleRTDBError(error, OperationType.GET, ".info/connected");
  }
}
testConnection();
