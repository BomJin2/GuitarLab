/** 앱 최소 창(1100×680) 이하인지. 접을 수 있는 패널의 첫 상태를 정할 때만 씁니다. */
export const isSmallWindow = () =>
  typeof window !== 'undefined' &&
  (window.innerWidth <= 1100 || window.innerHeight <= 680);
