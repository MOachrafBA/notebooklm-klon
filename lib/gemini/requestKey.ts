export const GEMINI_API_KEY_HEADER = "x-gemini-api-key";

export function getGeminiApiKey(request: Request): string | null {
  const apiKey = request.headers.get(GEMINI_API_KEY_HEADER)?.trim();
  if (!apiKey || apiKey.length > 512) {
    return null;
  }
  return apiKey;
}
