import os
import threading
import time
from http.server import ThreadingHTTPServer

import pytest

from nymph.server import Handler, find_port

SAMPLE_MD = """\
# Test Document

This is a **bold** paragraph with *italic* text.

## Section 2

Another paragraph here.

```python
def hello():
    return "world"
```

## List

- item one
- item two
- item three

> A blockquote.
"""


@pytest.fixture(scope="session")
def live_server(tmp_path_factory):
    md_path = tmp_path_factory.mktemp("e2e") / "test.md"
    md_path.write_text(SAMPLE_MD, encoding="utf-8")

    Handler.file_path = str(md_path)
    Handler.comments_path = str(md_path) + ".comments.json"

    port = find_port()
    httpd = ThreadingHTTPServer(("localhost", port), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.3)

    yield f"http://localhost:{port}"

    httpd.shutdown()


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "viewport": {"width": 1280, "height": 800}}


@pytest.fixture(autouse=True)
def clean_comments():
    """Remove comments file before each test for a clean state."""
    cp = Handler.comments_path
    if cp and os.path.exists(cp):
        os.remove(cp)
    yield
