import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

import { saveSiteContentBlock } from "./actions";

type ContentBlock = {
  key: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
  content_group: string | null;
  admin_label: string | null;
  editable_fields: string[] | null;
  policy_key: string | null;
  sort_order: number | null;
};

const groupOrder = [
  "Homepage", "About", "Hosting", "Help", "Contact", "Stay search",
  "Property policies", "Booking Terms", "Host Agreement",
  "Cancellation Policy", "Privacy Notice",
];

const policyGroups = new Set([
  "Booking Terms", "Host Agreement", "Cancellation Policy", "Privacy Notice",
]);

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [context, params] = await Promise.all([getAdminContext(), searchParams]);
  const canEdit = hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"]);
  const supabase = await createClient();

  const [{ data, error }, { data: versions }] = await Promise.all([
    supabase
      .from("site_content_blocks")
      .select("key,eyebrow,title,body,content_group,admin_label,editable_fields,policy_key,sort_order")
      .eq("admin_editable", true)
      .order("content_group", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase.from("platform_policy_versions").select("policy_key,version_label"),
  ]);

  if (error) throw new Error("Unable to load managed site content. Apply the latest content migration and refresh.");

  const rows = (data ?? []) as ContentBlock[];
  const versionByPolicy = new Map((versions ?? []).map((row) => [row.policy_key as string, row.version_label as string]));
  const groups = new Map<string, ContentBlock[]>();
  for (const row of rows) {
    const group = row.content_group || "Other";
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }

  const orderedGroups = [
    ...groupOrder.filter((group) => groups.has(group)),
    ...[...groups.keys()].filter((group) => !groupOrder.includes(group)),
  ];

  return (
    <AdminShell active="content" eyebrow="Public site" title="Site copy & policies" context={context}>
      {params.saved ? <div className="admin-message success">{params.saved}</div> : null}
      {params.error ? <div className="admin-message error">{params.error}</div> : null}

      <section className="panel">
        <p className="eyebrow dark">Safe copy controls</p>
        <h2>Edit the wording without editing the machinery.</h2>
        <p className="muted">
          This area controls approved public copy and platform-policy wording. Buttons, link destinations,
          navigation, payment behavior, Stripe routes, booking state, taxes, percentages and other easy-to-break
          controls remain fixed in code.
        </p>
      </section>

      <div className="admin-list content-editor-list">
        {orderedGroups.map((group, groupIndex) => {
          const blocks = groups.get(group) ?? [];
          const policyKey = blocks.find((block) => block.policy_key)?.policy_key;
          const version = policyKey ? versionByPolicy.get(policyKey) ?? null : null;
          return (
            <details className="panel" key={group} open={groupIndex === 0}>
              <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
                <span>
                  <span className="eyebrow dark">{group}</span>
                  <strong style={{ display: "block", marginTop: 4 }}>{blocks.length} editable section{blocks.length === 1 ? "" : "s"}</strong>
                </span>
                <span className="status-pill status-muted">{version ? `Policy ${version}` : canEdit ? "Editable" : "Read only"}</span>
              </summary>

              <p className="muted" style={{ marginTop: 14 }}>
                {policyGroups.has(group)
                  ? "Legal/policy copy. Saving a section publishes it immediately and automatically advances that policy version."
                  : "Safe public-facing wording only. Navigation, buttons, booking behavior and operational controls stay fixed."}
              </p>

              <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                {blocks.map((block) => {
                  const fields = new Set(block.editable_fields ?? []);
                  return (
                    <section id={block.key} key={block.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow dark">{block.admin_label || block.key}</p>
                          <h2 style={{ fontSize: "1.1rem" }}>{block.title}</h2>
                        </div>
                        <span className="status-pill status-muted">{block.policy_key ? "Versioned policy" : "Public copy"}</span>
                      </div>

                      <form className="settings-form" action={saveSiteContentBlock}>
                        <input type="hidden" name="key" value={block.key} />
                        {fields.has("eyebrow") ? <label><span>Eyebrow</span><input name="eyebrow" defaultValue={block.eyebrow ?? ""} disabled={!canEdit} /></label> : null}
                        {fields.has("title") ? <label><span>Heading</span><input name="title" defaultValue={block.title} disabled={!canEdit} required /></label> : null}
                        {fields.has("body") ? <label><span>Copy</span><textarea name="body" defaultValue={block.body ?? ""} disabled={!canEdit} rows={6} /></label> : null}
                        {canEdit ? <button className="button button-small" type="submit">Save wording</button> : null}
                      </form>
                    </section>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </AdminShell>
  );
}
