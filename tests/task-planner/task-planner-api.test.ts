/**
 * The planner's requests, against sole-webapp's planner.services.js and the
 * planner components' inline calls — same endpoints and params, bodies now
 * in the encrypted `{ data }` envelope.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  fetchPlannerBoard,
  fetchPlannerStagePage,
  fetchPlannerList,
  updatePlannerTaskStage,
  bulkMovePlannerTasks,
  draftPlannerTaskInvoice,
  fetchFinalStageId,
  fetchPlannerClients,
  fetchTimeLogsByTask,
  markTimeEntriesInvoiced,
} = await import("@/lib/task-planner-api");

beforeEach(() => vi.resetAllMocks());

function decrypted(body: unknown): Record<string, unknown> {
  const data = (body as { data?: unknown })?.data;
  if (typeof data !== "string") throw new Error("Body was not a {data} envelope");
  return decryptPayload(data);
}

describe("reading the planner", () => {
  it("loads the board with the filter params", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ stage_id: 1, cards: [] }] } });
    const params = { search: "visit", contact_id: ["1"], sortBy: "date" };

    expect(await fetchPlannerBoard(params)).toEqual([{ stage_id: 1, cards: [] }]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.planner.getAllEvents, { params });
  });

  it("pages a column from its cursor", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { cards: [{ event_id: "9" }], next_cursor: "c2" } } });

    const result = await fetchPlannerStagePage("3", { after: "c1", sortBy: "date" });

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.planner.getPaginatedEvents}/3`, {
      params: { after: "c1", sortBy: "date" },
    });
    expect(result).toEqual({ cards: [{ event_id: "9" }], nextCursor: "c2" });
  });

  it("reports the last page with no cursor", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { cards: [] } } });
    expect((await fetchPlannerStagePage("3", {})).nextCursor).toBeNull();
  });

  it("loads a page of the list with its total", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { rows: [{ event_id: "1" }], pagination: { total: 31 } } },
    });

    const result = await fetchPlannerList({ page: 2, limit: 10, billable: true });

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.planner.getAllListTasks, {
      params: { page: 2, limit: 10, billable: true },
    });
    expect(result).toEqual({ rows: [{ event_id: "1" }], total: 31 });
  });

  it("finds the final stage's id from /stage", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [{ id: 1, order: 0 }, { id: 4, order: 3 }] },
    });
    expect(await fetchFinalStageId()).toBe("4");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.plannerStage.getAllStages);

    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });
    expect(await fetchFinalStageId()).toBeNull();
  });

  it("lists clients for the filter from /contact/list, both kinds", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { contact_id: 38110, name: "Jordan Reyes" },
          { id: 5, client: { business_name: "Milton Trades" } },
        ],
      },
    });

    expect(await fetchPlannerClients()).toEqual([
      { contact_id: "38110", id: "38110", name: "Jordan Reyes" },
      { contact_id: "5", id: "5", name: "Milton Trades" },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.companyContact.list, {
      params: { page: 1, limit: 1000 },
    });
  });

  it("reads clients nested under data.clients too", async () => {
    apiMock.get.mockResolvedValue({ data: { data: { clients: [{ contact_id: 1, name: "A" }] } } });
    expect((await fetchPlannerClients()).map((client) => client.name)).toEqual(["A"]);
  });
});

describe("moving tasks", () => {
  it("saves a stage change on the calendar event, encrypted", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    await updatePlannerTaskStage("568_occ_3", "35241");

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.planner.editEvents}/568_occ_3`);
    expect(decrypted(body)).toEqual({ stage_id: 35241 });
  });

  it("throws on a refused stage change, so the board puts the card back", async () => {
    apiMock.put.mockResolvedValue({ data: { success: false, message: "Stage not found." } });
    await expect(updatePlannerTaskStage("1", 2)).rejects.toThrow("Stage not found.");
  });

  it("bulk-moves the selected events, encrypted", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await bulkMovePlannerTasks(["568", "568_occ_3"]);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.planner.bulkMoveTasks);
    expect(decrypted(body)).toEqual({ event_ids: ["568", "568_occ_3"] });
  });

  it("throws on a refused bulk move", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(bulkMovePlannerTasks(["1"])).rejects.toThrow("Bulk move failed");
  });
});

describe("invoicing a task", () => {
  it("drafts the invoice with a bare PUT on the event", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await draftPlannerTaskInvoice("568");
    expect(apiMock.put).toHaveBeenCalledWith(`${apiRoutes.planner.draftEventsInvoice}/568`);
  });

  it("reads time logs grouped by task", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ task_id: 77 }] } });
    expect(await fetchTimeLogsByTask()).toEqual([{ task_id: 77 }]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.timeTracking.listByTask);
  });

  it("marks the invoiced entries billed, encrypted", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    await markTimeEntriesInvoiced([{ id: 1 }, { id: 2 }], { id: "901", number: "INV-7" });

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.timeTracking.bulkUpdate);
    expect(decrypted(body)).toEqual({
      id: [1, 2],
      // The encryption sends booleans as strings; the controller now reads both.
      is_invoiced: "true",
      invoice_id: "901",
      bill_type: "billed",
      invoice_no: "INV-7",
    });
  });

  it("throws when the entries can't be marked", async () => {
    apiMock.put.mockResolvedValue({ data: { success: false } });
    await expect(markTimeEntriesInvoiced([{ id: 1 }], { id: "1", number: "INV-1" })).rejects.toThrow(
      "Failed to update time entries",
    );
  });
});
