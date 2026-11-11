// Rosa session tokens: stateless, HMAC-SHA256 signed, `v1.<payload>.<sig>`.
//
// Stateless on purpose: a sessions table would cost a D1 write per sign-in and a
// read per request; this costs nothing per request, and revocation is still free
// because every authenticated route reads the user's row anyway - the token's
// `ep` must equal `users.session_epoch`, so bumping the epoch kills every token.

export interface Session {
  sub: string; // Google user id
  exp: number; // unix ms
  ep: number; // users.session_epoch at mint time
}

export const SESSION_TTL_MS = 180 * 24 * 3600 * 1000; // a daily-use PWA, not a bank

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function mint(session: Session, secret: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(session)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`v1.${payload}`));
  return `v1.${payload}.${b64url(sig)}`;
}

/** The session a token encodes, or null for anything malformed, tampered or expired.
    Signature check is `crypto.subtle.verify` (constant time), never string equality. */
export async function verify(token: string, secret: string, now = Date.now()): Promise<Session | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payload, sig] = parts as [string, string, string];
  let sigBytes: Uint8Array;
  try {
    sigBytes = unb64url(sig);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    sigBytes as BufferSource,
    enc.encode(`v1.${payload}`),
  );
  if (!ok) return null;
  let session: unknown;
  try {
    session = JSON.parse(dec.decode(unb64url(payload)));
  } catch {
    return null;
  }
  if (
    typeof session !== "object" ||
    session === null ||
    typeof (session as Session).sub !== "string" ||
    typeof (session as Session).exp !== "number" ||
    typeof (session as Session).ep !== "number"
  ) {
    return null;
  }
  const s = session as Session;
  if (s.exp <= now) return null;
  return s;
}

/** Constant-time equality for shared secrets (admin header). */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  // HMAC both with a throwaway key and compare the MACs with subtle.verify: equal
  // inputs give equal MACs, and the comparison itself does not leak timing.
  const key = (await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])) as CryptoKey;
  const macA = await crypto.subtle.sign("HMAC", key, enc.encode(a));
  return crypto.subtle.verify("HMAC", key, macA, enc.encode(b));
}
