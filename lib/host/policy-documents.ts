import { createClient } from "@/lib/supabase/server";

export type HostPolicyDocument = {
  id: string;
  originalName: string;
  version: number;
  createdAt: string;
  signedUrl: string | null;
};

export async function getCurrentPropertyPolicyDocument(
  propertyId: string,
): Promise<HostPolicyDocument | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("property_policy_documents")
    .select("id,storage_path,original_name,version,created_at")
    .eq("property_id", propertyId)
    .eq("is_current", true)
    .maybeSingle();

  if (error || !data) return null;

  const { data: signed } = await supabase.storage
    .from("property-documents")
    .createSignedUrl(data.storage_path, 3600);

  return {
    id: data.id,
    originalName: data.original_name,
    version: data.version,
    createdAt: data.created_at,
    signedUrl: signed?.signedUrl ?? null,
  };
}
