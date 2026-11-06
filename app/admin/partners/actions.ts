"use server";

/** Legacy action remains disabled for old links/forms. 7% is the only new-booking rate. */
export async function setPartnerCommission(_formData: FormData): Promise<never> {
  throw new Error("Individual partner commission rates are no longer available.");
}
