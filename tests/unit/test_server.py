import json
import os
import socket
import urllib.error
import urllib.parse
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


class TestMultiFileWatch:
    def test_files_endpoint(self, server):
        base, *_ = server
        status, ct, body = _get(base + "/files")
        assert status == 200
        assert "application/json" in ct
        data = json.loads(body)
        assert isinstance(data, list)
        assert all("path" in f and "name" in f for f in data)

    def test_active_file_switch(self, server, tmp_path):
        from nymph.server import Handler

        base, md_path, _ = server
        f2 = tmp_path / "other.md"
        f2.write_text("# Other\n")
        original_paths = Handler.file_paths[:]
        Handler.file_paths = [str(md_path), str(f2)]
        status, _ = _post_json(base + "/active-file", {"path": str(f2)})
        assert status == 200
        assert Handler.active_file == str(f2)
        # restore
        Handler.file_paths = original_paths
        Handler.active_file = str(md_path)
        Handler.file_path = str(md_path)
        Handler.comments_path = str(md_path) + ".comments.json"

    def test_content_query_param(self, server, tmp_path):
        base, *_ = server
        f2 = tmp_path / "query_test.md"
        f2.write_text("# Query\n\nHello query.\n")
        Handler.file_paths = [Handler.file_path, str(f2)]
        status, ct, body = _get(base + f"/content?file={urllib.parse.quote(str(f2))}")
        assert status == 200
        data = json.loads(body)
        assert data["filename"] == "query_test.md"
        assert "# Query" in data["content"]


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
