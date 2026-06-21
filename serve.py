#!/usr/bin/env python3
import asyncio
import json
import re
import socketserver
import threading
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

import websockets

ROOT = Path(__file__).resolve().parent
HTTP_PORT = 8000
AIS_URL = "wss://stream.aisstream.io/v0/stream"

match = re.search(r'AISSTREAM_API_KEY = "([^"]+)"', (ROOT / "js/config.js").read_text())
API_KEY = match.group(1) if match else None

SUBSCRIPTION = {
    "APIKey": API_KEY,
    "BoundingBoxes": [[[34.9, 128.4], [35.38, 129.22]]],
    "FilterMessageTypes": [
        "PositionReport",
        "ExtendedClassBPositionReport",
        "StandardClassBPositionReport",
        "ShipStaticData",
    ],
}

ships = {}
ships_lock = threading.Lock()
ais_status = {"connected": False, "messages": 0}


def clean_ais_text(value):
    return (value or "").replace("@", "").strip()


def format_eta(eta):
    if not eta or not eta.get("Month") or not eta.get("Day"):
        return ""
    return (
        f"{eta['Month']:02d}-{eta['Day']:02d} "
        f"{eta.get('Hour', 0):02d}:{eta.get('Minute', 0):02d} UTC"
    )


def update_ship_from_message(message):
    message_type = message.get("MessageType")
    meta = message.get("MetaData") or message.get("Metadata") or {}
    body = (message.get("Message") or {}).get(message_type)

    if not body and message_type != "ShipStaticData":
        return

    if message_type == "ShipStaticData":
        body = message.get("Message", {}).get("ShipStaticData")
        if not body:
            return
        mmsi = str(meta.get("MMSI") or body.get("UserID"))
        with ships_lock:
            ship = ships.setdefault(mmsi, {"mmsi": mmsi})
            ship["name"] = clean_ais_text(body.get("Name") or meta.get("ShipName") or ship.get("name"))
            ship["destination"] = clean_ais_text(body.get("Destination") or ship.get("destination"))
            ship["eta"] = format_eta(body.get("Eta")) or ship.get("eta", "")
            lat = meta.get("latitude") or meta.get("Latitude")
            lng = meta.get("longitude") or meta.get("Longitude")
            if lat is not None and lng is not None:
                ship["lat"] = lat
                ship["lng"] = lng
        return

    if message_type in SUBSCRIPTION["FilterMessageTypes"] and message_type != "ShipStaticData":
        body = message.get("Message", {}).get(message_type)
        if not body:
            return
        mmsi = str(meta.get("MMSI") or body.get("UserID"))
        lat = meta.get("latitude") or meta.get("Latitude") or body.get("Latitude")
        lng = meta.get("longitude") or meta.get("Longitude") or body.get("Longitude")
        if lat is None or lng is None:
            return
        with ships_lock:
            ship = ships.setdefault(mmsi, {"mmsi": mmsi})
            ship["name"] = clean_ais_text(meta.get("ShipName") or body.get("Name") or ship.get("name"))
            ship["lat"] = lat
            ship["lng"] = lng
            ship["cog"] = body.get("Cog", body.get("TrueHeading"))
            if isinstance(body.get("Sog"), (int, float)):
                ship["sog"] = body["Sog"]


async def ais_loop():
    global ais_status
    while True:
        try:
            async with websockets.connect(AIS_URL) as ws:
                await ws.send(json.dumps(SUBSCRIPTION))
                ais_status = {"connected": True, "messages": 0}
                print("AISstream 연결됨")

                async for raw in ws:
                    data = json.loads(raw)
                    if data.get("error") or data.get("Error"):
                        print("AIS 오류:", data.get("error") or data.get("Error"))
                        continue
                    update_ship_from_message(data)
                    ais_status["messages"] += 1
                    if ais_status["messages"] == 1:
                        print("첫 AIS 메시지 수신")
        except Exception as error:
            ais_status = {"connected": False, "messages": 0}
            print(f"AIS 재연결 대기: {error}")
            await asyncio.sleep(3)


class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/ships":
            with ships_lock:
                payload = {
                    "ships": list(ships.values()),
                    "count": len(ships),
                    "ais": dict(ais_status),
                }
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/api/ais-status":
            body = json.dumps(ais_status, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()

    def log_message(self, format, *args):
        if str(args[0]).startswith("GET /api/"):
            return
        super().log_message(format, *args)


class ReuseServer(socketserver.TCPServer):
    allow_reuse_address = True


def start_http():
    with ReuseServer(("", HTTP_PORT), StaticHandler) as httpd:
        print(f"지도: http://localhost:{HTTP_PORT}")
        httpd.serve_forever()


def start_ais():
    asyncio.run(ais_loop())


def main():
    if not API_KEY:
        raise SystemExit("js/config.js에 AISSTREAM_API_KEY를 넣어주세요.")

    threading.Thread(target=start_ais, daemon=True).start()
    threading.Thread(target=start_http, daemon=True).start()

    print("AIS 데이터: http://localhost:8000/api/ships")
    print("종료: Ctrl+C")

    try:
        while True:
            threading.Event().wait(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
