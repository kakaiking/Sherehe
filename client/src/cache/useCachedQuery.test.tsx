import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { writeQuery } from "./queryCache";
import { useApiQuery } from "./useCachedQuery";

function Probe({
  path,
  cacheKey,
}: {
  path: string;
  cacheKey: string;
}): ReactElement {
  const { data, loading } = useApiQuery<{ name: string }>(cacheKey, path, {
    uid: "anon",
  });
  if (loading && !data) {
    return <p>skeleton</p>;
  }
  return <p>{data?.name ?? "empty"}</p>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useApiQuery", () => {
  it("shows a skeleton until the first network payload", async () => {
    let resolve!: (v: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      ),
    );
    render(<Probe path="/v1/catalog/event" cacheKey="probe:cold" />);
    expect(screen.getByText("skeleton")).toBeTruthy();
    resolve(
      new Response(JSON.stringify({ name: "Sherehe" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await screen.findByText("Sherehe")).toBeTruthy();
  });

  it("paints cached data without waiting on the network", async () => {
    writeQuery("anon", "probe:warm", { name: "Cached night" });
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>(() => {
          /* hang — cache must still paint */
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Probe path="/v1/catalog/event" cacheKey="probe:warm" />);
    expect(screen.getByText("Cached night")).toBeTruthy();
    expect(screen.queryByText("skeleton")).toBeNull();
  });
});
