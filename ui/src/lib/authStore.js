import { writable } from "svelte/store";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

export const currentUser = writable(null);

// onAuthStateChanged resolves asynchronously (it reads persisted session state
// from IndexedDB), so currentUser is null for a brief moment on every page
// load/refresh even when the user is actually still logged in. Routes must
// wait for authReady before treating a null currentUser as "logged out".
export const authReady = writable(false);

onAuthStateChanged(auth, (user) => {
  currentUser.set(user);
  authReady.set(true);
});
