import { beforeEach, describe, expect, it, vi } from "vitest";

type Delegate = {
  isReady: ReturnType<typeof vi.fn>;
  loadSession: ReturnType<typeof vi.fn>;
};

class MockMissingSessionStorageError extends Error {}
class MockMissingSessionTableError extends Error {
  constructor(message: string, public readonly cause: Error) {
    super(message);
  }
}

vi.mock("@shopify/shopify-app-session-storage-prisma", () => {
  class PrismaSessionStorage {
    private delegate: Delegate;

    constructor(prisma: { __delegate: Delegate }) {
      this.delegate = prisma.__delegate;
    }

    async isReady() {
      return this.delegate.isReady();
    }

    async loadSession(id: string) {
      return this.delegate.loadSession(id);
    }
  }

  return {
    MissingSessionStorageError: MockMissingSessionStorageError,
    MissingSessionTableError: MockMissingSessionTableError,
    PrismaSessionStorage,
  };
});

describe("RecoverablePrismaSessionStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechecks readiness and retries after a cached readiness failure", async () => {
    const { RecoverablePrismaSessionStorage } = await import(
      "./recoverablePrismaSessionStorage.server"
    );
    const delegate: Delegate = {
      isReady: vi.fn().mockResolvedValue(true),
      loadSession: vi
        .fn()
        .mockRejectedValueOnce(
          new MockMissingSessionStorageError("Prisma session storage is not ready"),
        )
        .mockResolvedValueOnce({ id: "session-1" }),
    };
    const storage = new RecoverablePrismaSessionStorage({
      __delegate: delegate,
    } as never);

    await expect(storage.loadSession("session-1")).resolves.toEqual({
      id: "session-1",
    });
    expect(delegate.isReady).toHaveBeenCalledTimes(1);
    expect(delegate.loadSession).toHaveBeenCalledTimes(2);
  });

  it("throws the original readiness error when storage is still not ready", async () => {
    const { RecoverablePrismaSessionStorage } = await import(
      "./recoverablePrismaSessionStorage.server"
    );
    const error = new MockMissingSessionTableError(
      "Prisma session table does not exist",
      new Error("database unreachable"),
    );
    const delegate: Delegate = {
      isReady: vi.fn().mockResolvedValue(false),
      loadSession: vi.fn().mockRejectedValue(error),
    };
    const storage = new RecoverablePrismaSessionStorage({
      __delegate: delegate,
    } as never);

    await expect(storage.loadSession("session-1")).rejects.toBe(error);
    expect(delegate.isReady).toHaveBeenCalledTimes(1);
    expect(delegate.loadSession).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-readiness failures", async () => {
    const { RecoverablePrismaSessionStorage } = await import(
      "./recoverablePrismaSessionStorage.server"
    );
    const error = new Error("permission denied");
    const delegate: Delegate = {
      isReady: vi.fn(),
      loadSession: vi.fn().mockRejectedValue(error),
    };
    const storage = new RecoverablePrismaSessionStorage({
      __delegate: delegate,
    } as never);

    await expect(storage.loadSession("session-1")).rejects.toBe(error);
    expect(delegate.isReady).not.toHaveBeenCalled();
    expect(delegate.loadSession).toHaveBeenCalledTimes(1);
  });
});
