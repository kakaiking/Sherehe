import { afterEach, describe, expect, it } from "vitest";
import {
  homeForPortal,
  portalForPath,
  portalLabel,
  readStoredPortal,
  signedInMessage,
  storePortal,
  syncPortalFromPath,
} from "./portal";

afterEach(() => {
  sessionStorage.clear();
});

describe("portalForPath", () => {
  it("maps admin and guest prefixes only", () => {
    expect(portalForPath("/admin")).toBe("admin");
    expect(portalForPath("/guest")).toBe("user");
    expect(portalForPath("/guest/tickets")).toBe("user");
    expect(portalForPath("/partner")).toBeNull();
    expect(portalForPath("/vendor/shop")).toBeNull();
    expect(portalForPath("/login")).toBeNull();
  });
});

describe("syncPortalFromPath", () => {
  it("stores the route portal when the path owns a gate", () => {
    expect(syncPortalFromPath("/guest/tickets")).toBe("user");
    expect(readStoredPortal()).toBe("user");
    expect(syncPortalFromPath("/admin")).toBe("admin");
    expect(readStoredPortal()).toBe("admin");
  });

  it("forces guest on /login", () => {
    storePortal("admin");
    expect(syncPortalFromPath("/login")).toBe("user");
    expect(readStoredPortal()).toBe("user");
  });
});

describe("homeForPortal", () => {
  it("lands each gate on its portal home", () => {
    expect(homeForPortal("user")).toBe("/guest");
    expect(homeForPortal("admin")).toBe("/admin");
  });
});

describe("portalLabel", () => {
  it("names each gate", () => {
    expect(portalLabel("user")).toBe("Guest");
    expect(portalLabel("admin")).toBe("Admin");
  });
});

describe("signedInMessage", () => {
  it("names each gate in the snackbar", () => {
    expect(signedInMessage("user")).toBe("Signed in as a guest.");
    expect(signedInMessage("admin")).toBe("Signed in as an admin.");
  });
});
