"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dict, type Lang } from "@/lib/i18n";
import { formatBytes } from "@/lib/format";
import { ACCEPT_ATTR, DISPLAYABLE_IMAGE, extOf, isAllowed, type FileKind } from "@/lib/filetypes";
import { uploadToDrive, uploadViaServer, PROXY_LIMIT } from "@/lib/upload-client";

type Item = {
  file: File;
  kind: FileKind;
  uploaded: number;
  state: "idle" | "uploading" | "done" | "failed";
};

type InitResponse = {
  versionId: string;
  url: string;
  uploads: { fileId: string; sessionUrl: string; name: string; size: number }[];
  error?: string;
};

export function UploadForm({
  lang,
  mode,
  modelId,
  maxFileBytes,
  maxTeamBytes,
  usedBytes,
}: {
  lang: Lang;
  mode: "model" | "version";
  modelId?: string;
  maxFileBytes: number;
  maxTeamBytes: number;
  usedBytes: number;
}) {
  const d = dict(lang);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [versionName, setVersionName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "uploading" | "finishing">("form");
  const [dragOver, setDragOver] = useState(false);

  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);
  const uploadedBytes = items.reduce((sum, i) => sum + i.uploaded, 0);
  const percent = totalBytes ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0;
  const remaining = Math.max(0, maxTeamBytes - usedBytes);

  function addFiles(incoming: FileList | File[]) {
    const accepted: Item[] = [];
    const problems: string[] = [];

    for (const file of Array.from(incoming)) {
      if (!isAllowed(file.name)) {
        problems.push(d.upload.badType(file.name));
        continue;
      }
      if (file.size > maxFileBytes) {
        problems.push(d.upload.tooBig(file.name, formatBytes(maxFileBytes)));
        continue;
      }
      if (file.size === 0) continue;
      // Renders are the common case for images, so they default to screenshots.
      const kind: FileKind = DISPLAYABLE_IMAGE.has(extOf(file.name)) ? "screenshot" : "model";
      accepted.push({ file, kind, uploaded: 0, state: "idle" });
    }

    setError(problems[0] ?? null);
    setItems((prev) => {
      const seen = new Set(prev.map((i) => `${i.file.name}:${i.file.size}`));
      return [...prev, ...accepted.filter((i) => !seen.has(`${i.file.name}:${i.file.size}`))];
    });
  }

  function setKind(index: number, kind: FileKind) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, kind } : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function patch(index: number, patchValue: Partial<Item>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patchValue } : item)));
  }

  async function submit() {
    setError(null);

    if (mode === "model" && !title.trim()) return setError(d.upload.needName);
    if (!versionName.trim()) return setError(d.upload.needName);
    if (items.length === 0) return setError(d.upload.needFiles);
    if (totalBytes > remaining) {
      return setError(d.upload.quota(formatBytes(usedBytes), formatBytes(maxTeamBytes)));
    }

    setBusy(true);
    setPhase("uploading");

    try {
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          model:
            mode === "model"
              ? {
                  title: title.trim(),
                  description: description.trim(),
                  tags: tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 10),
                }
              : undefined,
          version: { name: versionName.trim(), notes: notes.trim() },
          files: items.map((item) => ({ name: item.file.name, size: item.file.size, kind: item.kind })),
        }),
      });

      const init = (await initRes.json()) as InitResponse;
      if (!initRes.ok) throw new Error(init.error ?? d.upload.failed);

      const succeeded: { fileId: string; driveFileId: string }[] = [];
      const failed: string[] = [];

      // Sequential: one big file at a time keeps progress honest on a school connection.
      for (const [index, item] of items.entries()) {
        const slot = init.uploads[index];
        if (!slot) continue;
        patch(index, { state: "uploading" });

        try {
          const driveFileId = await uploadToDrive(slot.sessionUrl, item.file, (bytes) =>
            patch(index, { uploaded: bytes }),
          );
          succeeded.push({ fileId: slot.fileId, driveFileId });
          patch(index, { state: "done", uploaded: item.file.size });
        } catch (directErr) {
          // Small files get a second chance through our own server.
          if (item.file.size <= PROXY_LIMIT) {
            try {
              const driveFileId = await uploadViaServer(slot.fileId, item.file);
              succeeded.push({ fileId: slot.fileId, driveFileId });
              patch(index, { state: "done", uploaded: item.file.size });
              continue;
            } catch {
              /* fall through to failure */
            }
          }
          console.error("upload failed", item.file.name, directErr);
          failed.push(slot.fileId);
          patch(index, { state: "failed" });
        }
      }

      setPhase("finishing");

      const completeRes = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: init.versionId, succeeded, failed }),
      });
      const complete = (await completeRes.json()) as { url?: string; error?: string };
      if (!completeRes.ok) throw new Error(complete.error ?? d.upload.failed);

      router.push(complete.url ?? init.url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : d.upload.failed);
      setPhase("form");
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && <div className="alert alert-error">{error}</div>}

      {mode === "model" && (
        <div className="panel">
          <label className="field">
            <span className="label">{d.upload.modelTitle} *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={d.upload.modelTitleHint} disabled={busy} />
          </label>
          <label className="field">
            <span className="label">{d.upload.description}</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">{d.model.tags}</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hard surface, lowpoly" disabled={busy} />
            <span className="hint">{d.upload.tagsHint}</span>
          </label>
        </div>
      )}

      <div className="panel">
        <label className="field">
          <span className="label">{d.upload.versionName} *</span>
          <input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder={d.upload.versionNameHint} disabled={busy} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="label">{d.upload.notes}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
        </label>
      </div>

      <div className="panel">
        <div className="between" style={{ marginBottom: 10 }}>
          <span className="label strong small">{d.model.files}</span>
          <span className="tiny faint">
            {formatBytes(usedBytes)} / {formatBytes(maxTeamBytes)} · max {formatBytes(maxFileBytes)}
          </span>
        </div>

        <div
          className={`dropzone${dragOver ? " over" : ""}`}
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy) addFiles(e.dataTransfer.files);
          }}
        >
          <div className="strong">{d.upload.chooseFiles}</div>
          <div className="tiny faint">{d.upload.dropHint}</div>
          <div className="tiny faint" style={{ marginTop: 6 }}>
            glb · gltf · obj · stl · fbx · blend · ztl · max · c4d · png · zip …
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {items.length > 0 && (
          <div className="upload-list" style={{ marginTop: 12 }}>
            {items.map((item, index) => (
              <div className="upload-item" key={`${item.file.name}-${index}`}>
                <span className="file-ext">{extOf(item.file.name) || "?"}</span>

                <div style={{ minWidth: 0 }}>
                  <div className="wrap-any small">{item.file.name}</div>
                  <div className="tiny faint">{formatBytes(item.file.size)}</div>
                  {item.state === "uploading" && (
                    <div className="progress" style={{ marginTop: 4 }}>
                      <i style={{ width: `${item.file.size ? (item.uploaded / item.file.size) * 100 : 0}%` }} />
                    </div>
                  )}
                </div>

                <select
                  value={item.kind}
                  onChange={(e) => setKind(index, e.target.value as FileKind)}
                  disabled={busy}
                  style={{ width: "auto", fontSize: 12, padding: "4px 6px" }}
                >
                  <option value="model">{d.upload.markModel}</option>
                  <option value="screenshot">{d.upload.markScreenshot}</option>
                  <option value="texture">{d.upload.markTexture}</option>
                  <option value="other">{d.upload.markOther}</option>
                </select>

                {item.state === "done" ? (
                  <span className="chip chip-green">✓</span>
                ) : item.state === "failed" ? (
                  <span className="chip chip-red">✕</span>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(index)} disabled={busy}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {phase !== "form" && (
        <div className="panel">
          <div className="between small" style={{ marginBottom: 6 }}>
            <span>{phase === "finishing" ? d.upload.processing : `${d.upload.uploading} ${percent}%`}</span>
            <span className="faint tiny">
              {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
            </span>
          </div>
          <div className="progress">
            <i style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? d.upload.uploading : mode === "model" ? d.upload.submitModel : d.upload.submitVersion}
        </button>
        <span className="tiny faint">
          {items.length} · {formatBytes(totalBytes)}
        </span>
      </div>
    </div>
  );
}
