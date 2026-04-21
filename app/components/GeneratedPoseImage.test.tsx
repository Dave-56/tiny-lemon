import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GeneratedPoseImage } from "./GeneratedPoseImage";

const assetManifest = {
  kind: "pose-image-v2" as const,
  original: {
    url: "https://blob.example/outfits/shop/outfit/front.abcd1234.png",
    width: 800,
    height: 1200,
    contentType: "image/png",
  },
  displayFallback: {
    url: "https://blob.example/outfits/shop/outfit/front.abcd1234-640w.display.webp",
    width: 640,
    contentType: "image/webp",
  },
  variants: {
    avif: [
      {
        url: "https://blob.example/outfits/shop/outfit/front.abcd1234-640w.avif",
        width: 640,
        contentType: "image/avif",
      },
      {
        url: "https://blob.example/outfits/shop/outfit/front.abcd1234-800w.avif",
        width: 800,
        contentType: "image/avif",
      },
    ],
    webp: [
      {
        url: "https://blob.example/outfits/shop/outfit/front.abcd1234-640w.webp",
        width: 640,
        contentType: "image/webp",
      },
      {
        url: "https://blob.example/outfits/shop/outfit/front.abcd1234-800w.webp",
        width: 800,
        contentType: "image/webp",
      },
    ],
  },
  downloadUrl: "https://blob.example/outfits/shop/outfit/front.abcd1234.png",
};

describe("GeneratedPoseImage", () => {
  it("renders picture sources from the asset manifest", () => {
    const { container } = render(
      <GeneratedPoseImage asset={assetManifest} label="Front" />,
    );

    expect(container.querySelectorAll("source")).toHaveLength(2);
    expect(screen.getByAltText("Front")).toBeInTheDocument();
  });

  it("renders a plain image for legacy url-only rows", () => {
    const { container } = render(
      <GeneratedPoseImage
        url="https://blob.example/outfits/shop/outfit/front.legacy.png"
        label="Front"
      />,
    );

    expect(container.querySelectorAll("source")).toHaveLength(0);
    expect(screen.getByAltText("Front")).toHaveAttribute(
      "src",
      "https://blob.example/outfits/shop/outfit/front.legacy.png",
    );
  });

  it("falls back to the original URL for v1 manifests without display metadata", () => {
    render(
      <GeneratedPoseImage
        asset={{
          ...assetManifest,
          kind: "pose-image-v1" as const,
          displayFallback: undefined,
        }}
        label="Front"
      />,
    );

    expect(screen.getByAltText("Front")).toHaveAttribute(
      "src",
      "https://blob.example/outfits/shop/outfit/front.abcd1234.png",
    );
  });

  it("shows a placeholder after the selected asset fails", () => {
    const { container } = render(
      <GeneratedPoseImage asset={assetManifest} label="Front" />,
    );

    fireEvent.error(screen.getByAltText("Front"));

    expect(container.querySelectorAll("source")).toHaveLength(0);
    expect(screen.queryByAltText("Front")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("generated-pose-placeholder"),
    ).toBeInTheDocument();
  });

  it("falls back to the raw url when the manifest original fails", () => {
    const { container } = render(
      <GeneratedPoseImage
        asset={assetManifest}
        url="https://blob.example/outfits/shop/outfit/front.raw.png"
        label="Front"
      />,
    );

    const img = screen.getByAltText("Front");
    expect(img).toHaveAttribute(
      "src",
      "https://blob.example/outfits/shop/outfit/front.abcd1234-640w.display.webp",
    );
    expect(container.querySelectorAll("source")).toHaveLength(2);

    fireEvent.error(img);

    const fallbackImg = screen.getByAltText("Front");
    expect(fallbackImg).toHaveAttribute(
      "src",
      "https://blob.example/outfits/shop/outfit/front.raw.png",
    );
    expect(container.querySelectorAll("source")).toHaveLength(0);
  });

  it("resets fallback state when the asset changes", () => {
    const { container, rerender } = render(
      <GeneratedPoseImage asset={assetManifest} label="Front" />,
    );

    fireEvent.error(screen.getByAltText("Front"));
    expect(
      screen.getByTestId("generated-pose-placeholder"),
    ).toBeInTheDocument();

    rerender(
      <GeneratedPoseImage
        asset={{
          ...assetManifest,
          original: {
            ...assetManifest.original,
            url: "https://blob.example/outfits/shop/outfit/back.efgh5678.png",
          },
          displayFallback: {
            ...assetManifest.displayFallback,
            url: "https://blob.example/outfits/shop/outfit/back.efgh5678-640w.display.webp",
          },
        }}
        label="Back"
      />,
    );

    expect(container.querySelectorAll("source")).toHaveLength(2);
    expect(screen.getByAltText("Back")).toBeInTheDocument();
  });

  it("uses preset sizes when a preset is provided", () => {
    const { container } = render(
      <GeneratedPoseImage
        asset={assetManifest}
        label="Front"
        preset="lightbox"
      />,
    );

    const source = container.querySelector("source");
    expect(source).toHaveAttribute("sizes", "800px");
    expect(screen.getByAltText("Front")).toHaveAttribute("sizes", "800px");
  });
});
