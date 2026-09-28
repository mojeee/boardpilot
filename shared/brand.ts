// Product constants shared by the app and the website.

export const PRODUCT = 'BoardPilot';
export const SITE_URL = 'https://boardpilot.agentflowbind.com';
export const REPO_URL = 'https://github.com/mojeee/boardpilot';
/** Where "Buy a license" points. The site's pricing section explains how to get a key. */
export const BUY_URL = `${SITE_URL}/#pricing`;
export const TRIAL_DAYS = 30;

/** Ed25519 public key that verifies license keys. The private key never enters the repo. */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1VnjKyfwHTs2NOA5sEqIEnXHS41YHqJk+yqpA14ko0E=
-----END PUBLIC KEY-----`;
