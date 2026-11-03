/**
 * encrypt — AES-256 payload helpers for the Sole API.
 *
 * Rules:
 *  - encryptPayload: encrypts a plain object → { data: "<cipher>" }
 *    • File values are NOT encrypted — the payload is sent as-is via FormData.
 *    • If every value in the payload is a File the caller should skip encryption
 *      entirely and send as multipart/form-data instead.
 *  - decryptPayload: decrypts a cipher string returned by the API.
 *  - decryptUrlParam: decrypts URL-safe base64 params encrypted by the backend
 *    using IV:Encrypted (CBC / PKCS7) format.
 *
 * Set NEXT_PUBLIC_DISABLE_ENCRYPTION=true in your .env.local to send plain
 * payloads during development / debugging.
 */

import CryptoJS from "crypto-js";

const SECRET_KEY =
  process.env.NEXT_PUBLIC_SECRET_KEY;

const DISABLE_ENCRYPTION =
  process.env.NEXT_PUBLIC_DISABLE_ENCRYPTION === "true";

/* ------------------------------------------------------------------ *
 * encryptPayload                                                       *
 * ------------------------------------------------------------------ */

type Payload = Record<string, unknown>;

/**
 * Encrypts an object payload with AES-256.
 *
 * File values are preserved as metadata placeholders so they are not lost,
 * but in practice you should use `containsFiles` to check before calling
 * this and send a FormData instead when files are present.
 *
 * @returns { data: "<encrypted string>" }
 */
export function encryptPayload(payload: Payload): { data: string } {
  if (DISABLE_ENCRYPTION) {
    // Return the raw object cast — callers that type-check strictly will need
    // DISABLE_ENCRYPTION only during local development.
    return { data: JSON.stringify(payload) };
  }

  if (!SECRET_KEY) {
    throw new Error(
      "SECRET_KEY is not defined. Set NEXT_PUBLIC_SECRET_KEY in your .env.local.",
    );
  }

  // Normalise each value so JSON.stringify produces a clean string.
  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value instanceof File) {
      // Store file metadata — actual bytes must travel via FormData, not JSON.
      processed[key] = {
        __isFile: true,
        name: value.name,
        size: value.size,
        type: value.type,
        lastModified: value.lastModified,
      };
    } else if (typeof value === "boolean") {
      processed[key] = value.toString();
    } else if (value === null || value === undefined) {
      processed[key] = "";
    } else {
      processed[key] = value;
    }
  }

  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(processed),
    SECRET_KEY,
  ).toString();

  return { data: encrypted };
}

/* ------------------------------------------------------------------ *
 * decryptPayload                                                       *
 * ------------------------------------------------------------------ */

/**
 * Decrypts a cipher string returned by the API.
 *
 * @param encryptedData - the raw cipher string (not wrapped in an object)
 */
export function decryptPayload<T = unknown>(encryptedData: string): T {
  if (DISABLE_ENCRYPTION) {
    try {
      return JSON.parse(encryptedData) as T;
    } catch {
      return encryptedData as unknown as T;
    }
  }

  if (!SECRET_KEY) {
    throw new Error(
      "SECRET_KEY is not defined. Set NEXT_PUBLIC_SECRET_KEY in your .env.local.",
    );
  }

  const decryptedBytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
  const decryptedString = decryptedBytes.toString(CryptoJS.enc.Utf8);

  if (!decryptedString) {
    throw new Error("Decryption failed — wrong key or corrupted data.");
  }

  return JSON.parse(decryptedString) as T;
}

/* ------------------------------------------------------------------ *
 * decryptUrlParam                                                      *
 * ------------------------------------------------------------------ */

/**
 * Decrypts a URL parameter encrypted by the backend.
 *
 * Backend format: base64url( ivBase64 + ":" + encryptedBase64 )
 * Algorithm     : AES-CBC / PKCS7, key = SHA-256(SECRET_KEY)
 *
 * Returns the original value on failure so pages remain reachable during
 * a rolling key migration.
 */
export function decryptUrlParam(encryptedValue: string): string {
  if (DISABLE_ENCRYPTION) return encryptedValue;
  if (!encryptedValue) return encryptedValue;

  if (!SECRET_KEY) {
    console.warn("SECRET_KEY is not defined. Returning original value.");
    return encryptedValue;
  }

  try {
    // Restore standard base64 padding (URL-safe base64 strips it).
    let base64 = encryptedValue.replace(/-/g, "+").replace(/_/g, "/");
    const padding = base64.length % 4;
    if (padding) base64 += "=".repeat(4 - padding);

    const combined = atob(base64);
    const colonIdx = combined.indexOf(":");
    if (colonIdx === -1) {
      throw new Error("Invalid encrypted format — missing colon separator.");
    }

    const ivBase64 = combined.slice(0, colonIdx);
    const encryptedBase64 = combined.slice(colonIdx + 1);

    if (!ivBase64 || !encryptedBase64) {
      throw new Error("Invalid encrypted format — missing IV or ciphertext.");
    }

    const iv = CryptoJS.enc.Base64.parse(ivBase64);
    const key = CryptoJS.SHA256(SECRET_KEY);

    const decrypted = CryptoJS.AES.decrypt(encryptedBase64, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result) {
      throw new Error("Decryption failed — wrong key or corrupted data.");
    }

    return result;
  } catch (err) {
    console.error("URL parameter decryption error:", err);
    // Graceful degradation: return original value so the page doesn't hard-crash.
    return encryptedValue;
  }
}

/* ------------------------------------------------------------------ *
 * Helper                                                               *
 * ------------------------------------------------------------------ */

/**
 * Returns true if the payload contains at least one File value.
 * Use this to decide whether to skip encryptPayload and send FormData instead.
 */
export function containsFiles(payload: Payload): boolean {
  return Object.values(payload).some((v) => v instanceof File);
}
