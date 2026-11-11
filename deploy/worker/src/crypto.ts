// Secrets at rest: a Page token on the clients row is sealed with AES-GCM under a key
// derived from the TOKEN_SECRET Worker secret. `v1.<iv>.<ciphertext>`, base64.

const enc = new TextEncoder();
const dec = new TextDecoder();

async function key(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function b64(b: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(b)));
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function seal(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), enc.encode(plain));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function open(sealed: string, secret: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("sealed: not a v1 value");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(secret), unb64(ct)));
}
