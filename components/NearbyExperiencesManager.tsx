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

type CopyTarget = {
  propertyId: string;
  name: string;
  slug: string;
};

type CopyPropertyRow = {
  id: string;
  name: string;
};

type CopyUnitRow = {
  property_id: string;
  slug: string;
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

function normalizedExperienceTitle(value: string) {
  return value.trim().toLocaleLowerCase();
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
  const [copyTargets, setCopyTargets] = useState<CopyTarget[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);

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

  const loadCopyTargets = useCallback(async () => {
    const { data: propertyData, error: propertyError } = await supabase
      .from("properties")
      .select("id,name")
      .eq("organization_id", organizationId)
      .neq("status", "ARCHIVED")
      .neq("id", propertyId)
      .order("name", { ascending: true });

    if (propertyError || !propertyData?.length) {
      if (propertyError) {
        console.error("[nearby experiences copy targets]", propertyError);
      }
      setCopyTargets([]);
      setSelectedTargetIds([]);
      return;
    }

    const properties = propertyData as CopyPropertyRow[];
    const propertyIds = properties.map((property) => property.id);

    const { data: unitData, error: unitError } = await supabase
      .from("property_units")
      .select("property_id,slug")
      .in("property_id", propertyIds)
      .eq("is_primary", true)
      .eq("is_active", true);

    if (unitError) {
      console.error("[nearby experiences copy target units]", unitError);
      setCopyTargets([]);
      setSelectedTargetIds([]);
      return;
    }

    const slugByProperty = new Map(
      ((unitData ?? []) as CopyUnitRow[]).map((unit) => [
        unit.property_id,
        unit.slug,
      ]),
    );

    const nextTargets = properties.flatMap((property) => {
      const targetSlug = slugByProperty.get(property.id);
      if (!targetSlug) return [];
      return [
        {
          propertyId: property.id,
          name: property.name,
          slug: targetSlug,
        } satisfies CopyTarget,
      ];
    });

    setCopyTargets(nextTargets);
    setSelectedTargetIds((current) =>
      current.filter((id) =>
        nextTargets.some((target) => target.propertyId === id),
      ),
    );
  }, [organizationId, propertyId, supabase]);

  useEffect(() => {
    void load();
    void loadCopyTargets();
  }, [load, loadCopyTargets]);

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

  async function removeStoragePathIfUnused(path: string) {
    const { count, error: countError } = await supabase
      .from("property_nearby_experiences")
      .select("id", { count: "exact", head: true })
      .eq("image_path", path);

    if (countError) {
      console.error("[nearby experience image reference check]", countError);
      return;
    }

    if ((count ?? 0) === 0) {
      const { error: storageError } = await supabase.storage
        .from("property-images")
        .remove([path]);

      if (storageError) {
        console.error("[nearby experience image cleanup]", storageError);
      }
    }
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
        await removeStoragePathIfUnused(row.image_path);
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
      await removeStoragePathIfUnused(row.image_path);
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

  async function copyExperiences(targetIds: string[]) {
    if (!editable || saving || !targetIds.length) return;

    const allowedTargetIds = targetIds.filter((id) =>
      copyTargets.some((target) => target.propertyId === id),
    );
    if (!allowedTargetIds.length) return;

    setSaving(true);
    setError(null);
    setMessage("Copying saved nearby experiences…");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Your session expired. Sign in again.");

      // Copy the saved database state, not any unsaved edits currently on screen.
      const { data: sourceData, error: sourceError } = await supabase
        .from("property_nearby_experiences")
        .select(
          "id,property_id,title,category,description,distance_miles,drive_minutes,website_url,image_path,sort_order,is_active",
        )
        .eq("property_id", propertyId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (sourceError) throw sourceError;
      const sourceRows = (sourceData ?? []) as NearbyRow[];
      if (!sourceRows.length) {
        throw new Error("There are no saved nearby experiences to copy yet.");
      }

      const { data: existingData, error: existingError } = await supabase
        .from("property_nearby_experiences")
        .select("property_id,title,sort_order")
        .in("property_id", allowedTargetIds);

      if (existingError) throw existingError;

      const existingRows = (existingData ?? []) as Array<{
        property_id: string;
        title: string;
        sort_order: number;
      }>;

      const inserts: Array<{
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
        created_by: string;
      }> = [];

      let skippedForLimit = 0;

      for (const targetId of allowedTargetIds) {
        const targetExisting = existingRows.filter(
          (row) => row.property_id === targetId,
        );
        const existingTitles = new Set(
          targetExisting.map((row) => normalizedExperienceTitle(row.title)),
        );
        let targetCount = targetExisting.length;
        let nextSort =
          targetExisting.reduce(
            (max, row) => Math.max(max, Number(row.sort_order ?? -1)),
            -1,
          ) + 1;

        for (const source of sourceRows) {
          const normalizedTitle = normalizedExperienceTitle(source.title);
          if (existingTitles.has(normalizedTitle)) continue;

          if (targetCount >= 12) {
            skippedForLimit += 1;
            continue;
          }

          inserts.push({
            property_id: targetId,
            title: source.title,
            category: source.category,
            description: source.description,
            distance_miles: source.distance_miles,
            drive_minutes: source.drive_minutes,
            website_url: source.website_url,
            image_path: source.image_path,
            sort_order: nextSort,
            is_active: source.is_active,
            created_by: userId,
          });

          existingTitles.add(normalizedTitle);
          targetCount += 1;
          nextSort += 1;
        }
      }

      if (inserts.length) {
        const { error: insertError } = await supabase
          .from("property_nearby_experiences")
          .insert(inserts);

        if (insertError) throw insertError;
      }

      await Promise.all(
        allowedTargetIds.map(async (targetId) => {
          const target = copyTargets.find(
            (item) => item.propertyId === targetId,
          );
          if (!target) return;
          await revalidateNearbyExperienceChange({
            propertyId: target.propertyId,
            slug: target.slug,
          });
        }),
      );

      setSelectedTargetIds([]);

      if (!inserts.length) {
        setMessage(
          "Nothing new was copied. Those listings already contain the same nearby experiences or are at the 12-item limit.",
        );
      } else {
        setMessage(
          `${inserts.length} nearby experience${
            inserts.length === 1 ? "" : "s"
          } copied across ${allowedTargetIds.length} listing${
            allowedTargetIds.length === 1 ? "" : "s"
          }. Matching names were skipped${
            skippedForLimit ? " and the 12-item limit was respected" : ""
          }.`,
        );
      }
    } catch (caught) {
      setMessage(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Couldn't copy the nearby experiences.",
      );
    } finally {
      setSaving(false);
    }
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

      {rows.length && copyTargets.length ? (
        <div className={styles.addCard}>
          <div className={styles.addHead}>
            <div>
              <strong>Reuse these experiences on other listings</strong>
              <span>
                Pick specific properties or apply the saved list to every other
                listing in this host account.
              </span>
            </div>
            <small>{copyTargets.length} other listing{copyTargets.length === 1 ? "" : "s"}</small>
          </div>

          <div className={styles.formGrid}>
            {copyTargets.map((target) => (
              <label className={styles.visibleToggle} key={target.propertyId}>
                <input
                  type="checkbox"
                  checked={selectedTargetIds.includes(target.propertyId)}
                  disabled={!editable || saving}
                  onChange={(event) => {
                    setSelectedTargetIds((current) =>
                      event.target.checked
                        ? [...current, target.propertyId]
                        : current.filter((id) => id !== target.propertyId),
                    );
                  }}
                />
                <span>{target.name}</span>
              </label>
            ))}
          </div>

          <div className={styles.addActions}>
            <small>
              The place details, image, miles and drive time are copied exactly.
              Use this across listings at the same property/location. Existing
              target entries are kept, matching names are skipped, and nothing is
              deleted.
            </small>
            <div className={styles.orderButtons}>
              <button
                type="button"
                disabled={!editable || saving || !selectedTargetIds.length}
                onClick={() => void copyExperiences(selectedTargetIds)}
              >
                Apply to selected
              </button>
              <button
                type="button"
                disabled={!editable || saving || !copyTargets.length}
                onClick={() =>
                  void copyExperiences(
                    copyTargets.map((target) => target.propertyId),
                  )
                }
              >
                Apply to all listings
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
