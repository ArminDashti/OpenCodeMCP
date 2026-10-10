#!/usr/bin/env python3
"""HTTP/CONNECT proxy: outbound sockets bind to one host IPv4 (Ethernet path)."""
from __future__ import annotations

import socket
import sys
import threading

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 18080
BIND_IP = sys.argv[1] if len(sys.argv) > 1 else ""
TIMEOUT = 30
BUFSZ = 65536


def outbound_socket() -> socket.socket:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(TIMEOUT)
    s.bind((BIND_IP, 0))
    return s


def relay(a: socket.socket, b: socket.socket) -> None:
    try:
        while True:
            data = a.recv(BUFSZ)
            if not data:
                break
            b.sendall(data)
    except OSError:
        pass
    finally:
        try:
            b.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def read_headers(conn: socket.socket) -> bytes:
    buf = b""
    while b"\r\n\r\n" not in buf and len(buf) < 65536:
        chunk = conn.recv(4096)
        if not chunk:
            break
        buf += chunk
    return buf


def handle(conn: socket.socket, _addr: tuple) -> None:
    conn.settimeout(TIMEOUT)
    try:
        raw = read_headers(conn)
        if not raw:
            return
        line = raw.split(b"\r\n", 1)[0].decode("ascii", "replace")
        parts = line.split(" ")
        if len(parts) < 2:
            return
        method, target = parts[0].upper(), parts[1]
        if method == "CONNECT":
            host, port_s = target.rsplit(":", 1)
            dest = outbound_socket()
            dest.connect((host, int(port_s)))
            conn.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            leftover = raw.split(b"\r\n\r\n", 1)[1]
            if leftover:
                dest.sendall(leftover)
            t = threading.Thread(target=relay, args=(conn, dest), daemon=True)
            t.start()
            relay(dest, conn)
            t.join(TIMEOUT)
            dest.close()
            return
        if target.startswith("http://"):
            without = target[len("http://") :]
            hostport, _, path = without.partition("/")
            path = "/" + path
            if ":" in hostport:
                host, port_s = hostport.rsplit(":", 1)
                port = int(port_s)
            else:
                host, port = hostport, 80
            dest = outbound_socket()
            dest.connect((host, port))
            first, _, rest = raw.partition(b"\r\n")
            bits = first.decode("ascii", "replace").split(" ")
            bits[1] = path
            dest.sendall(" ".join(bits).encode("ascii") + b"\r\n" + rest)
            t = threading.Thread(target=relay, args=(conn, dest), daemon=True)
            t.start()
            relay(dest, conn)
            t.join(TIMEOUT)
            dest.close()
            return
        conn.sendall(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
    except OSError:
        pass
    finally:
        try:
            conn.close()
        except OSError:
            pass


def main() -> None:
    if not BIND_IP:
        sys.stderr.write("usage: bind-egress-proxy.py <bind-ipv4> [listen-port]\n")
        sys.exit(2)
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((LISTEN_HOST, LISTEN_PORT))
    srv.listen(128)
    print(f"bind-egress-proxy {LISTEN_HOST}:{LISTEN_PORT} via {BIND_IP}", flush=True)
    while True:
        conn, addr = srv.accept()
        threading.Thread(target=handle, args=(conn, addr), daemon=True).start()


if __name__ == "__main__":
    main()
