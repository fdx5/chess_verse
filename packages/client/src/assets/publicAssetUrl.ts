declare const __PUBLIC_ASSET_VERSIONS__: Readonly<Record<string, string>>;

const assetBaseUrl = (import.meta.env.VITE_PUBLIC_ASSET_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/**
 * Public assets keep stable file names on disk, while their URL carries a
 * content-derived version. Unchanged files therefore stay in the browser's
 * immutable cache and only changed files receive a new download URL.
 */
export function publicAssetUrl(path: string): string {
  const version = __PUBLIC_ASSET_VERSIONS__[path];
  const versionedPath = version === undefined ? path : `${path}?v=${version}`;
  return `${assetBaseUrl}${versionedPath}`;
}
