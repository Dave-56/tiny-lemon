import { describe, expect, it } from "vitest";

import { getAppFlowRedirect } from "./appFlow.server";

describe("getAppFlowRedirect", () => {
  it("sends merchants with incomplete intake to the store profile step", () => {
    expect(
      getAppFlowRedirect({
        pathname: "/app/dress-model",
        betaIntakeCompleted: false,
        onboardingCompleted: false,
      }),
    ).toBe("/app/beta-intake");

    expect(
      getAppFlowRedirect({
        pathname: "/app/beta-intake",
        betaIntakeCompleted: false,
        onboardingCompleted: false,
      }),
    ).toBeNull();
  });

  it("allows completed store profiles to be revisited before brand onboarding", () => {
    expect(
      getAppFlowRedirect({
        pathname: "/app/beta-intake",
        betaIntakeCompleted: true,
        onboardingCompleted: false,
      }),
    ).toBeNull();
  });

  it("allows the store profile nav after setup is complete", () => {
    expect(
      getAppFlowRedirect({
        pathname: "/app/beta-intake",
        betaIntakeCompleted: true,
        onboardingCompleted: true,
      }),
    ).toBeNull();
  });

  it("redirects completed setup-only pages back to the app", () => {
    expect(
      getAppFlowRedirect({
        pathname: "/app/onboarding",
        betaIntakeCompleted: true,
        onboardingCompleted: true,
      }),
    ).toBe("/app/dress-model");
  });
});
