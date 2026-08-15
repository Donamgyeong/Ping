/**
 * Checks if a given file is in HEIC/HEIF format and converts it to JPEG in the browser.
 * Non-HEIC files (PNG, JPG, GIF, WebP, etc.) are returned untouched.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  if (typeof window === "undefined") {
    return file;
  }

  const fileNameLower = file.name.toLowerCase();
  const fileTypeLower = (file.type || "").toLowerCase();

  const isHeic =
    fileNameLower.endsWith(".heic") ||
    fileNameLower.endsWith(".heif") ||
    fileTypeLower === "image/heic" ||
    fileTypeLower === "image/heif" ||
    fileTypeLower.includes("heic") ||
    fileTypeLower.includes("heif");

  if (!isHeic) {
    return file;
  }

  try {
    // 1. Read arrayBuffer and construct a Blob with explicit "image/heic" type.
    // This fixes issues where browsers (e.g. Windows/Chrome) pass file.type as "" for .heic files.
    const arrayBuffer = await file.arrayBuffer();
    const heicBlob = new Blob([arrayBuffer], { type: "image/heic" });

    // 2. Dynamically import heic2any safely
    const heic2anyModule = await import("heic2any");
    const heic2any =
      typeof heic2anyModule.default === "function"
        ? heic2anyModule.default
        : typeof heic2anyModule === "function"
        ? heic2anyModule
        : (heic2anyModule as any);

    // 3. Convert HEIC blob to JPEG
    const conversionResult = await heic2any({
      blob: heicBlob,
      toType: "image/jpeg",
      quality: 0.9,
      multiple: false,
    });

    const resultBlob = Array.isArray(conversionResult)
      ? conversionResult[0]
      : conversionResult;

    const newFileName = file.name.replace(/\.(heic|heif)$/i, ".jpg");

    return new File([resultBlob], newFileName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error("Failed to convert HEIC image client-side:", error);
    throw new Error(`HEIC conversion failed for ${file.name}`);
  }
}

/**
 * Convenience function to process a list or array of Files, converting any HEIC files to JPEG.
 */
export async function processImageFiles(files: File[]): Promise<File[]> {
  const convertedFiles: File[] = [];
  for (const file of files) {
    try {
      const converted = await convertHeicToJpeg(file);
      convertedFiles.push(converted);
    } catch (err) {
      console.warn(`Skipping file ${file.name} due to conversion failure:`, err);
    }
  }
  return convertedFiles;
}
