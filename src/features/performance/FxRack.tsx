import type { useInputMonitor } from '../practice/useInputMonitor';
import type { useMonitorPlugin } from '../practice/useMonitorPlugin';
import { monitorPluginMessage } from '../practice/monitorPlugin';
import type { TakeRender } from './freeze';

export type MonitorFx = {
  monitor: ReturnType<typeof useInputMonitor>;
  plugin: ReturnType<typeof useMonitorPlugin>;
};
/** 입력 줄이면 null, 테이크 줄이면 그 테이크. */
export type FxTarget = { takeId: string; name: string } | null;
/** docs/12 "테이크 Freeze v1": 테이크 줄의 Freeze 상태와 동작. */
export type FxFreeze = {
  info: TakeRender | undefined;
  busy: boolean;
  freeze: () => void;
  unfreeze: () => void;
  restoreTone: () => void;
  exportProcessed: () => void;
  bounce: () => void;
};

const stateLabel = (fx: MonitorFx) => {
  const s = fx.plugin.state;
  if (s.state === 'READY') return `불러옴 · ${s.version ?? ''}`;
  if (s.state === 'LOADING') return '불러오는 중';
  if (s.state === 'FAILED')
    return `${monitorPluginMessage(s.errorCode) ?? '실패'} 원음으로 재생합니다.`;
  return '불러오지 않음 · "내 기타 듣기"에서 불러오세요';
};

// docs/12 "AmpliTube FX 랙·실시간 Bypass v1": 한 줄의 FX 랙(슬롯은 AmpliTube 5 하나).
export function FxRack({
  fx,
  target,
  wetTakeId,
  setWetTake,
  freeze = null,
}: {
  fx: MonitorFx;
  target: FxTarget;
  wetTakeId: string | null;
  setWetTake: (takeId: string | null) => void;
  freeze?: FxFreeze | null;
}) {
  const frozen = !!freeze?.info;
  const { monitor, plugin } = fx;
  const ready = plugin.state.state === 'READY';
  const running = monitor.state.state === 'RUNNING';
  const live = running && monitor.state.insert === 'AMPLITUBE';
  const applied = target
    ? wetTakeId === target.takeId
    : running
      ? monitor.state.insert === 'AMPLITUBE'
      : monitor.insert === 'AMPLITUBE';
  const name = target ? target.name : '입력';
  const toggle = () => {
    if (target) setWetTake(applied ? null : target.takeId);
    else monitor.selectInsert(applied ? 'DRY' : 'AMPLITUBE');
  };
  // 입력 줄은 모니터를 끈 뒤에만, 테이크 줄은 AmpliTube 모니터가 켜져 있어야 바꿀 수 있습니다.
  const toggleBlocked = target
    ? frozen && !applied
      ? 'Freeze된 테이크는 이미 톤이 들어 있어 실시간 적용을 쓰지 않습니다.'
      : !applied && !live
        ? '모니터를 AmpliTube로 켜야 테이크에 적용할 수 있습니다.'
        : null
    : running
      ? '입력 FX는 모니터를 끈 뒤 바꿀 수 있습니다.'
      : null;
  return (
    <section className="fx-rack" aria-label={`${name} FX 랙`}>
      <strong>FX · {name}</strong>
      <div className="toolbar">
        <span>01 AmpliTube 5</span>
        <small>{stateLabel(fx)}</small>
        <button
          aria-pressed={applied}
          disabled={(!ready && !applied) || !!toggleBlocked}
          title={toggleBlocked ?? undefined}
          onClick={toggle}
        >
          {applied ? '이 줄에서 빼기' : '이 줄에 적용'}
        </button>
        <button
          aria-label={`${name} AmpliTube Bypass`}
          aria-pressed={!!monitor.state.insertBypassed}
          disabled={!live || !applied || monitor.busy}
          onClick={() => void monitor.setBypass(!monitor.state.insertBypassed)}
        >
          Bypass
        </button>
        <button
          disabled={!ready || plugin.busy}
          onClick={() =>
            void (plugin.state.editorOpen
              ? plugin.closeEditor()
              : plugin.openEditor())
          }
        >
          {plugin.state.editorOpen ? '편집 창 닫기' : '편집 창 열기'}
        </button>
        <button disabled title="현재 AmpliTube 5만 지원합니다.">
          + VST3 추가
        </button>
      </div>
      {target && freeze && (
        <div className="toolbar" aria-label={`${name} Freeze`}>
          {freeze.info ? (
            <>
              <span>
                ❄ Freeze됨 · AmpliTube {freeze.info.pluginVersion} · 꼬리{' '}
                {(freeze.info.tailFrames / freeze.info.sampleRate).toFixed(1)}초
              </span>
              <button disabled={freeze.busy} onClick={freeze.unfreeze}>
                Unfreeze
              </button>
              <button
                disabled={freeze.busy || !ready}
                onClick={freeze.restoreTone}
              >
                Freeze 때 톤 불러오기
              </button>
              <button disabled={freeze.busy} onClick={freeze.exportProcessed}>
                처리된 소리 WAV로 내보내기
              </button>
            </>
          ) : (
            <button
              disabled={freeze.busy || !ready || running}
              title={
                running
                  ? '모니터를 끈 뒤 Freeze할 수 있습니다(AmpliTube는 하나).'
                  : undefined
              }
              onClick={freeze.freeze}
            >
              ❄ Freeze
            </button>
          )}
          <button
            disabled={freeze.busy || (!freeze.info && (!ready || running))}
            title={
              !freeze.info && running
                ? '모니터를 끈 뒤 Bounce할 수 있습니다(Freeze된 테이크는 그대로 복사).'
                : undefined
            }
            onClick={freeze.bounce}
          >
            새 트랙으로 Bounce
          </button>
          <small>
            {freeze.info
              ? 'Unfreeze하면 캐시를 지우고 원본 DI + 실시간 톤으로 돌아갑니다. 지우기 전에 톤이 필요하면 먼저 불러오세요.'
              : running
                ? '모니터를 끈 뒤 Freeze할 수 있습니다.'
                : '지금 톤으로 이 테이크를 미리 처리해 두면 모니터 없이도 그 톤으로 재생·내보내기됩니다. 원본 DI는 그대로입니다.'}
          </small>
        </div>
      )}
      {toggleBlocked && <small>{toggleBlocked}</small>}
      <small>
        AmpliTube는 하나라서 입력과 &quot;AmpliTube로 재생&quot; 테이크가 같은
        톤·Bypass를 씁니다.
        {monitor.state.insertBypassed
          ? ' 지금 Bypass(원음) 중입니다.'
          : ''}{' '}
        불러오기·해제·톤 저장은 &quot;내 기타 듣기&quot; 패널에 있습니다.
      </small>
    </section>
  );
}
