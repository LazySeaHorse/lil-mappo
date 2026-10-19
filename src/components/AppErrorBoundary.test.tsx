import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { track } from "@/lib/analytics";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(track).mockClear();
  });

  it("renders children when nothing throws", () => {
    render(<AppErrorBoundary><span>editor</span></AppErrorBoundary>);
    expect(screen.getByText("editor")).toBeTruthy();
  });

  it("replaces a crashed tree with a reload prompt and reports it", () => {
    render(<AppErrorBoundary><Boom message="Cannot read properties of undefined" /></AppErrorBoundary>);
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
    expect(track).toHaveBeenCalledWith("app_crashed", { error_class: "other" });
  });

  it("says a new version is available for a failed chunk load", () => {
    render(
      <AppErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/A-1.js" />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("A new version is available");
    expect(track).toHaveBeenCalledWith("app_crashed", { error_class: "chunk_load" });
  });

  it("reloads the page from the button", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    render(<AppErrorBoundary><Boom message="x" /></AppErrorBoundary>);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalled();
  });
});
