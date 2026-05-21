type AppFlowState = {
  pathname: string;
  betaIntakeCompleted: boolean;
  onboardingCompleted: boolean;
};

const SETUP_PATHS = new Set([
  "/app/beta-welcome",
  "/app/beta-intake",
  "/app/onboarding",
]);

export function getAppFlowRedirect(state: AppFlowState): string | null {
  if (!state.betaIntakeCompleted) {
    return state.pathname === "/app/beta-intake" ? null : "/app/beta-intake";
  }

  if (!state.onboardingCompleted) {
    return state.pathname === "/app/onboarding" ? null : "/app/onboarding";
  }

  if (SETUP_PATHS.has(state.pathname)) {
    return "/app/dress-model";
  }

  return null;
}
