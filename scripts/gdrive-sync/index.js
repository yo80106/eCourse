const fs = require('fs');
const path = require('path');

const { GDRIVE_FOLDER_ID } = require('./config');
const { listVideoFiles } = require('./gdrive');
const { parseFilename } = require('./parse');
const { upsertLesson, createLesson, updateLessonDriveId } = require('./firestore');

const STATE_PATH = path.join(__dirname, 'sync-state.json');

function parseArgs(argv) {
  const args = { course: null, apply: false, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--course') {
      args.course = argv[++i];
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
    }
  }
  return args;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.course) {
    console.error('用法：node index.js --course <courseId> [--apply] [--limit <n>]');
    process.exit(1);
  }

  console.log(`模式：${args.apply ? 'APPLY（會實際寫入 Firestore）' : 'DRY-RUN（只預覽，不寫入）'}`);
  console.log(`Course: ${args.course}`);
  console.log('');

  let files = await listVideoFiles(GDRIVE_FOLDER_ID);
  if (args.limit) {
    files = files.slice(0, args.limit);
  }

  const state = loadState();
  const previewRows = [];
  const summary = { CREATE: 0, UPDATE: 0, SKIP: 0, '已同步(本地狀態)': 0, ERROR: 0 };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progressPrefix = `[${i + 1}/${files.length}] ${file.name}`;

    if (state[file.id]?.status === 'COMPLETED') {
      console.log(`${progressPrefix} → 本地狀態紀錄已同步，跳過`);
      summary['已同步(本地狀態)']++;
      continue;
    }

    try {
      const { sort, title } = parseFilename(file.name);
      const plan = await upsertLesson({
        courseId: args.course,
        title,
        sort,
        driveFileId: file.id,
      });

      console.log(
        `${progressPrefix} → title="${title}" sort=${sort} → ${plan.action}`
      );

      previewRows.push({
        檔名: file.name,
        course: args.course,
        title,
        sort,
        driveFileId: file.id,
        預計動作: plan.action,
      });

      if (args.apply) {
        let lessonId = plan.lessonId;

        if (plan.action === 'CREATE') {
          lessonId = await createLesson(plan.data);
        } else if (plan.action === 'UPDATE') {
          await updateLessonDriveId(plan.lessonId, plan.data.driveFileId);
        }

        state[file.id] = {
          status: 'COMPLETED',
          action: plan.action,
          lessonId,
          fileName: file.name,
          syncedAt: new Date().toISOString(),
        };
        saveState(state);
      }

      summary[plan.action]++;
    } catch (err) {
      console.error(`${progressPrefix} → ERROR: ${err.message}`);
      summary.ERROR++;
    }
  }

  console.log('');
  if (!args.apply) {
    console.log('預覽表（dry-run，尚未寫入 Firestore）：');
    console.table(previewRows);
    console.log('確認無誤後，加上 --apply 旗標才會實際寫入。');
  } else {
    console.log('已套用完成。');
  }

  console.log('');
  console.log('統計：', summary);
}

main().catch((err) => {
  console.error('腳本執行失敗:', err);
  process.exit(1);
});
