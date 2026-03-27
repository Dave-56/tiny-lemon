import { consumeRateLimit } from "./rateLimit.server";

const DEFAULT_REPLICATE_CREATE_LIMIT = 1;
const DEFAULT_REPLICATE_CREATE_WINDOW_MS = 10_000;

function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
  const value = Number(rawValue);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getReplicatePredictionCreateLimit() {
  return parsePositiveInt(
    process.env.REPLICATE_PREDICTION_CREATE_LIMIT,
    DEFAULT_REPLICATE_CREATE_LIMIT,
  );
}

export function getReplicatePredictionCreateWindowMs() {
  return parsePositiveInt(
    process.env.REPLICATE_PREDICTION_CREATE_WINDOW_MS,
    DEFAULT_REPLICATE_CREATE_WINDOW_MS,
  );
}

export async function consumeReplicatePredictionCreateSlot() {
  return consumeRateLimit({
    namespace: "replicate-prediction-create",
    subject: "replicate-account",
    limit: getReplicatePredictionCreateLimit(),
    windowMs: getReplicatePredictionCreateWindowMs(),
    algorithm: "sliding",
  });
}

type ReplicateThrottleError = Error & {
  response?: {
    status?: number;
    headers?: Headers;
  };
};

export function getReplicateThrottleRetryAfterMs(error: unknown): number | null {
  const throttleError = error as ReplicateThrottleError | undefined;
  const status = throttleError?.response?.status;
  if (status !== 429) {
    return null;
  }

  const retryAfterHeader = throttleError?.response?.headers?.get("retry-after");
  if (retryAfterHeader) {
    const asSeconds = Number(retryAfterHeader);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
      return Math.ceil(asSeconds * 1000);
    }

    const retryAt = new Date(retryAfterHeader);
    if (!Number.isNaN(retryAt.getTime())) {
      return Math.max(0, retryAt.getTime() - Date.now());
    }
  }

  if (throttleError && throttleError.message) {
    const match = throttleError.message.match(/"retry_after":\s*(\d+)/i);
    if (match) {
      return Math.ceil(Number(match[1]) * 1000);
    }
  }

  return getReplicatePredictionCreateWindowMs();
}
