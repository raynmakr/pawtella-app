// Current versions of the legal documents rendered at /terms and /privacy. Bumping a version here
// is what triggers the re-acceptance prompt for existing users (see api/auth.js and the web banner).
// The user-facing documents themselves live in web/content/legal/*.md.
export const TERMS_VERSION = '1.0';
export const PRIVACY_VERSION = '1.0';

/** True when the user has accepted the current Terms and Privacy versions. */
export function hasAcceptedCurrent(user) {
  return user?.terms_version === TERMS_VERSION && user?.privacy_version === PRIVACY_VERSION;
}

export default { TERMS_VERSION, PRIVACY_VERSION, hasAcceptedCurrent };
