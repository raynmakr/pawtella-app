import type { PrivateUser } from "./user";
import type { Pet } from "./pet";

/** What the API returns from /api/auth/{login,register,apple,google,reset}. The BFF strips `token`
 *  (it becomes the httpOnly cookie), so the browser sees only `user` and `isNew`. */
export interface AuthResponse {
  user: PrivateUser;
  isNew?: boolean;
}

/** GET /api/session (BFF) and GET /api/auth/me. */
export interface SessionPayload {
  user: PrivateUser | null;
  pets: Pet[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
  handle?: string;
  referralCode?: string;
  partnerCode?: string;
}

export interface GoogleAuthInput {
  idToken: string;
  referralCode?: string;
  partnerCode?: string;
}
