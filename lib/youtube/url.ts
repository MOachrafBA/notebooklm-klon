const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const YOUTUBE_SHORT_HOST = "youtu.be";
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;

export type YouTubeUrlValidation =
  | { valid: true; videoId: string; canonicalUrl: string }
  | { valid: false; error: string };

const INVALID_URL_MESSAGE = "Bitte sende eine gültige öffentliche YouTube-URL.";

function isValidVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value);
}

function validateWatchUrl(url: URL): YouTubeUrlValidation {
  if (url.pathname !== "/watch") {
    return { valid: false, error: INVALID_URL_MESSAGE };
  }

  const videoId = url.searchParams.get("v");
  if (!videoId || !isValidVideoId(videoId)) {
    return { valid: false, error: INVALID_URL_MESSAGE };
  }

  return {
    valid: true,
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,// youtube  URL auf einheitliches Standardformat
  };
}

function validateShortUrl(url: URL): YouTubeUrlValidation {
  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (pathSegments.length !== 1 || !isValidVideoId(pathSegments[0])) {
    return { valid: false, error: INVALID_URL_MESSAGE };
  }

  const videoId = pathSegments[0];
  return {
    valid: true,
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
  };
}

export function validateYouTubeUrl(value: string): YouTubeUrlValidation {
  const input = value.trim();
  if (!input) {
    return { valid: false, error: INVALID_URL_MESSAGE };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { valid: false, error: INVALID_URL_MESSAGE };
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return { valid: false, error: INVALID_URL_MESSAGE };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === YOUTUBE_SHORT_HOST) {
    return validateShortUrl(url);
  }

  if (YOUTUBE_HOSTS.has(hostname)) {
    return validateWatchUrl(url);
  }

  return { valid: false, error: INVALID_URL_MESSAGE };
}
