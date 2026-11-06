import { layerVolume, type MixDocument, type MixLayer } from './mixing';
import type { ProjectMixController } from './useProjectMix';

/** 믹스 패널과 하단 믹서가 같은 이름을 쓰도록 레이어 이름을 만듭니다. */
export function mixLayerName(
  layer: MixLayer,
  c: Pick<ProjectMixController, 'takes' | 'stems' | 'importedStems'>,
) {
  if (layer.kind === 'LOCAL_ASSET') return '로컬 반주';
  if (layer.kind === 'IMPORTED_STEM') {
    const name = c.importedStems.find((stem) => stem.id === layer.id)?.name;
    // 목록을 읽기 전에는 ID 대신 종류 이름을 보여 줍니다.
    return name
      ? `${name} · 사용자 제공 음원`
      : `사용자 기타 파일 · ${layer.id.slice(0, 8)}`;
  }
  if (layer.kind === 'STEM') {
    const role = c.stems.find((stem) => stem.id === layer.id)?.role;
    const name = !role
      ? 'AI 분리 음원'
      : role === 'GUITAR_FULL'
        ? '전체 기타 · AI 추정'
        : '잔여 반주 · AI 추정';
    return `${name} · ${layer.id.slice(0, 8)}`;
  }
  return c.takes.find((t) => t.id === layer.id)?.name ?? '누락된 테이크';
}

/** docs/12 "하단 믹서 최대 레벨 추정": 저장된 peak × 실제 재생 음량. 모를 때는 null입니다. */
export function layerLevels(
  mix: MixDocument,
  c: Pick<
    ProjectMixController,
    'takes' | 'stems' | 'importedStems' | 'stemPeaks'
  >,
  backingPeak: number | null,
) {
  const levels = mix.layers.map((layer) => {
    const peak =
      layer.kind === 'LOCAL_ASSET'
        ? backingPeak
        : layer.kind === 'TAKE'
          ? c.takes.find((t) => t.id === layer.id)?.peak
          : ((layer.kind === 'STEM'
              ? c.stems.find((s) => s.id === layer.id)?.peak
              : c.importedStems.find((s) => s.id === layer.id)?.peak) ??
            c.stemPeaks[layer.id]);
    return peak == null ? null : peak * layerVolume(mix, layer);
  });
  // 모든 최대값이 같은 순간에 겹친다고 가정한 상한입니다.
  const total = levels.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  return { levels, total, unknown: levels.includes(null) };
}

/** float32·PCM16 WAV의 최대 절댓값. 다른 형식이나 깨진 파일은 null입니다. */
export function wavPeak(bytes: ArrayBuffer): number | null {
  const view = new DataView(bytes);
  const tag = (at: number) =>
    String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (bytes.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE')
    return null;
  let format = 0;
  let bits = 0;
  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (tag(at) === 'fmt ' && size >= 16) {
      format = view.getUint16(body, true);
      bits = view.getUint16(body + 14, true);
      // WAVE_FORMAT_EXTENSIBLE은 하위 형식 GUID의 앞 2바이트가 실제 형식입니다.
      if (format === 0xfffe && size >= 26)
        format = view.getUint16(body + 24, true);
    } else if (tag(at) === 'data') {
      const end = Math.min(bytes.byteLength, body + size);
      let peak = 0;
      if (format === 3 && bits === 32)
        for (let i = body; i + 4 <= end; i += 4)
          peak = Math.max(peak, Math.abs(view.getFloat32(i, true)));
      else if (format === 1 && bits === 16)
        for (let i = body; i + 2 <= end; i += 2)
          peak = Math.max(peak, Math.abs(view.getInt16(i, true)) / 32768);
      else return null;
      return Number.isFinite(peak) ? peak : null;
    }
    at = body + size + (size % 2);
  }
  return null;
}
