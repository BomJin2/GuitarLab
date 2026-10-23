import type { GuitarPartRole } from './score';

export const guitarRoleLabels: Record<GuitarPartRole, string> = {
  LEAD: '리드',
  RHYTHM: '리듬',
  HARMONY: '하모니',
  GUITAR_OTHER: '기타 파트',
  UNKNOWN: '역할 미지정',
};

export function isGuitarPartRole(value: unknown): value is GuitarPartRole {
  return (
    value === 'LEAD' ||
    value === 'RHYTHM' ||
    value === 'HARMONY' ||
    value === 'GUITAR_OTHER' ||
    value === 'UNKNOWN'
  );
}
