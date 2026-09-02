# Generative AI provider

All image generation, flat-lay cleanup, garment-spec extraction, upload
validation, and pose/graphic checks go through `app/lib/genaiClient.ts`.
It exposes the `@google/genai` request shape (`ai.models.generateContent`)
and swaps the transport underneath, so call sites never change when the
billing relationship does.

## Providers

| `GENAI_PROVIDER` | Key env var          | What it calls                                                        |
| ---------------- | -------------------- | -------------------------------------------------------------------- |
| `openrouter`     | `OPENROUTER_API_KEY` | OpenRouter Images API for image requests, chat completions for text  |
| `gemini`         | `GEMINI_API_KEY`     | Google Gemini API directly (the original integration)                |

If `GENAI_PROVIDER` is unset, OpenRouter is used whenever `OPENROUTER_API_KEY`
is present, otherwise Gemini.

The same Google models run in both cases. Model ids stay in Gemini form
(`GEMINI_IMAGE_MODEL`, `GEMINI_TEXT_MODEL`, `GARMENT_VALIDATOR_MODEL`) and are
mapped to OpenRouter ids automatically, e.g. `gemini-3.1-flash-image-preview`
becomes `google/gemini-3.1-flash-image`. A value that already contains a `/`
is passed through unchanged.

## Where to set the key

Generation runs in two places, so the key has to exist in both:

1. **Vercel** project `tinylemon`, Production and Preview. Used by the flat-lay
   validator route and the model builder.
2. **Trigger.dev** project `proj_xsbppmkqnxvghowxmstj`, `prod` environment.
   Used by `generate-outfit`, `regenerate-outfit`. Trigger.dev tasks must be
   redeployed (`npm run trigger:deploy`) after the code change so the new
   client ships.

## Errors and refunds

OpenRouter errors are thrown as `OpenRouterApiError` with the message
`OpenRouter <endpoint> <status> <code>: <message>`. The existing substring
classifier in `app/lib/flatLayCleanup.ts` maps them:

| OpenRouter response                    | Kind                  | Refunds the merchant |
| -------------------------------------- | --------------------- | -------------------- |
| 402 insufficient credits, 401/403 key  | `provider_billing`    | yes, and alerts      |
| 429                                    | `quota_or_rate_limit` | yes                  |
| 5xx, network failure                   | `provider_unavailable`| yes                  |
| moderation / flagged                   | `safety`              | no                   |
| 400                                    | `invalid_input`       | no                   |

## Known differences from direct Gemini

- The Images API takes one prompt plus an ordered list of reference images,
  so the interleaved `IMAGE n:` label texts are joined into a single prompt.
  Reference order is preserved.
- `temperature` and `thinkingConfig` are not sent for image requests; the
  Images API has no equivalent. Retries still vary because generation is not
  deterministic.
- `scripts/generate-preset-previews.ts` and
  `scripts/generate-three-quarter-preview.ts` still use the Gemini chat API
  directly and need `GEMINI_API_KEY`.
