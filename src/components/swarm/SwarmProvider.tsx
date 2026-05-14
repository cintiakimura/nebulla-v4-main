'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { SwarmState, SwarmHandoffPacket, SwarmIntensity } from '@/types/swarm';

/** Single Inspect (Quality) lane — intensity is fixed for API compatibility. */
const INSPECT_INTENSITY: SwarmIntensity = 'balanced';

function agentsForInspect(): string[] {
  return ['quality'];
}

interface SwarmContextType extends SwarmState {
  setCurrentPhase: (phase: SwarmState['currentPhase']) => void;
  startSwarm: (phase: SwarmState['currentPhase'], projectName: string) => void;
  finishSwarm: (handoff: SwarmHandoffPacket) => void;
  cancelSwarmRun: () => void;
  addActivity: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  clearActivity: () => void;
}

const SwarmContext = createContext<SwarmContextType | undefined>(undefined);

export function SwarmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SwarmState>(() => ({
    intensity: INSPECT_INTENSITY,
    isRunning: false,
    currentPhase: 'pre_phase_0',
    activeAgents: [],
    activityLog: [],
  }));

  const setCurrentPhase = useCallback((phase: SwarmState['currentPhase']) => {
    setState((prev) => (prev.currentPhase === phase ? prev : { ...prev, currentPhase: phase }));
  }, []);

  const startSwarm = useCallback((phase: SwarmState['currentPhase'], projectName: string) => {
    setState((prev) => {
      const activeAgents = agentsForInspect();
      return {
        ...prev,
        isRunning: true,
        currentPhase: phase,
        activeAgents,
        activityLog: [
          ...prev.activityLog,
          {
            timestamp: new Date().toISOString(),
            message: `Inspect (Quality) starting — ${projectName}`,
            type: 'info' as const,
          },
        ],
      };
    });
  }, []);

  const finishSwarm = useCallback((handoff: SwarmHandoffPacket) => {
    setState((prev) => ({
      ...prev,
      isRunning: false,
      lastHandoff: handoff,
      activeAgents: [],
      activityLog: [
        ...prev.activityLog,
        {
          timestamp: new Date().toISOString(),
          message: 'Inspect (Quality) complete',
          type: 'success' as const,
        },
      ],
    }));
  }, []);

  const cancelSwarmRun = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isRunning: false,
      activeAgents: [],
    }));
  }, []);

  const addActivity = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setState((prev) => ({
      ...prev,
      activityLog: [
        ...prev.activityLog,
        { timestamp: new Date().toISOString(), message, type },
      ].slice(-20),
    }));
  }, []);

  const clearActivity = useCallback(() => {
    setState((prev) => ({ ...prev, activityLog: [] }));
  }, []);

  return (
    <SwarmContext.Provider
      value={{
        ...state,
        setCurrentPhase,
        startSwarm,
        finishSwarm,
        cancelSwarmRun,
        addActivity,
        clearActivity,
      }}
    >
      {children}
    </SwarmContext.Provider>
  );
}

export const useSwarm = () => {
  const context = useContext(SwarmContext);
  if (!context) throw new Error('useSwarm must be used within SwarmProvider');
  return context;
};
