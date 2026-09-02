import { writable } from "svelte/store";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

export const currentUser = writable(null);

onAuthStateChanged(auth, (user) => {
  currentUser.set(user);
});
