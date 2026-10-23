import { getApp, getApps, initializeApp } from "firebase/app";
import { collection, getFirestore, onSnapshot } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function subscribeToReaderBooks(onBooks, onError) {
  if (!config.apiKey || !config.projectId) {
    throw new Error("Firebase configuration is missing. Set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
  }

  const app = getApps().length ? getApp() : initializeApp(config);
  const database = getFirestore(app);
  return onSnapshot(
    collection(database, "shortStory"),
    (snapshot) => {
      onBooks(snapshot.docs.map((document) => {
        const data = document.data();
        return {
          ...data,
          id: `shortStory:${document.id}`,
          documentId: document.id,
          sourceCollection: "shortStory",
          title: data.title || "নামহীন বই",
          author: data.writer || data.author || "",
          artwork: data.artwork || data.cover || "",
          fileUrl: data.fileUrl || data.bookUrl || data.textUrl || "",
          source: "firestore",
        };
      }));
    },
    onError,
  );
}
