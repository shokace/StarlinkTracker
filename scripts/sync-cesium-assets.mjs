import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "node_modules", "cesium", "Build", "Cesium");
const targetRoot = path.join(projectRoot, "public", "cesium");

if (!existsSync(sourceRoot)) {
  console.warn("[cesium] Build assets not found, skipping copy.");
  process.exit(0);
}

mkdirSync(targetRoot, { recursive: true });

for (const folderName of ["Assets", "ThirdParty", "Widgets", "Workers"]) {
  cpSync(path.join(sourceRoot, folderName), path.join(targetRoot, folderName), {
    force: true,
    recursive: true,
  });
}

console.log("[cesium] Static assets copied to public/cesium");
