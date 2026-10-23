import type { Plugin } from 'vite';
export const publicAssetNames: string[];
export function copyPublicAssets(
  source: string,
  destination: string,
): Promise<void>;
export function publicAssetsPlugin(): Plugin;
