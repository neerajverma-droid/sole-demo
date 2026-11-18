import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Which "New client" each picker opens: the Time Tracker's fields ask for no
 * phone; the shared client picker, used as before elsewhere (Projects,
 * reputation surveys), still does. The dialog is replaced by a recorder of the
 * props it was given; everything between it and the screen is the real code.
 */

const dialogProps: Record<string, unknown>[] = [];
vi.mock("@/components/documents/new-client-dialog", () => ({
  NewClientDialog: (props: Record<string, unknown>) => {
    dialogProps.push(props);
    return null;
  },
}));
vi.mock("@/components/ui/tooltip", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return { Tooltip: Pass, TooltipTrigger: Pass, TooltipContent: () => null, TooltipProvider: Pass };
});
vi.mock("@/components/ui/popover", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return { Popover: Pass, PopoverTrigger: Pass, PopoverContent: () => null };
});
vi.mock("@/utils/axiosInstance", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const { ProjectClientSelect } = await import("@/components/projects/project-client-select");
const { TimeDetailsFields } = await import("@/components/time-tracker/time-fields");
const { EMPTY_SELECTION } = await import("@/lib/time-tracker");

function render(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, element));
}

beforeEach(() => {
  dialogProps.length = 0;
});

describe("which New client a picker opens", () => {
  it("the Time Tracker's client field: no phone", () => {
    render(
      React.createElement(TimeDetailsFields, {
        idPrefix: "t",
        value: EMPTY_SELECTION,
        onChange: () => {},
      }),
    );
    expect(dialogProps).toHaveLength(1);
    expect(dialogProps[0].showPhone).toBe(false);
  });

  it("the shared client picker elsewhere: phone, as before", () => {
    render(React.createElement(ProjectClientSelect, { value: null, onChange: () => {} }));
    expect(dialogProps[0].showPhone).toBe(true);
  });

  it("the shared client picker when told not to ask", () => {
    render(React.createElement(ProjectClientSelect, { value: null, onChange: () => {}, askPhone: false }));
    expect(dialogProps[0].showPhone).toBe(false);
  });
});
