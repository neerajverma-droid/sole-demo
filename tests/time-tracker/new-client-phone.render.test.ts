import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

/*
 * "New client" from the Time Tracker asks for a name and an email only — no
 * phone. Everywhere else the dialog keeps its optional Phone field. Rendered
 * for real; only the Radix wrappers are swapped for plain containers, since
 * their portals don't render on the server.
 */

vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      open ? React.createElement("div", { "data-dialog": "" }, children) : null,
    DialogContent: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});
vi.mock("@/components/ui/tooltip", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return { Tooltip: Pass, TooltipTrigger: Pass, TooltipContent: () => null, TooltipProvider: Pass };
});
vi.mock("@/components/ui/popover", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return { Popover: Pass, PopoverTrigger: Pass, PopoverContent: () => null };
});
vi.mock("@/hooks/use-country-context", () => ({
  useCountryContext: () => ({ country: {}, ready: true, loading: false, isError: false }),
}));
vi.mock("@/utils/axiosInstance", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const { NewClientDialog } = await import("@/components/documents/new-client-dialog");

function render(element: React.ReactElement): string {
  const client = new QueryClient();
  return renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, element));
}

const dialog = (props: Partial<React.ComponentProps<typeof NewClientDialog>> = {}) =>
  render(
    React.createElement(NewClientDialog, {
      open: true,
      onOpenChange: () => {},
      initialName: "",
      onCreated: () => {},
      ...props,
    }),
  );

describe("the New client dialog", () => {
  it("keeps its optional Phone field by default", () => {
    const html = dialog();
    expect(html).toContain("Client name");
    expect(html).toContain("Email");
    expect(html).toContain("Phone");
  });

  it("leaves Phone off when asked to — the Time Tracker's version", () => {
    const html = dialog({ showPhone: false });
    expect(html).toContain("Client name");
    expect(html).toContain("Email");
    expect(html).not.toContain("Phone");
    expect(html).not.toContain('inputMode="tel"');
  });

  it("still requires the email for a client either way", () => {
    // The required marker sits on Email; Phone (when shown) says Optional.
    expect(dialog({ showPhone: false })).not.toContain("Optional.");
    expect(dialog()).toContain("Optional.");
  });

  it("keeps Phone for a supplier", () => {
    expect(dialog({ createType: "Supplier" })).toContain("Phone");
  });
});
