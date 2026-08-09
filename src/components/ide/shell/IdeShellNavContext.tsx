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
  writeStoredShellScreen,
  writeStoredStartType,
  type IdeDashboardPanel,
  type IdeShellScreen,
  type IdeStartProjectType,
} from '../../../lib/ideShellScreens';
import { goToLanding } from '../../../lib/authNavigate';
import { commitLandingGoalHandoff } from '../../../lib/landingGoalHandoff';

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
  /** Clear goal and return to the kept Landing page (`/`). */
  goToLandingHome: (opts?: { clearGoal?: boolean }) => void;
  goToBuild: () => void;
  goToCode: () => void;
  goToPlan: () => void;
  goToSettings: () => void;
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
      if (!commitLandingGoalHandoff(raw, startType)) return false;
      setGoal(raw.trim());
      setActiveScreen('build');
      return true;
    },
    [setActiveScreen, startType],
  );

  const goToLandingHome = useCallback((opts?: { clearGoal?: boolean }) => {
    if (opts?.clearGoal) {
      setGoal('');
      clearStoredShellGoal();
    }
    writeStoredShellScreen('build');
    goToLanding();
  }, []);

  const goToBuild = useCallback(() => {
    setActiveScreen('build');
  }, [setActiveScreen]);

  const goToCode = useCallback(() => {
    setActiveScreen('code');
  }, [setActiveScreen]);

  const goToPlan = useCallback(() => {
    setDashboardPanel('plan');
    setActiveScreen('plan');
  }, [setActiveScreen, setDashboardPanel]);

  const goToSettings = useCallback(() => {
    setActiveScreen('settings');
  }, [setActiveScreen]);

  const goToDashboard = useCallback(
    (panel?: IdeDashboardPanel) => {
      // Legacy panel ids that now live outside the projects Dashboard.
      if (panel === 'plan' || panel === 'mindmap') {
        goToPlan();
        return;
      }
      if (panel === 'settings') {
        goToSettings();
        return;
      }
      if (panel) setDashboardPanel(panel);
      setActiveScreen('dashboard');
    },
    [goToPlan, goToSettings, setActiveScreen, setDashboardPanel],
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
      goToLandingHome,
      goToBuild,
      goToCode,
      goToPlan,
      goToSettings,
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
      goToLandingHome,
      goToBuild,
      goToCode,
      goToPlan,
      goToSettings,
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
