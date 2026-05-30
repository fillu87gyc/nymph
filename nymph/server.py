import difflib
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
    checkpoint_content: str | None = None
    _dropped_content: str | None = None
    _dropped_name: str | None = None

    def log_message(self, *_):
        pass

    def handle_error(self, request, client_address):
        if not issubclass(sys.exc_info()[0], ConnectionResetError):
            super().handle_error(request, client_address)

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
        elif path == "/diff":
            self._serve_diff()
        else:
            self._send(404, "text/plain", b"Not found")

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/comments":
            self._save_comments()
        elif path == "/edit-op":
            self._handle_edit_op()
        elif path == "/checkpoint":
            self._set_checkpoint()
        elif path == "/switch-file":
            self._switch_file()
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
            if Handler.file_path is not None:
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
            elif Handler._dropped_content is not None:
                data = json.dumps(
                    {
                        "content": Handler._dropped_content,
                        "filename": Handler._dropped_name,
                        "mtime": 0,
                    }
                ).encode()
            else:
                data = json.dumps({"content": "", "filename": None, "mtime": 0}).encode()
            self._send(200, "application/json", data)
        except Exception as e:
            self._send(500, "text/plain", str(e).encode())

    def _serve_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        if Handler.file_path is None:
            return
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
            if Handler.comments_path is None:
                self._send(200, "application/json", b"[]")
                return
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
            if Handler.comments_path is None:
                self._send(200, "application/json", b"{}")
                return
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            parsed = json.loads(body)
            with open(Handler.comments_path, "w", encoding="utf-8") as f:
                json.dump(parsed, f, ensure_ascii=False, indent=2)
            self._send(200, "application/json", b"{}")
        except Exception as e:
            self._send(500, "text/plain", str(e).encode())

    def _switch_file(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            payload = json.loads(body)
            Handler._dropped_content = payload.get("content", "")
            Handler._dropped_name = payload.get("filename")
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

            if not old_string or Handler.file_path is None:
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
        if Handler.comments_path is None or not os.path.exists(Handler.comments_path):
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

    def _set_checkpoint(self):
        try:
            if Handler.file_path is None:
                data = json.dumps({"ok": True, "lines": 0}).encode()
                self._send(200, "application/json", data)
                return
            with open(Handler.file_path, "r", encoding="utf-8") as f:
                Handler.checkpoint_content = f.read()
            line_count = Handler.checkpoint_content.count("\n") + 1
            data = json.dumps({"ok": True, "lines": line_count}).encode()
            self._send(200, "application/json", data)
        except Exception as e:
            self._send(500, "text/plain", str(e).encode())

    def _serve_diff(self):
        try:
            if Handler.checkpoint_content is None or Handler.file_path is None:
                self._send(200, "application/json", json.dumps({"lines": []}).encode())
                return
            with open(Handler.file_path, "r", encoding="utf-8") as f:
                current = f.read()
            checkpoint_lines = Handler.checkpoint_content.splitlines(keepends=True)
            current_lines = current.splitlines(keepends=True)
            matcher = difflib.SequenceMatcher(None, checkpoint_lines, current_lines)
            result = []
            current_n = 0
            group_id = 0
            for tag, i1, i2, j1, j2 in matcher.get_opcodes():
                if tag == "equal":
                    for line in current_lines[j1:j2]:
                        current_n += 1
                        c = line.rstrip("\n")
                        result.append({"n": current_n, "type": "equal", "content": c, "g": None})
                elif tag == "replace":
                    for line in checkpoint_lines[i1:i2]:
                        c = line.rstrip("\n")
                        result.append({"n": None, "type": "delete", "content": c, "g": group_id})
                    for line in current_lines[j1:j2]:
                        current_n += 1
                        c = line.rstrip("\n")
                        result.append({"n": current_n, "type": "insert", "content": c, "g": group_id})
                    group_id += 1
                elif tag == "insert":
                    for line in current_lines[j1:j2]:
                        current_n += 1
                        c = line.rstrip("\n")
                        result.append({"n": current_n, "type": "insert", "content": c, "g": group_id})
                    group_id += 1
                elif tag == "delete":
                    for line in checkpoint_lines[i1:i2]:
                        c = line.rstrip("\n")
                        result.append({"n": None, "type": "delete", "content": c, "g": group_id})
                    group_id += 1
            data = json.dumps({"lines": result}).encode()
            self._send(200, "application/json", data)
        except Exception as e:
            self._send(500, "text/plain", str(e).encode())


def find_port(start=6276):
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("localhost", port)) != 0:
                return port
    return start


def main():
    if len(sys.argv) >= 2:
        fpath = os.path.abspath(sys.argv[1])
        if not os.path.exists(fpath):
            print(f"エラー: {fpath} が見つかりません")
            sys.exit(1)
        Handler.file_path = fpath
        Handler.comments_path = fpath + ".comments.json"
    else:
        Handler.file_path = None
        Handler.comments_path = None
        fpath = None

    port = find_port()
    server = ThreadingHTTPServer(("localhost", port), Handler)

    lock_path = (fpath + ".nymph-lock") if fpath else None
    if lock_path:
        with open(lock_path, "w") as f:
            f.write(str(port))

    url = f"http://localhost:{port}"
    print(f"nymph   {url}")
    if fpath:
        print(f"監視中  {fpath}")
    else:
        print("ファイルをブラウザにドロップして開始")
    print("Ctrl+C で停止")

    threading.Timer(0.3, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")
    finally:
        if lock_path:
            try:
                os.unlink(lock_path)
            except OSError:
                pass
