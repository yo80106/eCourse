const { drive } = require('./config');

const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'];

async function listFiles(folderId, query) {
  const files = [];
  let pageToken;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (${query})`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 100,
      pageToken,
    });

    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return files;
}

async function listVideoFiles(folderId) {
  const mimeQuery = VIDEO_MIME_TYPES.map((type) => `mimeType = '${type}'`).join(
    ' or '
  );
  return listFiles(folderId, mimeQuery);
}

// Drive 對 .srt 檔案回報的 mimeType 不固定（常見 text/plain 或 application/octet-stream），
// 用檔名 contains '.srt' 篩選比較可靠
async function listSrtFiles(folderId) {
  return listFiles(folderId, "name contains '.srt'");
}

module.exports = { listVideoFiles, listSrtFiles, VIDEO_MIME_TYPES };
