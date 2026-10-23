import { useSyncExternalStore } from 'react';
export const routes = [
  'library',
  'copy',
  'practice',
  'performance',
  'results',
  'settings',
  'recordings',
  'backing',
] as const;
export type Route = (typeof routes)[number];
export const labels: Record<Route, string> = {
  library: '라이브러리',
  copy: '카피',
  practice: '연습',
  performance: '연주',
  results: '결과',
  settings: '환경 설정',
  recordings: '내 녹음',
  backing: '반주 찾기',
};
function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
export function useRoute(): Route | null {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  if (!hash) return 'library';
  return routes.find((route) => hash === `#/${route}`) ?? null;
}
export function isWorkspace(route: Route | null) {
  return route === 'copy' || route === 'practice' || route === 'performance';
}
