import json
import os
import socket
import urllib.error
import urllib.request

import pytest

from nymph.server import find_port


def _get(url):
    with urllib.request.urlopen(url) as r:
        return r.status, r.headers.get("Content-Type"), r.read()


def _post_json(url, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return r.status, r.read()


class TestEndpoints:
    def test_root_returns_html(self, server):
        base, *_ = server
        status, ct, body = _get(base + "/")
        assert status == 200
        assert "text/html" in ct
        assert b"nymph" in body

    def test_index_html_alias(self, server):
        base, *_ = server
        status, ct, _ = _get(base + "/index.html")
        assert status == 200
        assert "text/html" in ct

    def test_style_css(self, server):
        base, *_ = server
        status, ct, body = _get(base + "/style.css")
        assert status == 200
        assert "text/css" in ct
        assert len(body) > 0

    def test_content_json_shape(self, server):
        base, md_path, _ = server
        status, ct, body = _get(base + "/content")
        assert status == 200
        assert "application/json" in ct
        data = json.loads(body)
        assert data["filename"] == "sample.md"
        assert "# Hello" in data["content"]
        assert isinstance(data["mtime"], float)

    def test_comments_empty_when_no_file(self, server):
        base, _, cp = server
        if os.path.exists(cp):
            os.remove(cp)
        _, _, body = _get(base + "/comments")
        assert json.loads(body) == []

    def test_comments_save_and_load(self, server):
        base, _, cp = server
        if os.path.exists(cp):
            os.remove(cp)
        payload = [{"id": 1, "ls": 1, "le": 1, "ctx": "# Hello", "text": "hi"}]
        status, _ = _post_json(base + "/comments", payload)
        assert status == 200
        _, _, body = _get(base + "/comments")
        assert json.loads(body) == payload

    def test_unknown_path_404(self, server):
        base, *_ = server
        with pytest.raises(urllib.error.HTTPError) as exc:
            _get(base + "/nonexistent")
        assert exc.value.code == 404

    def test_post_unknown_path_404(self, server):
        base, *_ = server
        with pytest.raises(urllib.error.HTTPError) as exc:
            _post_json(base + "/nonexistent", {})
        assert exc.value.code == 404


class TestDragDrop:
    def test_switch_file_updates_content(self, drop_server):
        base = drop_server
        import json as _json

        body = _json.dumps({"content": "# Drop", "filename": "drop.md"}).encode()
        req = urllib.request.Request(
            base + "/switch-file",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req)
        status, _, rbody = _get(base + "/content")
        data = _json.loads(rbody)
        assert data["filename"] == "drop.md"
        assert "Drop" in data["content"]


class TestFindPort:
    def test_returns_open_port(self):
        port = find_port()
        with socket.socket() as s:
            assert s.connect_ex(("localhost", port)) != 0

    def test_skips_occupied_port(self):
        with socket.socket() as s:
            s.bind(("localhost", 0))
            occupied = s.getsockname()[1]
            s.listen(1)
            port = find_port(occupied)
            assert port != occupied
