"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const allowed = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"],
]);

function validImageSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  if (type === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  return false;
}

export function AdminListingPhotoUpload({
  propertyId, organizationId, currentCount,
}: {
  propertyId: string;
  organizationId: string;
  currentCount: number;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const file = input.current?.files?.[0];
    if (!file || !allowed.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setFailed(true);
      setMessage("Choose a JPG, PNG or WebP photo smaller than 10 MB.");
      return;
    }
    if (reason.trim().length < 8) {
      setFailed(true);
      setMessage("Add a brief note explaining the admin assistance.");
      return;
    }
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!validImageSignature(signature, file.type)) {
      setFailed(true);
      setMessage("This file is not a valid photo for the selected image type.");
      return;
    }
    if (currentCount >= 25) {
      setFailed(true);
      setMessage("This property already has the maximum 25 photos.");
      return;
    }
    setBusy(true);
    setFailed(false);
    setMessage("Uploading photo into private storage…");
    const extension = allowed.get(file.type)!;
    const path = `${organizationId}/${propertyId}/${crypto.randomUUID()}.${extension}`;
    try {
      const db = createClient();
      const { error: uploadError } = await db.storage.from("property-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error("Storage rejected the photo. Check admin permissions and try again.");
      const { error: registrationError } = await db.rpc("admin_register_listing_photo", {
        target_property_id: propertyId,
        storage_path_value: path,
        original_name_value: file.name.slice(0, 255),
        change_reason: reason.trim().slice(0, 500),
      });
      if (registrationError) {
        await db.storage.from("property-images").remove([path]);
        throw new Error(registrationError.message || "The photo could not be added to the listing.");
      }
      setMessage("Photo uploaded and added to the listing. The photo count will refresh.");
      setReason("");
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Unable to upload the photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={(event) => void upload(event)}>
      <label><span>Property photo</span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy || currentCount >= 25} />
      </label>
      <label><span>Host assistance reason</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500}
          required disabled={busy} placeholder="Host sent us photos to add to their listing" />
      </label>
      {message ? <div role="status" className={`admin-message ${failed ? "error" : "neutral"}`}>{message}</div> : null}
      <button className="button button-quiet" type="submit" disabled={busy || currentCount >= 25}>
        {busy ? "Saving photo…" : "Upload property photo"}
      </button>
    </form>
  );
}
