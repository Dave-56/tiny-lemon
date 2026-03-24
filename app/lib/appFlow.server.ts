import { BETA_STATUS } from "./beta";

type AppFlowState = {
  pathname: string;
  betaAccess: boolean;
  betaStatus: string | null;
  betaWelcomeCompleted: boolean;
  betaIntakeCompleted: boolean;
  onboardingCompleted: boolean;
};

const BETA_ALLOWED_PATHS = new Set([
  "/app/beta-welcome",
  "/app/beta-intake",
  "/app/onboarding",
]);

export function getAppFlowRedirect(state: AppFlowState): string | null {
  const betaOverlayActive =
    state.betaAccess &&
    state.betaStatus !== BETA_STATUS.paused &&
    state.betaStatus !== BETA_STATUS.ended;

  if (betaOverlayActive && !state.betaWelcomeCompleted) {
    return state.pathname === "/app/beta-welcome" ? null : "/app/beta-welcome";
  }

  if (betaOverlayActive && !state.betaIntakeCompleted) {
    return state.pathname === "/app/beta-intake" ? null : "/app/beta-intake";
  }

  if (!state.onboardingCompleted) {
    return state.pathname === "/app/onboarding" ? null : "/app/onboarding";
  }

  if (
    betaOverlayActive &&
    BETA_ALLOWED_PATHS.has(state.pathname)
  ) {
    return "/app/dress-model";
  }

  return null;
}
