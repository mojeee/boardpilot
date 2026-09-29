// Renders the social preview images (Open Graph 1200x630, GitHub 1280x640) with Electron.
// Run: npx electron scripts/render-social.cjs og   and   npx electron scripts/render-social.cjs github
// Per-board images (site/img/boards/<id>.jpg, used by the board, guide and comparison pages):
//   node scripts/screenshots.mjs boards && npx electron scripts/render-social.cjs boards
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mark = fs.readFileSync(path.join(root, 'assets/brand/boardpilot-mark.svg'), 'utf8');
const shot = fs.readFileSync(path.join(root, 'site/img/debug-900.jpg')).toString('base64');

const html = (w, h) => `<!doctype html><html><head><style>
body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:'IBM Plex Sans',-apple-system,'Helvetica Neue',sans-serif;
background:radial-gradient(700px 420px at 78% 40%,rgba(63,182,232,.22),transparent 70%),radial-gradient(600px 400px at 10% 10%,rgba(201,190,255,.16),transparent 70%),#0f1419;color:#E9EDF1}
.l{position:absolute;left:64px;top:64px;width:${Math.round(w * 0.43)}px;z-index:2}
.brand{display:flex;align-items:center;gap:16px;font-size:34px;font-weight:600;letter-spacing:-.5px}
.brand svg{width:64px;height:64px}.brand b{color:#5CCB8F;font-weight:600}
h1{font-size:62px;line-height:1.03;letter-spacing:-1.5px;margin:48px 0 18px}
p{font-size:25px;line-height:1.4;color:#A7B3BF;margin:0}
.chips{display:flex;gap:10px;margin-top:34px;flex-wrap:wrap}
.chips span{font:500 18px 'IBM Plex Mono',monospace;padding:7px 13px;border-radius:20px;background:#1c232b;border:1px solid #2c3540;color:#A7B3BF}
.chips span.g{color:#5CCB8F;border-color:#2c5a43;background:#1b2d25}
.r{position:absolute;right:-150px;top:${Math.round(h * 0.16)}px;width:${Math.round(w * 0.56)}px;border-radius:16px;overflow:hidden;border:1px solid #334050;box-shadow:0 40px 90px rgba(0,0,0,.6);transform:perspective(1400px) rotateY(-9deg)}
.r img{display:block;width:100%}
</style></head><body>
<div class="l"><div class="brand">${mark}<span>Board<b>Pilot</b></span></div>
<h1>See inside your board.</h1>
<p>Live 3D board, I2C debugging, wiring checks and a 380+ part library. ESP32, Pico, Arduino, STM32, nRF52, Teensy.</p>
<div class="chips"><span class="g">13 boards</span><span class="g">open parts data</span><span>Mac · Windows</span></div></div>
<div class="r"><img src="data:image/jpeg;base64,${shot}"></div>
</body></html>`;

/** Social card for one board: the name and pin facts on the left, its 3D view on the right. */
const boardHtml = (b, shot) => `<!doctype html><html><head><style>
body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:'IBM Plex Sans',-apple-system,'Helvetica Neue',sans-serif;
background:radial-gradient(600px 420px at 80% 45%,rgba(92,203,143,.16),transparent 70%),#0f1419;color:#E9EDF1}
.l{position:absolute;left:60px;top:58px;width:470px;z-index:2}
.brand{display:flex;align-items:center;gap:12px;font-size:26px;font-weight:600}.brand svg{width:46px;height:46px}.brand b{color:#5CCB8F;font-weight:600}
h1{font-size:${b.name.length > 24 ? 46 : 54}px;line-height:1.05;letter-spacing:-1px;margin:44px 0 10px}
h2{font:500 30px 'IBM Plex Mono',monospace;color:#3FB6E8;margin:0 0 26px}
p{font-size:23px;line-height:1.4;color:#A7B3BF;margin:0}
.chips{display:flex;gap:9px;margin-top:30px;flex-wrap:wrap}
.chips span{font:500 17px 'IBM Plex Mono',monospace;padding:6px 12px;border-radius:18px;background:#1c232b;border:1px solid #2c3540;color:#A7B3BF}
.r{position:absolute;right:-40px;top:70px;width:680px;border-radius:14px;overflow:hidden;border:1px solid #334050;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.r img{display:block;width:100%}
</style></head><body>
<div class="l"><div class="brand">${mark}<span>Board<b>Pilot</b></span></div>
<h1>${b.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h1><h2>pinout</h2>
<p>Every pin, what it can do and which ones to avoid. Wiring guides for 30 parts.</p>
<div class="chips"><span>${b.pins.length} pins</span><span>${b.logicVolt} V logic</span><span>${b.chip.replace(/</g, '&lt;')}</span></div></div>
<div class="r"><img src="data:image/png;base64,${shot}"></div>
</body></html>`;

async function renderHtml(html, w, h, out) {
  const win = new BrowserWindow({ width: w, height: h, show: false, useContentSize: true });
  const tmp = path.join(app.getPath('temp'), `bp-social-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  // Loading a second page right after the first one sometimes aborts (ERR_FAILED); retry once.
  await win.loadFile(tmp).catch(() => new Promise((r) => setTimeout(r, 500)).then(() => win.loadFile(tmp)));
  await new Promise((r) => setTimeout(r, 800));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  fs.writeFileSync(out, img.resize({ width: w, height: h }).toJPEG(86));
  win.destroy();
}

async function render(w, h, out) {
  const win = new BrowserWindow({ width: w, height: h, show: false, useContentSize: true, webPreferences: { offscreen: false } });
  const tmp = path.join(app.getPath('temp'), `bp-social-${w}.html`);
  fs.writeFileSync(tmp, html(w, h));
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 1200));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  fs.writeFileSync(out, out.endsWith('.jpg') ? img.resize({ width: w, height: h }).toJPEG(86) : img.resize({ width: w, height: h }).toPNG());
  win.destroy();
}

// Keep running between cards: closing the only window would otherwise quit the app.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  try {
    // one size per run: `npx electron scripts/render-social.cjs og|github`
    if (process.argv.includes('boards')) {
      const dir = path.join(root, 'site/img/boards');
      for (const f of fs.readdirSync(path.join(root, 'boards')).filter((x) => x.endsWith('.json'))) {
        const b = JSON.parse(fs.readFileSync(path.join(root, 'boards', f), 'utf8'));
        const shotPath = path.join(dir, `${b.id}-3d.png`);
        if (!fs.existsSync(shotPath)) continue;
        await renderHtml(boardHtml(b, fs.readFileSync(shotPath).toString('base64')), 1200, 630, path.join(dir, `${b.id}.jpg`));
        fs.unlinkSync(shotPath);
        console.log(b.id);
      }
    } else if (process.argv.includes('github')) await render(1280, 640, path.join(root, 'assets/brand/github-social.png'));
    else await render(1200, 630, path.join(root, 'site/img/og.jpg'));
  } catch (e) {
    console.error(e);
  }
  app.quit();
});
