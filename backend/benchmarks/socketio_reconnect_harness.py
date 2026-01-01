import argparse
import os
import time
from threading import Event

import socketio


def main() -> None:
    parser = argparse.ArgumentParser(description="Socket.IO reconnect harness")
    parser.add_argument("--base-url", default="http://127.0.0.1:5000")
    parser.add_argument(
        "--socket-token",
        default=os.environ.get("FORGE_SOCKET_TOKEN"),
        help="Socket.IO auth token (defaults to FORGE_SOCKET_TOKEN env var)",
    )
    parser.add_argument("--timeout", type=int, default=15)
    args = parser.parse_args()

    if not args.socket_token:
        raise RuntimeError(
            "Socket.IO token required. Set --socket-token or FORGE_SOCKET_TOKEN."
        )

    reconnected = Event()
    connected = Event()
    connect_count = {"count": 0}

    sio = socketio.Client(
        reconnection=True,
        reconnection_attempts=5,
        reconnection_delay=1,
        reconnection_delay_max=5,
        randomization_factor=0.5,
    )

    @sio.event
    def connect():
        connect_count["count"] += 1
        connected.set()
        if connect_count["count"] >= 2:
            reconnected.set()

    @sio.event
    def disconnect():
        pass

    sio.connect(
        args.base_url,
        transports=["websocket"],
        auth={"token": args.socket_token},
    )

    if not connected.wait(timeout=args.timeout):
        raise RuntimeError("Initial Socket.IO connection timed out")

    sio.eio.disconnect(abort=True)

    if not reconnected.wait(timeout=args.timeout):
        raise RuntimeError("Socket.IO reconnection timed out")

    sio.disconnect()
    print("Socket.IO reconnect harness succeeded")


if __name__ == "__main__":
    main()
