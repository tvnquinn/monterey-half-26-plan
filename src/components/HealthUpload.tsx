"use client";

import { useState } from "react";

interface HealthUploadProps {
  onImported: () => void;
}

export function HealthUpload({ onImported }: HealthUploadProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFileChange(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    setStatus("Uploading…");
    try {
      let imported = 0;
      let total = 0;
      for (const file of Array.from(fileList)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/health/ingest", {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (!res.ok) {
          setStatus(json.error || `Failed on ${file.name}`);
          return;
        }
        imported += json.imported || 0;
        total = json.total || total;
      }
      setStatus(`Imported ${imported} runs · ${total} total stored`);
      onImported();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-box">
      <label className="btn ghost upload-label">
        {busy ? "Uploading…" : "Choose JSON / GPX"}
        <input
          type="file"
          accept="application/json,.json,application/gpx+xml,.gpx,text/xml"
          multiple
          disabled={busy}
          onChange={(e) => onFileChange(e.target.files)}
          hidden
        />
      </label>
      {status ? <p className="sync-msg">{status}</p> : null}
    </div>
  );
}
