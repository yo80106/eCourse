const { db } = require('./config');

const INVITED_EMAILS_COLLECTION = 'invitedEmails';
const COURSES_COLLECTION = 'courses';

function usage() {
  console.log(`
用法：node index.js <command> [args]

指令：
  list                          列出所有受邀 email + 各自可見課程（無 courses 欄位 = 全部課程）
  list-courses                  列出所有課程 courseId + title，方便挑選要限縮的對象
  invite <email>                新增受邀 email（不影響已存在的文件）
  show <email>                  顯示單一 email 的邀請狀態
  set-courses <email> <id1,id2> 限縮該 email 只能看到清單內的課程
  clear-courses <email>         移除限縮，恢復成看到全部課程
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
    const data = doc.data();
    const scope = Array.isArray(data.courses)
      ? `限縮：${data.courses.join(', ')}`
      : '全部課程';
    console.log(`${doc.id}  -  ${scope}`);
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
  if (!snap.exists) {
    console.log(`${id} 不在受邀名單中。`);
    return;
  }
  const data = snap.data();
  if (Array.isArray(data.courses)) {
    console.log(`${id}：限縮可見課程 = ${data.courses.join(', ')}`);
  } else {
    console.log(`${id}：可見全部課程（未限縮）`);
  }
}

async function setCourses(email, courseIdsArg) {
  if (!email || !courseIdsArg) return usage();
  const id = docId(email);
  const ref = db.collection(INVITED_EMAILS_COLLECTION).doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    console.error(`${id} 不在受邀名單中，請先跑 invite <email>。`);
    process.exit(1);
  }
  const courseIds = courseIdsArg.split(',').map((s) => s.trim()).filter(Boolean);
  await ref.set({ courses: courseIds }, { merge: true });
  console.log(`已將 ${id} 限縮為只能看到：${courseIds.join(', ')}`);
}

async function clearCourses(email) {
  if (!email) return usage();
  const id = docId(email);
  const ref = db.collection(INVITED_EMAILS_COLLECTION).doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    console.error(`${id} 不在受邀名單中。`);
    process.exit(1);
  }
  const { FieldValue } = require('firebase-admin/firestore');
  await ref.update({ courses: FieldValue.delete() });
  console.log(`已移除 ${id} 的限縮，恢復成可見全部課程。`);
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
    case 'set-courses':
      return setCourses(rest[0], rest[1]);
    case 'clear-courses':
      return clearCourses(rest[0]);
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
