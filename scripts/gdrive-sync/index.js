const fs = require('fs');
const path = require('path');

const { GDRIVE_FOLDER_ID } = require('./config');
const { listVideoFiles, listSrtFiles } = require('./gdrive');
const { parseFilename } = require('./parse');
const { parseOutline, flattenLessons } = require('./parseOutline');
const {
  upsertLesson,
  createLesson,
  updateLessonDriveId,
  upsertModule,
  createModule,
} = require('./firestore');

const STATE_PATH = path.join(__dirname, 'sync-state.json');

function parseArgs(argv) {
  const args = { course: null, apply: false, limit: null, folder: null, outline: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--course') {
      args.course = argv[++i];
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
    } else if (arg === '--folder') {
      args.folder = argv[++i];
    } else if (arg === '--outline') {
      args.outline = argv[++i];
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

function stem(fileName) {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase();
}

// 先試檔名（去副檔名）完全相同，找不到再退而求其次比對檔名開頭數字
function matchSrt(videoFile, srtFiles) {
  const videoStem = stem(videoFile.name);
  const exact = srtFiles.find((f) => stem(f.name) === videoStem);
  if (exact) return { file: exact, confidence: 'exact' };

  const { sort: videoSort } = parseFilename(videoFile.name);
  if (videoSort == null) return null;

  const byNumber = srtFiles.find((f) => {
    const leading = f.name.match(/^(\d+)/);
    return leading && Number(leading[1]) === videoSort;
  });
  if (byNumber) return { file: byNumber, confidence: 'number' };

  return null;
}

// ---- 舊流程：單一資料夾內影片檔名 = lesson 名稱，無 module，無大綱 ----
async function runFlatMode(args) {
  const folderId = args.folder || GDRIVE_FOLDER_ID;
  console.log(`模式：${args.apply ? 'APPLY（會實際寫入 Firestore）' : 'DRY-RUN（只預覽，不寫入）'}（flat）`);
  console.log(`Course: ${args.course}`);
  console.log('');

  let files = await listVideoFiles(folderId);
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

      console.log(`${progressPrefix} → title="${title}" sort=${sort} → ${plan.action}`);

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

// ---- 新流程：--outline 純文字大綱驅動，先建 module 再依序把影片配對進 lesson ----
async function runOutlineMode(args) {
  const folderId = args.folder || GDRIVE_FOLDER_ID;
  console.log(`模式：${args.apply ? 'APPLY（會實際寫入 Firestore）' : 'DRY-RUN（只預覽，不寫入）'}（outline）`);
  console.log(`Course: ${args.course}`);
  console.log(`Folder: ${folderId}`);
  console.log('');

  const outlineText = fs.readFileSync(path.resolve(args.outline), 'utf-8');
  const modules = parseOutline(outlineText);
  const flatLessons = flattenLessons(modules);

  const [videoFiles, srtFiles] = await Promise.all([
    listVideoFiles(folderId),
    listSrtFiles(folderId),
  ]);

  const parsedVideos = videoFiles.map((file) => ({
    file,
    ...parseFilename(file.name),
  }));

  const missingSort = parsedVideos.filter((v) => v.sort == null);
  if (missingSort.length > 0) {
    console.error('以下影片檔名抓不到開頭數字，無法決定順序，請先重新命名再重跑：');
    missingSort.forEach((v) => console.error(`  - ${v.file.name}`));
    process.exit(1);
  }

  parsedVideos.sort((a, b) => a.sort - b.sort);

  if (parsedVideos.length !== flatLessons.length) {
    console.error(
      `數量對不上：大綱有 ${flatLessons.length} 個 lesson，資料夾裡有 ${parsedVideos.length} 支影片。`
    );
    console.error('');
    console.error('大綱清單（依序）：');
    flatLessons.forEach((l, i) => console.error(`  ${i + 1}. [${l.moduleTitle}] ${l.title}`));
    console.error('');
    console.error('影片清單（依檔名開頭數字排序）：');
    parsedVideos.forEach((v, i) => console.error(`  ${i + 1}. ${v.file.name} (sort=${v.sort})`));
    console.error('');
    console.error('請確認大綱或資料夾內容後再重跑，不會自動猜測配對。');
    process.exit(1);
  }

  const state = loadState();
  const previewRows = [];
  const captionChecklist = [];
  const summary = { CREATE: 0, UPDATE: 0, SKIP: 0, '已同步(本地狀態)': 0, ERROR: 0 };

  const moduleIdByTitle = {};

  for (const module of modules) {
    const plan = await upsertModule({
      courseId: args.course,
      title: module.title,
      sort: flatLessons.find((l) => l.moduleTitle === module.title).moduleSort,
    });

    let moduleId = plan.moduleId;
    if (args.apply && plan.action === 'CREATE') {
      moduleId = await createModule(plan.data);
    }

    moduleIdByTitle[module.title] = moduleId || '(dry-run 尚未建立)';
    console.log(`[module] ${module.title} → ${plan.action}${plan.reason ? '（' + plan.reason + '）' : ''}`);
  }
  console.log('');

  for (let i = 0; i < flatLessons.length; i++) {
    const lesson = flatLessons[i];
    const video = parsedVideos[i];
    const file = video.file;
    const progressPrefix = `[${i + 1}/${flatLessons.length}] ${file.name}`;

    const srtMatch = matchSrt(file, srtFiles);
    captionChecklist.push({
      影片: file.name,
      字幕檔: srtMatch ? srtMatch.file.name : '⚠ 未找到',
      配對信心: srtMatch ? srtMatch.confidence : '-',
    });

    if (state[file.id]?.status === 'COMPLETED') {
      console.log(`${progressPrefix} → 本地狀態紀錄已同步，跳過`);
      summary['已同步(本地狀態)']++;
      continue;
    }

    try {
      const plan = await upsertLesson({
        courseId: args.course,
        title: lesson.title,
        sort: lesson.sort,
        driveFileId: file.id,
        module: moduleIdByTitle[lesson.moduleTitle],
      });

      console.log(
        `${progressPrefix} → [${lesson.moduleTitle}] title="${lesson.title}" sort=${lesson.sort} → ${plan.action}`
      );

      previewRows.push({
        章節: lesson.moduleTitle,
        單元: lesson.title,
        影片檔名: file.name,
        字幕: srtMatch ? srtMatch.file.name : '⚠ 未找到',
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

  console.log('');
  console.log(
    '字幕手動掛載檢查清單（Google Drive API 沒有公開的 caption 端點，只能在 Drive UI 手動上傳——右鍵影片 → 檔案資訊 → 管理字幕軌）：'
  );
  console.table(captionChecklist);
  const missing = captionChecklist.filter((row) => row.字幕檔.startsWith('⚠'));
  if (missing.length > 0) {
    console.log(`⚠ ${missing.length} 支影片找不到對應字幕檔，需要人工確認檔名。`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.course) {
    console.error(
      '用法：\n' +
        '  舊流程（無 module）：node index.js --course <courseId> [--folder <folderId>] [--apply] [--limit <n>]\n' +
        '  新流程（大綱驅動）：node index.js --course <courseId> --outline <path> [--folder <folderId>] [--apply]'
    );
    process.exit(1);
  }

  if (args.outline) {
    await runOutlineMode(args);
  } else {
    await runFlatMode(args);
  }
}

main().catch((err) => {
  console.error('腳本執行失敗:', err);
  process.exit(1);
});
