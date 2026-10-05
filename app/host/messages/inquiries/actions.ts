"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deliverHostProfileInquiryReply } from "@/lib/notifications/host-profile-inquiries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function inquiryRedirect(
  kind: "saved" | "error",
  message: string,
  inquiryId?: string,
): never {
  const params = new URLSearchParams();
  params.set(kind, message);
  if (inquiryId) params.set("inquiry", inquiryId);
  redirect(`/host/messages/inquiries?${params.toString()}`);
}

async function getAccessibleInquiry(inquiryId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/host/sign-in");

  const { data: inquiry, error } = await supabase
    .from("host_profile_inquiries")
    .select("id,organization_id,status")
    .eq("id", inquiryId)
    .maybeSingle();

  if (error || !inquiry) {
    inquiryRedirect("error", "That inquiry could not be found.");
  }

  return { supabase, inquiry };
}

export async function markHostProfileInquiryRead(formData: FormData) {
  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  if (!inquiryId) inquiryRedirect("error", "Missing inquiry.");

  const { supabase } = await getAccessibleInquiry(inquiryId);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("host_profile_inquiries")
    .update({
      status: "READ",
      read_by_host_at: now,
      updated_at: now,
    })
    .eq("id", inquiryId)
    .eq("status", "NEW");

  if (error) {
    inquiryRedirect("error", "The inquiry could not be marked read.", inquiryId);
  }

  revalidatePath("/host/messages/inquiries");
  inquiryRedirect("saved", "Inquiry marked read.", inquiryId);
}

export async function replyToHostProfileInquiry(formData: FormData) {
  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const reply = String(formData.get("reply") ?? "").trim().slice(0, 4000);

  if (!inquiryId) inquiryRedirect("error", "Missing inquiry.");
  if (!reply) {
    inquiryRedirect("error", "Write a reply before sending.", inquiryId);
  }

  const { supabase } = await getAccessibleInquiry(inquiryId);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("host_profile_inquiries")
    .update({
      host_reply: reply,
      status: "REPLIED",
      read_by_host_at: now,
      replied_at: now,
      updated_at: now,
    })
    .eq("id", inquiryId);

  if (error) {
    inquiryRedirect("error", "The reply could not be saved.", inquiryId);
  }

  const admin = createAdminClient();
  after(async () => {
    try {
      await deliverHostProfileInquiryReply(admin, inquiryId);
    } catch (error) {
      console.error("[host inquiry reply] email failed", {
        inquiryId,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  });

  revalidatePath("/host/messages/inquiries");
  inquiryRedirect("saved", "Reply saved and queued for email delivery.", inquiryId);
}
