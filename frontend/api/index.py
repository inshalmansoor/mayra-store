"""
Vercel Python entrypoint.

backend/ is copied to frontend/backend/ by scripts/copy-backend.mjs (an npm
"prebuild" hook, so it runs automatically before every `npm run build`,
including Vercel's). That script exists because Vercel's Python function
bundler was observed to silently drop files from outside the Root
Directory at deploy time - even with "Include source files outside of the
Root Directory in the Build Step" on - producing
"ModuleNotFoundError: No module named 'backend'" at runtime. Copying it in
removes the ambiguity: this always imports a local package, one directory
up from this file, both locally and on Vercel.
"""
import sys
from pathlib import Path

_frontend_root = Path(__file__).resolve().parents[1]  # frontend/api/ -> frontend/
if str(_frontend_root) not in sys.path:
    sys.path.insert(0, str(_frontend_root))

from backend.app.main import app  # noqa: E402, F401
