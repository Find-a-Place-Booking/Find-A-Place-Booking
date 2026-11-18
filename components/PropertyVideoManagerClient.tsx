"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { HostPropertyVideo } from "./PropertyVideoManager";
import styles from "./PropertyVideoManager.module.css";

const MAX_VIDEO_BYTES = 75 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const VIDEO_COLUMNS = "id,storage_path,original_name,content_type,size_bytes,duration_seconds,is_primary";

function fileSizeLabel(bytes: number) {
  return `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement("video");
    let finished = false;
    const cleanup = () => {
      clearTimeout(timeout);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    };
    const finish = (duration: number | null) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (duration !== null && Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error("We couldn't read the video's length. Try exporting the file as MP4."));
      }
    };
    const timeout = setTimeout(() => finish(null), 20000);
    element.onloadedmetadata = () => finish(element.duration);
    element.onerror = () => finish(null);
    element.preload = "metadata";
    element.src = url;
    element.load();
  });
}

function normalizeVideo(row: {
  id: string;
  storage_path: string;
  original_name: string | null;
  content_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  is_primary: boolean;
}, signedUrl: string | null): HostPropertyVideo {
  return {
    id: row.id,
    storagePath: row.storage_path,
    originalName: row.original_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes || 0),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    isPrimary: Boolean(row.is_primary),
    signedUrl,
  };
}

export function PropertyVideoManagerClient({
  organizationId, propertyId, unitId, propertyName, editable, initialVideo,
}: {
  organizationId: string;
  propertyId: string;
  unitId: string;
  propertyName: string;
  editable: boolean;
  initialVideo: HostPropertyVideo | null;
}) {
  const router = useRouter();
  const locked = useRef(false);
  const [video, setVideo] = useState<HostPropertyVideo | null>(initialVideo);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialVideo ? "Property video is connected to this listing." : "Add an optional short property video.");
  const [tone, setTone] = useState<"normal" | "error" | "saved">(initialVideo ? "saved" : "normal");

  async function refreshPreview(storagePath: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("property-videos").createSignedUrl(storagePath, 3600);
    if (error || !data?.signedUrl) {
      setTone("error");
      setMessage("Video is saved, but its preview couldn't load. Refresh this page and try again.");
      return;
    }
    setVideo(current => current?.storagePath === storagePath ? { ...current, signedUrl: data.signedUrl } : current);
  }

  async function uploadVideo(file: File | null) {
    if (!file || locked.current || !editable) return;
    const contentType = file.type.toLowerCase() || (file.name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "");
    if (!VIDEO_TYPES.has(contentType)) {
      setTone("error");
      setMessage("Use an MP4 or WebM video. If your phone saved a MOV file, export it as MP4 first.");
      return;
    }
    if (file.size === 0 || file.size > MAX_VIDEO_BYTES) {
      setTone("error");
      setMessage("The video must be larger than 0 bytes and no more than 75 MB.");
      return;
    }

    locked.current = true;
    setBusy(true);
    setTone("normal");
    setMessage("Checking video format and length…");
    let uploadedPath: string | null = null;
    try {
      const duration = await readVideoDuration(file);
      if (duration > MAX_VIDEO_SECONDS) throw new Error("This video is over 60 seconds. Shorten it and try again.");
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Your session expired. Sign in and try again.");

      // Check the saved record first. A host may have uploaded the video from
      // another tab or device since this page was opened.
      const { data: existing, error: existingError } = await supabase
        .from("property_videos")
        .select("id,storage_path,is_primary")
        .eq("unit_id", unitId)
        .maybeSingle();
      if (existingError) throw new Error(`Could not verify the current property video: ${existingError.message}`);
      const oldPath = existing?.storage_path ?? video?.storagePath ?? null;
      const keepPrimary = existing?.is_primary ?? video?.isPrimary ?? false;

      const path = `${organizationId}/${propertyId}/${crypto.randomUUID()}.${contentType === "video/webm" ? "webm" : "mp4"}`;
      setMessage("Uploading video. Keep this page open until it finishes…");
      const { error: uploadError } = await supabase.storage.from("property-videos").upload(path, file, {
        contentType, cacheControl: "3600", upsert: false,
      });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      uploadedPath = path;

      setMessage("Upload received. Saving it to this property…");
      // An existing unit has ONE property_videos row. Use UPDATE on replacement
      // instead of UPSERT, which can evaluate an unnecessary INSERT policy and
      // fail even when the host has permission to edit the existing video.
      // Keep its created_by audit field unchanged on replacement.
      const changes = {
        storage_path: path,
        original_name: file.name.slice(0, 255),
        content_type: contentType,
        size_bytes: file.size,
        duration_seconds: Math.round(duration * 100) / 100,
        is_primary: keepPrimary,
      };
      const writeQuery = existing?.id
        ? supabase.from("property_videos").update(changes).eq("id", existing.id).eq("unit_id", unitId)
        : supabase.from("property_videos").insert({ ...changes, unit_id: unitId, created_by: auth.user.id });
      const { data: row, error: rowError } = await writeQuery.select(VIDEO_COLUMNS).single();
      if (rowError || !row) throw new Error(`The upload reached storage, but the listing couldn't save it: ${rowError?.message || "No record was returned"}`);

      // The new record is committed. Do not delete its file on any later
      // preview or cleanup error.
      uploadedPath = null;
      const { data: signed, error: signError } = await supabase.storage.from("property-videos").createSignedUrl(path, 3600);
      setVideo(normalizeVideo(row, signed?.signedUrl ?? null));
      setTone(signError ? "error" : "saved");
      setMessage(signError ? "Video saved, but the preview couldn't load. Refresh the page to retry." : "Property video saved. Guests can view it on the stay page.");
      router.refresh();

      if (oldPath && oldPath !== path) {
        const { error: cleanupError } = await supabase.storage.from("property-videos").remove([oldPath]);
        if (cleanupError) console.warn("[property video] old file cleanup failed", cleanupError);
      }
    } catch (error) {
      console.error("[property video] upload/save failed", error);
      if (uploadedPath) {
        const { error: cleanupError } = await createClient().storage.from("property-videos").remove([uploadedPath]);
        if (cleanupError) console.warn("[property video] failed-upload cleanup", cleanupError);
      }
      setTone("error");
      setMessage(error instanceof Error ? error.message : "The video couldn't be saved. Try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function setPrimary(next: boolean) {
    if (!video || locked.current || !editable) return;
    locked.current = true;
    setBusy(true);
    try {
      const { error } = await createClient().from("property_videos").update({ is_primary: next }).eq("id", video.id);
      if (error) throw error;
      setVideo(current => current ? { ...current, isPrimary: next } : current);
      setTone("saved");
      setMessage(next ? "Video is now the main media on the stay page." : "The first photo is the main media again.");
      router.refresh();
    } catch (error) {
      setTone("error");
      setMessage(`Couldn't change the main media setting: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function removeVideo() {
    if (!video || locked.current || !editable) return;
    locked.current = true;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("property_videos").delete().eq("id", video.id);
      if (error) throw error;
      const oldPath = video.storagePath;
      setVideo(null);
      setTone("saved");
      setMessage("Property video removed. Your photos are unchanged.");
      router.refresh();
      const { error: cleanupError } = await supabase.storage.from("property-videos").remove([oldPath]);
      if (cleanupError) console.warn("[property video] remove storage cleanup", cleanupError);
    } catch (error) {
      setTone("error");
      setMessage(`Couldn't remove the property video: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Property media</p>
          <h2>Property video</h2>
          <p>Add one short video guests can watch on the listing. You can make it the main media while keeping the first photo as the fallback for search and sharing.</p>
        </div>
        <span className={styles.optional}>Optional</span>
      </div>
      <div className={`${styles.message} ${tone === "error" ? styles.error : tone === "saved" ? styles.saved : ""}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
        {message}
      </div>
      {video ? (
        <div className={styles.current}>
          <div className={styles.preview}>
            {video.signedUrl ? <video src={video.signedUrl} controls playsInline preload="metadata" aria-label={`${propertyName} property video`} /> : <div className={styles.missing}>Preview unavailable. Refresh this page.</div>}
          </div>
          <div className={styles.details}>
            <strong>{video.originalName || "Property video"}</strong>
            <span>{fileSizeLabel(video.sizeBytes)}{video.durationSeconds ? ` · ${Math.round(video.durationSeconds)} sec` : ""}</span>
            <label className={styles.primaryToggle}>
              <input type="checkbox" checked={video.isPrimary} disabled={busy || !editable} onChange={event => void setPrimary(event.target.checked)} />
              <span><strong>Use video as the main media</strong><small>Guests see the video first. The first photo stays the fallback image.</small></span>
            </label>
            <div className={styles.actions}>
              <button type="button" className="button button-small button-quiet" disabled={busy} onClick={() => void refreshPreview(video.storagePath)}>Refresh preview</button>
              <label className={`button button-small button-quiet ${styles.replace}`}>
                {busy ? "Working…" : "Replace video"}
                <input type="file" accept="video/mp4,video/webm,.mp4,.webm" disabled={busy || !editable} onChange={event => { void uploadVideo(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
              </label>
              <button type="button" className="button button-small button-quiet" disabled={busy || !editable} onClick={() => void removeVideo()}>Remove video</button>
            </div>
          </div>
        </div>
      ) : (
        <label className={`${styles.upload} ${busy ? styles.busy : ""}`}>
          <input type="file" accept="video/mp4,video/webm,.mp4,.webm" disabled={busy || !editable} onChange={event => { void uploadVideo(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
          <strong>{busy ? "Saving video…" : "Add property video"}</strong>
          <span>MP4 or WebM · up to 60 seconds · up to 75 MB · private until the listing is published</span>
        </label>
      )}
    </section>
  );
}
