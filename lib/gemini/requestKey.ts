export function getGeminiApiKey(): string | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey.length > 512) {
    return null;
  }
  return apiKey;
}
