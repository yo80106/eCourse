const { drive } = require('./config');

const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'];

async function listVideoFiles(folderId) {
  const mimeQuery = VIDEO_MIME_TYPES.map((type) => `mimeType = '${type}'`).join(
    ' or '
  );
  const query = `'${folderId}' in parents and trashed = false and (${mimeQuery})`;

  const files = [];
  let pageToken;

  do {
    const res = await drive.files.list({
      q: query,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 100,
      pageToken,
    });

    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return files;
}

module.exports = { listVideoFiles, VIDEO_MIME_TYPES };
