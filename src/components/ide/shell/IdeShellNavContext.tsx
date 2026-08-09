import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearStoredShellGoal,
  readStoredDashboardPanel,
  readStoredShellGoal,
  readStoredShellScreen,
  readStoredStartType,
  writeStoredDashboardPanel,
  writeStoredShellGoal,
  writeStoredShellScreen,
  writeStoredStartType,
  type IdeDashboardPanel,
  type IdeShellScreen,
  type IdeStartProjectType,
} from '../../../lib/ideShellScreens';

type IdeShellNavContextValue = {
  activeScreen: IdeShellScreen;
  dashboardPanel: IdeDashboardPanel;
  goal: string;
  startType: IdeStartProjectType;
  setActiveScreen: (screen: IdeShellScreen) => void;
  setDashboardPanel: (panel: IdeDashboardPanel) => void;
  setStartType: (t: IdeStartProjectType) => void;
  /** Validate + persist goal, then go to Build. Returns false if goal empty. */
  submitGoal: (goal: string) => boolean;
  goToStart: (opts?: { clearGoal?: boolean }) => void;
  goToBuild: () => void;
  goToDashboard: (panel?: IdeDashboardPanel) => void;
};

const IdeShellNavContext = createContext<IdeShellNavContextValue | null>(null);

export function IdeShellNavProvider({ children }: { children: ReactNode }) {
  const [activeScreen, setActiveScreenState] = useState<IdeShellScreen>(() => readStoredShellScreen());
  const [dashboardPanel, setDashboardPanelState] = useState<IdeDashboardPanel>(() =>
    readStoredDashboardPanel(),
  );
  const [goal, setGoal] = useState(() => readStoredShellGoal());
  const [startType, setStartTypeState] = useState<IdeStartProjectType>(() => readStoredStartType());

  const setActiveScreen = useCallback((screen: IdeShellScreen) => {
    setActiveScreenState(screen);
    writeStoredShellScreen(screen);
  }, []);

  const setDashboardPanel = useCallback((panel: IdeDashboardPanel) => {
    setDashboardPanelState(panel);
    writeStoredDashboardPanel(panel);
  }, []);

  const setStartType = useCallback((t: IdeStartProjectType) => {
    setStartTypeState(t);
    writeStoredStartType(t);
  }, []);

  const submitGoal = useCallback(
    (raw: string) => {
      const next = raw.trim();
      if (!next) return false;
      setGoal(next);
      writeStoredShellGoal(next);
      setActiveScreen('build');
      return true;
    },
    [setActiveScreen],
  );

  const goToStart = useCallback(
    (opts?: { clearGoal?: boolean }) => {
      if (opts?.clearGoal) {
        setGoal('');
        clearStoredShellGoal();
      }
      setActiveScreen('start');
    },
    [setActiveScreen],
  );

  const goToBuild = useCallback(() => {
    setActiveScreen('build');
  }, [setActiveScreen]);

  const goToDashboard = useCallback(
    (panel?: IdeDashboardPanel) => {
      if (panel) setDashboardPanel(panel);
      setActiveScreen('dashboard');
    },
    [setActiveScreen, setDashboardPanel],
  );

  const value = useMemo(
    () => ({
      activeScreen,
      dashboardPanel,
      goal,
      startType,
      setActiveScreen,
      setDashboardPanel,
      setStartType,
      submitGoal,
      goToStart,
      goToBuild,
      goToDashboard,
    }),
    [
      activeScreen,
      dashboardPanel,
      goal,
      startType,
      setActiveScreen,
      setDashboardPanel,
      setStartType,
      submitGoal,
      goToStart,
      goToBuild,
      goToDashboard,
    ],
  );

  return <IdeShellNavContext.Provider value={value}>{children}</IdeShellNavContext.Provider>;
}

export function useIdeShellNav(): IdeShellNavContextValue {
  const ctx = useContext(IdeShellNavContext);
  if (!ctx) throw new Error('useIdeShellNav must be used within IdeShellNavProvider');
  return ctx;
}
