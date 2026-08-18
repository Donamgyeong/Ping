/**
 * Upload a file to storage following the 3-step workflow:
 * 1. Request presigned upload URL from backend (GET /file/upload/url)
 * 2. PUT file directly to the presigned URL with Content-Type
 * 3. Complete pending upload on backend (GET /file/upload/{fid}/complete)
 *
 * @param file The file or blob to upload
 * @param token The user's auth token
 * @param isPrivate Whether the file is private
 * @returns The unique file ID (fid)
 */
export async function uploadFile(
  file: File | Blob,
  token: string,
  isPrivate: boolean = false
): Promise<string> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // 1. Get presigned upload URL
  const urlRes = await fetch(`${API_URL}/file/upload/url?private=${isPrivate}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!urlRes.ok) {
    const errData = await urlRes.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to get upload URL.");
  }

  const urlData = await urlRes.json();
  const uploadUrl = urlData.url;
  if (!uploadUrl) {
    throw new Error("Upload URL not received from server.");
  }

  // Extract fid from the presigned URL pathname (e.g. /bucket/fid)
  const parsedUrl = new URL(uploadUrl);
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const fid = segments[segments.length - 1];

  if (!fid) {
    throw new Error("Failed to determine file ID from upload URL.");
  }

  // 2. PUT file directly to the presigned upload URL
  const contentType = file.type || "image/jpeg";
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error("Failed to upload file to storage.");
  }

  // 3. Notify backend that upload is complete
  const completeRes = await fetch(`${API_URL}/file/upload/${fid}/complete`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!completeRes.ok) {
    const completeErr = await completeRes.json().catch(() => ({}));
    throw new Error(completeErr.detail || "Failed to complete upload.");
  }

  return fid;
}

interface FileUrlCacheEntry {
  url: string;
  validUntil: number;
}

const fileUrlCache = new Map<string, FileUrlCacheEntry>();

/**
 * Fetch a presigned download URL for a file/thumbnail
 *
 * @param fid File ID
 * @param token User's auth token
 * @param thumbnail Whether to request the thumbnail version
 * @returns The presigned download URL string, or null if failed
 */
export async function getFileUrl(
  fid: string,
  token: string,
  thumbnail: boolean = false
): Promise<string | null> {
  if (!fid || !token) return null;

  const cacheKey = `${fid}:${thumbnail}`;
  const cached = fileUrlCache.get(cacheKey);
  if (cached && cached.validUntil - Date.now() > 30000) {
    return cached.url;
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  try {
    const res = await fetch(
      `${API_URL}/file/get/${fid}${thumbnail ? "?thumbnail=true" : ""}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (data.result === "success" && data.url) {
      const validUntilMs = data.valid_until
        ? new Date(data.valid_until).getTime()
        : Date.now() + 5 * 60 * 1000;

      fileUrlCache.set(cacheKey, {
        url: data.url,
        validUntil: validUntilMs,
      });

      return data.url;
    }
  } catch (err) {
    console.error(`Failed to get download URL for file ${fid}:`, err);
  }

  return null;
}
