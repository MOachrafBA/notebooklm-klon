import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const DEMO_ACCESS_COOKIE = "sourcewise_demo_access";
export const DEMO_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export function getDemoAccessPassword(): string | null {
  const password = process.env.SOURCE_ACCESS_PASSWORD;
  return password && password.length >= 32 ? password : null;
}

export function verifyDemoAccessPassword(candidate: string, password: string): boolean {
  const candidateBytes = Buffer.from(candidate);
  const passwordBytes = Buffer.from(password);
  return (
    candidateBytes.length === passwordBytes.length &&
    timingSafeEqual(candidateBytes, passwordBytes)
  );
}

export function createDemoSessionToken(password: string, now: number = Date.now()): string {
  const expiresAt = Math.floor(now / 1_000) + DEMO_SESSION_MAX_AGE_SECONDS;
  return `${expiresAt}.${createSessionSignature(expiresAt, password)}`;
}

export function isDemoAccessAuthorized(request: Request): boolean {
  const password = getDemoAccessPassword();
  if (!password) {
    return false;
  }

  return getDemoAccessSessionId(request) !== null;
}

export function getDemoAccessSessionId(request: Request): string | null {
  const password = getDemoAccessPassword();
  if (!password) {
    return null;
  }

  const cookieHeader = request.headers.get("cookie");
  const cookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEMO_ACCESS_COOKIE}=`));
  const token = cookie?.slice(DEMO_ACCESS_COOKIE.length + 1);
  if (!token) {
    return null;
  }

  const [expiresAtText, signature, extra] = token.split(".");
  const expiresAt = Number(expiresAtText);
  if (
    extra !== undefined ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1_000) ||
    !signature
  ) {
    return null;
  }

  const expected = Buffer.from(createSessionSignature(expiresAt, password));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? createHash("sha256").update(token).digest("hex")
    : null;
}

function createSessionSignature(expiresAt: number, password: string): string {
  return createHmac("sha256", password)
    .update(`${DEMO_ACCESS_COOKIE}:${expiresAt}`)
    .digest("base64url");
}
