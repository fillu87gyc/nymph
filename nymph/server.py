import sys, os, json, time, webbrowser, threading, socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

_DIR = os.path.dirname(os.path.abspath(__file__))


def _read(name: str) -> bytes:
    with open(os.path.join(_DIR, name), 'rb') as f:
        return f.read()


class Handler(BaseHTTPRequestHandler):
    file_path     = None
    comments_path = None

    def log_message(self, *_): pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ('/', '/index.html'):
            self._send(200, 'text/html; charset=utf-8', _read('index.html'))
        elif path == '/style.css':
            self._send(200, 'text/css; charset=utf-8', _read('style.css'))
        elif path == '/content':
            self._serve_content()
        elif path == '/watch':
            self._serve_sse()
        elif path == '/comments':
            self._serve_comments()
        else:
            self._send(404, 'text/plain', b'Not found')

    def do_POST(self):
        if urlparse(self.path).path == '/comments':
            self._save_comments()
        else:
            self._send(404, 'text/plain', b'Not found')

    def _send(self, status, ctype, body):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def _serve_content(self):
        try:
            with open(Handler.file_path, 'r', encoding='utf-8') as f:
                text = f.read()
            data = json.dumps({
                'content':  text,
                'filename': os.path.basename(Handler.file_path),
                'mtime':    os.path.getmtime(Handler.file_path),
            }).encode()
            self._send(200, 'application/json', data)
        except Exception as e:
            self._send(500, 'text/plain', str(e).encode())

    def _serve_sse(self):
        self.send_response(200)
        self.send_header('Content-Type',  'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection',    'keep-alive')
        self.end_headers()
        last = None
        try:
            while True:
                try:
                    mtime = os.path.getmtime(Handler.file_path)
                    if last is not None and mtime != last:
                        self.wfile.write(b'data: reload\n\n')
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
                with open(Handler.comments_path, 'r', encoding='utf-8') as f:
                    data = f.read().encode()
            else:
                data = b'[]'
            self._send(200, 'application/json', data)
        except Exception as e:
            self._send(500, 'text/plain', str(e).encode())

    def _save_comments(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            parsed = json.loads(body)
            with open(Handler.comments_path, 'w', encoding='utf-8') as f:
                json.dump(parsed, f, ensure_ascii=False, indent=2)
            self._send(200, 'application/json', b'{}')
        except Exception as e:
            self._send(500, 'text/plain', str(e).encode())


def find_port(start=6276):
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
    return start


def main():
    if len(sys.argv) < 2:
        print("使い方: nymph <file.md>")
        sys.exit(1)

    fpath = os.path.abspath(sys.argv[1])
    if not os.path.exists(fpath):
        print(f"エラー: {fpath} が見つかりません")
        sys.exit(1)

    Handler.file_path     = fpath
    Handler.comments_path = fpath + '.comments.json'

    port = find_port()
    server = HTTPServer(('localhost', port), Handler)

    url = f'http://localhost:{port}'
    print(f"nymph   {url}")
    print(f"監視中  {fpath}")
    print("Ctrl+C で停止")

    threading.Timer(0.3, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")
