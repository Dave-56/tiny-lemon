import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthenticatedFetchProvider, useAuthenticatedFetch } from "./AuthenticatedFetchContext";

// Mock @shopify/app-bridge-react
const mockIdToken = vi.fn();
vi.mock("@shopify/app-bridge-react", () => ({
  useAppBridge: () => ({
    idToken: mockIdToken,
  }),
}));

function Consumer({ onFetch }: { onFetch: (fn: (url: string, init?: RequestInit) => Promise<Response>) => void }) {
  const authenticatedFetch = useAuthenticatedFetch();
  onFetch(authenticatedFetch);
  return <div>Consumer</div>;
}

describe("AuthenticatedFetchContext", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    mockIdToken.mockResolvedValue("test-session-token");
  });

  it("adds Authorization Bearer header when idToken is available", async () => {
    let capturedFetch: (url: string, init?: RequestInit) => Promise<Response>;
    render(
      <AuthenticatedFetchProvider>
        <Consumer
          onFetch={(fn) => {
            capturedFetch = fn;
          }}
        />
      </AuthenticatedFetchProvider>
    );
    await screen.findByText("Consumer");

    await capturedFetch!("/app/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/app/outfits",
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = call[1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-session-token");
  });

  it("calls fetch without token when idToken rejects", async () => {
    mockIdToken.mockRejectedValueOnce(new Error("Not in iframe"));
    let capturedFetch: (url: string, init?: RequestInit) => Promise<Response>;
    render(
      <AuthenticatedFetchProvider>
        <Consumer
          onFetch={(fn) => {
            capturedFetch = fn;
          }}
        />
      </AuthenticatedFetchProvider>
    );
    await screen.findByText("Consumer");

    await capturedFetch!("/app/outfits", { method: "GET" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/app/outfits",
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = call[1].headers as Headers;
    expect(headers.get("Authorization")).toBeNull();
  });

  it("merges existing headers with Authorization", async () => {
    let capturedFetch: (url: string, init?: RequestInit) => Promise<Response>;
    render(
      <AuthenticatedFetchProvider>
        <Consumer
          onFetch={(fn) => {
            capturedFetch = fn;
          }}
        />
      </AuthenticatedFetchProvider>
    );
    await screen.findByText("Consumer");

    await capturedFetch!("/app/dress-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = call[1].headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer test-session-token");
  });
});
