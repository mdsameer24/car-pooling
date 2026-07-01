import React, { useEffect, useRef } from "react";
import L from "leaflet";
import type { Point, Driver, Passenger, MatchDetails } from "../utils/MatchingEngine";

interface MapContainerProps {
  drivers: Driver[];
  passengers: Passenger[];
  selectedDriver: Driver | null;
  selectedPassenger: Passenger | null;
  matchDetails: MatchDetails | null;
  placementMode: "driver-start" | "driver-end" | "passenger-pickup" | "passenger-drop" | null;
  onMapClick: (latlng: Point) => void;
  // Simulation props
  simulatingRideId?: string | null;
  simProgress?: number;
  simStatus: "idle" | "matching" | "driving_to_pickup" | "otp_verification" | "driving_to_drop" | "completed";
  currentSimPosition: Point | null;
  // Engine configuration props
  mapProvider: "osm" | "google";
  googleLoaded: boolean;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  selectedDriver,
  selectedPassenger,
  matchDetails,
  placementMode,
  onMapClick,
  simStatus,
  currentSimPosition,
  mapProvider,
  googleLoaded,
}) => {
  // DOM Container references
  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const googleContainerRef = useRef<HTMLDivElement>(null);

  // Map API instances references
  const leafletMapRef = useRef<L.Map | null>(null);
  const googleMapRef = useRef<any>(null);

  // Leaflet Layer groups
  const leafletRouteLayerRef = useRef<L.FeatureGroup | null>(null);
  const leafletMarkerLayerRef = useRef<L.FeatureGroup | null>(null);
  const leafletCarMarkerRef = useRef<L.Marker | null>(null);

  // Google Maps Overlay references
  const googleOverlaysRef = useRef<any[]>([]);
  const googleCarMarkerRef = useRef<any>(null);

  const clearGoogleOverlays = () => {
    googleOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
    googleOverlaysRef.current = [];
  };

  // Use refs for click handlers to prevent constant map recreation
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  // --- 1. INITIALIZE LEAFLET (OSM) MAP ---
  useEffect(() => {
    if (!leafletContainerRef.current || leafletMapRef.current) return;

    const map = L.map(leafletContainerRef.current, {
      center: [51.505, -0.09],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    leafletMapRef.current = map;
    leafletRouteLayerRef.current = L.featureGroup().addTo(map);
    leafletMarkerLayerRef.current = L.featureGroup().addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // --- 2. INITIALIZE GOOGLE MAP ---
  useEffect(() => {
    if (!googleContainerRef.current || !googleLoaded || googleMapRef.current) return;

    try {
      const googleMap = new (window as any).google.maps.Map(googleContainerRef.current, {
        center: { lat: 51.505, lng: -0.09 },
        zoom: 13,
        disableDefaultUI: false,
        zoomControl: true,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#1e293b" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
          { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#334155" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#090d16" }] },
        ], // sleet dark-mode google style
      });

      googleMap.addListener("click", (e: any) => {
        onMapClickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });

      googleMapRef.current = googleMap;
    } catch (error) {
      console.error("Failed to initialize Google Map:", error);
    }
  }, [googleLoaded]);

  // Adjust container styles when placement mode changes
  useEffect(() => {
    const leafletContainer = leafletContainerRef.current;
    const googleContainer = googleContainerRef.current;

    const cursor = placementMode ? "crosshair" : "";
    if (leafletContainer) leafletContainer.style.cursor = cursor;
    if (googleContainer) googleContainer.style.cursor = cursor;
  }, [placementMode]);

  // Force maps to recalculate size when switching tab layouts
  useEffect(() => {
    if (mapProvider === "osm" && leafletMapRef.current) {
      setTimeout(() => leafletMapRef.current?.invalidateSize(), 100);
    } else if (mapProvider === "google" && googleMapRef.current) {
      setTimeout(() => {
        const trigger = (window as any).google?.maps?.event?.trigger;
        if (trigger) trigger(googleMapRef.current, "resize");
      }, 100);
    }
  }, [mapProvider]);

  // --- 3. REDRAW MAP OVERLAYS & SEGMENTS ---
  useEffect(() => {
    if (mapProvider === "osm") {
      drawLeafletLayers();
    } else if (mapProvider === "google" && googleMapRef.current) {
      drawGoogleLayers();
    }
  }, [selectedDriver, selectedPassenger, matchDetails, mapProvider, googleLoaded]);

  // Helper to compile detoured index coordinates
  const getPointFromFractionalIndex = (routePoints: Point[], index: number): Point => {
    const floor = Math.floor(index);
    const rem = index - floor;
    if (floor >= routePoints.length - 1) return routePoints[routePoints.length - 1];
    const p1 = routePoints[floor];
    const p2 = routePoints[floor + 1];
    return {
      lat: p1.lat + rem * (p2.lat - p1.lat),
      lng: p1.lng + rem * (p2.lng - p1.lng),
    };
  };

  // --- DRAWING: LEAFLET (OSM) ---
  const drawLeafletLayers = () => {
    const map = leafletMapRef.current;
    const routeLayer = leafletRouteLayerRef.current;
    const markerLayer = leafletMarkerLayerRef.current;

    if (!map || !routeLayer || !markerLayer) return;

    // Clear active overlays
    routeLayer.clearLayers();
    markerLayer.clearLayers();
    if (leafletCarMarkerRef.current) {
      leafletCarMarkerRef.current.remove();
      leafletCarMarkerRef.current = null;
    }

    const bounds = L.latLngBounds([]);

    // DivIcon helpers
    const createPinIcon = (color: string, label: string) => {
      return L.divIcon({
        className: "custom-map-pin",
        html: `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="background-color: ${color}; color: white; font-size: 10px; font-weight: bold; padding: 4px 8px; border-radius: 20px; white-space: nowrap; border: 1.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">${label}</div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid ${color}; margin-top: -1px;"></div>
          </div>
        `,
        iconSize: [60, 30],
        iconAnchor: [30, 30],
      });
    };

    const createProjIcon = (color: string, label: string) => {
      return L.divIcon({
        html: `
          <div style="display: flex; align-items: center; justify-content: center; position: relative;">
            <div style="width: 14px; height: 14px; background-color: transparent; border: 2px dashed ${color}; border-radius: 50%;"></div>
            <div style="width: 6px; height: 6px; background-color: ${color}; border-radius: 50%; position: absolute;"></div>
            <div style="position: absolute; bottom: 16px; background-color: rgba(15, 23, 42, 0.9); border: 1px solid ${color}; color: white; font-size: 8px; padding: 2px 4px; border-radius: 4px; white-space: nowrap;">${label}</div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
    };

    // Draw Driver Route
    if (selectedDriver) {
      const points = selectedDriver.routePolyline;
      if (points.length >= 2) {
        L.polyline(points.map(p => L.latLng(p.lat, p.lng)), {
          color: "var(--color-driver)",
          weight: 5,
          opacity: 0.85,
        }).addTo(routeLayer);

        L.marker([points[0].lat, points[0].lng], {
          icon: createPinIcon("var(--color-driver)", `${selectedDriver.name} (Start)`),
        }).addTo(markerLayer);

        L.marker([points[points.length - 1].lat, points[points.length - 1].lng], {
          icon: createPinIcon("#4f46e5", "Finish"),
        }).addTo(markerLayer);

        points.forEach(p => bounds.extend([p.lat, p.lng]));
      }
    }

    // Draw Passenger Pickup/Drop
    if (selectedPassenger) {
      L.marker([selectedPassenger.pickup.lat, selectedPassenger.pickup.lng], {
        icon: createPinIcon("var(--color-passenger)", `${selectedPassenger.name} (Pickup)`),
      }).addTo(markerLayer);

      L.marker([selectedPassenger.drop.lat, selectedPassenger.drop.lng], {
        icon: createPinIcon("#ef4444", `${selectedPassenger.name} (Drop)`),
      }).addTo(markerLayer);

      bounds.extend([selectedPassenger.pickup.lat, selectedPassenger.pickup.lng]);
      bounds.extend([selectedPassenger.drop.lat, selectedPassenger.drop.lng]);

      L.polyline([[selectedPassenger.pickup.lat, selectedPassenger.pickup.lng], [selectedPassenger.drop.lat, selectedPassenger.drop.lng]], {
        color: "var(--color-passenger)",
        weight: 3,
        dashArray: "6, 8",
        opacity: 0.6,
      }).addTo(routeLayer);
    }

    // Draw Projections
    if (selectedDriver && selectedPassenger && matchDetails?.isMatched) {
      const routePoints = selectedDriver.routePolyline;
      const pickupProj = getPointFromFractionalIndex(routePoints, matchDetails.pickupIndex);
      const dropProj = getPointFromFractionalIndex(routePoints, matchDetails.dropIndex);

      L.marker([pickupProj.lat, pickupProj.lng], {
        icon: createProjIcon("var(--color-passenger)", "Pickup Point"),
      }).addTo(markerLayer);

      L.marker([dropProj.lat, dropProj.lng], {
        icon: createProjIcon("#ef4444", "Drop Point"),
      }).addTo(markerLayer);

      // Connect detours
      L.polyline([[pickupProj.lat, pickupProj.lng], [selectedPassenger.pickup.lat, selectedPassenger.pickup.lng]], {
        color: "var(--color-success)",
        weight: 2.5,
        dashArray: "4, 4",
      }).addTo(routeLayer);

      L.polyline([[dropProj.lat, dropProj.lng], [selectedPassenger.drop.lat, selectedPassenger.drop.lng]], {
        color: "#ef4444",
        weight: 2.5,
        dashArray: "4, 4",
      }).addTo(routeLayer);

      // Draw highlighted share path
      const sharedPoints: L.LatLng[] = [];
      const startFloor = Math.floor(matchDetails.pickupIndex);
      const endFloor = Math.ceil(matchDetails.dropIndex);
      
      sharedPoints.push(L.latLng(pickupProj.lat, pickupProj.lng));
      for (let i = startFloor + 1; i < endFloor; i++) {
        if (i < routePoints.length) sharedPoints.push(L.latLng(routePoints[i].lat, routePoints[i].lng));
      }
      sharedPoints.push(L.latLng(dropProj.lat, dropProj.lng));

      L.polyline(sharedPoints, {
        color: "var(--color-success)",
        weight: 6,
        opacity: 0.9,
      }).addTo(routeLayer);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  // --- DRAWING: GOOGLE MAPS ---
  const drawGoogleLayers = () => {
    const googleMap = googleMapRef.current;
    if (!googleMap) return;

    clearGoogleOverlays();
    if (googleCarMarkerRef.current) {
      googleCarMarkerRef.current.setMap(null);
      googleCarMarkerRef.current = null;
    }

    const bounds = new (window as any).google.maps.LatLngBounds();

    // Create marker helper
    const createGoogleMarker = (position: Point, label: string, color: string) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: position.lat, lng: position.lng },
        map: googleMap,
        label: {
          text: label.substring(0, 15),
          color: "#ffffff",
          fontSize: "10px",
          fontWeight: "bold",
        },
        icon: {
          path: (window as any).google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      googleOverlaysRef.current.push(marker);
      return marker;
    };

    // Draw Driver Route
    if (selectedDriver) {
      const points = selectedDriver.routePolyline;
      if (points.length >= 2) {
        const polyline = new (window as any).google.maps.Polyline({
          path: points.map(p => ({ lat: p.lat, lng: p.lng })),
          strokeColor: "#6366f1",
          strokeOpacity: 0.85,
          strokeWeight: 5,
          map: googleMap,
        });
        googleOverlaysRef.current.push(polyline);

        createGoogleMarker(points[0], "Start", "#6366f1");
        createGoogleMarker(points[points.length - 1], "Finish", "#4f46e5");

        points.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
      }
    }

    // Draw Passenger Pickup/Drop
    if (selectedPassenger) {
      createGoogleMarker(selectedPassenger.pickup, "Pickup", "#10b981");
      createGoogleMarker(selectedPassenger.drop, "Drop", "#ef4444");

      bounds.extend({ lat: selectedPassenger.pickup.lat, lng: selectedPassenger.pickup.lng });
      bounds.extend({ lat: selectedPassenger.drop.lat, lng: selectedPassenger.drop.lng });

      // Direct line
      const line = new (window as any).google.maps.Polyline({
        path: [
          { lat: selectedPassenger.pickup.lat, lng: selectedPassenger.pickup.lng },
          { lat: selectedPassenger.drop.lat, lng: selectedPassenger.drop.lng }
        ],
        strokeColor: "#10b981",
        strokeOpacity: 0.6,
        strokeWeight: 3,
        icons: [{
          icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 },
          offset: "0",
          repeat: "10px"
        }], // dashed
        map: googleMap,
      });
      googleOverlaysRef.current.push(line);
    }

    // Draw Projections & Highlight Share Route
    if (selectedDriver && selectedPassenger && matchDetails?.isMatched) {
      const routePoints = selectedDriver.routePolyline;
      const pickupProj = getPointFromFractionalIndex(routePoints, matchDetails.pickupIndex);
      const dropProj = getPointFromFractionalIndex(routePoints, matchDetails.dropIndex);

      // Create projection markers
      createGoogleMarker(pickupProj, "P-Proj", "#10b981");
      createGoogleMarker(dropProj, "D-Proj", "#ef4444");

      // Detour lines
      const line1 = new (window as any).google.maps.Polyline({
        path: [{ lat: pickupProj.lat, lng: pickupProj.lng }, { lat: selectedPassenger.pickup.lat, lng: selectedPassenger.pickup.lng }],
        strokeColor: "#10b981",
        strokeWeight: 2.5,
        map: googleMap,
      });
      const line2 = new (window as any).google.maps.Polyline({
        path: [{ lat: dropProj.lat, lng: dropProj.lng }, { lat: selectedPassenger.drop.lat, lng: selectedPassenger.drop.lng }],
        strokeColor: "#ef4444",
        strokeWeight: 2.5,
        map: googleMap,
      });
      googleOverlaysRef.current.push(line1, line2);

      // Draw highlighted share path
      const sharedPoints: Point[] = [];
      const startFloor = Math.floor(matchDetails.pickupIndex);
      const endFloor = Math.ceil(matchDetails.dropIndex);
      
      sharedPoints.push(pickupProj);
      for (let i = startFloor + 1; i < endFloor; i++) {
        if (i < routePoints.length) sharedPoints.push(routePoints[i]);
      }
      sharedPoints.push(dropProj);

      const sharePolyline = new (window as any).google.maps.Polyline({
        path: sharedPoints.map(p => ({ lat: p.lat, lng: p.lng })),
        strokeColor: "#10b981",
        strokeWeight: 7,
        strokeOpacity: 0.9,
        map: googleMap,
      });
      googleOverlaysRef.current.push(sharePolyline);
    }

    if (!bounds.isEmpty()) {
      googleMap.fitBounds(bounds);
    }
  };

  // --- 4. TRACKING CAR VEHICLE SIMULATION ---
  useEffect(() => {
    const getSimStatusEmoji = () => {
      switch (simStatus) {
        case "driving_to_pickup": return "🚕";
        case "otp_verification": return "🔑";
        case "driving_to_drop": return "👨‍👩‍👦";
        default: return "🚗";
      }
    };

    if (mapProvider === "osm") {
      const map = leafletMapRef.current;
      if (!map || !currentSimPosition) {
        if (leafletCarMarkerRef.current) {
          leafletCarMarkerRef.current.remove();
          leafletCarMarkerRef.current = null;
        }
        return;
      }

      const carIcon = L.divIcon({
        className: "sim-car-icon",
        html: `
          <div style="width: 32px; height: 32px; background-color: var(--bg-tertiary); border: 2px solid var(--color-match); box-shadow: 0 0 12px var(--color-match-glow); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px;">
            ${getSimStatusEmoji()}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (leafletCarMarkerRef.current) {
        leafletCarMarkerRef.current.setLatLng([currentSimPosition.lat, currentSimPosition.lng]);
      } else {
        leafletCarMarkerRef.current = L.marker([currentSimPosition.lat, currentSimPosition.lng], {
          icon: carIcon,
          zIndexOffset: 1000,
        }).addTo(map);
      }
      map.panTo([currentSimPosition.lat, currentSimPosition.lng]);
    } else if (mapProvider === "google") {
      const googleMap = googleMapRef.current;
      if (!googleMap || !currentSimPosition) {
        if (googleCarMarkerRef.current) {
          googleCarMarkerRef.current.setMap(null);
          googleCarMarkerRef.current = null;
        }
        return;
      }

      const pos = { lat: currentSimPosition.lat, lng: currentSimPosition.lng };
      if (googleCarMarkerRef.current) {
        googleCarMarkerRef.current.setPosition(pos);
      } else {
        // Embed SVG containing emoji inside SVG image source
        const carSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><circle cx='16' cy='16' r='14' fill='%231b2336' stroke='%230ea5e9' stroke-width='2'/><text x='6' y='22' font-size='16'>🚕</text></svg>`;

        googleCarMarkerRef.current = new (window as any).google.maps.Marker({
          position: pos,
          map: googleMap,
          title: "Car",
          icon: {
            url: carSvg,
            scaledSize: new (window as any).google.maps.Size(32, 32),
            anchor: new (window as any).google.maps.Point(16, 16),
          },
          zIndex: 1000,
        });
      }
      googleMap.panTo(pos);
    }
  }, [currentSimPosition, simStatus, mapProvider]);

  return (
    <div className="map-backdrop" style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Leaflet map container */}
      <div 
        ref={leafletContainerRef} 
        style={{ display: mapProvider === "osm" ? "block" : "none", width: "100%", height: "100%" }} 
      />
      {/* Google Maps map container */}
      <div 
        ref={googleContainerRef} 
        style={{ display: mapProvider === "google" ? "block" : "none", width: "100%", height: "100%" }} 
      />

      {placementMode && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            border: "1px solid var(--color-match)",
            color: "white",
            padding: "8px 16px",
            borderRadius: "20px",
            zIndex: 999,
            fontSize: "0.8rem",
            fontWeight: 600,
            pointerEvents: "none",
            boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
          }}
        >
          📍 Click on the map to set the {placementMode.replace("-", " ")}
        </div>
      )}
    </div>
  );
};
