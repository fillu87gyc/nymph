import argparse
import json
import os
import socket
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

_DIR = os.path.dirname(os.path.abspath(__file__))


def _read(name: str) -> bytes:
    with open(os.path.join(_DIR, name), "rb") as f:
        return f.read()


class Handler(BaseHTTPRequestHandler):
    file_path = None
    comments_path = None
    _cached_content = None
    _content_lock = threading.Lock()

    def log_message(self, *_):
        pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            self._send(200, "text/html; charset=utf-8", _read("index.html"))
        elif path == "/style.css":
            self._send(200, "text/css; charset=utf-8", _read("style.css"))
        elif path == "/content":
            self._serve_content()
        elif path == "/watch":
            self._serve_sse()
        elif path == "/comments":
            self._serve_comments()
        else:
            self._send(404, "text/plain", b"Not found")

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/comments":
            self._save_comments()
        elif path == "/edit-op":
            self._handle_edit_op()
        else:
            self._send(404, "text/plain", b"Not found")

    def _send(self, status, ctype, body):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _serve_content(self):
        try:
            with open(Handler.file_path, "r", encoding="utf-8") as f:
                text = f.read()
            with Handler._content_lock:
                Handler._cached_content = text
            data = json.dumps(
                {
                    "content": text,
                    "filename": os.path.basename(Handler.file_path),
                    "mtime": os.path.getmtime(Handler.file_path),
                }
            ).encode()
            self._send(200, "application/json", data)
        except Exception as e:
            self._send(500, "text/plain", str(e).encode())

    def _serve_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        last = None
        try:
            while True:
                try:
                    mtime = os.path.getmtime(Handler.file_path)
                    if last is not None and mtime != last:
                        self.wfile.write(b"data: reload\n\n")
                        self.wfile.flush()
                    last = mtime
                except FileNotFoundError:
                    pass
                time.sleep(0.5)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _serve_comments(self):
        try:
            if os.path.exists(Handler.comments_path):
                with open(Handler.comments_path, "r", encoding="utf-8") as f:
                    data = f.read().encode()
            else:
                data = b"[]"
            self._send(200, "application/json", data)
        except Exception as e:
            self._send(500, "text/plain", str(e).encode())

    def _save_comments(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            parsed = json.loads(body)
            with open(Handler.comments_path, "w", encoding="utf-8") as f:
                json.dump(parsed, f, ensure_ascii=False, indent=2)
            self._send(200, "application/json", b"{}")
        except Exception as e:
            self._send(500, "text/plain", str(e).encode())

    def _handle_edit_op(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            op = json.loads(body)
            ti = op.get("tool_input", op)
            old_string = ti.get("old_string", "")
            new_string = ti.get("new_string", "")

            if not old_string:
                self._send(200, "application/json", b"{}")
                return

            with Handler._content_lock:
                if Handler._cached_content is None:
                    with open(Handler.file_path, "r", encoding="utf-8") as f:
                        Handler._cached_content = f.read()
                cached = Handler._cached_content
                idx = cached.find(old_string)
                if idx != -1:
                    start_line = cached[:idx].count("\n") + 1
                    old_line_count = old_string.count("\n") + 1
                    new_line_count = new_string.count("\n") + 1
                    delta = new_line_count - old_line_count
                    Handler._cached_content = cached.replace(old_string, new_string, 1)
                    if delta != 0:
                        self._remap_comments(start_line, old_line_count, delta)

            self._send(200, "application/json", b"{}")
        except Exception as e:
            self._send(500, "text/plain", str(e).encode())

    def _remap_comments(self, edit_line, old_line_count, delta):
        if not os.path.exists(Handler.comments_path):
            return
        try:
            with open(Handler.comments_path, "r", encoding="utf-8") as f:
                comments = json.load(f)
            edit_end = edit_line + old_line_count - 1
            for c in comments:
                ls, le = c.get("ls", 0), c.get("le", 0)
                if ls > edit_end:
                    c["ls"] = ls + delta
                    c["le"] = le + delta
                elif le > edit_end:
                    c["le"] = le + delta
            with open(Handler.comments_path, "w", encoding="utf-8") as f:
                json.dump(comments, f, ensure_ascii=False, indent=2)
        except Exception:
            pass


def find_port(start=6276):
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("localhost", port)) != 0:
                return port
    return start


def export_html(md_path: str, out_path: str) -> None:
    with open(md_path, "r", encoding="utf-8") as f:
        md_content = f.read()
    comments_path = md_path + ".comments.json"
    comments = []
    if os.path.exists(comments_path):
        with open(comments_path, "r", encoding="utf-8") as f:
            comments = json.load(f)
    template = _read("index.html").decode("utf-8")
    css_content = _read("style.css").decode("utf-8")

    def _safe_json(obj):
        return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")

    init_script = (
        "<script>\n"
        "  window.__EXPORT_MODE__ = true;\n"
        f"  window.__INITIAL_SOURCE__ = {_safe_json(md_content)};\n"
        f"  window.__INITIAL_COMMENTS__ = {_safe_json(comments)};\n"
        f"  window.__INITIAL_FILENAME__ = {_safe_json(os.path.basename(md_path))};\n"
        "</script>"
    )
    html = template.replace(
        '<link rel="stylesheet" href="/style.css">',
        f"<style>\n{css_content}\n</style>",
        1,
    )
    html = html.replace("</head>", init_script + "\n</head>", 1)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"エクスポート完了: {out_path} ({len(comments)}件のコメント)")


def main():
    parser = argparse.ArgumentParser(prog="nymph", description="Markdownレビューツール")
    parser.add_argument("file", help="Markdownファイル")
    parser.add_argument(
        "--export", "-e", metavar="OUT", help="HTMLエクスポートしてサーバーを起動せずに終了"
    )
    args = parser.parse_args()
    fpath = os.path.abspath(args.file)
    if not os.path.exists(fpath):
        print(f"エラー: {fpath} が見つかりません")
        sys.exit(1)
    if args.export:
        export_html(fpath, args.export)
        sys.exit(0)

    Handler.file_path = fpath
    Handler.comments_path = fpath + ".comments.json"

    port = find_port()
    server = ThreadingHTTPServer(("localhost", port), Handler)

    lock_path = fpath + ".nymph-lock"
    with open(lock_path, "w") as f:
        f.write(str(port))

    url = f"http://localhost:{port}"
    print(f"nymph   {url}")
    print(f"監視中  {fpath}")
    print("Ctrl+C で停止")

    threading.Timer(0.3, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")
    finally:
        try:
            os.unlink(lock_path)
        except OSError:
            pass
