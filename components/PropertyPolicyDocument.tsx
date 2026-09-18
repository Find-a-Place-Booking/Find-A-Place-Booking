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
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow dark">Property policies</p>
          <h2>Upload the full rental-policy PDF.</h2>
        </div>
        <span className="status-pill status-muted">
          {current ? `Version ${current.version}` : "No PDF"}
        </span>
      </div>

      <p className="muted">
        Guests can open the current PDF before booking. Every replacement creates
        a new version instead of deleting the old one, so the policy reference
        can remain attached to the reservation record.
      </p>

      {current ? (
        <div className="setting-row">
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

      <label>
        <span>{current ? "Replace with a new version" : "Upload policy PDF"}</span>
        <input
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={(event) => upload(event.target.files?.[0] ?? null)}
        />
      </label>

      {message ? <p className="muted">{message}</p> : null}
      <small>PDF only · maximum 10 MB.</small>
    </section>
  );
}
