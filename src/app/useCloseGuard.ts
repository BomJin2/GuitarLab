import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { ScoreSession } from '../features/score/scoreSession';
import { logDiagnostic } from '../shared/logger';
import { closeGuardApi, closeIntent } from './closeGuard';
import { ScoreDirtyTracker } from './scoreDirty';

export function useCloseGuard(session: ScoreSession | null) {
  const tracker = useRef(new ScoreDirtyTracker());
  const dirty = useRef(false);
  const confirming = useRef(false);
  const currentSession = useRef(session);
  const mounted = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  useLayoutEffect(() => {
    currentSession.current = session;
    dirty.current = tracker.current.observe(session);
  }, [session]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!closeGuardApi.available()) return;
    let canceled = false;
    const subscriptions: Array<() => void> = [];
    async function connect() {
      const closing = await listen<unknown>(
        'application-close-requested',
        (event) => {
          if (canceled) return;
          try {
            const id = closeIntent(event.payload);
            void closeGuardApi.resolve(id, dirty.current).catch(() => {
              if (!canceled)
                setNotice(
                  '종료 상태 확인이 지연됩니다. 5초 뒤 닫기를 다시 누르면 저장 확인을 선택할 수 있습니다.',
                );
              logDiagnostic('warn', 'CLOSE_GUARD_FAILED');
            });
          } catch {
            setNotice(
              '종료 요청을 확인하지 못했습니다. 5초 뒤 닫기를 다시 눌러주세요.',
            );
            logDiagnostic('warn', 'CLOSE_GUARD_FAILED');
          }
        },
      );
      if (canceled) {
        closing();
        return;
      }
      subscriptions.push(closing);
      const blocked = await listen('application-close-blocked', () => {
        if (!canceled)
          setNotice(
            '녹음·모델 설치·파일 작업을 마치거나 선택 창을 취소한 뒤 창을 닫아주세요.',
          );
      });
      if (canceled) {
        blocked();
        return;
      }
      subscriptions.push(blocked);
      await closeGuardApi.enable();
    }
    void connect().catch(() => {
      if (!canceled)
        setNotice(
          '악보 종료 보호 연결을 확인하지 못했습니다. 프로젝트를 저장한 뒤 닫아주세요.',
        );
      logDiagnostic('warn', 'CLOSE_GUARD_FAILED');
    });
    return () => {
      canceled = true;
      for (const unlisten of subscriptions) {
        try {
          unlisten();
        } catch {
          logDiagnostic('warn', 'CLOSE_GUARD_FAILED');
        }
      }
    };
  }, []);
  async function confirmReplacement() {
    if (!mounted.current || confirming.current) return false;
    if (!dirty.current) return true;
    const source = currentSession.current;
    confirming.current = true;
    try {
      const accepted = await window.confirm(
        '현재 악보에 저장하지 않은 편집이 있습니다. 프로젝트를 바꾸거나 보관하면 이 편집을 잃을 수 있습니다. 저장하지 않고 진행하려면 확인, 현재 편집을 유지하려면 취소를 누르세요.',
      );
      return (
        accepted === true &&
        mounted.current &&
        currentSession.current === source
      );
    } catch {
      if (mounted.current)
        setNotice(
          '악보 교체 확인을 열지 못했습니다. 프로젝트를 먼저 저장한 뒤 다시 시도하세요.',
        );
      logDiagnostic('warn', 'CLOSE_GUARD_FAILED');
      return false;
    } finally {
      confirming.current = false;
    }
  }
  return { notice, dismiss: () => setNotice(null), confirmReplacement };
}
