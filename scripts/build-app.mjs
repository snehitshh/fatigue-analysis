// Prepare the Capacitor web assets for the APK.
// The APK is the SCROLL study, so we copy the built site and make scroll.html the
// entry (index.html). Run via: npm run build:app
import { cpSync, copyFileSync, rmSync, existsSync } from "node:fs";

const DIST = "dist";
const APP = "dist-app";

if (!existsSync(`${DIST}/scroll.html`)) {
    console.error("dist/scroll.html missing - run `npm run build` first.");
    process.exit(1);
}

rmSync(APP, { recursive: true, force: true });
cpSync(DIST, APP, { recursive: true });
copyFileSync(`${APP}/scroll.html`, `${APP}/index.html`);
console.log(`Prepared ${APP}/ (scroll.html -> index.html). Now run: npx cap sync android`);
