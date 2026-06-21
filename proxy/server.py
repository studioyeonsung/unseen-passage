#!/usr/bin/env python3
import asyncio
import json
import re
from pathlib import Path

import websockets

PORT = 8787
AIS_URL = "wss://stream.aisstream.io/v0/stream"
ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "js" / "config.js"

match = re.search(r'AISSTREAM_API_KEY = "([^"]+)"', CONFIG.read_text())
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


async def relay(client):
    async with websockets.connect(AIS_URL) as upstream:
        await upstream.send(json.dumps(SUBSCRIPTION))

        async def upstream_to_client():
            async for message in upstream:
                await client.send(message)

        async def keep_client_open():
            async for _ in client:
                pass

        await asyncio.gather(upstream_to_client(), keep_client_open())


async def main():
    if not API_KEY:
        raise SystemExit("js/config.js에 AISSTREAM_API_KEY를 넣어주세요.")

    print(f"AIS proxy: ws://127.0.0.1:{PORT}")
    print("권장: python3 serve.py (지도+프록시 한 번에)")

    async with websockets.serve(relay, "127.0.0.1", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
