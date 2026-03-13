import { useState, useEffect } from 'react';
import posthog from 'posthog-js';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useLoaderData, useRouteError } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { Loader2 } from 'lucide-react';
import { useAuthenticatedFetch } from '../contexts/AuthenticatedFetchContext';
import { authenticate } from '../shopify.server';
import { BILLING_PLANS } from '../lib/plans';
import prisma from '../db.server';
import { getMonthlyUsage, PLAN_LIMITS } from '../lib/billing.server';

// ── Loader ────────────────────────────────────────────────────────────────────
//
// Also handles the Shopify post-payment redirect (GET to /app/billing).
// billing.check() reflects the new subscription state immediately, so we sync
// the plan to our DB here on every load — no separate return_from_billing intent needed.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  const subscription = await billing.check({
    plans: Object.values(BILLING_PLANS),
    isTest: true,
  });

  const activePlan = subscription.hasActivePayment
    ? (subscription.appSubscriptions[0]?.name ?? 'free')
    : 'free';

  // Sync plan to DB — keeps us consistent after upgrades, downgrades, and
  // subscription events that arrive via the webhook.
  await prisma.shop.update({
    where: { id: session.shop },
    data: { plan: activePlan },
  });

  const used = await getMonthlyUsage(session.shop);

  return {
    shop: session.shop,
    plan: activePlan,
    used,
    limit: PLAN_LIMITS[activePlan] ?? PLAN_LIMITS.free,
  };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const fd = await request.formData();
  const plan = fd.get('plan') as keyof typeof BILLING_PLANS;

  if (!Object.values(BILLING_PLANS).includes(plan)) {
    return Response.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // billing.request() always throws — on success it throws a redirect Response,
  // on failure it throws a BillingError. React Router handles the thrown Response.
  await billing.request({
    plan,
    isTest: true,
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
  });
};

// ── Plan card data ────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'free',
    label: 'Free',
    price: '$0',
    generations: 3,
    angles: 'Front only',
    features: ['3 generations / month', 'Front angle only', '1 brand style profile'],
    cta: null,
  },
  {
    id: BILLING_PLANS.Starter,
    label: 'Starter',
    price: '$39',
    generations: 30,
    angles: 'Front · 3/4 · Back',
    features: ['30 generations / month', 'Full 3-angle structural set', 'High-res output', '1 brand style profile'],
    cta: 'Upgrade to Starter',
  },
  {
    id: BILLING_PLANS.Growth,
    label: 'Growth',
    price: '$99',
    generations: 100,
    angles: 'Front · 3/4 · Back',
    features: ['100 generations / month', 'Full 3-angle structural set', 'Detail close-up generation', 'Flat lay output', '2 brand style profiles'],
    cta: 'Upgrade to Growth',
  },
  {
    id: BILLING_PLANS.Scale,
    label: 'Scale',
    price: '$249',
    generations: 300,
    angles: 'Front · 3/4 · Back',
    features: ['300 generations / month', 'Full 3-angle structural set', 'Detail close-up generation', 'Flat lay output', 'Lifestyle image generation', 'Unlimited brand style profiles', 'Credit rollover (up to 1 month)'],
    cta: 'Upgrade to Scale',
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function Billing() {
  const { shop, plan, used, limit } = useLoaderData<typeof loader>();
  const authenticatedFetch = useAuthenticatedFetch();
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [submittingPlan, setSubmittingPlan] = useState<string | undefined>();

  useEffect(() => {
    posthog.capture('billing_viewed', { shop, plan });
  }, [shop, plan]);

  async function handlePlanSubmit(planId: keyof typeof BILLING_PLANS) {
    if (!Object.values(BILLING_PLANS).includes(planId)) return;
    setIsSubscribing(true);
    setSubmittingPlan(planId);
    try {
      const formData = new FormData();
      formData.set('plan', planId);
      const res = await authenticatedFetch('/app/billing', {
        method: 'POST',
        body: formData,
        redirect: 'manual',
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('Location');
        if (location) window.location.href = location;
      }
    } finally {
      setIsSubscribing(false);
      setSubmittingPlan(undefined);
    }
  }

  return (
    <div className="min-h-screen bg-krea-bg p-6">
      <div className="max-w-3xl space-y-8">

        {/* Usage meter */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">This month</p>
          <div className="bg-white rounded-xl border border-krea-border px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-krea-text">
                {used} / {limit} generations used
              </p>
              <p className="text-xs text-krea-muted mt-0.5">
                Resets on the 1st of each month
              </p>
            </div>
            <div className="w-32 h-1.5 bg-krea-border rounded-full overflow-hidden">
              <div
                className="h-full bg-krea-accent rounded-full transition-all"
                style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
              />
            </div>
          </div>
        </section>

        {/* Plan cards */}
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Plans</p>
          <div className="grid grid-cols-2 gap-3">
            {PLANS.map((p) => {
              const isCurrent = p.id === plan;
              const isSubmitting = isSubscribing && submittingPlan === p.id;

              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 space-y-3 bg-white transition-all ${
                    isCurrent
                      ? 'border-krea-accent ring-1 ring-krea-accent'
                      : 'border-krea-border'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-krea-text">{p.label}</p>
                      <p className="text-xs text-krea-muted">{p.angles}</p>
                    </div>
                    <p className="text-sm font-semibold text-krea-text">{p.price}<span className="text-xs font-normal text-krea-muted">/mo</span></p>
                  </div>

                  <ul className="space-y-1">
                    {p.features.map((f) => (
                      <li key={f} className="text-xs text-krea-muted flex items-start gap-1.5">
                        <span className="text-krea-accent mt-0.5">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="h-8 flex items-center">
                      <span className="text-xs font-medium text-krea-accent">Current plan</span>
                    </div>
                  ) : p.cta ? (
                    <button
                      type="button"
                      disabled={isSubscribing}
                      onClick={() => handlePlanSubmit(p.id)}
                      className="w-full h-8 rounded-md bg-krea-accent text-white text-xs font-medium flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSubscribing && submittingPlan === p.id ? (
                        <><Loader2 className="w-3 h-3 animate-spin" />Redirecting…</>
                      ) : (
                        p.cta
                      )}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

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
