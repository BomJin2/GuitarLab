import type { AudioInputController } from './useAudioInput';
import { MoreMenu } from '../../components/ui/MoreMenu';
import { monitorError, monitorLatencyEstimateMs } from './monitoring';
import {
  monitorPluginMessage,
  pluginNotices,
  pluginOwnershipNotice,
} from './monitorPlugin';
import { useMonitorFx } from './useMonitorFx';
import type { MonitorFx } from '../performance/FxRack';

type InputMonitorProps = {
  input: AudioInputController;
  startBlocked?: boolean;
  /** 열린 프로젝트(톤 저장·불러오기 대상) */
  projectId?: string;
};
export function InputMonitor(props: InputMonitorProps) {
  const fx = useMonitorFx(
    props.input,
    props.startBlocked ?? false,
    props.projectId,
  );
  return <InputMonitorPanel {...props} fx={fx} />;
}
export function InputMonitorPanel({
  input,
  startBlocked = false,
  projectId,
  fx: { monitor, plugin },
}: InputMonitorProps & { fx: MonitorFx }) {
  const output = monitor.selectedOutput;
  const running = monitor.state.state === 'RUNNING';
  const latency = monitorLatencyEstimateMs(monitor.state);
  const enabled = monitor.enabled || running;
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
          aria-pressed={enabled}
          disabled={monitor.busy || (startBlocked && !enabled)}
          onClick={() => void (enabled ? monitor.stop() : monitor.enable())}
        >
          {enabled ? '🎧 모니터 끄기' : '🎧 모니터 켜기'}
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
        <MoreMenu>
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
              value={
                running ? (monitor.state.outputDeviceId ?? output) : output
              }
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
        </MoreMenu>
        {monitor.state.state === 'ERROR' && (
          <button disabled={monitor.busy} onClick={() => void monitor.stop()}>
            모니터 오류 해제
          </button>
        )}
      </div>
      <div className="toolbar" aria-label="모니터 앰프 시뮬레이터">
        <strong>AmpliTube 5 (VST3)</strong>
        {plugin.state.state === 'READY' ? (
          <>
            <label>
              <input
                type="checkbox"
                aria-label="모니터에 AmpliTube 사용"
                checked={monitor.insert === 'AMPLITUBE'}
                disabled={running || monitor.busy}
                onChange={(event) =>
                  monitor.selectInsert(
                    event.target.checked ? 'AMPLITUBE' : 'DRY',
                  )
                }
              />
              모니터에 AmpliTube 사용
            </label>
            <button
              disabled={plugin.busy}
              onClick={() =>
                void (plugin.state.editorOpen
                  ? plugin.closeEditor()
                  : plugin.openEditor())
              }
            >
              {plugin.state.editorOpen
                ? 'AmpliTube 편집 창 닫기'
                : plugin.busy
                  ? '처리 중…'
                  : 'AmpliTube 편집 창 열기'}
            </button>
            {projectId && (
              <>
                <button
                  disabled={plugin.busy}
                  onClick={() => void plugin.saveTone()}
                >
                  톤을 이 프로젝트에 저장
                </button>
                <button
                  disabled={plugin.busy || !plugin.tone?.saved}
                  onClick={() => void plugin.restoreTone()}
                >
                  저장한 톤 불러오기
                </button>
              </>
            )}
            <button
              disabled={plugin.busy || plugin.state.inUse}
              onClick={() => {
                monitor.selectInsert('DRY');
                void plugin.unload();
              }}
            >
              AmpliTube 해제
            </button>
          </>
        ) : (
          <button
            disabled={
              plugin.busy ||
              plugin.state.state === 'LOADING' ||
              input.state.state !== 'RUNNING' ||
              input.state.sampleRate <= 0
            }
            onClick={() => void plugin.load(input.state.sampleRate)}
          >
            {plugin.state.state === 'LOADING'
              ? 'AmpliTube 5 불러오는 중…'
              : 'AmpliTube 5 불러오기'}
          </button>
        )}
      </div>
      <p role="status" aria-label="AmpliTube 상태">
        {plugin.state.state === 'READY'
          ? `${plugin.state.name} ${plugin.state.version ?? ''} · ${plugin.state.sampleRate} Hz · ${running && monitor.state.insert === 'AMPLITUBE' ? '모니터에 적용 중' : '준비됨'}. 체크는 모니터가 꺼져 있을 때만 바꿀 수 있습니다. 편집 창은 별도 창으로 열리며(여는 약 3초 동안 모니터 소리가 끊김) 바꾼 톤은 바로 들립니다. ${projectId ? (plugin.tone?.saved ? `이 프로젝트에 저장한 톤 있음(AmpliTube ${plugin.tone.pluginVersion}). ` : '이 프로젝트에 저장한 톤 없음. ') + '톤은 버튼으로만 저장·불러오며 저장하지 않은 편집은 해제·앱 종료 때 사라집니다. ' : '프로젝트를 열면 톤을 프로젝트에 저장할 수 있습니다. '}녹음 파일과 채점은 원음(DI) 그대로입니다.`
          : plugin.state.state === 'LOADING'
            ? 'AmpliTube 5를 찾아 여는 중입니다(약 10초, 메모리 약 1GB).'
            : input.state.state !== 'RUNNING'
              ? '기타 입력을 시작하면 설치된 AmpliTube 5를 불러올 수 있습니다.'
              : '설치·인증된 AmpliTube 5를 앱 안에서 엽니다. 불러온 뒤 편집 창에서 톤을 바꿀 수 있습니다.'}
      </p>
      {(plugin.error || plugin.state.errorCode) && (
        <p role="alert">
          {monitorPluginMessage(plugin.error ?? plugin.state.errorCode)}
        </p>
      )}
      {pluginNotices(plugin.state, plugin.tone, plugin.loadingSeconds).map(
        (notice) => (
          <p key={notice}>{notice}</p>
        ),
      )}
      <p>
        <small>{pluginOwnershipNotice}</small>
      </p>
      {running &&
        monitor.state.insert === 'AMPLITUBE' &&
        (monitor.state.insertUnderrunFrames ?? 0) > 0 && (
          <p>
            AmpliTube 처리 지연으로 {monitor.state.insertUnderrunFrames}프레임이
            무음 처리됐습니다. 다른 무거운 작업을 줄여 보세요.
          </p>
        )}
      {running &&
        monitor.state.insert === 'AMPLITUBE' &&
        ((monitor.state.insertErrorBlocks ?? 0) > 0 ||
          (monitor.state.insertDroppedFrames ?? 0) > 0) && (
          <p role="alert">
            AmpliTube 처리 오류 {monitor.state.insertErrorBlocks ?? 0}블록·처리
            대기열 유실 {monitor.state.insertDroppedFrames ?? 0}프레임이 있어 그
            구간이 무음 처리됐습니다(플러그인은 불러온 상태로 보여도 소리가
            끊겼습니다). 계속되면 모니터를 껐다 켜거나 AmpliTube를 다시
            불러오세요.
          </p>
        )}
      {startBlocked && <p>유선 관측 중에는 앱 모니터를 켤 수 없습니다.</p>}
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
          AmpliTube를 켜지 않으면 앰프·이펙트가 없는 입력 소리입니다.
          AmpliTube는 앱 안에서 실행되므로 플러그인이 멈추면 앱도 멈출 수
          있습니다. 현재 Windows 공유 모드로 재생하며 ASIO 수준의 지연을
          보장하지 않습니다. 입력·출력 샘플레이트는 같아야 합니다. 모니터 경로나
          출력 장치가 바뀌면 채점용 입력 보정도 다시 확인하세요.
        </p>
        <p>
          모니터 큐 {monitor.state.queuedFrames}프레임 · 출력 부족{' '}
          {monitor.state.underrunFrames}프레임 · 큐 초과/지연 조정{' '}
          {monitor.state.droppedFrames}프레임 · 출력 버퍼{' '}
          {monitor.state.bufferFrames ?? '미확인'}프레임. 녹음 누락과는 별도이며
          전체 왕복 지연 측정값이 아닙니다.
        </p>
        {latency !== null && (
          <p>
            모니터 지연 구성 추정 약 {latency.toFixed(1)}ms(큐 목표·출력 버퍼·
            삽입 처리 합계). 입력 버퍼와 드라이버 지연은 빠져 있어 실제로 들리는
            지연은 더 깁니다.
          </p>
        )}
      </details>
    </section>
  );
}
