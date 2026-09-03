const { db } = require('./config');

const LESSONS_COLLECTION = 'lessons';

async function findLessonByDriveId(courseId, driveFileId) {
  const snap = await db
    .collection(LESSONS_COLLECTION)
    .where('course', '==', courseId)
    .where('driveFileId', '==', driveFileId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function findLessonByTitle(courseId, title) {
  const snap = await db
    .collection(LESSONS_COLLECTION)
    .where('course', '==', courseId)
    .where('title', '==', title)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

// 只回傳「打算做什麼」，不實際寫入 Firestore；實際寫入交給 index.js 依 dry-run / --apply 決定
async function upsertLesson({ courseId, title, sort, driveFileId }) {
  const byDriveId = await findLessonByDriveId(courseId, driveFileId);
  if (byDriveId) {
    return {
      action: 'SKIP',
      reason: 'driveFileId 已存在，視為已同步',
      lessonId: byDriveId.id,
    };
  }

  const byTitle = await findLessonByTitle(courseId, title);
  if (byTitle) {
    return {
      action: 'UPDATE',
      reason: '找到同 title 的既有 lesson，只補 driveFileId（保留手動填的 title/sort）',
      lessonId: byTitle.id,
      data: { driveFileId },
    };
  }

  return {
    action: 'CREATE',
    reason: '找不到對應 lesson，準備建立新文件',
    data: { course: courseId, title, sort, driveFileId },
  };
}

// 實際寫入：交給 index.js 在 --apply 模式下呼叫
async function createLesson(data) {
  const ref = await db.collection(LESSONS_COLLECTION).add(data);
  return ref.id;
}

async function updateLessonDriveId(lessonId, driveFileId) {
  await db
    .collection(LESSONS_COLLECTION)
    .doc(lessonId)
    .update({ driveFileId });
}

module.exports = {
  findLessonByDriveId,
  findLessonByTitle,
  upsertLesson,
  createLesson,
  updateLessonDriveId,
};
