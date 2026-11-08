// Android launcher icons + splash screens and the web icons, from app/assets/naqla-mark.png
// (the "N with doorway and box" mark cropped from the brand sheet). Run: node mobile/scripts/icons.cjs
const path = require('node:path');
const fs = require('node:fs');
const sharp = require(path.join(__dirname, '..', '..', 'api', 'node_modules', 'sharp'));

const root = path.join(__dirname, '..', '..');
const mark = path.join(root, 'app', 'assets', 'naqla-mark.png');
const res = path.join(root, 'mobile', 'android', 'app', 'src', 'main', 'res');
const BG = '#F1F8F6'; // the sheet's background, so the mark's edges blend in
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function onBackground(size, markSize, { round = false } = {}) {
  const m = await sharp(mark).resize(markSize, markSize).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: m, gravity: 'center' }]);
  if (round) {
    const circle = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: circle, blend: 'dest-in' }]);
  }
  return img.png().toBuffer();
}

(async () => {
  for (const [d, k] of Object.entries(DENSITIES)) {
    const dir = path.join(res, 'mipmap-' + d);
    const legacy = Math.round(48 * k);
    // legacy icons (Android < 8): the mark fills most of the square / circle
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), await onBackground(legacy, Math.round(legacy * 0.86)));
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await onBackground(legacy, Math.round(legacy * 0.74), { round: true }));
    // adaptive foreground: 108dp canvas, the mark inside the 72dp safe zone
    const fg = Math.round(108 * k);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await onBackground(fg, Math.round(fg * 0.64)));
  }
  fs.writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

  // splash screens: same sizes as Capacitor's defaults, mark centered
  for (const dir of fs.readdirSync(res).filter((n) => n === 'drawable' || n.startsWith('drawable-land') || n.startsWith('drawable-port'))) {
    const file = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const m = await sharp(mark).resize(Math.round(Math.min(width, height) * 0.38)).png().toBuffer();
    const out = await sharp({ create: { width, height, channels: 4, background: BG } }).composite([{ input: m, gravity: 'center' }]).png().toBuffer();
    fs.writeFileSync(file, out);
  }

  // web app icons (favicon + home-screen icon)
  const assets = path.join(root, 'app', 'assets');
  fs.writeFileSync(path.join(assets, 'icon.png'), await onBackground(128, 112));
  fs.writeFileSync(path.join(assets, 'app-icon.png'), await onBackground(512, 430));
  console.log('icons written');
})();
