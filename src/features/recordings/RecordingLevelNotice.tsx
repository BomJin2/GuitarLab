export function RecordingLevelNotice({ peak }: { peak: number }) {
  if (peak < 1) return null;
  return (
    <p role="status">
      녹음 입력이 디지털 최대값(0 dBFS)에 도달하거나 넘었습니다. 소리가
      찌그러졌다면 인터페이스의 입력 GAIN을 낮춰 다시 녹음하세요. 재생
      음량·음소거로 이미 녹음된 왜곡을 복구할 수는 없습니다. 최대값만으로 실제
      왜곡 여부를 확정하지 않습니다.
    </p>
  );
}
