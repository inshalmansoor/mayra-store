// Runs automatically before `npm run build` (npm's built-in "prebuild"
// lifecycle hook). Copies the sibling backend/ folder into frontend/backend/
// so it is physically inside Vercel's Root Directory before the Python
// function bundler runs.
//
// Why this exists: Vercel's Python function bundler was observed NOT to
// include files from outside the Root Directory in the deployed function,
// even with Project Settings -> "Include source files outside of the Root
// Directory in the Build Step" switched on. That setting does make
// ../backend readable during the BUILD (which is what lets this script
// read it), but the separate, later step that packages api/index.py for
// deployment did not carry it through - real deploys failed at runtime
// with "ModuleNotFoundError: No module named 'backend'". Copying it inside
// frontend/ removes the ambiguity entirely: it's just a local package.
//
// frontend/backend/ is git-ignored - it is regenerated on every build, not
// a second source of truth. Edit the real backend/ at the repo root.
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "..", "backend");
const dest = join(__dirname, "..", "backend");

if (!existsSync(src)) {
  console.error(`copy-backend: source not found at ${src} - is backend/ still a sibling of frontend/?`);
  process.exit(1);
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}

cpSync(src, dest, {
  recursive: true,
  filter: (path) => !path.includes("__pycache__") && !path.endsWith(".pyc"),
});

console.log(`copy-backend: copied ${src} -> ${dest}`);
