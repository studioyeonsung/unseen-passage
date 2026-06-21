import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const PORT = 8787;
const AIS_URL = "wss://stream.aisstream.io/v0/stream";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = readFileSync(join(ROOT, "js/config.js"), "utf8");
const API_KEY =
  process.env.AISSTREAM_API_KEY ||
  (config.match(/AISSTREAM_API_KEY = "([^"]+)"/) || [])[1];

if (!API_KEY) {
  console.error("js/config.js에 AISSTREAM_API_KEY를 넣거나 환경 변수를 설정해주세요.");
  process.exit(1);
}

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("AIS WebSocket proxy\nConnect: ws://localhost:8787\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (client) => {
  const upstream = new WebSocket(AIS_URL);
  let upstreamOpen = false;
  const queue = [];

  upstream.on("open", () => {
    upstreamOpen = true;
    queue.forEach((data) => upstream.send(data));
    queue.length = 0;

    client.on("message", (data) => {
      if (upstream.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        const payload = JSON.parse(String(data));
        payload.APIKey = API_KEY;
        upstream.send(JSON.stringify(payload));
      } catch {
        upstream.send(data);
      }
    });
  });

  upstream.on("message", (data) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });

  upstream.on("close", () => client.close());
  upstream.on("error", () => client.close());
  client.on("close", () => upstream.close());
});

server.listen(PORT, () => {
  console.log(`AIS proxy: ws://localhost:${PORT}`);
  console.log("지도 페이지를 새로고침하세요.");
});
