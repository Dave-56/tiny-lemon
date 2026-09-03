import type { LoaderFunctionArgs } from "react-router";
import { publicOrigin } from "../lib/agent/config.server";
import { getJobState, jobResponse } from "../lib/agent/onModelJob.server";

/**
 * GET /api/on-model/jobs/:jobId — free status poll for a paid generation.
 * Job ids are unguessable cuids scoped to the agent system shop.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const jobId = params.jobId?.trim();
  if (!jobId) {
    return Response.json({ error: "missing_job_id" }, { status: 400 });
  }
  const state = await getJobState(jobId);
  if (!state) {
    return Response.json({ error: "not_found", message: "Unknown jobId." }, { status: 404 });
  }
  const { body } = jobResponse(state, publicOrigin(request));
  // Polls always answer 200 with the state inside; the paid call is the one
  // that uses 202/502 to signal outcome to payment middleware.
  return Response.json(body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      ...(state.status === "processing" ? { "retry-after": "5" } : {}),
    },
  });
};
