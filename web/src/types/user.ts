/** Mirrors lib/users.js toPublicUser(). */
export interface PublicUser {
  id: number;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
}

/** Mirrors lib/users.js toPrivateUser() + referralCode (what /api/auth/* and /api/users/me return). */
export interface PrivateUser extends PublicUser {
  email: string | null;
  role: "user" | "admin";
  status: "active" | "suspended" | "deleted";
  pawPoints: number;
  pointsLifetimeEarned: number;
  country: string | null;
  postalCode: string | null;
  marketingOptIn: boolean;
  featureConsentDefault: boolean;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  privacyVersion: string | null;
  needsTermsAcceptance: boolean;
  hasPassword: boolean;
  hasApple: boolean;
  hasGoogle: boolean;
  bonuses: {
    welcome: boolean;
    profilePet: boolean;
    firstPost: boolean;
    firstOrder: boolean;
    firstCreation: boolean;
  };
  lastSeenAt: string | null;
  shopifyCustomerId?: string;
  referralCode?: string;
}

/** GET /api/users/:handle */
export interface UserProfile extends PublicUser {
  followerCount: number;
  followingCount: number;
  postCount: number;
  isFollowing: boolean;
  isMe: boolean;
}

export interface UpdateMeInput {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  country?: string | null;
  postalCode?: string | null;
  marketingOptIn?: boolean;
  featureConsentDefault?: boolean;
}
