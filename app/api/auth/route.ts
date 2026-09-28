import {
  createDemoSessionToken,
  DEMO_ACCESS_COOKIE,
  DEMO_SESSION_MAX_AGE_SECONDS,
  getDemoAccessPassword,
  isDemoAccessAuthorized,
  verifyDemoAccessPassword,
} from "@/lib/auth/demoAccess";

const INVALID_LOGIN_MESSAGE = "Das Passwort ist nicht korrekt.";

function isLoginRequest(value: unknown): value is { password: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "password" in value &&
    typeof value.password === "string"
  );
}

export async function GET(request: Request): Promise<Response> {
  return Response.json(
    {
      configured: getDemoAccessPassword() !== null,
      authenticated: isDemoAccessAuthorized(request),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const password = getDemoAccessPassword();
  if (!password) {
    return Response.json(
      { error: "Der Demo-Zugang ist nicht konfiguriert." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: INVALID_LOGIN_MESSAGE }, { status: 400 });
  }

  if (!isLoginRequest(body) || !verifyDemoAccessPassword(body.password, password)) {
    return Response.json({ error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }

  const token = createDemoSessionToken(password);
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { authenticated: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie":
          `${DEMO_ACCESS_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; ` +
          `Max-Age=${DEMO_SESSION_MAX_AGE_SECONDS}${secureAttribute}`,
      },
    },
  );
}

export async function DELETE(): Promise<Response> {
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { authenticated: false },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `${DEMO_ACCESS_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureAttribute}`,
      },
    },
  );
}
