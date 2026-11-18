import { saveCustomHostFee, deleteCustomHostFee } from "@/app/host/rates/[slug]/custom-fees/actions";
import { createClient } from "@/lib/supabase/server";

type Fee = {
  id: string;
  name: string;
  description: string;
  amount_cents: number;
  calculation: string;
  taxable_as_accommodation: boolean;
  is_active: boolean;
};

const modeOptions = [
  ["FLAT_PER_STAY", "Once per stay"],
  ["PER_NIGHT", "Per night"],
  ["PER_GUEST_PER_STAY", "Per guest, per stay"],
  ["PER_GUEST_PER_NIGHT", "Per guest, per night"],
  ["PER_PET_PER_STAY", "Per pet, per stay"],
] as const;

function FeeForm({ unitId, fee }: { unitId: string; fee?: Fee }) {
  return (
    <form action={saveCustomHostFee} className="pricing-inline-form addon-form" style={{ marginTop: 12 }}>
      <input type="hidden" name="unitId" value={unitId}/>
      <input type="hidden" name="feeId" value={fee?.id ?? ""}/>
      <label className="wide"><span>Fee name</span>
        <input name="name" required minLength={2} maxLength={100} defaultValue={fee?.name ?? ""} placeholder="e.g. Linen fee, resort fee, additional cleaning" />
      </label>
      <label className="wide"><span>What is this fee for?</span>
        <input name="description" maxLength={500} defaultValue={fee?.description ?? ""} placeholder="Shown to hosts as context; fee name is always shown to guests" />
      </label>
      <label><span>Amount (USD)</span>
        <div className="money-input"><i>$</i><input type="number" name="amount" min="0" max="10000" step="0.01" defaultValue={fee && fee.amount_cents > 0 ? (fee.amount_cents / 100).toFixed(2) : ""} placeholder="Leave blank for draft" /></div>
      </label>
      <label><span>How to charge</span>
        <select name="calculation" defaultValue={fee?.calculation ?? "FLAT_PER_STAY"}>
          {modeOptions.map(([mode,label]) => <option key={mode} value={mode}>{label}</option>)}
        </select>
      </label>
      <label className="checkline wide"><input type="checkbox" name="taxableAsAccommodation" defaultChecked={fee?.taxable_as_accommodation ?? true}/>
        <span>Include in accommodation-taxable charges under the property's tax rules</span>
      </label>
      <label className="checkline wide"><input type="checkbox" name="isActive" defaultChecked={fee?.is_active ?? true}/>
        <span>Charge guests automatically (uncheck to save as inactive)</span>
      </label>
      <div className="pricing-inline-actions"><button className="button button-small" type="submit">{fee ? "Save fee" : "+ Add custom fee"}</button></div>
    </form>
  );
}

export async function HostCustomFeeManager({ unitId }: { unitId: string }) {
  const client = await createClient();
  const { data, error } = await client.from("unit_custom_fees")
    .select("id,name,description,amount_cents,calculation,taxable_as_accommodation,is_active")
    .eq("unit_id",unitId).order("created_at",{ascending:true});
  if (error) return <section className="panel" id="custom-fees"><h2>Custom host fees</h2><p>Fee settings could not be loaded. Refresh and try again.</p></section>;
  const fees = (data ?? []) as Fee[];
  return (
    <section className="panel pricing-rule-section" id="custom-fees">
      <div className="panel-head"><div><p className="eyebrow dark">Normal nightly rates &amp; fees</p><h2>Custom host fees</h2></div></div>
      <p className="muted">Add required fees such as linen, amenities or property services. Active fees are automatically included in every eligible quote and checkout, shown by name before payment. Unlike optional extras, guests don't have to select these. They aren't included in the Find A Place lodging-based service fee.</p>
      <p className="muted">Set the correct tax treatment for your location. A blank amount stays inactive until you set a price. Refundable security deposits must be configured separately.</p>
      {fees.length > 0 ? <div style={{ display:"grid", gap: 16 }}>
        {fees.map(fee => <div key={fee.id} style={{ borderTop:"1px solid var(--border, #d9ddd8)", paddingTop: 12 }}>
          <strong>{fee.name}</strong> <small>{fee.is_active ? "· Charged automatically" : "· Inactive draft"}</small>
          <FeeForm unitId={unitId} fee={fee}/>
          <form action={deleteCustomHostFee} style={{ marginTop: 8 }}><input type="hidden" name="unitId" value={unitId}/><input type="hidden" name="feeId" value={fee.id}/><button type="submit" className="button button-small button-quiet">Remove fee</button></form>
        </div>)}
      </div> : <p className="muted">No custom fees yet.</p>}
      <div style={{ marginTop: 20, paddingTop: 14, borderTop:"1px solid var(--border, #d9ddd8)" }}>
        <strong>Add a custom fee</strong>
        <FeeForm unitId={unitId}/>
      </div>
    </section>
  );
}
