// Product constants shared by the app and the website.

export const PRODUCT = 'BoardPilot';
export const SITE_URL = 'https://boardpilot.agentflowbind.com';
export const REPO_URL = 'https://github.com/mojeee/boardpilot';
/** Where "Buy a license" points. The site's pricing section explains how to get a key. */
export const BUY_URL = `${SITE_URL}/#pricing`;
export const TRIAL_DAYS = 30;
/**
 * Free public beta (decided Sep 28): when true, the end of the trial shows a notice that can be
 * closed (at most once a week) instead of the lock screen. Set to false to require a license key
 * again; the trial and key code is still there. LICENSE.md must change together with this flag.
 */
export const BETA_FREE = true;
/** Where beta feedback goes (a prefilled GitHub issue). */
export const FEEDBACK_URL = `${REPO_URL}/issues/new?labels=feedback&title=Beta%20feedback`;

/** Ed25519 public key that verifies license keys. The private key never enters the repo. */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1VnjKyfwHTs2NOA5sEqIEnXHS41YHqJk+yqpA14ko0E=
-----END PUBLIC KEY-----`;
