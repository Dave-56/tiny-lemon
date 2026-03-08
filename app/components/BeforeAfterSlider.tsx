import { useState, useRef, useCallback } from "react";
import sliderStyles from "./BeforeAfterSlider.module.css";

export interface BeforeAfterSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

export function BeforeAfterSlider({
  beforeImage,
  afterImage,
  beforeLabel = "Before",
  afterLabel = "After",
  className = "",
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(100, ((clientX - rect.left) / rect.width) * 100)
    );
    setPosition(x);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      updatePosition(e.clientX);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [updatePosition]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updatePosition(e.clientX);
    },
    [isDragging, updatePosition]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      setPosition((p) => Math.max(0, p - 5));
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setPosition((p) => Math.min(100, p + 5));
      e.preventDefault();
    }
  }, []);

  const rootClass = [sliderStyles.slider, className].filter(Boolean).join(" ");

  return (
    <div
      ref={containerRef}
      className={rootClass}
      role="img"
      aria-label={`Comparison: ${beforeLabel} and ${afterLabel}. Use slider or arrow keys to compare.`}
    >
      {/* After (base layer, full image) */}
      <div className={sliderStyles.after}>
        <img
          src={afterImage}
          alt=""
          role="presentation"
          width={800}
          height={600}
        />
        <span className={`${sliderStyles.label} ${sliderStyles.labelAfter}`}>
          {afterLabel}
        </span>
      </div>
      {/* Before (on top, clipped by position) */}
      <div
        className={sliderStyles.before}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={beforeImage}
          alt=""
          role="presentation"
          width={800}
          height={600}
        />
        <span className={`${sliderStyles.label} ${sliderStyles.labelBefore}`}>
          {beforeLabel}
        </span>
      </div>
      {/* Slider handle */}
      <div
        className={sliderStyles.handle}
        style={{ left: `${position}%` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Compare ${beforeLabel} and ${afterLabel}`}
      >
        <span className={sliderStyles.line} />
        <span className={sliderStyles.thumb} />
      </div>
    </div>
  );
}
