import {
  IMAGE_SERVICE_CAPACITY_MESSAGE,
  IMAGE_SERVICE_BILLING_CONFIGURATION_MESSAGE,
  IMAGE_SERVICE_QUOTA_OR_RATE_LIMIT_MESSAGE,
  IMAGE_SERVICE_UNAVAILABLE_MESSAGE,
  type ImageProviderErrorKind,
  isRefundableImageProviderFailure,
} from "./flatLayCleanup";
import { logServerEvent } from "./observability.server";

const STORAGE_ERROR_MESSAGE =
  "We hit a storage issue while saving your image. This attempt was not counted. Please try again.";

const GRAPHIC_FIDELITY_ERROR_MESSAGE =
  "Image generation failed to preserve the product graphic. This attempt was not counted. Please try again.";

const DEFAULT_GENERATION_ERROR_MESSAGE =
  "Image generation failed. Please try again.";

const REFUNDED_PROVIDER_ERROR_MESSAGES: Record<
  Extract<ImageProviderErrorKind, "quota_or_rate_limit" | "provider_billing" | "provider_unavailable">,
  string
> = {
  quota_or_rate_limit:
    "AI image generation is busy right now. This attempt was not counted. Please try again in a few minutes.",
  provider_billing:
    "AI image generation is currently unavailable. This attempt was not counted. Our team has been alerted. Please try again later.",
  provider_unavailable:
    "AI image generation provider is temporarily unavailable. This attempt was not counted. Please try again shortly.",
};

export class GraphicFidelityGenerationError extends Error {
  constructor() {
    super("Generated image failed graphic fidelity validation.");
    this.name = "GraphicFidelityGenerationError";
  }
}

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

export function isGraphicFidelityGenerationFailure(error: unknown): boolean {
  if (error instanceof GraphicFidelityGenerationError) return true;

  const message = error instanceof Error ? error.message : String(error ?? "");
  return message === "Generated image failed graphic fidelity validation.";
}

export function getUserFacingGenerationError(
  error: unknown,
  fallback = DEFAULT_GENERATION_ERROR_MESSAGE,
  options: { refunded?: boolean } = {},
): string {
  if (isStorageGenerationFailure(error)) {
    return STORAGE_ERROR_MESSAGE;
  }

  if (isGraphicFidelityGenerationFailure(error)) {
    return GRAPHIC_FIDELITY_ERROR_MESSAGE;
  }

  const providerErrorKind = getImageProviderErrorKind(error);
  if (providerErrorKind) {
    if (options.refunded && providerErrorKind in REFUNDED_PROVIDER_ERROR_MESSAGES) {
      return REFUNDED_PROVIDER_ERROR_MESSAGES[
        providerErrorKind as keyof typeof REFUNDED_PROVIDER_ERROR_MESSAGES
      ];
    }

    if (providerErrorKind === "quota_or_rate_limit") {
      return IMAGE_SERVICE_QUOTA_OR_RATE_LIMIT_MESSAGE;
    }

    if (providerErrorKind === "provider_billing") {
      return IMAGE_SERVICE_BILLING_CONFIGURATION_MESSAGE;
    }

    if (providerErrorKind === "provider_unavailable") {
      return IMAGE_SERVICE_UNAVAILABLE_MESSAGE;
    }
  }

  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();
  if (message === IMAGE_SERVICE_CAPACITY_MESSAGE) {
    return options.refunded
      ? REFUNDED_PROVIDER_ERROR_MESSAGES.provider_unavailable
      : IMAGE_SERVICE_UNAVAILABLE_MESSAGE;
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

function getImageProviderErrorKind(error: unknown): ImageProviderErrorKind | null {
  if (!error || typeof error !== "object") return null;
  const providerErrorKind = (error as { providerErrorKind?: unknown }).providerErrorKind;
  if (
    providerErrorKind === "quota_or_rate_limit" ||
    providerErrorKind === "provider_billing" ||
    providerErrorKind === "safety" ||
    providerErrorKind === "invalid_input" ||
    providerErrorKind === "provider_unavailable" ||
    providerErrorKind === "unknown"
  ) {
    return providerErrorKind;
  }
  return null;
}

export function isRefundableGenerationFailure(error: unknown): boolean {
  return (
    isRefundableImageProviderFailure(error) ||
    isStorageGenerationFailure(error) ||
    isGraphicFidelityGenerationFailure(error)
  );
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
    errorKind: isStorageGenerationFailure(error)
      ? "storage"
      : isGraphicFidelityGenerationFailure(error)
      ? "graphic_fidelity"
      : "provider",
    refunded,
  });

  return refunded;
}
