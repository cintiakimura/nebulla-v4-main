import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function derivedKey(): Buffer {
  const raw =
    process.env.NEBULA_SECRETS_ENCRYPTION_KEY?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "dev-only-nebula-at-rest-change-me";
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

/** AES-256-GCM; output is base64(iv || tag || ciphertext). */
export function encryptAtRest(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, derivedKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptAtRest(b64: string): string | null {
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, derivedKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
