import type { AudioInputController } from './useAudioInput';
import { useInputMonitor } from './useInputMonitor';
import { monitorError } from './monitoring';

export function InputMonitor({ input }: { input: AudioInputController }) {
  const monitor = useInputMonitor(
    input.native,
    input.state.state === 'RUNNING' ? input.state.streamGeneration : null,
  );
  const output = monitor.selectedOutput;
  const running = monitor.state.state === 'RUNNING';
  const error =
    monitor.error ??
    (monitor.state.errorCode
      ? monitorError({ code: monitor.state.errorCode })
      : null);
  if (!input.native) return null;
  return (
    <section className="panel" aria-label="기타 입력 모니터">
      <div className="toolbar">
        <strong>🎧 내 기타 듣기</strong>
        <button
          disabled={monitor.busy || running}
          onClick={() => void monitor.refresh()}
        >
          모니터 출력 새로고침
        </button>
        <label>
          모니터 출력
          <select
            aria-label="모니터 출력"
            value={running ? (monitor.state.outputDeviceId ?? output) : output}
            disabled={monitor.busy || running}
            onChange={(event) => monitor.selectOutput(event.target.value)}
          >
            <option value="">출력 장치를 선택하세요</option>
            {monitor.outputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
                {device.isDefault ? ' · PC 기본 출력' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-pressed={monitor.enabled}
          disabled={monitor.busy}
          onClick={() =>
            void (monitor.enabled ? monitor.stop() : monitor.enable())
          }
        >
          {monitor.enabled ? '🎧 모니터 끄기' : '🎧 모니터 켜기'}
        </button>
        <label>
          모니터 음량
          <input
            aria-label="모니터 음량"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(monitor.volume * 100)}
            onChange={(event) =>
              monitor.setVolume(Number(event.target.value) / 100)
            }
          />
        </label>
        <span>{Math.round(monitor.volume * 100)}%</span>
        {monitor.state.state === 'ERROR' && (
          <button disabled={monitor.busy} onClick={() => void monitor.stop()}>
            모니터 오류 해제
          </button>
        )}
      </div>
      <p role="status">
        {running
          ? `모니터 켜짐 · ${monitor.state.outputName} · ${monitor.state.sampleRate} Hz`
          : monitor.enabled
            ? '모니터 대기 · 입력을 시작하면 선택 출력으로 연결합니다. REC와 별도입니다.'
            : '모니터 꺼짐 · REC와 별도로 동작합니다.'}
      </p>
      {monitor.loaded && monitor.outputs.length === 0 && (
        <p>
          사용할 수 있는 mono/stereo 출력이 없습니다. 출력 연결 후
          새로고침하세요.
        </p>
      )}
      {monitor.loaded && monitor.outputs.length > 0 && !output && (
        <p>
          지원 목록에서 PC 기본 출력을 찾지 못했습니다. 사용할 출력 장치를
          선택해주세요.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>모니터 연결·지연 안내</summary>
        <p>
          모니터는 기본 꺼짐입니다. 기타 입력을 시작한 뒤 ‘모니터 켜기’를 누르면
          선택한 출력으로 연결합니다. 다른 장치는 모니터를 끈 뒤 선택할 수
          있습니다. SSL은 MIX를 USB 끝으로 두면 직접 모니터와 중복되지 않습니다.
          이 버튼은 녹음을 시작하지 않습니다.
        </p>
        <p>
          앰프·이펙트가 없는 입력 소리입니다. 현재 Windows 공유 모드로 재생하며
          ASIO 수준의 지연을 보장하지 않습니다. 입력·출력 샘플레이트는 같아야
          합니다. 모니터 경로나 출력 장치가 바뀌면 채점용 입력 보정도 다시
          확인하세요.
        </p>
        <p>
          모니터 큐 {monitor.state.queuedFrames}프레임 · 출력 부족{' '}
          {monitor.state.underrunFrames}프레임 · 큐 초과/지연 조정{' '}
          {monitor.state.droppedFrames}프레임 · 출력 버퍼{' '}
          {monitor.state.bufferFrames ?? '미확인'}프레임. 녹음 누락과는 별도이며
          전체 왕복 지연 측정값이 아닙니다.
        </p>
      </details>
    </section>
  );
}
