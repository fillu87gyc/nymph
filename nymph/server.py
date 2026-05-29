import glob as _glob
import json
import os
import socket
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

_DIR = os.path.dirname(os.path.abspath(__file__))


def _read(name: str) -> bytes:
    with open(os.path.join(_DIR, name), "rb") as f:
        return f.read()


class Handler(BaseHTTPRequestHandler):
    file_path = None
    comments_path = None
    file_paths: list = []
    active_file: str = None
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
        elif path == "/files":
            self._serve_files()
        else:
            self._send(404, "text/plain", b"Not found")

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/comments":
            self._save_comments()
        elif path == "/edit-op":
            self._handle_edit_op()
        elif path == "/active-file":
            self._set_active_file()
        else:
            self._send(404, "text/plain", b"Not found")

    def _send(self, status, ctype, body):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _serve_content(self):
        qs = parse_qs(urlparse(self.path).query)
        file_param = qs.get("file", [None])[0]
        allowed = set(Handler.file_paths or ([Handler.file_path] if Handler.file_path else []))
        if file_param and file_param not in allowed:
            self._send(403, "text/plain", b"Forbidden")
            return
        target = file_param if file_param else (Handler.active_file or Handler.file_path)
        try:
            with open(target, "r", encoding="utf-8") as f:
                text = f.read()
            with Handler._content_lock:
                Handler._cached_content = text
            data = json.dumps(
                {
                    "content": text,
                    "filename": os.path.basename(target),
                    "mtime": os.path.getmtime(target),
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
        paths = Handler.file_paths if Handler.file_paths else [Handler.file_path]
        mtimes = {p: None for p in paths}
        try:
            while True:
                for p in list(mtimes.keys()):
                    try:
                        mtime = os.path.getmtime(p)
                        if mtimes[p] is not None and mtime != mtimes[p]:
                            msg = json.dumps({"file": p})
                            self.wfile.write(f"data: {msg}\n\n".encode())
                            self.wfile.flush()
                        mtimes[p] = mtime
                    except FileNotFoundError:
                        pass
                time.sleep(0.5)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _serve_comments(self):
        qs = parse_qs(urlparse(self.path).query)
        file_param = qs.get("file", [None])[0]
        allowed = set(Handler.file_paths or ([Handler.file_path] if Handler.file_path else []))
        if file_param and file_param not in allowed:
            self._send(403, "text/plain", b"Forbidden")
            return
        if file_param:
            cp = file_param + ".comments.json"
        else:
            cp = Handler.comments_path
        try:
            if os.path.exists(cp):
                with open(cp, "r", encoding="utf-8") as f:
                    data = f.read().encode()
            else:
                data = b"[]"
            self._send(200, "application/json", data)
        except Exception as e:
            self._send(500, "text/plain", str(e).encode())

    def _serve_files(self):
        paths = Handler.file_paths if Handler.file_paths else [Handler.file_path]
        data = json.dumps([{"path": p, "name": os.path.basename(p)} for p in paths]).encode()
        self._send(200, "application/json", data)

    def _set_active_file(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            payload = json.loads(body)
            new_path = payload.get("path")
            allowed = set(Handler.file_paths or ([Handler.file_path] if Handler.file_path else []))
            if not new_path or new_path not in allowed:
                self._send(400, "application/json", b'{"error":"invalid path"}')
                return
            Handler.active_file = new_path
            Handler.file_path = new_path
            Handler.comments_path = new_path + ".comments.json"
            self._send(200, "application/json", b"{}")
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


def main():
    args = sys.argv[1:]
    if not args:
        print("使い方: nymph <file.md> [file2.md ...]")
        sys.exit(1)

    paths = []
    for a in args:
        if os.path.isdir(a):
            paths.extend(sorted(_glob.glob(os.path.join(os.path.abspath(a), "*.md"))))
        else:
            expanded = sorted(_glob.glob(a))
            paths.extend(
                [os.path.abspath(p) for p in expanded] if expanded else [os.path.abspath(a)]
            )
    paths = [p for p in paths if os.path.exists(p)]
    if not paths:
        print("エラー: Markdownファイルが見つかりません")
        sys.exit(1)

    Handler.file_paths = paths
    Handler.active_file = paths[0]
    Handler.file_path = paths[0]
    Handler.comments_path = paths[0] + ".comments.json"

    port = find_port()
    server = ThreadingHTTPServer(("localhost", port), Handler)

    lock_path = paths[0] + ".nymph-lock"
    with open(lock_path, "w") as f:
        f.write(str(port))

    url = f"http://localhost:{port}"
    print(f"nymph   {url}")
    print(f"監視中  {', '.join(paths)}")
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
