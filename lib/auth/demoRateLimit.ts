import { createClient } from "@supabase/supabase-js";
import { getDemoAccessSessionId } from "./demoAccess";

export interface DemoRateLimit {
  scope: "chat" | "document-ingestion" | "youtube-ingestion";
  maxRequests: number;
  windowSeconds: number;
}

export const CHAT_RATE_LIMIT: DemoRateLimit = {
  scope: "chat",
  maxRequests: 10,
  windowSeconds: 60,
};

export const DOCUMENT_INGESTION_RATE_LIMIT: DemoRateLimit = {
  scope: "document-ingestion",
  maxRequests: 3,
  windowSeconds: 10 * 60,
};

export const YOUTUBE_INGESTION_RATE_LIMIT: DemoRateLimit = {
  scope: "youtube-ingestion",
  maxRequests: 2,
  windowSeconds: 10 * 60,
};

export class DemoRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoRateLimitError";
  }
}

export async function consumeDemoRateLimit(
  request: Request,
  limit: DemoRateLimit,
): Promise<boolean> {
  const sessionId = getDemoAccessSessionId(request);
  if (!sessionId) {
    throw new DemoRateLimitError("Die Demo-Sitzung konnte nicht für das Rate-Limit bestimmt werden.");
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new DemoRateLimitError("Die Supabase-Konfiguration für das Rate-Limit fehlt.");
  }

  const { data, error } = await createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).rpc("consume_demo_rate_limit", {
    p_scope: limit.scope,
    p_key_hash: sessionId,
    p_max_requests: limit.maxRequests,
    p_window_seconds: limit.windowSeconds,
  });

  if (error || typeof data !== "boolean") {
    throw new DemoRateLimitError("Das Demo-Rate-Limit konnte nicht geprüft werden.");
  }

  return data;
}
