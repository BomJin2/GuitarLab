import { useState } from 'react';
import type { AudioInputController } from './useAudioInput';
import { TunerDisplay } from './TunerDisplay';
import type { ClockState } from '../player/useCaptureClock';

export function InputPanel({
  input,
  clock,
}: {
  input: AudioInputController;
  clock?: ClockState;
}) {
  const [deviceId, setDeviceId] = useState('');
  const [channelIndex, setChannelIndex] = useState(0);
  const [gate, setGate] = useState(-50);
  const { state } = input;
  const selected = input.devices.find((device) => device.id === deviceId);
  const active = state.state === 'RUNNING' || state.state === 'STARTING';
  const activeDevice = input.devices.find(
    (device) => device.id === state.deviceId,
  );
  const shownDeviceId = active ? (state.deviceId ?? deviceId) : deviceId;
  const shownChannels = active ? state.channels : (selected?.channels ?? 1);
  return (
    <section className="panel" aria-label="기타 입력">
      <h2>기타 입력 · 단음 튜너</h2>
      <p>
        선택한 입력 채널만 분석합니다. 오디오를 저장하거나 전송하지 않습니다.
        깨끗한 단음·헤드폰 사용을 권장합니다.
      </p>
      <details>
        <summary>연주 중 내 기타 소리 듣기</summary>
        <p>
          상단 ‘내 기타 듣기’에서 출력 장치를 선택하고 모니터를 켜면 REC 없이
          입력 소리를 들을 수 있습니다. 인터페이스의 직접 모니터링도 사용할 수
          있습니다.
        </p>
        <p>
          SSL 2 MKII에 헤드폰·스피커를 연결했다면 MIX를 INPUT과 USB 사이에
          두세요. Input 1만 사용할 때는 STEREO를 끄고, 헤드폰은 PHONES, 스피커는
          MONITOR로 음량을 조절하세요. 반주 재생 출력도 SSL로 선택하세요.
        </p>
        <p>
          앱 모니터를 켰다면 SSL의 MIX를 USB 끝에 두어 중복 청취를 피하세요.
        </p>
        <p>
          이 조절은 녹음 파일의 음량을 바꾸지 않습니다. 컴퓨터의 별도 출력에
          연결한 헤드폰에는 인터페이스의 직접 입력 소리가 전달되지 않습니다.
        </p>
      </details>
      {!input.native ? (
        <p>네이티브 입력은 Windows Tauri 앱에서 사용할 수 있습니다.</p>
      ) : (
        <>
          <div className="toolbar">
            <button
              disabled={input.busy || active}
              onClick={() => void input.refresh()}
            >
              입력 장치 새로고침
            </button>
            <label>
              입력 장치
              <select
                aria-label="입력 장치"
                disabled={input.busy || active}
                value={shownDeviceId}
                onChange={(event) => {
                  setDeviceId(event.target.value);
                  setChannelIndex(0);
                }}
              >
                <option value="">장치를 선택하세요</option>
                {input.devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              입력 채널
              <select
                aria-label="입력 채널"
                disabled={input.busy || active || !selected}
                value={active ? state.channelIndex : channelIndex}
                onChange={(event) =>
                  setChannelIndex(Number(event.target.value))
                }
              >
                {Array.from({ length: shownChannels }, (_, i) => (
                  <option key={i} value={i}>
                    채널 {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              노이즈 게이트 dBFS
              <input
                aria-label="노이즈 게이트 dBFS"
                type="number"
                min={-80}
                max={-10}
                value={active ? state.noiseGateDbfs : gate}
                disabled={input.busy || active}
                onChange={(event) => setGate(Number(event.target.value))}
              />
            </label>
            <button
              disabled={
                input.busy ||
                active ||
                !selected ||
                gate < -80 ||
                gate > -10 ||
                !Number.isFinite(gate)
              }
              onClick={() => void input.start(deviceId, channelIndex, gate)}
            >
              선택 장치 입력 시작
            </button>
            <button
              disabled={input.busy || (!active && state.state !== 'ERROR')}
              onClick={() => void input.stop()}
            >
              입력 중단
            </button>
          </div>
          {!input.devicesLoaded && !input.error && (
            <p role="status">입력 장치 목록을 불러오는 중입니다.</p>
          )}
          <p role="status">
            {input.busy
              ? '입력 설정 처리 중'
              : state.state === 'RUNNING'
                ? '입력 분석 중 · 녹음은 별도 REC 패널에서 제어'
                : state.state === 'STARTING'
                  ? '입력 시작 중'
                  : state.state === 'ERROR'
                    ? '장치 입력 오류'
                    : '입력 중단됨'}
          </p>
          {activeDevice && active && (
            <p>
              사용 중: {activeDevice.name} · 채널 {state.channelIndex + 1}
            </p>
          )}
          {input.devicesLoaded && input.devices.length === 0 && (
            <p>
              입력 장치가 없습니다. USB 인터페이스 연결·Windows 입력 장치와
              권한을 확인한 뒤 새로고침하세요.
            </p>
          )}
          <label>
            입력 레벨{' '}
            <meter
              min={-80}
              max={0}
              low={-50}
              high={-6}
              optimum={-12}
              value={Math.max(-80, state.levelDbfs)}
            />{' '}
            {state.levelDbfs.toFixed(1)} dBFS
          </label>
          {active && state.levelDbfs > -1 && (
            <p>⚠ 입력 레벨이 높습니다. 인터페이스 게인을 낮춰주세요.</p>
          )}
          <TunerDisplay state={state} />
          <p>
            프렛·줄은 음높이만으로 확정할 수 없습니다. 화음·왜곡·벤딩 검증은
            후속 단계입니다.
          </p>
          <details>
            <summary>입력 진단</summary>
            <p>
              {state.sampleRate} Hz / {state.channels}채널 /{' '}
              {state.sampleFormat || '미선택'} / 관측 callback{' '}
              {state.callbackFrames}프레임 / 협상 버퍼{' '}
              {state.bufferFrames ?? '미확인'}프레임
            </p>
            <p>
              캡처 {state.capturedFrames}프레임 · 누락 {state.droppedFrames} ·
              불연속 {state.discontinuities} · 검출 onset{' '}
              {state.onsets.at(-1)?.sequence ?? 0}
            </p>
            <p>캡처 monotonic ns: {state.capturedMonotonicNs}</p>
            {clock && (
              <p>
                재생 시간 동기화:{' '}
                {clock.status === 'READY'
                  ? '동기화 PoC 안정'
                  : clock.status === 'WARMING'
                    ? '표본 수집 중'
                    : clock.status === 'UNCERTAIN'
                      ? '불확실 · 채점 보류'
                      : '입력과 반주 재생이 필요합니다'}{' '}
                · 왕복 {clock.roundTripMs?.toFixed(2) ?? '—'} ms · anchor{' '}
                {clock.anchorCount} · 최대 잔차{' '}
                {clock.maximumResidualRealMs?.toFixed(2) ?? '—'} ms
              </p>
            )}
            <p>
              실제 기타의 음정 오차·onset 지연 분포는 측정 전입니다. 실시간
              채점은 보정값과 동기화가 준비된 연습/연주 화면에서 명시적으로
              시작합니다.
            </p>
          </details>
          {state.errorCode && (
            <p role="alert">
              입력이 끊겼습니다. 장치를 확인하고 입력을 중단한 뒤 다시
              연결하세요.
            </p>
          )}
        </>
      )}
      {input.error && <p role="alert">{input.error}</p>}
    </section>
  );
}
