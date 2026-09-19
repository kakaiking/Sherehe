import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Rewrite = { source: string; destination: string };

type VercelConfig = {
  rewrites?: Rewrite[];
};

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadVercelConfig(): VercelConfig {
  return JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as VercelConfig;
}

describe("vercel SPA routing", () => {
  it("rewrites client routes to index.html after API prefixes", () => {
    const rewrites = loadVercelConfig().rewrites ?? [];
    expect(rewrites[0]).toEqual({
      source: "/v1/:path*",
      destination: "/api",
    });
    expect(rewrites[1]).toEqual({
      source: "/health",
      destination: "/api",
    });
    expect(rewrites.at(-1)).toEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
  });
});
