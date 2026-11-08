import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CapacitorConfig } from '@capacitor/cli';

// The app loads the UI the API serves (devui: customer, company admin, technician).
// Default: http://localhost:3000 on the phone, forwarded to this PC with `adb reverse tcp:3000 tcp:3000`.
// For Wi-Fi instead of USB: NAGLA_SERVER_URL=http://<pc-lan-ip>:3000/dev/ npm run sync
const serverUrl = process.env.NAGLA_SERVER_URL ?? 'http://localhost:3000/app/index.html';

// The offline page (served from the app, no extra files) retries the server this build points at.
const offline = join(process.cwd(), 'www', 'offline.html');
writeFileSync(offline, readFileSync(offline, 'utf8')
  .replace(/window\.NAGLA_SERVER = .*?;/, `window.NAGLA_SERVER = ${JSON.stringify(serverUrl)};`));

const config: CapacitorConfig = {
  appId: 'com.nagla.app',
  appName: 'Naqla',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: true, // dev API is plain http
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
