# BoardPilot License 1.1 (source-available)

Copyright (c) 2026 Mojtaba Amini ("Licensor"). All rights reserved except as granted below.

BoardPilot is **source-available**: the source code is public so you can read it, learn from it, check what it does with your hardware, build it yourself and contribute. It is **not** "open source" in the OSI sense, because the Licensor may require a paid license for future versions (see section 3).

This license covers everything in this repository **except**:

- the folder `firmware/`, licensed under the MIT License (see `firmware/LICENSE`), so the diagnostic agent and the BoardPilotProbe library can be used freely in your own firmware;
- the parts library in `parts/` (and the published `parts.json`), licensed under Creative Commons Attribution 4.0 (see `parts/LICENSE`), so anyone can reuse the part data with credit.

## 1. Definitions

- **Software**: the BoardPilot desktop application in this repository, its source code, builds made from it, and its documentation, excluding `firmware/` and `parts/`.
- **You**: the person or organisation using the Software.
- **License Key**: a key issued by the Licensor (format `BP1-…`) that that may be required to use future versions of the Software (see section 3).

## 2. What you may do

1. **Read, study and modify** the source code.
2. **Build** the Software from source for your own use under the terms below.
3. **Use** the Software free of charge during the **public beta**. The 30-day "Evaluation Period" counted from the first start on each computer stays in the Software, so a paid model can be switched on later, but while the public beta lasts it does not limit your use.
4. **Contribute** changes back to this repository (see section 6).
5. **Share links** to this repository and to official downloads.

## 3. Public beta and future versions

BoardPilot is **free to use during the public beta**; no License Key is needed. The terms may change for future versions: the Licensor may then require a valid License Key for each user (personal plan) or each seat (commercial and education plans), obtained through the official website <https://boardpilot.agentflowbind.com>. If that happens, users will be told well in advance, on the website and in the app, before any key is required. Until such an announcement, this section does not require you to pay or to hold a key.

## 4. What you may not do

1. Remove, disable or work around the evaluation or license-key check, or distribute builds in which it is removed, disabled or bypassed. (This applies once a License Key is required under section 3.)
2. Sell, rent, sublicense or redistribute the Software, modified or not, or offer it as a hosted service, except with the Licensor's written permission.
3. Generate, share or publish License Keys, or keys that imitate them.
4. Remove copyright, license or attribution notices.

Distributing unmodified copies of the official installers, free of charge and with this license, is allowed.

## 5. Third-party components

The Software uses third-party libraries (for example Electron, React, three.js, serialport, uPlot and the Anthropic SDK), each under its own license. Those licenses apply to those components and are not changed by this license.

## 6. Contributions

By submitting a contribution (for example a pull request), you confirm you have the right to do so and you grant the Licensor a perpetual, worldwide, royalty-free, irrevocable license to use, modify, relicense and distribute your contribution as part of the Software.

## 7. No warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. The Software talks to real hardware and can write firmware to it. Although it backs up the flash and asks for confirmation before every write, **you are responsible for your hardware**. Wrong wiring can damage boards and components.

## 8. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE LICENSOR BE LIABLE FOR ANY CLAIM, DAMAGES (INCLUDING DAMAGE TO HARDWARE OR LOSS OF DATA) OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR ITS USE. Nothing in this license limits rights you have under mandatory consumer-protection law in your country.

## 9. Termination

Your rights under this license end automatically if you break its terms. If you fix the breach within 30 days of becoming aware of it, your rights are reinstated.

## 10. Governing law

This license is governed by the laws of Italy, without regard to conflict-of-law rules, unless mandatory law where you live says otherwise.

---

Questions about licensing: open an issue at <https://github.com/mojeee/boardpilot/issues> with the label `license`.
