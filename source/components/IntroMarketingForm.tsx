"use client";

import { useState } from "react";
import { saveHostMarketingPreferences } from "@/app/host/marketing/actions";

type Preferences = {
  organization_id: string;
  organization_name: string;
  intro_enabled: boolean;
  advertising_requested: boolean;
  contact_email: string;
  notes: string;
  participating_properties: number;
};

export function IntroMarketingForm({preferences, returnTo = "marketing"}: {preferences:Preferences; returnTo?: "marketing" | "onboarding"}) {
  const [intro, setIntro] = useState(preferences.intro_enabled);
  const [extra, setExtra] = useState(preferences.advertising_requested ? "YES" : "NO");
  return (
    <form className="settings-form" action={saveHostMarketingPreferences}>
      <input type="hidden" name="organization_id" value={preferences.organization_id}/>
      <input type="hidden" name="return_to" value={returnTo}/>
      <label style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        <input type="checkbox" name="intro_offer" checked={intro}
          onChange={event=>setIntro(event.target.checked)}
          style={{width:20,height:20,marginTop:4}} />
        <span>
          <strong>Yes, enroll my eligible new listings in the 25% introductory offer.</strong>
          <small style={{display:"block"}}>25% off lodging for the first three bookings on each eligible listing. No discount on fees or taxes. Turning this off stops new discounts; past bookings and discounts remain unchanged.</small>
        </span>
      </label>
      {!intro ? <p className="muted">No introductory discount will be offered unless you check the box above.</p> : null}
      {intro ? (
        <div style={{display:"grid",gap:12}}>
          <label>
            <span>Would you like additional advertising from Find A Place?</span>
            <select name="additional_advertising" value={extra} onChange={event=>setExtra(event.target.value)}>
              <option value="NO">No thanks, just the introductory offer</option>
              <option value="YES">Yes, please contact me about extra advertising</option>
            </select>
          </label>
          {extra === "YES" ? (
            <label>
              <span>Best email for the Find A Place advertising team</span>
              <input type="email" name="contact_email" maxLength={254} required
                defaultValue={preferences.contact_email}
                placeholder="you@example.com" autoComplete="email" />
              <small>We will send this request to Gez and Renea. No advertising charges are authorized by this form.</small>
            </label>
          ) : null}
        </div>
      ) : null}
      <label>
        <span>Anything we should know? (optional)</span>
        <textarea name="notes" rows={3} maxLength={1000}
          defaultValue={preferences.notes} placeholder="Which listing you want to feature, preferred promotion dates, advertising goals…" />
      </label>
      <p className="muted">{preferences.participating_properties} published {preferences.participating_properties===1?"listing currently shows":"listings currently show"} an introductory offer. Any eligible listing created after opting in will be enrolled automatically.</p>
      <button className="button" type="submit">Save marketing choices</button>
    </form>
  );
}
