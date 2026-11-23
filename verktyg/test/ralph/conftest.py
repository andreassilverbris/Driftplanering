"""Det Ralph-loopens tester behöver utöver sömmen i `ralph_harness.py`.

Portat ur photo_manager:s `tests/conftest.py`, och bara det loopens tester
använder: repots rot, väntan med tak och en ntfy i en tråd.
"""

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

#: Repots rot: tre nivåer upp från `verktyg/test/ralph/`.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

#: Så länge en väntan får hålla på innan den fäller testet i stället för att hänga sviten.
RUN_CEILING = 120


def waiting(ceiling=RUN_CEILING):
    """Läsningarna en väntan hinner med innan taket nås.

    Fråga om och om igen, och svara när svaret är det väntade. Formen ligger på
    ett ställe, så att taket och takten inte kan glida isär mellan väntningarna.

    Args:
        ceiling: Taket i sekunder.
    """
    deadline = time.time() + ceiling
    while time.time() < deadline:
        yield
        time.sleep(0.05)


class Ntfy:
    """ntfy i en tråd: tar emot det notisskriptet POST:ar, och säger vad det var.

    Skriptet pekas hit genom miljön. Det som läses är notisen som ntfy tar emot
    den, publicerad som JSON, och inte hur skriptet byggde den. Sviten skickar
    aldrig en notis till en telefon.
    """

    def __init__(self):
        self.received = []
        #: Svaret ntfy ger. Ett fel är en notis som inte gick fram.
        self.answer = 200
        ntfy = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
                try:
                    notification = json.loads(body)
                except ValueError:
                    notification = {'path': self.path, 'body': body}
                ntfy.received.append(notification)
                self.send_response(ntfy.answer)
                self.end_headers()

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.url = f'http://127.0.0.1:{self.server.server_address[1]}'
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.closed = False

    def notifications(self):
        """Notiserna som kommit fram, i den ordning de kom."""
        return list(self.received)

    def close(self):
        """Stäng ntfy, så att en notis inte kommer fram alls."""
        if not self.closed:
            self.server.shutdown()
            self.server.server_close()
            self.closed = True
