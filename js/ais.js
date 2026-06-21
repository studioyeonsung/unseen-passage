const BUSAN_CHANGWON_BBOX = [[[34.9, 128.4], [35.38, 129.22]]];
const POSITION_MESSAGE_TYPES = [
  "PositionReport",
  "ExtendedClassBPositionReport",
  "StandardClassBPositionReport",
];

function getAisRegionBounds() {
  const [[south, west], [north, east]] = BUSAN_CHANGWON_BBOX[0];
  return new google.maps.LatLngBounds(
    { lat: south, lng: west },
    { lat: north, lng: east }
  );
}

function getShipsApiUrl() {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "/api/ships";
  }
  if (typeof AIS_API_URL === "string" && AIS_API_URL) {
    return `${AIS_API_URL.replace(/\/$/, "")}/api/ships`;
  }
  return null;
}

function initAisStream(map) {
  const statusEl = document.getElementById("ais-status");
  const countEl = document.getElementById("ais-count");
  const rotterdamCountEl = document.getElementById("ais-rotterdam-count");
  const markers = new Map();
  const shipsApiUrl = getShipsApiUrl();

  function setStatus(text) {
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  function setCount(count) {
    if (countEl) {
      countEl.textContent = String(count);
    }
  }

  function setRotterdamCount(count) {
    if (rotterdamCountEl) {
      rotterdamCountEl.textContent = String(count);
    }
  }

  function isRotterdamBound(destination) {
    return (destination || "").toUpperCase().includes("ROTTERDAM");
  }

  function createShipIcon(cog, destination) {
    return {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 5,
      fillColor: isRotterdamBound(destination) ? "#2d8632" : "#c0392b",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 1.5,
      rotation: typeof cog === "number" ? cog : 0,
    };
  }

  const shipData = new Map();

  function upsertShipMarker(ship) {
    const { mmsi, lat, lng, cog } = ship;
    if (lat == null || lng == null) {
      return;
    }

    shipData.set(mmsi, ship);
    let marker = markers.get(mmsi);
    const position = { lat, lng };
    const icon = createShipIcon(cog, ship.destination);

    if (!marker) {
      marker = new google.maps.Marker({
        position,
        map,
        title: ship.name || `MMSI ${mmsi}`,
        icon,
        zIndex: google.maps.Marker.MAX_ZINDEX + 1,
      });

      marker.addListener("click", () => {
        const latest = shipData.get(mmsi) || ship;
        const lines = [
          latest.name || `MMSI ${mmsi}`,
          latest.destination ? `목적지: ${latest.destination}` : "",
          latest.eta ? `ETA: ${latest.eta}` : "",
          isRotterdamBound(latest.destination) ? "로테르담 행" : "",
          latest.sog != null ? `속력: ${Number(latest.sog).toFixed(1)} kn` : "",
        ].filter(Boolean);
        window.alert(lines.join("\n"));
      });

      markers.set(mmsi, marker);
      return;
    }

    marker.setPosition(position);
    marker.setIcon(icon);
  }

  async function pollShips() {
    if (!shipsApiUrl) {
      setStatus("AIS API URL 없음 · worker 배포 후 config.js에 AIS_API_URL 입력");
      setCount(0);
      setRotterdamCount(0);
      return;
    }

    try {
      const response = await fetch(shipsApiUrl);
      if (!response.ok) {
        throw new Error("bad response");
      }

      const data = await response.json();
      const rotterdamCount = data.ships.filter((ship) =>
        isRotterdamBound(ship.destination)
      ).length;
      data.ships.forEach(upsertShipMarker);

      setCount(data.count);
      setRotterdamCount(rotterdamCount);
      if (data.count > 0) {
        setStatus(`부산·창원 권역 선박 ${data.count}척 표시 중`);
      } else if (data.ais?.connected) {
        setStatus("AIS 연결됨 · 선박 신호 대기 중");
        setRotterdamCount(0);
      } else {
        setStatus("AIS 연결 중...");
        setRotterdamCount(0);
      }
    } catch {
      const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      setStatus(
        isLocal
          ? "AIS 데이터 불러오기 실패 · python3 serve.py 실행"
          : "AIS 데이터 불러오기 실패 · Worker URL 확인"
      );
      setRotterdamCount(0);
    }
  }

  if (!shipsApiUrl) {
    setStatus("AIS API URL 없음 · worker/README.md 참고");
    setCount(0);
    setRotterdamCount(0);
    return;
  }

  setStatus("AIS 불러오는 중...");
  pollShips();
  setInterval(pollShips, 2000);
}
