import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import posthog from "posthog-js";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { BETA_FEEDBACK_CATEGORIES, WOULD_USE_LIVE_OPTIONS } from "../lib/beta";
import { getSupportEmail } from "../lib/support.server";

type FeedbackPayload = {
  category?: string | null;
  rating?: string | null;
  message?: string | null;
  outfitId?: string | null;
};

function normalizePayload(input: FormData | Record<string, unknown>): FeedbackPayload {
  const getValue = (key: string) => {
    if (input instanceof FormData) {
      return (input.get(key) as string | null) ?? null;
    }
    const value = input[key];
    return typeof value === "string" ? value : null;
  };

  return {
    category: getValue("category"),
    rating: getValue("rating"),
    message: getValue("message"),
    outfitId: getValue("outfitId"),
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    shop: session.shop,
    supportEmail: getSupportEmail(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const isJson = (request.headers.get("Content-Type") ?? "").includes("application/json");
  const payload = normalizePayload(
    isJson ? ((await request.json()) as Record<string, unknown>) : await request.formData(),
  );

  if (!payload.category) {
    return Response.json({ error: "category_required" }, { status: 400 });
  }

  if (payload.category === "would_use_live") {
    const existing = await prisma.betaFeedback.findFirst({
      where: { shopId: session.shop, category: "would_use_live" },
      select: { id: true },
    });
    if (existing) {
      return Response.json({ ok: true, reused: true });
    }
  }

  const record = await prisma.betaFeedback.create({
    data: {
      shopId: session.shop,
      outfitId: payload.outfitId || undefined,
      category: payload.category,
      rating: payload.rating || undefined,
      message: payload.message || undefined,
    },
  });

  if (isJson) {
    return Response.json({ ok: true, id: record.id });
  }

  return Response.json({ ok: true, id: record.id, submitted: true });
};

export default function Feedback() {
  const { shop, supportEmail } = useLoaderData<typeof loader>();
  const actionData = useActionData() as { ok?: boolean } | undefined;

  useEffect(() => {
    posthog.capture("beta_feedback_viewed", { shop });
  }, [shop]);

  return (
    <div className="min-h-screen bg-krea-bg p-6 pt-10">
      <div className="mx-auto max-w-xl rounded-2xl border border-krea-border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-krea-text">Send feedback</h1>
        <p className="mt-2 text-sm text-krea-muted">
          Tell us what you were trying to do, what happened, and whether the result is close enough to use live.
        </p>

        <Form
          method="post"
          className="mt-6 space-y-4"
          onSubmit={() => posthog.capture("beta_feedback_submitted", { shop, source: "feedback_page" })}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-krea-text">Category</span>
            <select
              name="category"
              defaultValue="result quality"
              className="h-10 w-full rounded-md border border-krea-border px-3 text-sm text-krea-text"
            >
              {BETA_FEEDBACK_CATEGORIES.filter((item) => item !== "would_use_live").map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-krea-text">Would you use this live?</span>
            <select
              name="rating"
              defaultValue="almost"
              className="h-10 w-full rounded-md border border-krea-border px-3 text-sm text-krea-text"
            >
              {WOULD_USE_LIVE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-krea-text">Message</span>
            <textarea
              name="message"
              rows={5}
              className="w-full rounded-md border border-krea-border px-3 py-2 text-sm text-krea-text"
              placeholder="What were you trying to do? What went wrong? What would make this usable?"
            />
          </label>

          <button
            type="submit"
            className="h-10 rounded-md bg-krea-accent px-4 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95"
          >
            Submit feedback
          </button>
        </Form>

        {actionData?.ok ? (
          <p className="mt-4 text-sm text-green-700">Thanks. Your feedback was saved.</p>
        ) : null}

        <a
          href={`mailto:${supportEmail}?subject=${encodeURIComponent("TinyLemon support")}`}
          onClick={() => posthog.capture("beta_support_clicked", { shop, location: "feedback_page" })}
          className="mt-5 inline-flex text-sm text-krea-accent underline underline-offset-2"
        >
          Prefer email? Contact support.
        </a>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
