import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

// Parent layout (app.tsx) already handles authentication.
// This route just redirects to the main tab.
export const loader = async (_: LoaderFunctionArgs) => {
  return redirect("/app/dress-model");
};
