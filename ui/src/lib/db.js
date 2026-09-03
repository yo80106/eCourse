import { writable } from "svelte/store";
import {
  collection,
  getDocs,
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

const getCollectionRecords = async (name) => {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));
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
      getCollectionRecords("courses"),
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
export const setCourseProgress = async (courseId, newStatus) => {
  try {
    const uid = auth.currentUser.uid;
    const progressId = `${uid}_${courseId}`;
    await setDoc(doc(db, "progress", progressId), {
      userId: uid,
      course: courseId,
      status: newStatus,
    });
    return { id: progressId, userId: uid, course: courseId, status: newStatus };
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
