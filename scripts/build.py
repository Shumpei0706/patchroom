"""Build the standalone offline page using the pinned Relate npm package."""
import base64
import gzip
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
ASSETS = ROOT / "assets"
PKG = ROOT / "node_modules/@relate/relate-wasm"

def encoded(path):
    return base64.b64encode(path.read_bytes()).decode("ascii")

def asset(match):
    path = ASSETS / match[1]
    return f"data:image/{path.suffix[1:]};base64,{encoded(path)}"

def main():
    glue = (PKG / "relate.js").read_text()
    opfs = next(PKG.glob("snippets/*/js/opfs.js"))
    glue, count = re.subn(r"from './snippets/[^']+'", "from 'data:text/javascript;base64," + encoded(opfs) + "'", glue)
    if not count or "export { initSync, __wbg_init as default };" not in glue:
        raise ValueError("Unexpected Relate JS wrapper. Check the pinned package version.")
    glue = glue.replace("export { initSync, __wbg_init as default };", "const init = __wbg_init;")
    wasm = gzip.compress((PKG / "relate_bg.wasm").read_bytes(), mtime=0)
    clips = {key:encoded(ASSETS / f"{key}.pcm") for key in ["guest", "onsite"]}
    app = (SRC / "app.js").read_text().replace("WASM_BYTES", base64.b64encode(wasm).decode()).replace("VOICE_CLIPS", json.dumps(clips))
    page = (SRC / "page.html").read_text().replace("LICENSE_TEXT", html.escape((ROOT / "NOTICE.md").read_text() + "\n" + (ROOT / "licenses/Relate-Apache-2.0.txt").read_text()))
    script = (SRC / "language.js").read_text() + "\n" + app
    page = page.replace("RUNTIME\nDEMO_SCRIPT", glue + "\n" + script)
    (ROOT / "index.html").write_text(re.sub(r"ASSET_URI\(([\w.-]+)\)", asset, page))

if __name__ == "__main__":
    main()
