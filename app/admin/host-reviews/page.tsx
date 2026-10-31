import { AdminShell } from "@/components/AdminShell";
import { StarRating } from "@/components/StarRating";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderatePublicHostReview } from "./actions";

export const dynamic = "force-dynamic";

export default async function ModerateHostReviews({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const context = await getAdminContext();
  const canModerate = hasAnyAdminRole(context,["SUPER_ADMIN","OPERATIONS_ADMIN"]);
  const { saved, error: queryError } = await searchParams;
  const admin = createAdminClient();
  const { data: reviews, error } = await admin.from("public_host_reviews")
    .select("id,organization_id,reviewer_name,reviewer_email,rating,body,experience_type,created_at,status")
    .order("created_at",{ascending:false}).limit(100);
  const items = reviews ?? [];
  const ids = [...new Set(items.map(r => r.organization_id))];
  const { data: orgs } = ids.length
    ? await admin.from("organizations").select("id,name").in("id", ids)
    : { data: [] as {id:string;name:string}[] };
  const names = new Map((orgs ?? []).map(o=>[o.id,o.name]));
  const pending = items.filter(r=>r.status==="PENDING");
  const recent = items.filter(r=>r.status!=="PENDING");
  return (
    <AdminShell active="host-reviews" title="Host reviews" eyebrow="Community feedback moderation" context={context}>
      <div className="dash-toolbar">
        <div><p>Community-submitted feedback is not a verified Find A Place booking. It remains private until approved here. Verified guest reviews are handled separately and have not changed.</p></div>
      </div>
      {saved ? <div className="admin-message success">Review decision saved.</div> : null}
      {queryError || error ? <div className="admin-message error">{error ? "Unable to load reviews." : "Review decision could not be saved."}</div> : null}
      <section className="panel" style={{display:"grid",gap:16}}>
        <h2>Awaiting review ({pending.length})</h2>
        {pending.length ? pending.map(r=>(
          <article key={r.id} style={{borderTop:"1px solid #e1dfd8",paddingTop:14,display:"grid",gap:10}}>
            <div><strong>{names.get(r.organization_id) || "Host"}</strong> · {r.reviewer_name} · {r.reviewer_email}</div>
            <div><StarRating rating={Number(r.rating)} showValue /> · {r.experience_type.replaceAll("_"," ")}</div>
            <p style={{whiteSpace:"pre-wrap"}}>{r.body}</p>
            <small>Received {new Date(r.created_at).toLocaleString("en-US")}. Check whether the content describes a firsthand experience. Do not approve fake, defamatory, or irrelevant submissions.</small>
            {canModerate ? (
              <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
                <form action={moderatePublicHostReview}><input type="hidden" name="reviewId" value={r.id}/><input type="hidden" name="decision" value="PUBLISHED"/><button className="button button-small" type="submit">Approve review</button></form>
                <form action={moderatePublicHostReview}><input type="hidden" name="reviewId" value={r.id}/><input type="hidden" name="decision" value="REJECTED"/><button className="button button-small button-quiet" type="submit">Reject</button></form>
              </div>
            ) : <small>Only Operations or Super Admin can moderate reviews.</small>}
          </article>
        )) : <p>No reviews awaiting moderation.</p>}
      </section>
      <section className="panel" style={{marginTop:16}}>
        <h2>Recent decisions</h2>
        {recent.length ? recent.slice(0,30).map(r=><p key={r.id}><strong>{r.status}</strong> · {names.get(r.organization_id)||"Host"} · {r.reviewer_name} · {r.rating} stars</p>) : <p>No reviews processed yet.</p>}
      </section>
    </AdminShell>
  );
}
