"use client";

import { useState } from "react";
import { saveAddOn } from "@/app/host/rates/actions";

const choices = [
  { value: "", label: "Choose an optional guest extra" },
  { value: "Extra cleaning", label: "Extra cleaning" },
  { value: "Early check-in", label: "Early check-in" },
  { value: "Late checkout", label: "Late checkout" },
  { value: "Firewood bundle", label: "Firewood bundle" },
  { value: "Parking add-on", label: "Parking add-on" },
  { value: "Breakfast basket", label: "Breakfast basket" },
  { value: "Pet welcome package", label: "Pet welcome package" },
  { value: "other", label: "Other — write a custom name" },
] as const;

/** Uses existing host-owned add-on pricing; does not create undisclosed mandatory charges. */
export function HostOptionalFeeBuilder({ unitId, slug }: { unitId: string; slug: string }) {
  const [type, setType] = useState("");
  const [customName, setCustomName] = useState("");
  const [amount, setAmount] = useState("");
  const name = type === "other" ? customName.trim() : type;

  return (
    <form action={saveAddOn} className="pricing-inline-form addon-form">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="addOnId" value="" />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="amount" value={amount || "0"} />
      <label className="wide"><span>Optional fee / extra type</span>
        <select value={type} onChange={e => setType(e.target.value)} required>
          {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      </label>
      {type === "other" ? <label className="wide"><span>Custom name</span><input value={customName} onChange={e => setCustomName(e.target.value)} maxLength={120} required placeholder="What is this optional charge for?" /></label> : null}
      <label className="wide"><span>Description</span><textarea name="description" maxLength={1000} placeholder="Explain exactly what the guest receives." /></label>
      <label><span>Price (leave blank until you know it)</span>
        <div className="money-input"><i>$</i><input type="number" value={amount} onChange={event => setAmount(event.target.value)} min="0" step="0.01" placeholder="Leave blank to save an inactive draft" /></div>
      </label>
      <label><span>How it is charged</span>
        <select name="calculation" defaultValue="FLAT_PER_STAY">
          <option value="FLAT_PER_STAY">Once per stay</option>
          <option value="PER_NIGHT">Per night</option>
          <option value="PER_PERSON">Per person</option>
          <option value="PER_PERSON_PER_NIGHT">Per person per night</option>
        </select>
      </label>
      <input type="hidden" name="sortOrder" value="0" />
      <label className="checkline wide"><input type="checkbox" name="guestVisible" disabled={!amount} defaultChecked /><span>Show this optional extra to guests at booking</span></label>
      <label className="checkline wide"><input type="checkbox" name="isActive" disabled={!amount} defaultChecked /><span>Extra is active</span></label>
      <p className="muted wide">Leave the amount blank to save a $0 inactive draft, then set the actual price and activate it later under Rates &amp; fees. Draft extras are not shown to guests. Never use this form for a refundable security deposit or undisclosed mandatory fee.</p>
      <div className="pricing-inline-actions"><button className="button button-small" type="submit" disabled={!name}>Save optional extra</button></div>
    </form>
  );
}
