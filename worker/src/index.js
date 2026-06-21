const AIS_URL = "wss://stream.aisstream.io/v0/stream";
const BBOX = [[[34.9, 128.4], [35.38, 129.22]]];
const MESSAGE_TYPES = [
  "PositionReport",
  "ExtendedClassBPositionReport",
  "StandardClassBPositionReport",
  "ShipStaticData",
];
const CACHE_MS = 4000;
const COLLECT_MS = 3500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

let cache = null;
let cacheAt = 0;

function cleanAisText(value) {
  return (value || "").replace(/@/g, "").trim();
}

function formatEta(eta) {
  if (!eta || !eta.Month || !eta.Day) {
    return "";
  }
  const month = String(eta.Month).padStart(2, "0");
  const day = String(eta.Day).padStart(2, "0");
  const hour = String(eta.Hour || 0).padStart(2, "0");
  const minute = String(eta.Minute || 0).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute} UTC`;
}

function updateShipFromMessage(ships, message) {
  const messageType = message.MessageType;
  const meta = message.MetaData || message.Metadata || {};

  if (messageType === "ShipStaticData") {
    const body = message.Message?.ShipStaticData;
    if (!body) {
      return;
    }

    const mmsi = String(meta.MMSI || body.UserID);
    const ship = ships[mmsi] || { mmsi };
    ship.name = cleanAisText(body.Name || meta.ShipName || ship.name);
    ship.destination = cleanAisText(body.Destination || ship.destination);
    ship.eta = formatEta(body.Eta) || ship.eta || "";

    const lat = meta.latitude ?? meta.Latitude;
    const lng = meta.longitude ?? meta.Longitude;
    if (lat != null && lng != null) {
      ship.lat = lat;
      ship.lng = lng;
    }

    ships[mmsi] = ship;
    return;
  }

  if (!MESSAGE_TYPES.includes(messageType) || messageType === "ShipStaticData") {
    return;
  }

  const body = message.Message?.[messageType];
  if (!body) {
    return;
  }

  const mmsi = String(meta.MMSI || body.UserID);
  const lat = meta.latitude ?? meta.Latitude ?? body.Latitude;
  const lng = meta.longitude ?? meta.Longitude ?? body.Longitude;
  if (lat == null || lng == null) {
    return;
  }

  const ship = ships[mmsi] || { mmsi };
  ship.name = cleanAisText(meta.ShipName || body.Name || ship.name);
  ship.lat = lat;
  ship.lng = lng;
  ship.cog = body.Cog ?? body.TrueHeading;
  if (typeof body.Sog === "number") {
    ship.sog = body.Sog;
  }

  ships[mmsi] = ship;
}

function collectAisShips(apiKey) {
  return new Promise((resolve, reject) => {
    const ships = {};
    let messageCount = 0;
    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      resolve({
        ships: Object.values(ships),
        count: Object.keys(ships).length,
        ais: { connected: true, messages: messageCount },
      });
    };

    const ws = new WebSocket(AIS_URL);
    const timer = setTimeout(() => {
      ws.close();
      finish();
    }, COLLECT_MS);

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: BBOX,
          FilterMessageTypes: MESSAGE_TYPES,
        })
      );
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.error || message.Error) {
          return;
        }
        messageCount += 1;
        updateShipFromMessage(ships, message);
      } catch {
        // ignore malformed messages
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("AIS connection failed"));
    });

    ws.addEventListener("close", () => {
      clearTimeout(timer);
      finish();
    });
  });
}

async function getShips(env) {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) {
    return cache;
  }

  if (!env.AISSTREAM_API_KEY) {
    return {
      ships: [],
      count: 0,
      ais: { connected: false, error: "AISSTREAM_API_KEY secret missing" },
    };
  }

  cache = await collectAisShips(env.AISSTREAM_API_KEY);
  cacheAt = now;
  return cache;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/api/ships" && request.method === "GET") {
      try {
        const data = await getShips(env);
        return Response.json(data, { headers: corsHeaders });
      } catch {
        return Response.json(
          {
            ships: [],
            count: 0,
            ais: { connected: false, error: "AIS fetch failed" },
          },
          { status: 502, headers: corsHeaders }
        );
      }
    }

    return new Response("unseen-passage AIS worker", { headers: corsHeaders });
  },
};
