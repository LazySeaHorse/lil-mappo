import { describe, it, expect } from "vitest";
import { applyEasing, getNormalizedProgress } from "../engine/easings";

describe("easings", () => {
  it("should calculate linear correctly", () => {
    expect(applyEasing("linear", 0)).toBe(0);
    expect(applyEasing("linear", 0.5)).toBe(0.5);
    expect(applyEasing("linear", 1)).toBe(1);
  });

  it("should calculate easeInOutSine correctly", () => {
    expect(applyEasing("easeInOutSine", 0)).toBe(0);
    expect(applyEasing("easeInOutSine", 0.5)).toBeCloseTo(0.5);
    expect(applyEasing("easeInOutSine", 1)).toBe(1);
  });

  it("should calculate bounce correctly", () => {
    expect(applyEasing("bounce", 0)).toBe(0);
    expect(applyEasing("bounce", 1)).toBe(1);
  });

  it("should clamp bounds in getNormalizedProgress", () => {
    expect(getNormalizedProgress(0, 5, 10, "linear")).toBe(0);
    expect(getNormalizedProgress(15, 5, 10, "linear")).toBe(1);
    expect(getNormalizedProgress(7.5, 5, 10, "linear")).toBe(0.5);
  });
});
