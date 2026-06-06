type AppFlowState = {
  pathname: string;
  betaIntakeCompleted: boolean;
  onboardingCompleted: boolean;
};

const POST_SETUP_REDIRECT_PATHS = new Set([
  "/app/beta-welcome",
  "/app/onboarding",
]);

export function getAppFlowRedirect(state: AppFlowState): string | null {
  if (!state.betaIntakeCompleted) {
    return state.pathname === "/app/beta-intake" ? null : "/app/beta-intake";
  }

  if (!state.onboardingCompleted) {
    return state.pathname === "/app/onboarding" ||
      state.pathname === "/app/beta-intake"
      ? null
      : "/app/onboarding";
  }

  if (POST_SETUP_REDIRECT_PATHS.has(state.pathname)) {
    return "/app/dress-model";
  }

  return null;
}
