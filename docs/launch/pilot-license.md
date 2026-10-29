# Pilot license and unsigned-install rehearsal

Run this before a customer meeting so the license state and the "unknown developer" prompts never surprise us there.

## 1. Issue a commercial pilot key

The app is free during the public beta (`BETA_FREE` in `shared/brand.ts`): after 30 days it shows a closable notice once a week instead of the lock screen, so the customer is never locked out and a key is optional. Issue one anyway if the pilot should show a licensed state or run after the beta ends.

The private key is `~/.boardpilot/license-private.pem` (or `$BOARDPILOT_LICENSE_KEY`). It is not in the repo. The matching public key is `LICENSE_PUBLIC_KEY_PEM` in `shared/brand.ts`; if the two do not match, no issued key will activate.

```bash
node scripts/make-license.mjs --name "Giardinocontrol" --plan commercial --expires 2027-01-31
```

Pick the expiry 90 days after the issue date. Keep the printed `BP1-…` key in the password manager.

- [ ] Paste the key into the app (license dialog) on the demo laptop and check the top bar shows a licensed state, not the trial days.
- [ ] Restart the app and check the state stays licensed.

## 2. Install the unsigned build on a clean machine

Installers are unsigned until the signing work (#13) lands.

- [ ] Build both installers from current `main` (the Release workflow, or `npm run dist:mac` / `npm run dist:win` on each platform).
- [ ] Install on a machine that has never had BoardPilot.
- [ ] macOS: write down the exact steps to open it (Control-click > Open, or System Settings > Privacy & Security > Open Anyway).
- [ ] Windows: write down the SmartScreen steps (More info > Run anyway).
- [ ] Put those steps in the FAQ on the website.

## 3. Use the customer's own Anthropic key on the demo laptop

`AiSettingsStore.active` (`app/main/settings/settings.ts`) falls back to the free demo AI (`app/main/ai/providers/demo.ts`) when the chosen provider has no key.

- [ ] Open AI settings, pick Anthropic (the first cards), enter the key and press the test button.
- [ ] Check the "free demo" card is not the selected one, then ask the assistant something.
- [ ] With the network off, check the simulator still works.
