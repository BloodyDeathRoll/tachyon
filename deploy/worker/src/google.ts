// Verify a Google Identity Services credential (an OpenID Connect ID token, RS256)
// against Google's published JWKS. This is the security boundary of the whole
// user API: everything a client claims about who it is comes through here.
//
// Google's rules (https://developers.google.com/identity/gsi/web/guides/verify-google-id-token):
// signature by a key from https://www.googleapis.com/oauth2/v3/certs, `iss` is
// accounts.google.com (with or without https://), `aud` is OUR client id, `exp`
// is in the future. We also require `email_verified`, so a spoofable unverified
// address can never become an account.

import { unb64url } from "./session.ts";

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const JWKS_TTL_MS = 6 * 3600 * 1000;
const JWKS_MIN_REFRESH_MS = 5 * 60 * 1000; // an unknown kid forces a refetch, but not a storm

export interface GoogleClaims {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export type Jwk = JsonWebKey & { kid?: string };
export type FetchJwks = () => Promise<Jwk[]>;

export async function fetchGoogleJwks(): Promise<Jwk[]> {
  const r = await fetch(GOOGLE_JWKS_URL, { cf: { cacheTtl: 3600 } } as RequestInit);
  if (!r.ok) throw new Error(`jwks ${r.status}`);
  const body = (await r.json()) as { keys?: Jwk[] };
  if (!Array.isArray(body.keys)) throw new Error("jwks: no keys");
  return body.keys;
}

// Module-level cache: lives as long as the isolate. Stale-ok: a JWKS outage only
// matters for kids we have never seen.
let cache: { keys: Jwk[]; at: number } | null = null;

async function keysFor(kid: string, now: number, fetchJwks: FetchJwks): Promise<Jwk | null> {
  const find = () => cache?.keys.find((k) => k.kid === kid) ?? null;
  if (cache && now - cache.at < JWKS_TTL_MS) {
    const hit = find();
    if (hit) return hit;
    if (now - cache.at < JWKS_MIN_REFRESH_MS) return null;
  }
  try {
    cache = { keys: await fetchJwks(), at: now };
  } catch {
    if (!cache) throw new Error("jwks unavailable");
  }
  return find();
}

/** For tests: forget the cached key set. */
export function resetJwksCache(): void {
  cache = null;
}

function decodeJson(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(unb64url(part)));
}

export class TokenError extends Error {}

/** Claims of a valid Google ID token for `clientId`, or a TokenError. */
export async function verifyIdToken(
  credential: string,
  clientId: string,
  opts: { now?: number; fetchJwks?: FetchJwks } = {},
): Promise<GoogleClaims> {
  const now = opts.now ?? Date.now();
  const fetchJwks = opts.fetchJwks ?? fetchGoogleJwks;
  const parts = credential.split(".");
  if (parts.length !== 3) throw new TokenError("malformed");
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = decodeJson(h) as { alg?: string; kid?: string };
    claims = decodeJson(p) as Record<string, unknown>;
  } catch {
    throw new TokenError("malformed");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new TokenError("alg");
  const jwk = await keysFor(header.kid, now, fetchJwks);
  if (!jwk) throw new TokenError("kid");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "verify",
  ]);
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      unb64url(s) as BufferSource,
      new TextEncoder().encode(`${h}.${p}`),
    );
  } catch {
    ok = false;
  }
  if (!ok) throw new TokenError("signature");
  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss)) throw new TokenError("iss");
  const aud = claims.aud;
  if (aud !== clientId && !(Array.isArray(aud) && aud.includes(clientId))) throw new TokenError("aud");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) throw new TokenError("exp");
  if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 64) {
    throw new TokenError("sub");
  }
  const email = typeof claims.email === "string" ? claims.email : null;
  if (email !== null && claims.email_verified !== true) throw new TokenError("email_verified");
  return {
    sub: claims.sub,
    email,
    name: typeof claims.name === "string" ? claims.name.slice(0, 200) : null,
    picture: typeof claims.picture === "string" && claims.picture.startsWith("https://") ? claims.picture : null,
  };
}
