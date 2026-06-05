import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

for (const child of Array.from(document.documentElement.children)) {
  if (child.tagName !== "HEAD" && child.tagName !== "BODY") {
    child.remove();
  }
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
