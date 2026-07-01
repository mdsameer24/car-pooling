import type { Point } from "./MatchingEngine";
import { decodeGooglePolyline } from "./MatchingEngine";

// Fetch polyline from OSRM API or Google Directions API
export async function fetchRoute(start: Point, end: Point, useGoogle: boolean = false): Promise<Point[]> {
  if (useGoogle && typeof window !== "undefined" && (window as any).google) {
    return new Promise((resolve) => {
      try {
        const directionsService = new (window as any).google.maps.DirectionsService();
        directionsService.route(
          {
            origin: { lat: start.lat, lng: start.lng },
            destination: { lat: end.lat, lng: end.lng },
            travelMode: (window as any).google.maps.TravelMode.DRIVING,
          },
          (response: any, status: string) => {
            if (status === "OK" && response.routes && response.routes.length > 0) {
              const encodedPolyline = response.routes[0].overview_polyline;
              const points = decodeGooglePolyline(encodedPolyline);
              resolve(points);
            } else {
              console.warn(`Google Directions failed (Status: ${status}), falling back to OSRM.`);
              resolve(fetchOSRMRoute(start, end));
            }
          }
        );
      } catch (err) {
        console.warn("Google Directions Service error, falling back to OSRM.", err);
        resolve(fetchOSRMRoute(start, end));
      }
    });
  }

  return fetchOSRMRoute(start, end);
}

// Helper: standard OSRM router
async function fetchOSRMRoute(start: Point, end: Point): Promise<Point[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      throw new Error("No routes found from OSRM");
    }

    const coordinates = data.routes[0].geometry.coordinates as [number, number][];
    return coordinates.map(([lng, lat]) => ({ lat, lng }));
  } catch (error) {
    console.warn("OSRM routing failed. Falling back to straight-line route.", error);
    const points: Point[] = [];
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push({
        lat: start.lat + t * (end.lat - start.lat),
        lng: start.lng + t * (end.lng - start.lng),
      });
    }
    return points;
  }
}

// OpenStreetMap Nominatim Geocoding API or Google Geocoding API search
export interface GeocodeResult {
  display_name: string;
  lat: number;
  lng: number;
}

export async function searchAddress(query: string, useGoogle: boolean = false): Promise<GeocodeResult[]> {
  if (!query || query.trim().length < 3) return [];
  
  if (useGoogle && typeof window !== "undefined" && (window as any).google) {
    return new Promise((resolve) => {
      try {
        const geocoder = new (window as any).google.maps.Geocoder();
        geocoder.geocode({ address: query }, (results: any, status: string) => {
          if (status === "OK" && results) {
            const formatted = results.slice(0, 5).map((r: any) => ({
              display_name: r.formatted_address,
              lat: r.geometry.location.lat(),
              lng: r.geometry.location.lng(),
            }));
            resolve(formatted);
          } else {
            console.warn(`Google Geocoding failed (Status: ${status}), falling back to Nominatim.`);
            resolve(searchNominatim(query));
          }
        });
      } catch (err) {
        console.warn("Google Geocoder error, falling back to Nominatim.", err);
        resolve(searchNominatim(query));
      }
    });
  }

  return searchNominatim(query);
}

// Helper: standard Nominatim geocoding
async function searchNominatim(query: string): Promise<GeocodeResult[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    const response = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "AntigravityCarpoolMatchingApp/1.0"
      }
    });
    
    if (!response.ok) {
      throw new Error(`Geocoding error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.map((item: any) => ({
      display_name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));
  } catch (error) {
    console.error("Geocoding address search failed:", error);
    return [];
  }
}
