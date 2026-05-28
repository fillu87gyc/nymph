import os
import threading
import time
from http.server import ThreadingHTTPServer

import pytest

from nymph.server import Handler, find_port

SAMPLE_MD = "# Hello\n\nWorld paragraph.\n\n- item 1\n- item 2\n"


@pytest.fixture(scope="module")
def server(tmp_path_factory):
    md_path = tmp_path_factory.mktemp("unit") / "sample.md"
    md_path.write_text(SAMPLE_MD, encoding="utf-8")
    comments_path = str(md_path) + ".comments.json"

    Handler.file_path = str(md_path)
    Handler.comments_path = comments_path

    port = find_port()
    httpd = ThreadingHTTPServer(("localhost", port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.1)

    yield f"http://localhost:{port}", md_path, comments_path

    httpd.shutdown()
    if os.path.exists(comments_path):
        os.remove(comments_path)
