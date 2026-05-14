'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { SwarmState, SwarmHandoffPacket, SwarmIntensity } from '@/types/swarm';

const SWARM_INTENSITY_STORAGE_KEY = 'nebula-swarm-intensity';

function readStoredIntensity(): SwarmIntensity {
  if (typeof window === 'undefined') return 'full_quality';
  const v = localStorage.getItem(SWARM_INTENSITY_STORAGE_KEY);
  if (v === 'light' || v === 'balanced' || v === 'full_quality') return v;
  return 'full_quality';
}

function agentsForLeanManual(): string[] {
  return ['quality'];
}

interface SwarmContextType extends SwarmState {
  toggleSwarm: () => void;
  setSwarmIntensity: (i: SwarmIntensity) => void;
  /** Updates Nebula execution phase from Grok `planningPhase` / heuristics (swarm gating uses this). */
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
    isEnabled: true,
    intensity: readStoredIntensity(),
    isRunning: false,
    currentPhase: 'pre_phase_0',
    activeAgents: [],
    activityLog: [],
  }));

  const toggleSwarm = useCallback(() => {
    setState((prev) => ({ ...prev, isEnabled: !prev.isEnabled }));
  }, []);

  const setSwarmIntensity = useCallback((intensity: SwarmIntensity) => {
    try {
      localStorage.setItem(SWARM_INTENSITY_STORAGE_KEY, intensity);
    } catch {
      /* ignore */
    }
    setState((prev) => ({ ...prev, intensity }));
  }, []);

  const setCurrentPhase = useCallback((phase: SwarmState['currentPhase']) => {
    setState((prev) => (prev.currentPhase === phase ? prev : { ...prev, currentPhase: phase }));
  }, []);

  const startSwarm = useCallback((phase: SwarmState['currentPhase'], projectName: string) => {
    setState((prev) => {
      const activeAgents = agentsForLeanManual();
      return {
        ...prev,
        isRunning: true,
        currentPhase: phase,
        activeAgents,
        activityLog: [
          ...prev.activityLog,
          {
            timestamp: new Date().toISOString(),
            message: `Quality run starting — ${projectName}, phase ${phase}`,
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
          message: 'Quality run complete — handoff ready',
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
        toggleSwarm,
        setSwarmIntensity,
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
