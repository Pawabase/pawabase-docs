#!/usr/bin/env python3
"""Flag method names used in the docs' TypeScript and Python examples that the SDKs don't define.

Usage:  python3 scripts/check-sdk-names.py [path ...]      (default: every .mdx page)
Env:    PAWABASE_JS_SRC (default ~/sillo.build/_split/js/src)
        PAWABASE_PY_SRC (default ~/sillo.build/_split/python/client/pawabase)

It collects every `.name(` call inside ```typescript/```ts/```tsx and ```python fences and reports names that appear nowhere in the SDK
sources (as a method, function, property or key). It cannot prove a call is right (wrong arguments pass), but it catches invented methods.
Names that belong to the platform or the language (fetch, map, json…) are ignored through ALLOW below.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = Path(os.environ.get("PAWABASE_JS_SRC", "~/sillo.build/_split/js/src")).expanduser()
PY = Path(os.environ.get("PAWABASE_PY_SRC", "~/sillo.build/_split/python/client/pawabase")).expanduser()
IAC = Path(os.environ.get("PAWABASE_IAC_SRC", "~/sillo.build/_split/python-iac")).expanduser()

FENCE = re.compile(r"```(typescript|ts|tsx|javascript|js|python|py)[^\n]*\n(.*?)```", re.S)
CALL = re.compile(r"\.([A-Za-z_][A-Za-z0-9_]*)\s*[(<]")

# Standard library, DOM, framework and test-runner names that are not the SDK's business.
ALLOW = set("""
then catch finally map filter reduce forEach find some every includes push pop slice splice join split trim toString toFixed
keys values entries assign from parse stringify json text arrayBuffer blob get set has delete add clear startsWith endsWith replace
replaceAll match test exec toLowerCase toUpperCase padStart log error warn info debug table now toISOString getTime setTimeout
addEventListener removeEventListener getElementById querySelector append replaceChildren createElement preventDefault reset focus
reload assign open close send write end listen use status redirect header headers query params cookie render json sendStatus
useState useEffect useMemo useCallback useRef useContext createContext all allSettled race resolve reject Promise
format strftime isoformat items lower upper strip lstrip rstrip encode decode read readlines append extend update pop copy
get_json run gather sleep create_task wait_for decode b64encode b64decode urlsafe_b64encode hexdigest digest new randomBytes
createHash toBuffer slice2 env exit stdout stderr argv join dumps loads load dump readFileSync writeFileSync existsSync mkdirSync
setHeader getHeader on once emit pipe flat flatMap sort reverse concat indexOf lastIndexOf fill at charAt charCodeAt
fetch Response Request URL URLSearchParams FormData Blob File Headers AbortController TextEncoder TextDecoder setInterval clearInterval
clearTimeout raise_for_status model_dump model_validate isinstance getattr setattr hasattr print range len enumerate zip sorted
compare_digest abs createHmac timingSafeEqual uuid4 createObjectURL revokeObjectURL token_urlsafe fetchone transaction writeHead
toBeInstanceOf toHaveLength toBeUndefined toBe toEqual FormEvent ChangeEvent fromWeb click setRequestHeader toBlob
sqrt home formData getResponse toLocaleString PyJWKClient get_signing_key_from_jwt writeFile readFile
""".split())


def sdk_names() -> set[str]:
    names: set[str] = set()
    for base, pattern in ((JS, "*.ts"), (PY, "*.py"), (IAC, "*.py")):
        for file in base.rglob(pattern):
            text = file.read_text(errors="ignore")
            names.update(re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*)\b", text))
    return names


def main(paths: list[str]) -> int:
    known = sdk_names() | ALLOW
    files = [Path(p).resolve() for p in paths] if paths else sorted(p for p in ROOT.rglob("*.mdx") if "node_modules" not in p.parts and "dist" not in p.parts)
    problems = 0
    for file in files:
        text = file.read_text()
        for lang, code in FENCE.findall(text):
            # names defined in the snippet itself (functions, methods, classes) are the snippet's own
            local = set(re.findall(r"(?:function|def|class|const|let|var|async def)\s+([A-Za-z_][A-Za-z0-9_]*)", code))
            local |= set(re.findall(r"^\s*(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*[:{]", code, re.M))
            for name in sorted(set(CALL.findall(code))):
                if name not in known and name not in local:
                    print(f"{file.relative_to(ROOT)}: .{name}( [{lang}]")
                    problems += 1
    print(f"{problems} unknown name(s)" if problems else "every called name exists in the SDKs")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
