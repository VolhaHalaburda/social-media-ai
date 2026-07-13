import type { SessionUser } from "./types";

// ---------------------------------------------------------------------------
// Session tokens: a JSON payload signed with HMAC-SHA256 (Web Crypto only, so
// this module works in BOTH the edge proxy and Node route handlers).
//
// Format: base64url(payload) + "." + base64url(hmac)
// Payload: { sub, email, name, role, exp }
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "vs_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface TokenPayload extends SessionUser {
  exp: number; // unix seconds
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET env var is missing or too short (min 16 chars). Set it in .env / Vercel project settings.");
  }
  return secret;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(user: SessionUser): Promise<string> {
  const payload: TokenPayload = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac(body));
  return `${body}.${sig}`;
}

// Returns the session user if the token is authentic and unexpired, else null.
export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const expected = b64urlEncode(await hmac(body));
    if (!timingSafeEqualStr(expected, sig)) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as TokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: payload.id, email: payload.email, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

// Machine token for server-to-server calls (the pipeline worker chain), which
// carry no user cookie. Derived from AUTH_SECRET so no extra env var is needed.
export const INTERNAL_TOKEN_HEADER = "x-internal-token";

export async function internalToken(): Promise<string> {
  return b64urlEncode(await hmac("pipeline-worker-v1"));
}

export async function verifyInternalToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  return timingSafeEqualStr(await internalToken(), token);
}
