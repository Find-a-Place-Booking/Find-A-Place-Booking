import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

import { saveSiteContentBlock } from "./actions";

const order = [
  "home.hero",
  "home.story",
  "home.host_cta",
  "about.hero",
  "about.who",
  "about.what",
  "about.community",
  "about.hosts",
];

function label(key: string) {
  return key
    .replace("home.", "Homepage · ")
    .replace("about.", "About page · ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [context, params] = await Promise.all([
    getAdminContext(),
    searchParams,
  ]);

  const canEdit = hasAnyAdminRole(context, [
    "SUPER_ADMIN",
    "OPERATIONS_ADMIN",
  ]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_content_blocks")
    .select("key,eyebrow,title,body,cta_label,cta_href,image_url,updated_at")
    .in("key", order);

  if (error) {
    throw new Error(
      "Unable to load site content. Apply migration 024 and refresh.",
    );
  }

  const byKey = new Map((data ?? []).map((row) => [row.key, row]));

  return (
    <AdminShell
      active="content"
      eyebrow="Public site"
      title="Site content"
      context={context}
    >
      {params.saved ? (
        <div className="admin-message success">{params.saved}</div>
      ) : null}

      {params.error ? (
        <div className="admin-message error">{params.error}</div>
      ) : null}

      <section className="panel">
        <p className="eyebrow dark">Structured editing</p>
        <h2>Change public copy without changing the booking platform.</h2>
        <p className="muted">
          These fields control selected homepage and About-page sections only.
          Booking, Stripe, taxes, host records and layouts are not editable here.
        </p>
      </section>

      <div className="admin-list">
        {order.map((key) => {
          const block = byKey.get(key);
          if (!block) return null;

          return (
            <section className="panel" id={key} key={key}>
              <div className="panel-head">
                <div>
                  <p className="eyebrow dark">{label(key)}</p>
                  <h2>{block.title}</h2>
                </div>
                <span className="status-pill status-muted">
                  {canEdit ? "Editable" : "Read only"}
                </span>
              </div>

              <form className="settings-form" action={saveSiteContentBlock}>
                <input type="hidden" name="key" value={key} />

                <label>
                  <span>Eyebrow</span>
                  <input
                    name="eyebrow"
                    defaultValue={block.eyebrow ?? ""}
                    disabled={!canEdit}
                  />
                </label>

                <label>
                  <span>Heading</span>
                  <input
                    name="title"
                    defaultValue={block.title}
                    disabled={!canEdit}
                    required
                  />
                </label>

                <label>
                  <span>Copy</span>
                  <textarea
                    name="body"
                    defaultValue={block.body ?? ""}
                    disabled={!canEdit}
                    rows={5}
                  />
                </label>

                <div className="form-row">
                  <label>
                    <span>Button label</span>
                    <input
                      name="cta_label"
                      defaultValue={block.cta_label ?? ""}
                      disabled={!canEdit}
                    />
                  </label>

                  <label>
                    <span>Button link</span>
                    <input
                      name="cta_href"
                      defaultValue={block.cta_href ?? ""}
                      disabled={!canEdit}
                    />
                  </label>
                </div>

                <label>
                  <span>Optional image URL</span>
                  <input
                    name="image_url"
                    defaultValue={block.image_url ?? ""}
                    disabled={!canEdit}
                  />
                </label>

                {canEdit ? (
                  <button className="button button-small" type="submit">
                    Save section
                  </button>
                ) : null}
              </form>
            </section>
          );
        })}
      </div>
    </AdminShell>
  );
}
