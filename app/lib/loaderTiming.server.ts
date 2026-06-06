type LoaderTimingMetadata = Record<string, boolean | number | string | null | undefined>;

function roundMs(ms: number): number {
  return Math.round(ms);
}

export function createLoaderTiming(route: string, request: Request) {
  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  const pathname = new URL(request.url).pathname;

  async function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const labelStartedAt = performance.now();
    try {
      return await fn();
    } finally {
      timings[label] = roundMs(performance.now() - labelStartedAt);
    }
  }

  function log(metadata: LoaderTimingMetadata = {}) {
    if (process.env.NODE_ENV === "test") return;

    console.info(
      "[loader-timing]",
      JSON.stringify({
        route,
        pathname,
        totalMs: roundMs(performance.now() - startedAt),
        ...timings,
        ...metadata,
      }),
    );
  }

  return { log, measure };
}
