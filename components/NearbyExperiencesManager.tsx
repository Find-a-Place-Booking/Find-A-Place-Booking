"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { revalidateNearbyExperienceChange } from "@/app/host/properties/nearby-actions";
import { createClient } from "@/lib/supabase/client";
import styles from "./NearbyExperiencesManager.module.css";

const categories = [
  "Outdoors",
  "ATV / off-road",
  "Lake / river",
  "Attraction",
  "Food & drink",
  "Family",
  "Shopping / local",
  "Entertainment",
  "Other",
];

type NearbyRow = {
  id: string;
  property_id: string;
  title: string;
  category: string;
  description: string | null;
  distance_miles: number | null;
  drive_minutes: number | null;
  website_url: string | null;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  signedUrl?: string | null;
};

type SearchResult = {
  key: string;
  label: string;
  secondary: string;
  category: string;
  approximateMiles: number;
  lat: number;
  lng: number;
};

type Draft = {
  title: string;
  category: string;
  description: string;
  distanceMiles: string;
  driveMinutes: string;
  websiteUrl: string;
};

const emptyDraft: Draft = {
  title: "",
  category: "Outdoors",
  description: "",
  distanceMiles: "",
  driveMinutes: "",
  websiteUrl: "",
};

function sanitizeWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function NearbyExperiencesManager({
  propertyId,
  organizationId,
  slug,
  editable,
}: {
  propertyId: string;
  organizationId: string;
  slug: string;
  editable: boolean;
}) {
  const [rows, setRows] = useState<NearbyRow[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [matchedPlace, setMatchedPlace] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const refreshPublicListing = useCallback(async () => {
    await revalidateNearbyExperienceChange({ propertyId, slug });
  }, [propertyId, slug]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("property_nearby_experiences")
      .select(
        "id,property_id,title,category,description,distance_miles,drive_minutes,website_url,image_path,sort_order,is_active",
      )
      .eq("property_id", propertyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (loadError) {
      setRows([]);
      setLoading(false);
      setError(
        loadError.message.includes("property_nearby_experiences")
          ? "Nearby experiences are not ready yet. Apply the included Supabase migration, then refresh."
          : "Couldn't load nearby experiences.",
      );
      return;
    }

    const withImages = await Promise.all(
      ((data ?? []) as NearbyRow[]).map(async (row) => {
        if (!row.image_path) return { ...row, signedUrl: null };
        const { data: signed } = await supabase.storage
          .from("property-images")
          .createSignedUrl(row.image_path, 3600);
        return { ...row, signedUrl: signed?.signedUrl ?? null };
      }),
    );

    setRows(withImages);
    setLoading(false);
    setError(null);
  }, [propertyId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDraft(key: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
    if (key === "title") {
      setSearchResults([]);
      setMatchedPlace(null);
    }
  }

  function updateRow(id: string, key: keyof NearbyRow, value: string | boolean | number | null) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
    setMessage(null);
    setError(null);
  }

  async function searchNearby() {
    const query = draft.title.trim();
    if (query.length < 2 || searching) return;

    setSearching(true);
    setError(null);
    setMessage("Searching near this property's saved address…");

    const response = await fetch(
      `/api/host/properties/${encodeURIComponent(propertyId)}/nearby-search?q=${encodeURIComponent(query)}`,
      { credentials: "same-origin" },
    );
    const payload = (await response.json().catch(() => null)) as
      | { results?: SearchResult[]; error?: string }
      | null;

    setSearching(false);

    if (!response.ok) {
      setSearchResults([]);
      setMessage(null);
      setError(payload?.error || "Couldn't search nearby places.");
      return;
    }

    const results = payload?.results ?? [];
    setSearchResults(results);
    setMessage(
      results.length
        ? "Choose the right place below and Find A Place will calculate driving distance."
        : "No nearby Mapbox match was found. You can still enter the distance manually.",
    );
  }

  async function useSearchResult(result: SearchResult) {
    if (searching) return;
    setSearching(true);
    setError(null);
    setMessage(`Calculating the driving route to ${result.label}…`);

    const response = await fetch(
      `/api/host/properties/${encodeURIComponent(propertyId)}/nearby-distance`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: result.lat, lng: result.lng }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { distanceMiles?: number; driveMinutes?: number | null; error?: string }
      | null;

    setSearching(false);

    if (!response.ok || typeof payload?.distanceMiles !== "number") {
      setMessage(null);
      setError(payload?.error || "Couldn't calculate a driving route to that place.");
      return;
    }

    setDraft((current) => ({
      ...current,
      distanceMiles: String(payload.distanceMiles),
      driveMinutes:
        typeof payload.driveMinutes === "number" ? String(payload.driveMinutes) : "",
    }));
    setMatchedPlace(result.label);
    setSearchResults([]);
    setMessage(
      `${result.label}: about ${payload.distanceMiles} driving miles${
        payload.driveMinutes ? ` · ${payload.driveMinutes} min` : ""
      }. You can adjust the numbers before saving.`,
    );
  }

  async function uploadImage(file: File) {
    if (!file) return null;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Use a JPG, PNG or WebP image.");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Nearby-place images must be under 10 MB.");
    }

    const path = `${organizationId}/${propertyId}/nearby/${crypto.randomUUID()}.${extensionFor(file)}`;
    const { error: uploadError } = await supabase.storage
      .from("property-images")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;
    return path;
  }

  async function addExperience() {
    if (!editable || saving || rows.length >= 12) return;
    const title = draft.title.trim();
    if (!title) {
      setError("Add a nearby place or activity name first.");
      return;
    }

    const website = sanitizeWebsite(draft.websiteUrl);
    if (draft.websiteUrl.trim() && !website) {
      setError("That website address doesn't look valid.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage("Adding nearby experience…");

    let imagePath: string | null = null;
    try {
      if (newImage) imagePath = await uploadImage(newImage);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Your session expired. Sign in again.");

      const distance = Number(draft.distanceMiles);
      const minutes = Number(draft.driveMinutes);
      const { error: insertError } = await supabase
        .from("property_nearby_experiences")
        .insert({
          property_id: propertyId,
          title,
          category: draft.category || "Attraction",
          description: draft.description.trim() || null,
          distance_miles:
            draft.distanceMiles.trim() && Number.isFinite(distance) ? distance : null,
          drive_minutes:
            draft.driveMinutes.trim() && Number.isFinite(minutes)
              ? Math.max(0, Math.round(minutes))
              : null,
          website_url: website,
          image_path: imagePath,
          sort_order: rows.length,
          is_active: true,
          created_by: userId,
        });

      if (insertError) throw insertError;

      setDraft(emptyDraft);
      setNewImage(null);
      setMatchedPlace(null);
      setSearchResults([]);
      setMessage("Nearby experience added to this property.");
      await refreshPublicListing();
      await load();
    } catch (caught) {
      if (imagePath) {
        await supabase.storage.from("property-images").remove([imagePath]);
      }
      setError(caught instanceof Error ? caught.message : "Couldn't add the nearby experience.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRow(row: NearbyRow) {
    if (!editable || saving) return;
    const website = sanitizeWebsite(row.website_url || "");
    if (row.website_url?.trim() && !website) {
      setError("That website address doesn't look valid.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(`Saving ${row.title}…`);

    const { error: updateError } = await supabase
      .from("property_nearby_experiences")
      .update({
        title: row.title.trim(),
        category: row.category,
        description: row.description?.trim() || null,
        distance_miles: row.distance_miles,
        drive_minutes: row.drive_minutes,
        website_url: website,
        is_active: row.is_active,
      })
      .eq("id", row.id)
      .eq("property_id", propertyId);

    setSaving(false);
    if (updateError) {
      setMessage(null);
      setError("Couldn't save that nearby experience.");
      return;
    }
    setMessage(`${row.title} saved.`);
    await refreshPublicListing();
  }

  async function replaceRowImage(row: NearbyRow, file: File) {
    if (!editable || saving) return;
    setSaving(true);
    setError(null);
    setMessage(`Updating the image for ${row.title}…`);

    let nextPath: string | null = null;
    try {
      nextPath = await uploadImage(file);
      const { error: updateError } = await supabase
        .from("property_nearby_experiences")
        .update({ image_path: nextPath })
        .eq("id", row.id)
        .eq("property_id", propertyId);
      if (updateError) throw updateError;

      if (row.image_path) {
        await supabase.storage.from("property-images").remove([row.image_path]);
      }
      setMessage(`${row.title} image updated.`);
      await refreshPublicListing();
      await load();
    } catch (caught) {
      if (nextPath) {
        await supabase.storage.from("property-images").remove([nextPath]);
      }
      setError(caught instanceof Error ? caught.message : "Couldn't update that image.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(row: NearbyRow) {
    if (!editable || saving || !window.confirm(`Remove ${row.title} from this property's nearby list?`)) {
      return;
    }

    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from("property_nearby_experiences")
      .delete()
      .eq("id", row.id)
      .eq("property_id", propertyId);

    if (!deleteError && row.image_path) {
      await supabase.storage.from("property-images").remove([row.image_path]);
    }

    setSaving(false);
    if (deleteError) {
      setError("Couldn't remove that nearby experience.");
      return;
    }
    setMessage(`${row.title} removed.`);
    await refreshPublicListing();
    await load();
  }

  async function moveRow(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (!editable || saving || target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    const normalized = next.map((row, sortOrder) => ({ ...row, sort_order: sortOrder }));
    setRows(normalized);
    setSaving(true);
    setError(null);
    setMessage("Saving nearby-place order…");

    const { error: reorderError } = await supabase.rpc(
      "reorder_property_nearby_experiences",
      {
        target_property_id: propertyId,
        ordered_experience_ids: normalized.map((row) => row.id),
      },
    );

    setSaving(false);
    if (reorderError) {
      setError("The nearby-place order didn't save. Refresh and try again.");
      await load();
      return;
    }
    setMessage("Nearby-place order saved.");
    await refreshPublicListing();
  }

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Nearby experiences</p>
          <h2>Show guests what makes this location worth the trip</h2>
          <p>
            Add waterfalls, trail systems, ATV areas, rivers, lakes, restaurants,
            attractions and other local draws. Search a place with Mapbox to fill
            in real driving miles and estimated drive time from this property.
          </p>
        </div>
        <div className={styles.summary}>
          <strong>{rows.length}</strong>
          <span>of 12 added</span>
        </div>
      </div>

      {message ? <div className="admin-message success">{message}</div> : null}
      {error ? <div className="admin-message error">{error}</div> : null}

      <div className={styles.addCard}>
        <div className={styles.addHead}>
          <div>
            <strong>Add something nearby</strong>
            <span>Host-curated. Nothing is added to the listing until you save it.</span>
          </div>
          {matchedPlace ? <small>Mapbox match: {matchedPlace}</small> : null}
        </div>

        <div className={styles.formGrid}>
          <label className={styles.full}>
            <span>Place / activity</span>
            <div className={styles.searchLine}>
              <input
                value={draft.title}
                disabled={!editable || saving}
                onChange={(event) => updateDraft("title", event.target.value)}
                placeholder="Little Missouri Falls, Wolf Pen Gap, Caddo River…"
              />
              <button
                type="button"
                className="button button-small button-quiet"
                disabled={!editable || saving || searching || draft.title.trim().length < 2}
                onClick={() => void searchNearby()}
              >
                {searching ? "Working…" : "Find & calculate"}
              </button>
            </div>
          </label>

          {searchResults.length ? (
            <div className={`${styles.searchResults} ${styles.full}`}>
              {searchResults.map((result) => (
                <button
                  type="button"
                  key={result.key}
                  disabled={searching}
                  onClick={() => void useSearchResult(result)}
                >
                  <span>
                    <strong>{result.label}</strong>
                    <small>{result.secondary || result.category}</small>
                  </span>
                  <b>~{result.approximateMiles} mi · use this</b>
                </button>
              ))}
            </div>
          ) : null}

          <label>
            <span>Category</span>
            <select
              value={draft.category}
              disabled={!editable || saving}
              onChange={(event) => updateDraft("category", event.target.value)}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Optional image</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!editable || saving}
              onChange={(event) => setNewImage(event.target.files?.[0] ?? null)}
            />
          </label>

          <label>
            <span>Driving miles</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={draft.distanceMiles}
              disabled={!editable || saving}
              onChange={(event) => updateDraft("distanceMiles", event.target.value)}
              placeholder="8.4"
            />
          </label>

          <label>
            <span>Estimated drive time (minutes)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={draft.driveMinutes}
              disabled={!editable || saving}
              onChange={(event) => updateDraft("driveMinutes", event.target.value)}
              placeholder="14"
            />
          </label>

          <label className={styles.full}>
            <span>Why guests might want to go</span>
            <textarea
              value={draft.description}
              disabled={!editable || saving}
              onChange={(event) => updateDraft("description", event.target.value)}
              placeholder="Waterfalls, swimming holes and hiking in the Ouachita National Forest."
              maxLength={600}
            />
          </label>

          <label className={styles.full}>
            <span>Website / information link · optional</span>
            <input
              value={draft.websiteUrl}
              disabled={!editable || saving}
              onChange={(event) => updateDraft("websiteUrl", event.target.value)}
              placeholder="https://…"
            />
          </label>
        </div>

        <div className={styles.addActions}>
          <small>
            Images are uploaded by the host. Mapbox is used to find the place and
            calculate the route; Find A Place does not store the Mapbox POI coordinates.
          </small>
          <button
            type="button"
            className="button button-small"
            disabled={!editable || saving || rows.length >= 12 || !draft.title.trim()}
            onClick={() => void addExperience()}
          >
            {rows.length >= 12 ? "12-place limit reached" : saving ? "Saving…" : "Add nearby place"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="panel-empty">Loading nearby experiences…</div>
      ) : rows.length ? (
        <div className={styles.list}>
          {rows.map((row, index) => (
            <article className={styles.rowCard} key={row.id}>
              <div className={styles.preview}>
                {row.signedUrl ? (
                  <img src={row.signedUrl} alt="" />
                ) : (
                  <div className={styles.placeholder}>
                    <span>{row.category}</span>
                    <strong>{row.title.slice(0, 1).toUpperCase()}</strong>
                  </div>
                )}
                <label className={styles.imageButton}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!editable || saving}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void replaceRowImage(row, file);
                      event.currentTarget.value = "";
                    }}
                  />
                  {row.image_path ? "Replace image" : "Add image"}
                </label>
              </div>

              <div className={styles.rowFields}>
                <div className={styles.rowTop}>
                  <strong>#{index + 1}</strong>
                  <div className={styles.orderButtons}>
                    <button
                      type="button"
                      disabled={!editable || saving || index === 0}
                      onClick={() => void moveRow(index, -1)}
                    >
                      ↑ Earlier
                    </button>
                    <button
                      type="button"
                      disabled={!editable || saving || index === rows.length - 1}
                      onClick={() => void moveRow(index, 1)}
                    >
                      ↓ Later
                    </button>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <label>
                    <span>Name</span>
                    <input
                      value={row.title}
                      disabled={!editable || saving}
                      onChange={(event) => updateRow(row.id, "title", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Category</span>
                    <select
                      value={row.category}
                      disabled={!editable || saving}
                      onChange={(event) => updateRow(row.id, "category", event.target.value)}
                    >
                      {categories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Miles</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={row.distance_miles ?? ""}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        updateRow(
                          row.id,
                          "distance_miles",
                          event.target.value === "" ? null : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Drive minutes</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={row.drive_minutes ?? ""}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        updateRow(
                          row.id,
                          "drive_minutes",
                          event.target.value === "" ? null : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label className={styles.full}>
                    <span>Description</span>
                    <textarea
                      value={row.description ?? ""}
                      disabled={!editable || saving}
                      onChange={(event) => updateRow(row.id, "description", event.target.value)}
                      maxLength={600}
                    />
                  </label>
                  <label className={styles.full}>
                    <span>Website</span>
                    <input
                      value={row.website_url ?? ""}
                      disabled={!editable || saving}
                      onChange={(event) => updateRow(row.id, "website_url", event.target.value)}
                    />
                  </label>
                </div>

                <div className={styles.rowActions}>
                  <label className={styles.visibleToggle}>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      disabled={!editable || saving}
                      onChange={(event) => updateRow(row.id, "is_active", event.target.checked)}
                    />
                    <span>Show on public listing</span>
                  </label>
                  <div>
                    <button
                      type="button"
                      className="button button-small button-quiet"
                      disabled={!editable || saving || !row.title.trim()}
                      onClick={() => void saveRow(row)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={!editable || saving}
                      onClick={() => void removeRow(row)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel-empty">
          <strong>No nearby experiences added yet.</strong>
          <span>Add the local places that help sell the trip, not just the room.</span>
        </div>
      )}
    </section>
  );
}
