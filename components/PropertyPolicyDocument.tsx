"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { HostPolicyDocument } from "@/lib/host/policy-documents";

export function PropertyPolicyDocument({
  propertyId,
  organizationId,
  current,
}: {
  propertyId: string;
  organizationId: string;
  current: HostPolicyDocument | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File | null) {
    if (!file || busy) return;

    if (file.type !== "application/pdf") {
      setMessage("Use a PDF file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage("Policy PDF must be 10 MB or smaller.");
      return;
    }

    setBusy(true);
    setMessage("Uploading policy PDF…");

    const supabase = createClient();
    const path = `${organizationId}/${propertyId}/${crypto.randomUUID()}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("property-documents")
      .upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("[policy pdf upload]", uploadError);
      setBusy(false);
      setMessage("The PDF could not be uploaded.");
      return;
    }

    const { error: registerError } = await supabase.rpc(
      "register_property_policy_document",
      {
        target_property_id: propertyId,
        document_storage_path: path,
        document_original_name: file.name,
        document_size_bytes: file.size,
      },
    );

    if (registerError) {
      console.error("[policy pdf register]", registerError);
      await supabase.storage.from("property-documents").remove([path]);
      setBusy(false);
      setMessage("The PDF uploaded, but the policy version could not be saved.");
      return;
    }

    setMessage("Policy PDF saved. Refreshing…");
    window.location.reload();
  }

  return (
    <section className="panel property-policy-document">
      <div className="panel-head">
        <div>
          <p className="eyebrow dark">Property policies</p>
          <h2>Written rules and optional policy PDF</h2>
        </div>
        <span className="status-pill status-muted">
          {current ? `PDF version ${current.version}` : "No PDF"}
        </span>
      </div>

      <p className="muted">
        Use the Policies &amp; stay rules section above for written rules. You can
        also upload a full rental-policy PDF here. Guests must open the policy
        review and agree before payment, and each reservation keeps the policy
        version that applied when the booking was started.
      </p>

      {current ? (
        <div className="setting-row property-policy-current">
          <span>Current document</span>
          <strong>
            {current.signedUrl ? (
              <a href={current.signedUrl} target="_blank" rel="noreferrer">
                {current.originalName}
              </a>
            ) : (
              current.originalName
            )}
          </strong>
        </div>
      ) : null}

      <label className={`property-policy-upload${busy ? " busy" : ""}`}>
        <span>{current ? "Replace with a new version" : "Upload policy PDF"}</span>
        <strong>{busy ? "Uploading…" : "Choose a PDF"}</strong>
        <small>Optional · PDF only · maximum 10 MB. Written policies can be used without a PDF.</small>
        <input
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={(event) => upload(event.target.files?.[0] ?? null)}
        />
      </label>

      {message ? <p className="property-policy-message">{message}</p> : null}
    </section>
  );
}
