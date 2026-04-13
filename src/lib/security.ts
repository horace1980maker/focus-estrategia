import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PASSWORD_HASH_FORMAT_VERSION = "v1";
const SESSION_TOKEN_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEYLEN_BYTES = 64;

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, PASSWORD_KEYLEN_BYTES).toString("hex");
  return `${PASSWORD_HASH_FORMAT_VERSION}:${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const parts = passwordHash.split(":");
  if (parts.length !== 3) {
    return false;
  }

  const [version, salt, hash] = parts;
  if (version !== PASSWORD_HASH_FORMAT_VERSION || !salt || !hash) {
    return false;
  }

  const candidateHash = scryptSync(password, salt, PASSWORD_KEYLEN_BYTES).toString("hex");
  const expected = Buffer.from(hash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  if (expected.length !== candidate.length) {
    return false;
  }

  return timingSafeEqual(expected, candidate);
}
