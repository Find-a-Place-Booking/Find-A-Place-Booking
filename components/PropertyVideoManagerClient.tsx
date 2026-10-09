"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { HostPropertyVideo } from "./PropertyVideoManager";
import styles from "./PropertyVideoManager.module.css";

const MAX_VIDEO_BYTES = 75 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

function extensionFor(type: string) {
  return type === "video/webm" ? "webm" : "mp4";
}

function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Could not read the video length."));
        return;
      }
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read that video file."));
    };
    video.src = url;
  });
}

function fileSizeLabel(bytes: number) {
  return `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PropertyVideoManagerClient({
  organizationId,
  propertyId,
  unitId,
  propertyName,
  editable,
  initialVideo,
}: {
  organizationId: string;
  propertyId: string;
  unitId: string;
  propertyName: string;
  editable: boolean;
  initialVideo: HostPropertyVideo | null;
}) {
  const [video, setVideo] = useState<HostPropertyVideo | null>(initialVideo);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    initialVideo
      ? "Property video is connected to this listing."
      : "Add an optional short property video.",
  );
  const [tone, setTone] = useState<"normal" | "error" | "saved">(
    initialVideo ? "saved" : "normal",
  );

  async function uploadVideo(file: File | null) {
    if (!file || busy || !editable) return;

    if (!VIDEO_TYPES.has(file.type)) {
      setTone("error");
      setMessage("Use an MP4 or WebM video so it plays reliably for guests.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setTone("error");
      setMessage("Keep the property video under 75 MB.");
      return;
    }

    setBusy(true);
    setTone("normal");
    setMessage("Checking and uploading property video…");

    let duration = 0;
    try {
      duration = await readVideoDuration(file);
    } catch (error) {
      setBusy(false);
      setTone("error");
      setMessage(
        error instanceof Error ? error.message : "Could not read that video.",
      );
      return;
    }

    if (duration > MAX_VIDEO_SECONDS + 0.25) {
      setBusy(false);
      setTone("error");
      setMessage("Keep the property video to 60 seconds or less.");
      return;
    }

    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      setBusy(false);
      setTone("error");
      setMessage("Your session expired. Sign in again before uploading video.");
      return;
    }

    const path = `${organizationId}/${propertyId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
    const { error: uploadError } = await supabase.storage
      .from("property-videos")
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("[property video upload]", uploadError);
      setBusy(false);
      setTone("error");
      setMessage(`Couldn't upload ${file.name}.`);
      return;
    }

    const keepPrimary = Boolean(video?.isPrimary);
    const { data: row, error: rowError } = await supabase
      .from("property_videos")
      .upsert(
        {
          unit_id: unitId,
          storage_path: path,
          original_name: file.name.slice(0, 255),
          content_type: file.type,
          size_bytes: file.size,
          duration_seconds: Math.round(duration * 100) / 100,
          is_primary: keepPrimary,
          created_by: userId,
        },
        { onConflict: "unit_id" },
      )
      .select(
        "id,storage_path,original_name,content_type,size_bytes,duration_seconds,is_primary",
      )
      .single();

    if (rowError || !row) {
      await supabase.storage.from("property-videos").remove([path]);
      console.error("[property video row]", rowError);
      setBusy(false);
      setTone("error");
      setMessage("The video uploaded, but the listing could not save it.");
      return;
    }

    if (video?.storagePath && video.storagePath !== path) {
      const { error: cleanupError } = await supabase.storage
        .from("property-videos")
        .remove([video.storagePath]);
      if (cleanupError) {
        console.warn("[property video old file cleanup]", cleanupError);
      }
    }

    const { data: signed } = await supabase.storage
      .from("property-videos")
      .createSignedUrl(path, 3600);

    setVideo({
      id: row.id,
      storagePath: row.storage_path,
      originalName: row.original_name,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes || 0),
      durationSeconds:
        row.duration_seconds == null ? null : Number(row.duration_seconds),
      isPrimary: Boolean(row.is_primary),
      signedUrl: signed?.signedUrl ?? null,
    });
    setBusy(false);
    setTone("saved");
    setMessage("Property video saved immediately.");
  }

  async function setPrimary(next: boolean) {
    if (!video || busy || !editable) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("property_videos")
      .update({ is_primary: next })
      .eq("id", video.id);

    setBusy(false);
    if (error) {
      console.error("[property video primary]", error);
      setTone("error");
      setMessage("Couldn't change the primary media setting.");
      return;
    }

    setVideo((current) =>
      current ? { ...current, isPrimary: next } : current,
    );
    setTone("saved");
    setMessage(
      next
        ? "Video is now the main media on the stay page."
        : "The first photo is the main media again.",
    );
  }

  async function removeVideo() {
    if (!video || busy || !editable) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("property_videos")
      .delete()
      .eq("id", video.id);

    if (error) {
      setBusy(false);
      setTone("error");
      setMessage("Couldn't remove the property video.");
      return;
    }

    const { error: storageError } = await supabase.storage
      .from("property-videos")
      .remove([video.storagePath]);
    if (storageError) {
      console.warn("[property video storage cleanup]", storageError);
    }

    setVideo(null);
    setBusy(false);
    setTone("saved");
    setMessage("Property video removed. Photos are unchanged.");
  }

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Property media</p>
          <h2>Property video</h2>
          <p>
            Add one short video guests can watch on the listing. You can make it
            the main media on the stay page, while the first photo stays the
            fallback image for cards, search results and social sharing.
          </p>
        </div>
        <span className={styles.optional}>Optional</span>
      </div>

      <div
        className={`${styles.message} ${
          tone === "error"
            ? styles.error
            : tone === "saved"
              ? styles.saved
              : ""
        }`}
        aria-live="polite"
      >
        {message}
      </div>

      {video ? (
        <div className={styles.current}>
          <div className={styles.preview}>
            {video.signedUrl ? (
              <video
                src={video.signedUrl}
                controls
                playsInline
                preload="metadata"
                aria-label={`${propertyName} property video`}
              />
            ) : (
              <div className={styles.missing}>Preview unavailable</div>
            )}
          </div>

          <div className={styles.details}>
            <strong>{video.originalName || "Property video"}</strong>
            <span>
              {fileSizeLabel(video.sizeBytes)}
              {video.durationSeconds
                ? ` · ${Math.round(video.durationSeconds)} sec`
                : ""}
            </span>
            <label className={styles.primaryToggle}>
              <input
                type="checkbox"
                checked={video.isPrimary}
                disabled={busy || !editable}
                onChange={(event) => void setPrimary(event.target.checked)}
              />
              <span>
                <strong>Use video as the main media</strong>
                <small>
                  Guests see the video first on the stay page. The first photo
                  remains the thumbnail and fallback image elsewhere.
                </small>
              </span>
            </label>

            <div className={styles.actions}>
              <label className={`button button-small button-quiet ${styles.replace}`}>
                {busy ? "Working…" : "Replace video"}
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  disabled={busy || !editable}
                  onChange={(event) => {
                    void uploadVideo(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                className="button button-small button-quiet"
                disabled={busy || !editable}
                onClick={() => void removeVideo()}
              >
                Remove video
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label className={`${styles.upload} ${busy ? styles.busy : ""}`}>
          <input
            type="file"
            accept="video/mp4,video/webm"
            disabled={busy || !editable}
            onChange={(event) => {
              void uploadVideo(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <strong>{busy ? "Uploading video…" : "Add property video"}</strong>
          <span>
            MP4 or WebM · up to 60 seconds · up to 75 MB · private until the
            listing is published
          </span>
        </label>
      )}
    </section>
  );
}
