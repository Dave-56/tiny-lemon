import type { LoaderFunctionArgs } from "react-router";
import { buildOpenApiDocument } from "../lib/agent/openapi.server";

/**
 * GET /openapi.json — discovery document for MPP (mppx validate, MPPScan),
 * AgentCash, and x402scan. Always free.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const doc = await buildOpenApiDocument(request);
  return Response.json(doc, {
    headers: {
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
};
