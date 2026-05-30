import json
import os
import socket
import urllib.error
import urllib.request

import pytest

from nymph.server import Handler, find_port


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


def _post_empty(url):
    req = urllib.request.Request(
        url,
        data=b"",
        headers={"Content-Length": "0"},
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


class TestCheckpoint:
    def test_checkpoint_set(self, server):
        base, md_path, _ = server
        Handler.checkpoint_content = None
        status, body = _post_empty(base + "/checkpoint")
        assert status == 200
        data = json.loads(body)
        assert data["ok"] is True
        assert data["lines"] > 0
        assert Handler.checkpoint_content is not None

    def test_diff_no_checkpoint(self, server):
        base, *_ = server
        Handler.checkpoint_content = None
        status, ct, body = _get(base + "/diff")
        assert status == 200
        assert "application/json" in ct
        data = json.loads(body)
        assert data == {"lines": []}

    def test_diff_with_change(self, server):
        base, md_path, _ = server
        # Set checkpoint with original content
        Handler.checkpoint_content = None
        _post_empty(base + "/checkpoint")
        original_checkpoint = Handler.checkpoint_content

        # Modify the file
        new_content = original_checkpoint + "\nNew line added.\n"
        md_path.write_text(new_content, encoding="utf-8")

        status, ct, body = _get(base + "/diff")
        assert status == 200
        data = json.loads(body)
        assert len(data["lines"]) > 0
        types = {item["type"] for item in data["lines"]}
        assert "insert" in types

        # Restore original
        md_path.write_text(original_checkpoint, encoding="utf-8")
        Handler.checkpoint_content = None


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


class TestDragDrop:
    def test_switch_file_updates_content(self, server_no_file):
        # POST /switch-file でコンテンツが切り替わること
        base = server_no_file
        _post_json(base + "/switch-file", {"content": "# Hello Drop", "filename": "drop.md"})
        _, _, body = _get(base + "/content")
        data = json.loads(body)
        assert data["filename"] == "drop.md"
        assert "Hello Drop" in data["content"]

    def test_content_no_file(self, server_no_file):
        # ファイルなし起動時に filename が null を返すこと
        base = server_no_file
        _, _, body = _get(base + "/content")
        data = json.loads(body)
        assert data["filename"] is None
