const { db } = require('./config');

const INVITED_EMAILS_COLLECTION = 'invitedEmails';
const COURSES_COLLECTION = 'courses';

function usage() {
  console.log(`
用法：node index.js <command> [args]

指令：
  list                          列出所有受邀 email
  list-courses                  列出所有課程 courseId + title
  invite <email>                新增受邀 email（不影響已存在的文件）
  show <email>                  顯示單一 email 是否在受邀名單中

注意：受邀者一律可見全部課程。「限縮特定課程」曾經嘗試過（invitedEmails.courses
與 courses.visibleTo 兩種寫法都試過），但已證實 Firestore rules 引擎對
「陣列成員比對 + 未加過濾的 list 查詢」不會逐筆過濾（2026-09-07 用 production
Firestore REST API 驗證：單筆 getDoc 正確擋絕，但 getDocs/runQuery 完全不過濾），
所以這個功能目前無法用 Firestore rules 實作，已移除相關指令。
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
    console.log(`${doc.id}  -  ${doc.data().title ?? '(無 title)'}`);
  });
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
