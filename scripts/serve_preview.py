#!/usr/bin/env python3
"""Serve the repo statically, with the lead sheet as the preview landing page.

Serves /home/user/LeadsCRM on 0.0.0.0:3000. The app's own index.html is left
untouched; only this preview server maps "/" to exports/leads-sheet.html so the
live preview opens on the Excel-style lead grid.
"""

import functools
import http.server
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "exports"
PORT = 3000
DOWNLOAD_EXTENSIONS = (".xlsx", ".pdf", ".csv")


class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            self.path = "/exports/leads-sheet.html"
        elif parsed.path.startswith("/download/"):
            # /download/<filename> -> forced attachment from the exports folder
            name = Path(parsed.path[len("/download/"):]).name
            target = EXPORTS / name
            if not target.is_file() or target.suffix.lower() not in DOWNLOAD_EXTENSIONS:
                self.send_error(404, "File not found")
                return
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(str(target)))
            self.send_header("Content-Disposition", f'attachment; filename="{name}"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def end_headers(self):
        """Make every export file a real browser download (unless ?inline=1)."""
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if (
            parsed.path.lower().endswith(DOWNLOAD_EXTENSIONS)
            and not parsed.path.startswith("/download/")
            and query.get("inline") != ["1"]
        ):
            name = Path(parsed.path).name
            self.send_header("Content-Disposition", f'attachment; filename="{name}"')
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(PreviewHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler) as httpd:
        print(f"Lead sheet preview on http://0.0.0.0:{PORT}/", flush=True)
        httpd.serve_forever()
