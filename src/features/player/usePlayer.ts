import { useContext, useSyncExternalStore } from 'react';
import { Context } from './playerContextValue';
export function usePlayerEngine() {
  const engine = useContext(Context);
  if (!engine) throw new Error('플레이어 공급자가 필요합니다.');
  return engine;
}
export function usePlayer() {
  const engine = usePlayerEngine();
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  return { engine, state };
}
