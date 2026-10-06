#!/usr/bin/env python3
"""ApuraBrasil — servidor do portal (stdlib apenas).

Uso:
    python3 server.py [porta]     # padrao: 8000

Depois abra no navegador: http://127.0.0.1:8000/
"""
import functools
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
HOST = "127.0.0.1"


class Handler(http.server.SimpleHTTPRequestHandler):
    server_version = "ApuraBrasil/1.0"

    # MIME explícito: módulos ES exigem text/javascript; registro do SO pode divergir.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
    }

    def end_headers(self):
        # HTML/JS sempre frescos; o app busca dados ao vivo no TSE com no-store.
        if self.path.split("?")[0].endswith((".html", ".js", ".css")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # log enxuto
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer((HOST, PORT), Handler) as httpd:
        print(f"ApuraBrasil no ar: http://{HOST}:{PORT}/  (Ctrl+C para parar)")
        httpd.serve_forever()
