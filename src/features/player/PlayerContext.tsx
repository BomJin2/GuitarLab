import { useEffect, useState, type ReactNode } from 'react';
import { PlayerEngine } from './PlayerEngine';
import { Context } from './playerContextValue';
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [engine] = useState(() => new PlayerEngine());
  useEffect(() => {
    engine.activate();
    return () => engine.dispose();
  }, [engine]);
  return <Context.Provider value={engine}>{children}</Context.Provider>;
}
