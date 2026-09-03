import slugify from "slugify";

// slugify the lesson title for use in the URL, always suffixed with the
// Firestore document ID to guarantee uniqueness. slugify()'s charmap only
// transliterates a handful of CJK characters (e.g. "元" -> "yuan") and drops
// the rest under strict mode, so two unrelated Traditional Chinese titles
// like "單元 1 - ..." and "單元 1 - ..." can both reduce to "yuan-1" -- the
// id suffix is what actually keeps routes from colliding.
export function lessonSlug(lesson) {
  const slug = slugify(lesson.title, { lower: true, strict: true });
  return slug ? `${slug}-${lesson.id}` : lesson.id;
}

// function to clean up the download file names from PB
export function cleanFileName(inputFileName) {
  let cleanedFileName =
    inputFileName.charAt(0).toUpperCase() + inputFileName.slice(1);

  cleanedFileName = cleanedFileName.replace(/_/g, " ");

  const dotIndex = cleanedFileName.lastIndexOf(".");
  if (dotIndex !== -1 && dotIndex >= 11) {
    cleanedFileName =
      cleanedFileName.slice(0, dotIndex - 11) + cleanedFileName.slice(dotIndex);
  }

  return cleanedFileName;
}
