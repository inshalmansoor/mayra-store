"""
Vercel Python entrypoint. Lives under frontend/ (the Vercel project's Root
Directory — see plans/07-deployment-vercel.md §1-2) so that Vercel's
zero-config Next.js detection finds package.json at the project root while
this file's own directory (frontend/api/) still gets picked up as a Python
serverless function.

backend/ is a SIBLING of frontend/ at the true repository root, two levels
up from this file. Reaching it requires:
  1. Vercel Project Settings -> General -> "Include source files outside of
     the Root Directory in the Build Step" switched ON, so backend/ is part
     of the deployment bundle at all.
  2. The sys.path insert below, so Python can import it as a package.
"""
import sys
from pathlib import Path

_repo_root = Path(__file__).resolve().parents[2]  # frontend/api/ -> frontend/ -> repo root
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

from backend.app.main import app  # noqa: E402, F401
