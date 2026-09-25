import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const PREFIX = "v1";

function encryptionKey() {
  const raw = process.env.PMS_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "PMS_CREDENTIAL_ENCRYPTION_KEY is required before connecting a PMS account.",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "PMS_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

export function encryptPmsCredential(value: string) {
  if (!value) throw new Error("A PMS credential is required.");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptPmsCredential(payload: string) {
  const [version, ivText, tagText, encryptedText] = payload.split(".");
  if (
    version !== PREFIX ||
    !ivText ||
    !tagText ||
    !encryptedText
  ) {
    throw new Error("Stored PMS credential has an unsupported format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
