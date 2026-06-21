function getPhotoBounds() {
  const bounds = new google.maps.LatLngBounds();

  PHOTOS.forEach((photo) => {
    bounds.extend({ lat: photo.lat, lng: photo.lng });
  });

  return bounds;
}

function groupPhotosByLocation(photos) {
  const groups = new Map();

  photos.forEach((photo) => {
    const key = `${photo.lat},${photo.lng}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(photo);
  });

  return groups;
}

function createPhotoTooltip(map) {
  const container = document.createElement("div");
  container.className = "photo-tooltip hidden";
  map.getDiv().appendChild(container);

  let activePosition = null;
  let hideTimer = null;

  const overlay = new google.maps.OverlayView();
  overlay.onAdd = function onAdd() {
    this.getPanes().overlayMouseTarget.appendChild(container);
  };
  overlay.draw = function draw() {
    if (!activePosition) {
      return;
    }

    const point = overlay.getProjection().fromLatLngToDivPixel(activePosition);
    container.style.left = `${point.x}px`;
    container.style.top = `${point.y}px`;
  };
  overlay.setMap(map);

  function cancelHide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(hide, 120);
  }

  function show(position, photos) {
    cancelHide();
    activePosition = position;
    container.innerHTML = photos
      .map(
        (photo) => `
          <div class="photo-tooltip__item">
            <img class="photo-tooltip__image" src="${photo.image}" alt="${photo.file}" loading="lazy" />
            <p class="photo-tooltip__time">${photo.datetime}</p>
          </div>
        `
      )
      .join("");
    container.classList.remove("hidden");
    overlay.draw();
  }

  function hide() {
    cancelHide();
    activePosition = null;
    container.classList.add("hidden");
    container.innerHTML = "";
  }

  container.addEventListener("mouseenter", cancelHide);
  container.addEventListener("mouseleave", scheduleHide);

  return { show, hide, scheduleHide, cancelHide };
}

function createPhotoMarkers(map, tooltip) {
  const groups = groupPhotosByLocation(PHOTOS);

  groups.forEach((photos) => {
    const position = { lat: photos[0].lat, lng: photos[0].lng };
    const marker = new google.maps.Marker({
      position,
      map,
      title: photos.map((photo) => photo.datetime).join(", "),
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#1a3a8f",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });

    marker.addListener("mouseover", () => {
      tooltip.show(position, photos);
    });
    marker.addListener("mouseout", () => {
      tooltip.scheduleHide();
    });
    marker.addListener("click", () => {
      tooltip.cancelHide();
      tooltip.show(position, photos);
    });
  });
}

function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  const bounds = getPhotoBounds();
  bounds.union(getAisRegionBounds());
  map.fitBounds(bounds, 48);

  google.maps.event.addListenerOnce(map, "bounds_changed", () => {
    if (map.getZoom() > 14) {
      map.setZoom(14);
    }
  });

  const tooltip = createPhotoTooltip(map);
  createPhotoMarkers(map, tooltip);
  initAisStream(map);

  map.addListener("click", () => {
    tooltip.hide();
  });
}

function showMapError(message) {
  const mapEl = document.getElementById("map");
  mapEl.className = "map-error";
  mapEl.textContent = message;
}

function loadGoogleMaps() {
  if (!GOOGLE_MAPS_API_KEY) {
    showMapError("Google Maps API 키를 js/config.js에 넣어주세요.");
    return;
  }

  window.initMap = initMap;

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initMap`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    showMapError("Google Maps를 불러오지 못했습니다. API 키를 확인해주세요.");
  };
  document.head.appendChild(script);
}

document.addEventListener("DOMContentLoaded", loadGoogleMaps);
