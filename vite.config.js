import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const legacyAssets = [
    "engagementMonitor.js",
    "consent.js",
    "demographics.js",
    "typing.js",
    "fitts.js",
    "nasatlx.js",
    "cognitive.js",
    "fatigueScale.js",
    "main.js",
    "corpus.txt"
];

function copyLegacyAssets() {
    return {
        name: "copy-legacy-assets",
        closeBundle() {
            const projectRoot = process.cwd();
            const frontendRoot = resolve(projectRoot, "frontend");
            const outDir = resolve(projectRoot, "dist");

            for (const asset of legacyAssets) {
                const source = resolve(frontendRoot, asset);
                const target = resolve(outDir, asset);

                if (!existsSync(source)) continue;

                mkdirSync(dirname(target), { recursive: true });
                copyFileSync(source, target);
            }
        }
    };
}

export default defineConfig({
    root: "frontend",
    envDir: process.cwd(),
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(process.cwd(), "frontend/index.html"),
                admin: resolve(process.cwd(), "frontend/admin.html"),
                scroll: resolve(process.cwd(), "frontend/scroll.html")
            }
        }
    },
    plugins: [copyLegacyAssets()]
});
