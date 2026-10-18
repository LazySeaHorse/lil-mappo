import { lazy } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LazyBoundary } from "./LazyBoundary";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("LazyBoundary", () => {
  it("contains a failed chunk import instead of unmounting the tree", async () => {
    const Broken = lazy(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module: /a.js")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <div>
        <span>app</span>
        <LazyBoundary>
          <Broken />
        </LazyBoundary>
      </div>,
    );
    await vi.waitFor(() => expect(screen.getByText("app")).toBeTruthy());
    const { toast } = await import("sonner");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
