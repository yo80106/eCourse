function parseFilename(fileName) {
  const base = fileName.replace(/\.(mp4|mov)$/i, '');

  const leadingDigits = base.match(/^(\d+)/);
  const sort = leadingDigits ? Number(leadingDigits[1]) : null;
  const rest = leadingDigits ? base.slice(leadingDigits[0].length) : base;

  const title = rest
    .replace(/_/g, ' ')
    .replace(/^[\s.\-]+/, '')
    .replace(/[\s.\-]+$/, '')
    .trim();

  return { sort, title };
}

module.exports = { parseFilename };
