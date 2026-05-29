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


class TestWritebackComments:
    def test_writeback_inserts_comments(self, tmp_path):
        from nymph.server import writeback_comments

        md = tmp_path / "test.md"
        md.write_text("# Hello\n\nworld\n")
        (tmp_path / "test.md.comments.json").write_text(
            json.dumps(
                [
                    {
                        "id": 1,
                        "ls": 1,
                        "le": 1,
                        "block_type": "heading",
                        "context": "Hello",
                        "text": "見出しコメント",
                    },
                    {
                        "id": 2,
                        "ls": 3,
                        "le": 3,
                        "block_type": "paragraph",
                        "context": "world",
                        "text": "本文コメント",
                    },
                ]
            )
        )
        writeback_comments(str(md))
        content = md.read_text()
        assert "> [nymph] 見出しコメント" in content
        assert "> [nymph] 本文コメント" in content

    def test_writeback_no_comments_file(self, tmp_path, capsys):
        from nymph.server import writeback_comments

        md = tmp_path / "test.md"
        md.write_text("# Hello\n")
        writeback_comments(str(md))
        assert "見つかりません" in capsys.readouterr().out

    def test_writeback_order_preserved(self, tmp_path):
        from nymph.server import writeback_comments

        md = tmp_path / "test.md"
        md.write_text("line1\n\nline3\n\nline5\n")
        (tmp_path / "test.md.comments.json").write_text(
            json.dumps(
                [
                    {"id": 1, "ls": 1, "le": 1, "context": "line1", "text": "first"},
                    {"id": 2, "ls": 3, "le": 3, "context": "line3", "text": "second"},
                ]
            )
        )
        writeback_comments(str(md))
        lines = md.read_text().splitlines()
        assert lines[1] == "> [nymph] first"
        line3_idx = lines.index("line3")
        assert lines[line3_idx + 1] == "> [nymph] second"


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
