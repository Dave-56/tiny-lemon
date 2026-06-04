import {
  IMAGE_SERVICE_CAPACITY_MESSAGE,
  isRefundableImageProviderFailure,
} from "./flatLayCleanup";
import { logServerEvent } from "./observability.server";

const STORAGE_ERROR_MESSAGE =
  "We hit a storage issue while saving your image. This attempt was not counted. Please try again.";

const DEFAULT_GENERATION_ERROR_MESSAGE =
  "Image generation failed. Please try again.";

export function isStorageGenerationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  return (
    lower.includes("vercel blob") ||
    lower.includes("blob already exists") ||
    lower.includes("allowoverwrite") ||
    lower.includes("addrandomsuffix")
  );
}

export function getUserFacingGenerationError(
  error: unknown,
  fallback = DEFAULT_GENERATION_ERROR_MESSAGE,
): string {
  if (isStorageGenerationFailure(error)) {
    return STORAGE_ERROR_MESSAGE;
  }

  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();
  if (message === IMAGE_SERVICE_CAPACITY_MESSAGE) {
    return message;
  }

  if (message) {
    if (
      !message.includes("Vercel Blob") &&
      !message.includes("file://") &&
      !message.includes(" at ") &&
      !message.startsWith("Error:")
    ) {
      return message;
    }
  }

  return fallback;
}

export function isRefundableGenerationFailure(error: unknown): boolean {
  return isRefundableImageProviderFailure(error) || isStorageGenerationFailure(error);
}

export async function maybeRefundFailedGeneration({
  taskId,
  payload,
  error,
  refundReservedGeneration,
}: {
  taskId: string;
  payload: {
    outfitId: string;
    shopId: string;
    creditReservation?: {
      reservationDescription: string;
      refundDescription: string;
    };
  };
  error: unknown;
  refundReservedGeneration: (
    shopId: string,
    reservation: {
      reservationDescription: string;
      refundDescription: string;
    },
  ) => Promise<boolean>;
}): Promise<boolean> {
  if (!payload.creditReservation || !isRefundableGenerationFailure(error)) {
    return false;
  }

  const refunded = await refundReservedGeneration(
    payload.shopId,
    payload.creditReservation,
  ).catch(() => false);

  logServerEvent("info", "generation.failure_refund", {
    taskId,
    outfitId: payload.outfitId,
    shopId: payload.shopId,
    errorKind: isStorageGenerationFailure(error) ? "storage" : "provider",
    refunded,
  });

  return refunded;
}
