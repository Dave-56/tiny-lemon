import type { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import {
  MissingSessionStorageError,
  MissingSessionTableError,
  PrismaSessionStorage,
} from "@shopify/shopify-app-session-storage-prisma";
import type { PrismaClient } from "@prisma/client";

type PrismaSessionStorageOptions = {
  tableName?: string;
  connectionRetries?: number;
  connectionRetryIntervalMs?: number;
};

type SessionOperation<T> = () => Promise<T>;

function isRecoverableReadinessError(error: unknown) {
  if (
    error instanceof MissingSessionTableError ||
    error instanceof MissingSessionStorageError
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Prisma session table does not exist") ||
    error.message.includes("Prisma session storage is not ready")
  );
}

export class RecoverablePrismaSessionStorage
  extends PrismaSessionStorage<PrismaClient>
  implements SessionStorage
{
  constructor(prisma: PrismaClient, options?: PrismaSessionStorageOptions) {
    super(prisma, options);
  }

  async storeSession(session: Session) {
    return this.withReadinessRecovery(() => super.storeSession(session));
  }

  async loadSession(id: string) {
    return this.withReadinessRecovery(() => super.loadSession(id));
  }

  async deleteSession(id: string) {
    return this.withReadinessRecovery(() => super.deleteSession(id));
  }

  async deleteSessions(ids: string[]) {
    return this.withReadinessRecovery(() => super.deleteSessions(ids));
  }

  async findSessionsByShop(shop: string) {
    return this.withReadinessRecovery(() => super.findSessionsByShop(shop));
  }

  private async withReadinessRecovery<T>(operation: SessionOperation<T>) {
    try {
      return await operation();
    } catch (error) {
      if (!isRecoverableReadinessError(error)) {
        throw error;
      }

      const ready = await this.isReady();
      if (!ready) {
        throw error;
      }

      return operation();
    }
  }
}
