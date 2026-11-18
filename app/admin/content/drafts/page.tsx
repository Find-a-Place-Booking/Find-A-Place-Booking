import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";
import { publishContentDraft, saveContentDraft } from "./actions";

export default async function ContentDraftsPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; published?: string; error?: string }>;
}) {
  const [context, q] = await Promise.all([getAdminContext(), searchParams]);
  const canEdit = hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"]);
  const client = await createClient();
  const [{ data: blocks, error }, { data: drafts }] = await Promise.all([
    client.from("site_content_blocks").select("key,eyebrow,title,body,content_group,policy_key,admin_editable,editable_fields")
      .eq("admin_editable", true).order("content_group"),
    client.from("site_copy_drafts").select("key,title,eyebrow,body,updated_at"),
  ]);
  const draftByKey = new Map((drafts || []).map(d => [d.key, d]));
  return <AdminShell active="content" eyebrow="Public site" title="Content & policy drafts" context={context}>
    <p><Link href="/admin/content">← Public content editor</Link></p>
    <p className="muted">Save a private draft without changing the live site. Review the complete draft before publishing. Publishing legal sections automatically advances the policy version through the existing audited process.</p>
    {q.saved ? <p className="admin-message success">Private draft saved. The public site is unchanged.</p> : null}
    {q.published ? <p className="admin-message success">Draft published through the versioned policy editor.</p> : null}
    {q.error || error ? <p className="admin-message error">Could not complete the draft action. Review your admin permissions and retry.</p> : null}
    {(blocks || []).map(block => {
      const draft = draftByKey.get(block.key);
      const title = draft?.title ?? block.title;
      const body = draft?.body ?? block.body;
      const eyebrow = draft?.eyebrow ?? block.eyebrow;
      const fields = new Set(block.editable_fields || []);
      return <details id={block.key} className="panel" key={block.key} style={{ marginBottom: 18 }}>
        <summary style={{ cursor: "pointer" }}><strong>{block.content_group || "Content"} · {block.title}</strong> {draft ? "· Draft saved" : ""}</summary>
        <form action={saveContentDraft} className="settings-form" style={{ marginTop: 16 }}>
          <input type="hidden" name="key" value={block.key} />
          {fields.has("eyebrow") ? <label><span>Eyebrow</span><input name="eyebrow" defaultValue={eyebrow ?? ""} disabled={!canEdit} /></label> : <input type="hidden" name="eyebrow" value={eyebrow ?? ""} />}
          {fields.has("title") ? <label><span>Heading</span><input name="title" defaultValue={title} required disabled={!canEdit} /></label> : <input type="hidden" name="title" value={title} />}
          {fields.has("body") ? <label><span>Copy</span><textarea name="body" defaultValue={body ?? ""} rows={7} disabled={!canEdit} /></label> : <input type="hidden" name="body" value={body ?? ""} />}
          {canEdit ? <button className="button button-small" type="submit">Save private draft</button> : null}
        </form>
        {draft ? <div style={{ marginTop: 18 }}>
          <strong>Saved draft preview</strong>
          <div className="panel" style={{ whiteSpace: "pre-wrap" }}><h3>{draft.title}</h3><p>{draft.body}</p></div>
          {canEdit ? <form action={publishContentDraft} className="settings-form">
            <input type="hidden" name="key" value={block.key} />
            <label className="checkline"><input type="checkbox" name="publishConfirmed" required /><span>I reviewed this draft and want to publish it to the public site now.</span></label>
            <button type="submit" className="button">Publish reviewed draft {block.policy_key ? "and advance policy version" : ""}</button>
          </form> : null}
        </div> : null}
      </details>;
    })}
  </AdminShell>;
}
