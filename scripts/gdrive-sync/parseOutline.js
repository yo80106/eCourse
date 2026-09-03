// 純文字課程大綱格式，兩種寫法皆可、可混用：
//   1) "-" 開頭的行            -> 目前 module 底下的一個 lesson（單元）標題
//      不是 "-" 開頭的非空白行 -> 新的 module（章節）標題
//   2) "單元 N - xxx" 開頭的行 -> lesson，自動去掉「單元 N - 」前綴
//      "章節 N - xxx" 開頭的行 -> module，自動去掉「章節 N - 」前綴
//   空白行 -> 忽略
//
// 範例：
//   第一章：新人融入
//   - 認識公司文化
//   - 第一週該做的事
//
//   章節 2 - 溝通技巧
//   單元 1 - 書信往來篇
const LESSON_PREFIX = /^(?:-\s*|單元\s*\d+\s*[-.:：]?\s*)/;
const MODULE_PREFIX = /^章節\s*\d+\s*[-.:：]?\s*/;

function parseOutline(text) {
  const modules = [];
  let current = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (LESSON_PREFIX.test(line)) {
      const title = line.replace(LESSON_PREFIX, '').trim();
      if (!title) continue;
      if (!current) {
        throw new Error(
          `大綱格式錯誤：lesson「${title}」出現在還沒有任何 module 標題之前`
        );
      }
      current.lessons.push({ title });
    } else {
      const title = line.replace(MODULE_PREFIX, '').trim();
      current = { title, lessons: [] };
      modules.push(current);
    }
  }

  const emptyModule = modules.find((m) => m.lessons.length === 0);
  if (emptyModule) {
    throw new Error(`大綱格式錯誤：module「${emptyModule.title}」底下沒有任何 lesson`);
  }

  return modules;
}

function flattenLessons(modules) {
  const flat = [];
  modules.forEach((module, moduleIndex) => {
    module.lessons.forEach((lesson, lessonIndex) => {
      flat.push({
        moduleTitle: module.title,
        moduleSort: moduleIndex + 1,
        title: lesson.title,
        sort: lessonIndex + 1,
      });
    });
  });
  return flat;
}

module.exports = { parseOutline, flattenLessons };
