import { api } from "@/lib/api";
import type { AuthResponse, GoogleAuthInput, LoginInput, RegisterInput, SessionPayload } from "@/types/auth";

/** All auth calls go through the BFF, which turns the API's `token` into the httpOnly cookie. */
export const authService = {
  session: () => api<SessionPayload>("/api/session"),
  me: () => api<SessionPayload>("/api/auth/me"),
  login: (input: LoginInput) => api<AuthResponse>("/api/auth/login", { method: "POST", json: input }),
  register: (input: RegisterInput) => api<AuthResponse>("/api/auth/register", { method: "POST", json: input }),
  google: (input: GoogleAuthInput) => api<AuthResponse>("/api/auth/google", { method: "POST", json: input }),
  forgot: (email: string) => api<{ ok: true }>("/api/auth/forgot", { method: "POST", json: { email } }),
  reset: (token: string, password: string) =>
    api<AuthResponse>("/api/auth/reset", { method: "POST", json: { token, password } }),
  /** Record acceptance of the current Terms + Privacy versions (re-acceptance prompt). */
  acceptTerms: () => api<AuthResponse>("/api/auth/accept-terms", { method: "POST" }),
  /** Handled entirely by the BFF: clears the cookie. */
  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  deleteAccount: () => api<{ ok: true }>("/api/auth/account", { method: "DELETE" }),
};
