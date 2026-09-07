import { writable, get } from "svelte/store";
import {
  collection,
  collectionGroup,
  getDocs,
  getDoc,
  doc,
  setDoc,
  query,
  where,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { showAlert } from "./store";

export const courses = writable([]);
export const modules = writable([]);
export const lessons = writable([]);
export const progress = writable([]);
export const resources = writable([]);
export const lesson_faqs = writable([]);
export const lesson_resources = writable([]);

// These stores are module-level (not component state), so they survive a
// logout/login within the same tab. Without an explicit reset, a
// permission-denied fetch for a newly signed-in (differently-scoped or
// uninvited) account leaves the *previous* account's data on screen instead
// of clearing it -- call this on sign-out so stale content never lingers.
export const resetRecords = () => {
  courses.set([]);
  modules.set([]);
  lessons.set([]);
  progress.set([]);
  resources.set([]);
  lesson_faqs.set([]);
  lesson_resources.set([]);
};

const getCollectionRecords = async (name) => {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));
};

// Courses default to `restricted: true` in firestore.rules, so a plain
// getDocs(collection(db,'courses')) rule can't grant access per-course --
// list() only reliably enforces a scalar equality condition
// (restricted == false), never an exists()-based per-document check. So
// this is a two-phase read instead of one query:
//   1. courses explicitly opened (restricted == false) -- a normal,
//      rules-filtered list query.
//   2. restricted courses the signed-in user has been individually
//      assigned -- discovered via a collectionGroup('assigned') query
//      (also rules-filtered, on the `email` field), then fetched one at a
//      time with getDoc() (get() enforces the exists() check correctly;
//      list() does not -- see firestore.rules for why).
// See Efforts/Projects/Active/個人-線上課程平台專案 for the failed prior
// attempts this design replaced.
const getCourseRecords = async () => {
  const email = auth.currentUser?.email?.toLowerCase();
  if (!email) return [];

  const openQuery = query(
    collection(db, "courses"),
    where("restricted", "==", false),
  );
  const assignedQuery = query(
    collectionGroup(db, "assigned"),
    where("email", "==", email),
  );

  const [openSnapshot, assignedSnapshot] = await Promise.all([
    getDocs(openQuery),
    getDocs(assignedQuery),
  ]);

  const openCourses = openSnapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));

  const assignedCourseIds = assignedSnapshot.docs.map(
    (docSnapshot) => docSnapshot.ref.parent.parent.id,
  );
  const assignedCourseSnapshots = await Promise.all(
    assignedCourseIds.map((courseId) => getDoc(doc(db, "courses", courseId))),
  );
  const assignedCourses = assignedCourseSnapshots
    .filter((docSnapshot) => docSnapshot.exists())
    .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }));

  return [...openCourses, ...assignedCourses];
};

// function to fetch all the records from Firestore
export const fetchRecords = async () => {
  try {
    const [
      courseRecords,
      lessonRecords,
      resourceRecords,
      lessonFaqsRecords,
      lessonResourcesRecords,
    ] = await Promise.all([
      getCourseRecords(),
      getCollectionRecords("lessons"),
      getCollectionRecords("resources"),
      getCollectionRecords("lesson_faqs"),
      getCollectionRecords("lesson_resources"),
    ]);

    let progressRecords = [];
    if (auth.currentUser) {
      const progressQuery = query(
        collection(db, "progress"),
        where("userId", "==", auth.currentUser.uid),
      );
      const progressSnapshot = await getDocs(progressQuery);
      progressRecords = progressSnapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }));
    }

    // Optional chapter grouping: fetched outside the Promise.all above so a
    // rules-deploy lag or missing collection can't take down course/lesson
    // loading too -- it just falls back to the ungrouped view.
    let moduleRecords = [];
    try {
      moduleRecords = await getCollectionRecords("modules");
    } catch (error) {
      moduleRecords = [];
    }

    // sorted once here so every consumer (course list, sidebar contents,
    // prev/next navigation) sees the same order without repeating this
    // logic; lessons without a `sort` value fall to the end, keeping their
    // relative fetch order (stable sort)
    lessonRecords.sort((a, b) => (a.sort ?? Infinity) - (b.sort ?? Infinity));

    courses.set(courseRecords);
    modules.set(moduleRecords);
    lessons.set(lessonRecords);
    progress.set(progressRecords);
    resources.set(resourceRecords);
    lesson_faqs.set(lessonFaqsRecords);
    lesson_resources.set(lessonResourcesRecords);
  } catch (error) {
    showAlert("Failed to load data. Please try again", "fail");
  }
};

// self-directed learning: progress documents only get created/updated when the
// user marks something themselves, never auto-assigned. So a course may not
// have a progress record yet when this is called.
//
// Doc ID is deterministic (`{uid}_{courseId}`) rather than auto-generated, so
// there is exactly one progress doc per (user, course) -- this is also
// enforced at the firestore.rules layer, closing off unbounded doc creation.
//
// `completedLessons` is optional: omit it to leave whichever lessons were
// already checked off untouched (write uses merge: true), or pass an array
// (including []) to explicitly set it -- e.g. Reset Progress clears it.
export const setCourseProgress = async (courseId, newStatus, completedLessons) => {
  try {
    const uid = auth.currentUser.uid;
    const progressId = `${uid}_${courseId}`;
    const existing = get(progress).find((record) => record.course === courseId);
    const resolvedCompletedLessons =
      completedLessons !== undefined ? completedLessons : existing?.completedLessons;

    const payload = { userId: uid, course: courseId, status: newStatus };
    if (resolvedCompletedLessons !== undefined) {
      payload.completedLessons = resolvedCompletedLessons;
    }

    await setDoc(doc(db, "progress", progressId), payload, { merge: true });
    return { id: progressId, ...payload };
  } catch (error) {
    showAlert("Failed to update course status. Please try again", "fail");
    return null;
  }
};

// merge a progress record into the local store, whether it's a new record or
// an update to an existing one
export const upsertLocalProgress = (record) => {
  progress.update((records) => {
    const index = records.findIndex((r) => r.course === record.course);
    if (index >= 0) {
      const updated = [...records];
      updated[index] = record;
      return updated;
    }
    return [...records, record];
  });
};
