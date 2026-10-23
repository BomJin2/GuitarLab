import { createContext } from 'react';
import type { PlayerEngine } from './PlayerEngine';
export const Context = createContext<PlayerEngine | null>(null);
