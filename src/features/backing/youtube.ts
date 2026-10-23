export type YoutubeSelection = {
  kind: 'YOUTUBE_EMBED';
  videoId: string;
  selectedByUser: true;
};

export const youtubeCapability = {
  syncPrecision: 'BEST_EFFORT',
  canPreciseLoop: false,
  canTimeStretch: false,
  canAnalyzeAudio: false,
  canRecordBackingToFile: false,
} as const;

export function isYoutubeVideoId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
}

export function parseYoutubeUrl(value: string): YoutubeSelection {
  const text = value.trim();
  if (
    text.length > 2048 ||
    text.includes('\\') ||
    [...text].some((character) => character.charCodeAt(0) <= 32)
  )
    throw new Error('YT_URL_INVALID');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('YT_URL_INVALID');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new Error('YT_URL_INVALID');
  let id: string | null = null;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  else if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
  ) {
    if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1)
      id = url.searchParams.get('v');
    else
      id =
        /^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})$/.exec(url.pathname)?.[1] ??
        null;
  }
  if (!isYoutubeVideoId(id)) throw new Error('YT_URL_INVALID');
  return { kind: 'YOUTUBE_EMBED', videoId: id, selectedByUser: true };
}

export function youtubeEmbedUrl(selection: YoutubeSelection): string {
  if (!isYoutubeVideoId(selection.videoId)) throw new Error('YT_URL_INVALID');
  return `https://www.youtube.com/embed/${selection.videoId}?autoplay=0&controls=1&playsinline=1`;
}
