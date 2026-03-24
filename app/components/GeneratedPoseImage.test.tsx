import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GeneratedPoseImage } from "./GeneratedPoseImage";

describe("GeneratedPoseImage", () => {
  it("retries without variant sources after the first image error", () => {
    const { container } = render(
      <GeneratedPoseImage
        url="https://blob.example/outfits/shop/outfit/front.abcd1234.png"
        label="Front"
      />,
    );

    expect(container.querySelectorAll("source")).toHaveLength(2);

    fireEvent.error(screen.getByAltText("Front"));

    expect(container.querySelectorAll("source")).toHaveLength(0);
    expect(screen.getByAltText("Front")).toBeInTheDocument();
    expect(
      screen.queryByTestId("generated-pose-placeholder"),
    ).not.toBeInTheDocument();
  });

  it("shows a placeholder only after the plain png also fails", () => {
    const { container } = render(
      <GeneratedPoseImage
        url="https://blob.example/outfits/shop/outfit/front.abcd1234.png"
        label="Front"
      />,
    );

    fireEvent.error(screen.getByAltText("Front"));
    fireEvent.error(screen.getByAltText("Front"));

    expect(container.querySelectorAll("source")).toHaveLength(0);
    expect(screen.queryByAltText("Front")).not.toBeInTheDocument();
    expect(screen.getByTestId("generated-pose-placeholder")).toBeInTheDocument();
  });

  it("resets fallback state when the url changes", () => {
    const { container, rerender } = render(
      <GeneratedPoseImage
        url="https://blob.example/outfits/shop/outfit/front.abcd1234.png"
        label="Front"
      />,
    );

    fireEvent.error(screen.getByAltText("Front"));
    expect(container.querySelectorAll("source")).toHaveLength(0);

    rerender(
      <GeneratedPoseImage
        url="https://blob.example/outfits/shop/outfit/back.efgh5678.png"
        label="Back"
      />,
    );

    expect(container.querySelectorAll("source")).toHaveLength(2);
    expect(screen.getByAltText("Back")).toBeInTheDocument();
  });
});
