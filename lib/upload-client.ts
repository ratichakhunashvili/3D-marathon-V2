/**
 * Browser side of the upload. The bytes go straight from the student's machine to Google,
 * never through this app's server — Vercel would reject anything over 4.5 MB.
 *
 * Uploads are chunked so that a dropped Wi-Fi connection halfway through a 120 MB .blend
 * resumes from the last confirmed byte instead of starting over.
 */

const CHUNK = 8 * 1024 * 1024; // must be a multiple of 256 KB per Drive's resumable protocol
const MAX_ATTEMPTS = 4;

export type ProgressFn = (uploadedBytes: number) => void;

type ChunkResult = { done: true; driveFileId: string } | { done: false; nextByte: number };

function putChunk(
  sessionUrl: string,
  body: Blob,
  start: number,
  total: number,
  onProgress: ProgressFn,
): Promise<ChunkResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", sessionUrl, true);
    const end = start + body.size - 1;
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end}/${total}`);

    // fetch() cannot report upload progress, which is the only reason this uses XHR.
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(start + event.loaded);
    };

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText) as { id?: string };
          if (!data.id) return reject(new Error("Drive did not return a file id"));
          onProgress(total);
          return resolve({ done: true, driveFileId: data.id });
        } catch {
          return reject(new Error("Could not read Drive's response"));
        }
      }

      if (xhr.status === 308) {
        // Drive reports what it actually stored; trust that over our own counter.
        const range = xhr.getResponseHeader("Range");
        const confirmed = range ? Number(range.split("-")[1]) + 1 : end + 1;
        onProgress(confirmed);
        return resolve({ done: false, nextByte: confirmed });
      }

      reject(new Error(`Upload failed (${xhr.status}) ${xhr.responseText.slice(0, 200)}`));
    };

    xhr.onerror = () => reject(new Error("network"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.send(body);
  });
}

/** Asks Drive how much of this session it already holds, so an interrupted upload can resume. */
async function confirmedByte(sessionUrl: string, total: number): Promise<number> {
  const res = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${total}` },
  });
  if (res.status === 200 || res.status === 201) return total;
  if (res.status === 308) {
    const range = res.headers.get("Range");
    return range ? Number(range.split("-")[1]) + 1 : 0;
  }
  return 0;
}

export async function uploadToDrive(
  sessionUrl: string,
  file: File,
  onProgress: ProgressFn,
): Promise<string> {
  const total = file.size;
  let offset = 0;
  let attempts = 0;

  while (offset < total) {
    const slice = file.slice(offset, Math.min(offset + CHUNK, total));
    try {
      const result = await putChunk(sessionUrl, slice, offset, total, onProgress);
      if (result.done) return result.driveFileId;
      offset = result.nextByte;
      attempts = 0;
    } catch (err) {
      attempts++;
      if (attempts >= MAX_ATTEMPTS) throw err;
      // Back off, re-ask Drive where it got to, and carry on from there.
      await new Promise((r) => setTimeout(r, 800 * attempts));
      offset = await confirmedByte(sessionUrl, total);
      if (offset >= total) break;
    }
  }

  // Every byte is in but the final response was lost — one empty PUT retrieves the file id.
  const final = await confirmedByte(sessionUrl, total);
  if (final >= total) {
    const res = await fetch(sessionUrl, { method: "PUT", headers: { "Content-Range": `bytes */${total}` } });
    if (res.ok) {
      const data = (await res.json()) as { id?: string };
      if (data.id) return data.id;
    }
  }
  throw new Error("Upload did not complete");
}

/** Fallback for small files if a browser or network blocks the direct PUT to Google. */
export async function uploadViaServer(fileId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("fileId", fileId);
  form.append("file", file);
  const res = await fetch("/api/upload/proxy", { method: "POST", body: form });
  const data = (await res.json()) as { driveFileId?: string; error?: string };
  if (!res.ok || !data.driveFileId) throw new Error(data.error ?? "Proxy upload failed");
  return data.driveFileId;
}

export const PROXY_LIMIT = 4 * 1024 * 1024;
