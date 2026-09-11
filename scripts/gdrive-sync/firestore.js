const { db } = require('./config');

const LESSONS_COLLECTION = 'lessons';
const MODULES_COLLECTION = 'modules';

async function findModuleByTitle(courseId, title) {
  const snap = await db
    .collection(MODULES_COLLECTION)
    .where('course', '==', courseId)
    .where('title', '==', title)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

// 只回傳「打算做什麼」，實際寫入交給 index.js 依 dry-run / --apply 決定
async function upsertModule({ courseId, title, sort }) {
  const existing = await findModuleByTitle(courseId, title);
  if (existing) {
    return {
      action: 'SKIP',
      reason: '已存在同 title 的 module，沿用既有 id（不覆蓋 sort，避免蓋掉手動調整）',
      moduleId: existing.id,
    };
  }

  return {
    action: 'CREATE',
    reason: '找不到對應 module，準備建立新文件',
    data: { course: courseId, title, sort },
  };
}

async function createModule(data) {
  const ref = await db.collection(MODULES_COLLECTION).add(data);
  return ref.id;
}

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

// moduleId 沒給時退回舊行為（course+title），給了就一併比對 module——
// 同一門課不同章節共用相同單元標題（例如「自我延伸學習」「總結」）時，
// 沒有 module 條件會誤判成同一筆 lesson，導致後面的章節寫不進去、
// 只會不斷覆蓋前一個章節那筆的 driveFileId（曾在實際上傳時踩到，見
// Efforts/Areas/個人-線上學習平台維運/課程上傳規則.md 已知限制）。
async function findLessonByTitle(courseId, title, moduleId) {
  let query = db
    .collection(LESSONS_COLLECTION)
    .where('course', '==', courseId)
    .where('title', '==', title);
  if (moduleId) {
    query = query.where('module', '==', moduleId);
  }
  const snap = await query.limit(1).get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

// 只回傳「打算做什麼」，不實際寫入 Firestore；實際寫入交給 index.js 依 dry-run / --apply 決定
// module 只在 CREATE 時寫入；既有文件走 UPDATE 只補 driveFileId，不覆蓋手動填的欄位
async function upsertLesson({ courseId, title, sort, driveFileId, module }) {
  const byDriveId = await findLessonByDriveId(courseId, driveFileId);
  if (byDriveId) {
    return {
      action: 'SKIP',
      reason: 'driveFileId 已存在，視為已同步',
      lessonId: byDriveId.id,
    };
  }

  const byTitle = await findLessonByTitle(courseId, title, module);
  if (byTitle) {
    return {
      action: 'UPDATE',
      reason: '找到同 title 的既有 lesson，只補 driveFileId（保留手動填的 title/sort/module）',
      lessonId: byTitle.id,
      data: { driveFileId },
    };
  }

  const data = { course: courseId, title, sort, driveFileId };
  if (module) data.module = module;

  return {
    action: 'CREATE',
    reason: '找不到對應 lesson，準備建立新文件',
    data,
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
  findModuleByTitle,
  upsertModule,
  createModule,
  findLessonByDriveId,
  findLessonByTitle,
  upsertLesson,
  createLesson,
  updateLessonDriveId,
};
