"use client";

import { useState } from "react";
import { saveSiteContentBlock } from "@/app/admin/content/actions";

type EditableBlock = {
  key: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
  editable_fields: string[] | null;
  policy_key: string | null;
};

/** Require an explicit review before admins publish public terms or other copy. */
export function AdminManagedCopyEditor({
  block,
  canEdit,
}: {
  block: EditableBlock;
  canEdit: boolean;
}) {
  const fields = new Set(block.editable_fields ?? []);
  const [eyebrow, setEyebrow] = useState(block.eyebrow || "");
  const [title, setTitle] = useState(block.title);
  const [body, setBody] = useState(block.body || "");
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const dirty = eyebrow !== (block.eyebrow || "") || title !== block.title || body !== (block.body || "");
  const resetReview = () => { setReviewing(false); setConfirmed(false); };
  const isPolicy = Boolean(block.policy_key);

  return (
    <form className="settings-form" action={saveSiteContentBlock}>
      <input type="hidden" name="key" value={block.key} />
      {fields.has("eyebrow") ? (
        <label><span>Eyebrow</span><input name="eyebrow" value={eyebrow} disabled={!canEdit} maxLength={200} onChange={e => { setEyebrow(e.target.value); resetReview(); }} /></label>
      ) : null}
      {fields.has("title") ? (
        <label><span>Heading</span><input name="title" value={title} disabled={!canEdit} required maxLength={500} onChange={e => { setTitle(e.target.value); resetReview(); }} /></label>
      ) : null}
      {fields.has("body") ? (
        <label><span>Copy</span><textarea name="body" value={body} disabled={!canEdit} rows={6} maxLength={20000} onChange={e => { setBody(e.target.value); resetReview(); }} /></label>
      ) : null}
      {canEdit ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button className="button button-small button-quiet" type="button" disabled={!dirty || !title.trim()} onClick={() => { setReviewing(true); setConfirmed(false); }}>Review changes</button>
            {reviewing ? <button className="button button-small button-quiet" type="button" onClick={resetReview}>Keep editing</button> : null}
          </div>
          {reviewing ? (
            <section aria-label="Content publishing preview" className="panel" style={{ border: "1px solid var(--line)", padding: 18, display: "grid", gap: 12 }}>
              <p className="eyebrow dark">Preview — not published</p>
              {fields.has("eyebrow") ? <small>{eyebrow || "(no eyebrow)"}</small> : null}
              <h3>{title}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{body || "(empty body)"}</p>
              <p className="muted">{isPolicy
                ? "Publishing this change updates public legal text and automatically advances the policy version. Previous acceptances remain recorded under their original version."
                : "Publishing this change makes it public immediately."}</p>
              <label className="checkline">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
                <span>I reviewed the full text and want to publish this version.</span>
              </label>
              <button type="submit" className="button button-small" disabled={!confirmed || !dirty || !title.trim()}>Publish reviewed changes</button>
            </section>
          ) : null}
        </>
      ) : null}
    </form>
  );
}
