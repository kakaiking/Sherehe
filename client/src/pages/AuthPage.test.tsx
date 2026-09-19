import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../App";
import * as googleStart from "../auth/googleStart";
import { storeGooglePending } from "../auth/googleStart";
import { saveContinue } from "../flow/continue";
import { SnackbarProvider } from "../snackbar";
import { AuthPage } from "./AuthPage";

const me: User = {
  id: "u1",
  email: "a@example.com",
  phone: "+254700000000",
  role: "customer",
  displayName: "Ada Lovelace",
  givenName: "Ada",
};

function renderAuth(entry: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SnackbarProvider>
        <Routes>
          <Route path="/login" element={<AuthPage onAuth={() => undefined} />} />
          <Route path="/" element={<p>Home module</p>} />
          <Route path="/tickets" element={<p>Ticket step two</p>} />
          <Route path="/account" element={<p>Account home</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("AuthPage Google", () => {
  it("shows allowlisted Google failure copy and ignores unknown error query values", () => {
    const { unmount } = renderAuth("/login?error=google_network");
    expect(screen.getByRole("alert").textContent).toMatch(/VPN|network/i);
    unmount();
    renderAuth("/login?error=%3Cscript%3Ealert(1)%3C/script%3E");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a dropped session after Google returns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/csrf")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ csrfToken: "test-csrf" }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({
            detail: "Sign in to continue.",
          }),
        });
      }),
    );
    renderAuth("/login?from=google");
    expect((await screen.findByRole("alert")).textContent).toMatch(/cookies/i);
  });

  it("offers Continue with Google instead of a password form", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <SnackbarProvider>
          <AuthPage onAuth={() => undefined} />
        </SnackbarProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Vendor" }));
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("starts Google with PKCE in sessionStorage instead of a bounce 302", async () => {
    const leave = vi.spyOn(googleStart, "leaveForGoogle").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/v1/auth/google")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              enabled: true,
              clientId: "cid.apps.googleusercontent.com",
              redirectUri: "http://localhost:5173/v1/auth/google/callback",
            }),
          });
        }
        return Promise.reject(new Error(String(url)));
      }),
    );
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <SnackbarProvider>
          <AuthPage onAuth={() => undefined} />
        </SnackbarProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(leave).toHaveBeenCalled());
    const dest = new URL(String(leave.mock.calls[0]?.[0]));
    expect(dest.origin).toBe("https://accounts.google.com");
    expect(dest.searchParams.get("code_challenge_method")).toBe("S256");
    expect(sessionStorage.getItem("sherehe.oauth")).toMatch(/verifier/);
    leave.mockRestore();
  });

  it("treats a Google return without a matching PKCE start as expired", async () => {
    renderAuth(`/login?code=auth-code-value&state=${"e".repeat(64)}`);
    expect((await screen.findByRole("alert")).textContent).toMatch(/expired/i);
  });

  it("finishes Google sign-in by POSTing the PKCE verifier", async () => {
    storeGooglePending({
      state: "p".repeat(64),
      verifier: "v".repeat(43),
      portal: "user",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (String(url).includes("/csrf")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ csrfToken: "test-csrf" }),
          });
        }
        if (
          String(url).includes("/v1/auth/google/callback") &&
          init?.method === "POST"
        ) {
          return Promise.resolve({
            ok: true,
            json: async () => me,
          });
        }
        return Promise.reject(new Error(String(url)));
      }),
    );
    renderAuth(`/login?code=auth-code-value&state=${"p".repeat(64)}`);
    expect(await screen.findByText("Home module")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Signed in.");
  });

  it("returns to the saved in-app step after Google sign-in", async () => {
    saveContinue("/tickets?pick=early_bird");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/csrf")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ csrfToken: "test-csrf" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => me,
        });
      }),
    );
    renderAuth("/login?from=google");
    expect(await screen.findByText("Ticket step two")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Signed in.");
  });

  it("lands on home after Google sign-in when nothing is saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/csrf")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ csrfToken: "test-csrf" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => me,
        });
      }),
    );
    renderAuth("/login?from=google");
    expect(await screen.findByText("Home module")).toBeTruthy();
    expect(screen.queryByText("Ticket step two")).toBeNull();
  });

  it("skips a phone step when Google left the number empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/csrf")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ csrfToken: "test-csrf" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...me, phone: null }),
        });
      }),
    );
    renderAuth("/login?from=google");
    expect(await screen.findByText("Home module")).toBeTruthy();
    expect(screen.queryByLabelText("Kenyan mobile")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save number" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Signed in.");
  });
});
