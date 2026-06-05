export const REGENERATE_POSES = ["front", "three-quarter", "back"] as const;

export type RegeneratePose = (typeof REGENERATE_POSES)[number];

export function isRegeneratePose(value: unknown): value is RegeneratePose {
  return (
    typeof value === "string" &&
    (REGENERATE_POSES as readonly string[]).includes(value)
  );
}

export function parseTargetPoses(value: unknown): {
  poses?: RegeneratePose[];
  error?: string;
} {
  if (value === undefined || value === null) return {};
  if (!Array.isArray(value)) {
    return { error: "targetPoses must be an array" };
  }
  if (value.length === 0) {
    return { error: "targetPoses cannot be empty" };
  }
  if (value.length > 1) {
    return { error: "Regenerate one image at a time" };
  }
  const [pose] = value;
  if (!isRegeneratePose(pose)) {
    return { error: "Invalid target pose" };
  }
  return { poses: [pose] };
}
