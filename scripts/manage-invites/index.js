const { db } = require('./config');

const INVITED_EMAILS_COLLECTION = 'invitedEmails';
const COURSES_COLLECTION = 'courses';
const ASSIGNED_SUBCOLLECTION = 'assigned';

function usage() {
  console.log(`
用法：node index.js <command> [args]

指令：
  list                          列出所有受邀 email
  list-courses                  列出所有課程 courseId + title + restricted 狀態
  invite <email>                新增受邀 email（不影響已存在的文件）
  show <email>                  顯示單一 email 是否在受邀名單中

  migrate-restrict-all          一次性：把所有還沒有 restricted 欄位的課程設為
                                 restricted: true（新版可見性控制的必要 migration，
                                 執行前請見下方說明）
  restrict <courseId>           把課程設為 restricted: true（限制，只有 assigned 名單能看）
  open <courseId>                把課程設為 restricted: false（開放，所有受邀者都能看）
  assign <courseId> <email>      把 email 加進該課程的 assigned 名單
  unassign <courseId> <email>    把 email 從該課程的 assigned 名單移除
  list-assigned <courseId>       列出該課程 assigned 名單

課程可見性控制（第三版，2026-09-08）：courses 一律要有明確的 restricted 欄位
（true=限制／false=開放），沒有「欄位不存在＝開放」這種預設，因為 Firestore 的
list() 查詢只能可靠地對純量欄位做相等比對過濾，做不到「欄位不存在」這種條件。
courses 預設 restricted: true——新建課程、或還沒跑過 migrate-restrict-all 的
既有課程，在受邀者眼中都是「看不到」，直到手動 assign 或 open 為止。
lessons/modules 維持不過濾，只有 courses 這層有限制（防君子不防小人，細節見
Efforts/Projects/Active/個人-線上課程平台專案）。
`);
}

function docId(email) {
  return email.trim().toLowerCase();
}

async function list() {
  const snap = await db.collection(INVITED_EMAILS_COLLECTION).get();
  if (snap.empty) {
    console.log('目前沒有任何受邀 email。');
    return;
  }
  snap.docs.forEach((doc) => {
    console.log(doc.id);
  });
}

async function listCourses() {
  const snap = await db.collection(COURSES_COLLECTION).get();
  if (snap.empty) {
    console.log('目前沒有任何課程。');
    return;
  }
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const status =
      !('restricted' in data)
        ? '(尚未設定 restricted，受邀者一律看不到，先跑 migrate-restrict-all)'
        : data.restricted
          ? 'restricted'
          : 'open';
    console.log(`${doc.id}  -  ${data.title ?? '(無 title)'}  [${status}]`);
  });
}

async function migrateRestrictAll() {
  const snap = await db.collection(COURSES_COLLECTION).get();
  const toMigrate = snap.docs.filter((doc) => !('restricted' in doc.data()));
  if (toMigrate.length === 0) {
    console.log('所有課程都已經有 restricted 欄位，不用 migrate。');
    return;
  }
  const batch = db.batch();
  toMigrate.forEach((doc) => {
    batch.update(doc.ref, { restricted: true });
  });
  await batch.commit();
  console.log(`已把 ${toMigrate.length} 門課設為 restricted: true：`);
  toMigrate.forEach((doc) => console.log(`  ${doc.id}  -  ${doc.data().title ?? '(無 title)'}`));
  console.log('\n這些課程在手動 assign 或 open 之前，受邀者都看不到，請確認這是預期行為。');
}

async function setRestricted(courseId, restricted) {
  if (!courseId) return usage();
  const ref = db.collection(COURSES_COLLECTION).doc(courseId);
  const existing = await ref.get();
  if (!existing.exists) {
    console.log(`找不到課程 ${courseId}。`);
    return;
  }
  await ref.update({ restricted });
  console.log(`已把課程 ${courseId} 設為 restricted: ${restricted}`);
}

async function assign(courseId, email) {
  if (!courseId || !email) return usage();
  const courseRef = db.collection(COURSES_COLLECTION).doc(courseId);
  const existing = await courseRef.get();
  if (!existing.exists) {
    console.log(`找不到課程 ${courseId}。`);
    return;
  }
  const id = docId(email);
  await courseRef.collection(ASSIGNED_SUBCOLLECTION).doc(id).set({ email: id });
  console.log(`已把 ${id} 加進課程 ${courseId} 的 assigned 名單。`);
}

async function unassign(courseId, email) {
  if (!courseId || !email) return usage();
  const id = docId(email);
  await db
    .collection(COURSES_COLLECTION)
    .doc(courseId)
    .collection(ASSIGNED_SUBCOLLECTION)
    .doc(id)
    .delete();
  console.log(`已把 ${id} 從課程 ${courseId} 的 assigned 名單移除。`);
}

async function listAssigned(courseId) {
  if (!courseId) return usage();
  const snap = await db
    .collection(COURSES_COLLECTION)
    .doc(courseId)
    .collection(ASSIGNED_SUBCOLLECTION)
    .get();
  if (snap.empty) {
    console.log(`課程 ${courseId} 目前沒有任何 assigned email。`);
    return;
  }
  snap.docs.forEach((doc) => console.log(doc.id));
}

async function invite(email) {
  if (!email) return usage();
  const id = docId(email);
  const ref = db.collection(INVITED_EMAILS_COLLECTION).doc(id);
  const existing = await ref.get();
  if (existing.exists) {
    console.log(`${id} 已在受邀名單中，未變動。`);
    return;
  }
  await ref.set({});
  console.log(`已新增受邀 email：${id}`);
}

async function show(email) {
  if (!email) return usage();
  const id = docId(email);
  const snap = await db.collection(INVITED_EMAILS_COLLECTION).doc(id).get();
  console.log(snap.exists ? `${id} 在受邀名單中。` : `${id} 不在受邀名單中。`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'list':
      return list();
    case 'list-courses':
      return listCourses();
    case 'invite':
      return invite(rest[0]);
    case 'show':
      return show(rest[0]);
    case 'migrate-restrict-all':
      return migrateRestrictAll();
    case 'restrict':
      return setRestricted(rest[0], true);
    case 'open':
      return setRestricted(rest[0], false);
    case 'assign':
      return assign(rest[0], rest[1]);
    case 'unassign':
      return unassign(rest[0], rest[1]);
    case 'list-assigned':
      return listAssigned(rest[0]);
    default:
      return usage();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
