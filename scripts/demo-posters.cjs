// Screenshots of the browser demo shown on the website until a visitor clicks "Try it live":
// site/img/demo/<lang>/<board id>.jpg, 1200 × 750, captured at 2× and scaled down so they stay sharp.
// Needs the web build first (npm run build:web). Serves site/ on a local port, opens the demo for
// each board and language, waits for the 3D view, and saves the page.
//   npx electron scripts/demo-posters.cjs                 every board, English and Italian
//   npx electron scripts/demo-posters.cjs rpi-pico it     some boards / one language
// On Linux without a display give Xvfb a screen big enough for the 2× window (its default 1280 × 1024
// would shrink the window to 640 × 512):
//   xvfb-run -a -s "-screen 0 2560x1600x24" npx electron scripts/demo-posters.cjs --no-sandbox

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');
const site = path.join(root, 'site');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split(/[?#]/)[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(site, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(site) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const langs = args.filter((a) => a === 'en' || a === 'it');
const wanted = args.filter((a) => a !== 'en' && a !== 'it');
const boards = wanted.length ? wanted : fs.readdirSync(path.join(root, 'boards')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
// One window per capture: closing it must not quit the app before the next one opens.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const server = await serve();
  const port = server.address().port;
  all: for (const lang of langs.length ? langs : ['en', 'it']) {
    fs.mkdirSync(path.join(site, 'img/demo', lang), { recursive: true });
    for (const id of boards) {
      const win = new BrowserWindow({ width: 1200, height: 750, show: false, useContentSize: true, webPreferences: { backgroundThrottling: false } });
      // A fresh page per board: the demo keeps nothing between loads.
      await win.webContents.session.clearStorageData();
      await win.loadURL(`http://127.0.0.1:${port}/demo/#demo=board&board=${encodeURIComponent(id)}&lang=${lang}&stage=desk&detail=full&light=studio`);
      await new Promise((r) => setTimeout(r, 14000));
      const img = await win.webContents.capturePage();
      const size = img.getSize();
      // A window the screen could not fit comes out smaller, with the layout of a narrow window.
      if (size.width * 750 !== size.height * 1200) {
        process.stderr.write(`${lang}/${id}: captured ${size.width} × ${size.height}, not 1200 × 750 (screen too small?)\n`);
        process.exitCode = 1;
        win.destroy();
        break all;
      }
      const out = path.join(site, 'img/demo', lang, `${id}.jpg`);
      fs.writeFileSync(out, img.resize({ width: 1200, quality: 'best' }).toJPEG(86));
      process.stdout.write(`${lang}/${id} ok\n`);
      win.destroy();
    }
  }
  server.close();
  app.quit();
});
