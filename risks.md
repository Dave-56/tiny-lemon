# Risks

## Current Risks

### 1. Auth/session edge cases in embedded mode
- Embedded requests can lose Shopify session context when `idToken()` fails or the app receives a redirect/HTML response instead of JSON.
- User impact: actions can fail mid-flow unless the client handles expired sessions cleanly.
- Current status: partially hardened with a shared authenticated request helper and session-expired handling.

### 2. Billing and idempotency correctness
- Generation credits can be reserved too early in the request lifecycle, before enough deterministic validation and before enqueue is fully confirmed.
- Repeated clicks or retries on generate, regenerate, or publish can create duplicate work or unfair charges without explicit idempotency rules.
- User impact: overcharging, duplicate outfits, or duplicate Shopify sync jobs.

### 3. Server-side trust boundaries
- The server currently trusts client-supplied model metadata more than it should in generation flows.
- Model identity and owned asset resolution should be done server-side from known DB or preset records.
- User impact: malformed requests, incorrect asset use, or easier abuse of internal generation paths.

### 4. Duplicate async writes in generated images
- `GeneratedImage` does not yet have a uniqueness guard on `(outfitId, pose)`.
- Concurrent retries or duplicated jobs can create multiple rows for the same pose.
- User impact: inconsistent outfit state, duplicated outputs, and harder recovery logic.

### 5. Very light test coverage for a route-heavy app
- The app has important business logic in route actions/loaders and Trigger task orchestration, but very little automated coverage.
- User impact: regressions in billing, generation, auth, and publishing are easier to ship unnoticed.

### 6. In-memory rate limiting is not durable across instances
- `/try` demo limiting and flat-lay validation throttling now use durable shared storage.
- The validator still has process-local cache and circuit-breaker state even after durable rate limiting landed.
- Files involved: [app/lib/rateLimit.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/rateLimit.server.ts), [app/routes/try.tsx](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/routes/try.tsx), [app/routes/api.validate-flatlay.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/routes/api.validate-flatlay.ts), [app/lib/validateFlatLay.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/validateFlatLay.server.ts)
- User impact: inconsistent enforcement in production and weaker abuse protection across multiple instances.

### 7. Trigger.dev version consistency
- Trigger code currently uses `@trigger.dev/sdk/v3` imports while repo guidance prefers `@trigger.dev/sdk`.
- User impact: future work can drift into mixed patterns, making maintenance and upgrades riskier.

## Recommended Priority Order

1. Auth/session hardening, server-side validation, billing correctness, and idempotency
2. Tests for the exact failure modes above
3. Durable shared rate limiting plus instrumentation/observability
4. Trigger.dev cleanup or migration

## Actionable Checklist

### Phase 1. Auth, trust boundaries, billing correctness, and idempotency

- [x] Create one shared client authenticated-request helper for embedded app requests
- [x] Handle `idToken()` failure gracefully instead of letting the request crash
- [x] Normalize `401`/`403` and redirected HTML auth failures into a consistent session-expired response
- [x] Route dress-model generation requests through the shared auth helper
- [x] Surface session-expired errors on the outfits page instead of failing silently
- [x] Add lightweight instrumentation for auth helper fallbacks and unauthorized responses
- [x] Resolve model ownership server-side from DB/preset records instead of trusting client-supplied model image data
- [x] Move deterministic validation ahead of credit reservation in generation flows
- [x] Add narrow refund/compensation logic when credit reservation succeeds but enqueue fails
- [x] Define product behavior for duplicate generate/regenerate/publish requests
- [x] Add request idempotency for generate
- [x] Add request idempotency for regenerate
- [x] Add request idempotency for publish to Shopify
- [x] Add a DB uniqueness constraint for `GeneratedImage(outfitId, pose)`
- [x] Handle uniqueness conflicts cleanly in async generation tasks
- [x] Add lightweight instrumentation for reservation/refund paths
- [x] Add lightweight instrumentation for idempotency reuse vs fresh enqueue
- [x] Add lightweight instrumentation for generated-image uniqueness conflicts

### Phase 2. Tests for the exact failure modes

- [x] Add/repair tests for auth helper token-failure fallback
- [x] Add tests for normalized unauthorized/session-expired responses
- [x] Add tests for server-side model resolution and invalid model input rejection
- [x] Add tests for validation-before-reservation behavior
- [x] Add tests for refund behavior on pre-enqueue failure
- [x] Add tests for generate/regenerate/publish idempotency behavior
- [x] Add tests for duplicate generated-image conflict handling
- [x] Add tests for billing boundary conditions in `billing.server.ts`
- [x] Add tests for `triggerGeneration.server.ts` happy path and limit-reached path

### Phase 3. Durable rate limiting and observability

- [x] Replace `/try` demo rate limiting with durable shared storage
- [x] Replace flat-lay validation rate limiting with durable shared storage
- [x] Move rate-limit logic into shared utilities instead of route-local state
- [x] Add counters/logs for rate-limit allow/deny behavior
- [x] Add counters/logs for background-job failures and retries

### Phase 4. Trigger.dev cleanup/migration

- [ ] Decide whether to stay on the current Trigger.dev version or migrate fully
- [ ] Avoid mixed Trigger.dev usage patterns across the codebase
- [ ] Centralize task-triggering helpers where it reduces duplication
- [ ] Review retry semantics and document the intended billing policy for failed downstream jobs

## Done So Far

- [x] Shared authenticated request helper added in [app/lib/authenticatedRequest.client.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/authenticatedRequest.client.ts)
- [x] `AuthenticatedFetchContext` wired to the shared helper in [app/contexts/AuthenticatedFetchContext.tsx](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/contexts/AuthenticatedFetchContext.tsx)
- [x] Dress-model generation requests moved onto the shared helper in [app/routes/app.dress-model.tsx](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/routes/app.dress-model.tsx)
- [x] Outfits page now shows a visible session-expired error state in [app/routes/app.outfits.tsx](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/routes/app.outfits.tsx)
- [x] Auth helper instrumentation added for fallback and unauthorized cases
- [x] Auth-related tests expanded and fixed in [app/contexts/AuthenticatedFetchContext.test.tsx](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/contexts/AuthenticatedFetchContext.test.tsx)
- [x] Server-side model resolution added in [app/lib/triggerGeneration.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/triggerGeneration.server.ts)
- [x] Generation and regeneration now validate model ownership before reserving credits in [app/lib/triggerGeneration.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/triggerGeneration.server.ts)
- [x] Correlation-safe pre-enqueue refund helper added in [app/lib/billing.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/billing.server.ts)
- [x] Generate/regenerate now refund only pre-enqueue failures in [app/lib/triggerGeneration.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/triggerGeneration.server.ts)
- [x] Publish no-op/idempotency guard added at the route boundary in [app/routes/app.outfits.tsx](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/routes/app.outfits.tsx)
- [x] Focused publish idempotency tests added in [app/routes/app.outfits.test.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/routes/app.outfits.test.ts)
- [x] Generated-image uniqueness constraint added in [schema.prisma](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/prisma/schema.prisma)
- [x] Prisma migration created in [migration.sql](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/prisma/migrations/20260323000100_add_generated_image_pose_unique/migration.sql)
- [x] Generate/regenerate uniqueness handling added via [generatedImagePersistence.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/generatedImagePersistence.server.ts)
- [x] Generated-image conflict tests added in [generatedImagePersistence.server.test.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/generatedImagePersistence.server.test.ts)
- [x] DB-backed generate/regenerate idempotency helper added in [requestIdempotency.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/requestIdempotency.server.ts)
- [x] Request idempotency schema and migration added in [schema.prisma](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/prisma/schema.prisma) and [migration.sql](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/prisma/migrations/20260323000300_add_request_idempotency/migration.sql)
- [x] Generate/regenerate flows now claim idempotency before reservation in [triggerGeneration.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/triggerGeneration.server.ts)
- [x] Focused generate/regenerate idempotency tests added in [triggerGeneration.server.test.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/triggerGeneration.server.test.ts)
- [x] Focused generation trust-boundary tests added in [app/lib/triggerGeneration.server.test.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/triggerGeneration.server.test.ts)
- [x] Focused billing boundary-condition tests added in [billing.server.test.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/billing.server.test.ts)
- [x] Verification completed: `npm run typecheck`, focused Vitest auth tests, and full `npm test`

## Lightweight Instrumentation To Keep

- [x] Count auth helper fallbacks and `401` session-expired responses
- [x] Count reservation/refund paths
- [x] Count idempotency reuses vs fresh enqueues
- [x] Count unique-constraint conflicts if they occur
- [x] Count durable `/try` rate-limit allow/deny behavior
- [x] Count durable flat-lay validation rate-limit allow/deny behavior
- [x] Count background task start/success/final-failure lifecycle events

## Phase 3 Notes

- `/try` now uses a durable Prisma-backed limiter with HMAC subject digests, bounded transaction retries, fail-open behavior on limiter-store issues, and standard rate-limit headers.
- `/api/validate-flatlay` now uses the same durable limiter with preserved sliding-window semantics, standard rate-limit headers, and distinct upstream Gemini failure logs.
- Background tasks now emit shared structured `task.started`, `task.completed`, and `task.failed_final` logs. Per-attempt retry telemetry is still intentionally deferred until the Trigger.dev cleanup/migration work in Phase 4.
- Validator residual risk remains: [app/lib/validateFlatLay.server.ts](/Users/preciousemakenemi/Downloads/test-fashion/create-a-model/tiny-lemon/app/lib/validateFlatLay.server.ts) still keeps per-instance cache and warn-mode breaker state.
