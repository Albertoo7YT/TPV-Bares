export function buildAssetUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";
  const origin = apiBaseUrl.endsWith("/api") ? apiBaseUrl.slice(0, -4) : apiBaseUrl;
  return `${origin}${path}`;
}
