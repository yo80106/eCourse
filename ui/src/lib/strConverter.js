import slugify from "slugify";

// slugify the lesson title for use in the URL, falling back to the Firestore
// document ID when the title has no Latin-script characters to slugify (e.g.
// Traditional Chinese titles) -- otherwise slugify() returns an empty string
// and every such lesson's route collapses to "/", breaking navigation.
export function lessonSlug(lesson) {
  const slug = slugify(lesson.title, { lower: true, strict: true });
  return slug || lesson.id;
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
