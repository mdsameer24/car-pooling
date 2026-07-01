export interface Point {
  lat: number;
  lng: number;
}

export interface Driver {
  id: string;
  name: string;
  startLocation: string;
  endLocation: string;
  routePolyline: Point[]; // Array of lat/lng
  departureTime: string; // HH:MM
  availableSeats: number;
  totalSeats: number;
  pricePerKm: number;
}

export interface Passenger {
  id: string;
  name: string;
  pickup: Point;
  pickupAddress: string;
  drop: Point;
  dropAddress: string;
  requestedTime: string; // HH:MM
  seatsNeeded: number;
}

export interface MatchDetails {
  pickupDistance: number; // meters
  dropDistance: number; // meters
  pickupIndex: number; // fractional index along route
  dropIndex: number; // fractional index along route
  originalRouteDistance: number; // meters
  detourDistance: number; // meters
  isMatched: boolean;
  reasons: string[];
  estimatedFare: number;
}

export interface MatchedRide {
  driver: Driver;
  details: MatchDetails;
}

// Earth Radius in meters
const EARTH_RADIUS = 6371000;

// Helper to convert lat/lng to flat Cartesian coordinates relative to a reference latitude
function projectToFlat(lat: number, lng: number, refLat: number) {
  const latToMeters = 111320;
  const lonToMeters = 111320 * Math.cos((refLat * Math.PI) / 180);
  return {
    x: lng * lonToMeters,
    y: lat * latToMeters,
  };
}

// Compute Haversine distance between two points
export function getHaversineDistance(p1: Point, p2: Point): number {
  const phi1 = (p1.lat * Math.PI) / 180;
  const phi2 = (p2.lat * Math.PI) / 180;
  const deltaPhi = ((p2.lat - p1.lat) * Math.PI) / 180;
  const deltaLng = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS * c;
}

// Calculate cumulative distance of a polyline
export function getRouteDistance(polyline: Point[]): number {
  let distance = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    distance += getHaversineDistance(polyline[i], polyline[i + 1]);
  }
  return distance;
}

// Find closest distance from point P to line segment AB
export function getDistanceToSegment(p: Point, a: Point, b: Point): { distance: number; projection: Point; t: number } {
  const refLat = a.lat;
  const projA = projectToFlat(a.lat, a.lng, refLat);
  const projB = projectToFlat(b.lat, b.lng, refLat);
  const projP = projectToFlat(p.lat, p.lng, refLat);

  const dx = projB.x - projA.x;
  const dy = projB.y - projA.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return {
      distance: getHaversineDistance(p, a),
      projection: a,
      t: 0,
    };
  }

  // Projection factor t
  let t = ((projP.x - projA.x) * dx + (projP.y - projA.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment

  const closestX = projA.x + t * dx;
  const closestY = projA.y + t * dy;

  // Convert closest back to lat/lon
  const latToMeters = 111320;
  const lonToMeters = 111320 * Math.cos((refLat * Math.PI) / 180);
  const closestPoint: Point = {
    lat: closestY / latToMeters,
    lng: closestX / lonToMeters,
  };

  const distance = getHaversineDistance(p, closestPoint);
  return { distance, projection: closestPoint, t };
}

// Find closest point and its fractional index on a driver polyline
export function getClosestPointOnPolyline(p: Point, polyline: Point[]): { distance: number; projection: Point; fractionalIndex: number } {
  if (polyline.length === 0) {
    throw new Error("Polyline must contain at least one point");
  }
  if (polyline.length === 1) {
    return {
      distance: getHaversineDistance(p, polyline[0]),
      projection: polyline[0],
      fractionalIndex: 0,
    };
  }

  let minDistance = Infinity;
  let bestProjection = polyline[0];
  let bestFractionalIndex = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const { distance, projection, t } = getDistanceToSegment(p, a, b);

    if (distance < minDistance) {
      minDistance = distance;
      bestProjection = projection;
      bestFractionalIndex = i + t;
    }
  }

  return {
    distance: minDistance,
    projection: bestProjection,
    fractionalIndex: bestFractionalIndex,
  };
}

// Calculate the route distance from the start to a specific fractional index
export function getDistanceToFractionalIndex(polyline: Point[], index: number): number {
  if (polyline.length <= 1) return 0;
  const floorIndex = Math.floor(index);
  const rem = index - floorIndex;

  let distance = 0;
  for (let i = 0; i < floorIndex; i++) {
    distance += getHaversineDistance(polyline[i], polyline[i + 1]);
  }

  if (floorIndex < polyline.length - 1 && rem > 0) {
    const startPt = polyline[floorIndex];
    const endPt = polyline[floorIndex + 1];
    // Interpolate point
    const interpPt = {
      lat: startPt.lat + rem * (endPt.lat - startPt.lat),
      lng: startPt.lng + rem * (endPt.lng - startPt.lng),
    };
    distance += getHaversineDistance(startPt, interpPt);
  }

  return distance;
}

// Compare two time strings (HH:MM) and return difference in minutes (t2 - t1)
export function getTimeDifference(t1: string, t2: string): number {
  const [h1, m1] = t1.split(":").map(Number);
  const [h2, m2] = t2.split(":").map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

// Spatial & Temporal Matching Algorithm
export function matchRide(
  driver: Driver,
  passenger: Passenger,
  config: {
    proximityThreshold: number; // meters
    detourLimit: number; // meters
    timeWindow: number; // minutes
  }
): MatchDetails {
  const reasons: string[] = [];
  let isMatched = true;

  // 1. Decodes & measures driver polyline length
  const polyline = driver.routePolyline;
  if (polyline.length < 2) {
    return {
      pickupDistance: Infinity,
      dropDistance: Infinity,
      pickupIndex: -1,
      dropIndex: -1,
      originalRouteDistance: 0,
      detourDistance: Infinity,
      isMatched: false,
      reasons: ["Driver route polyline is empty or invalid"],
      estimatedFare: 0,
    };
  }

  const originalRouteDistance = getRouteDistance(polyline);

  // 2. Compute minimum distance to driver's route for pickup and drop coordinates
  const pickupMatch = getClosestPointOnPolyline(passenger.pickup, polyline);
  const dropMatch = getClosestPointOnPolyline(passenger.drop, polyline);

  const pickupDistance = pickupMatch.distance;
  const dropDistance = dropMatch.distance;
  const pickupIndex = pickupMatch.fractionalIndex;
  const dropIndex = dropMatch.fractionalIndex;

  // 3. Proximity Checks (pickup & drop within spatial threshold distance)
  if (pickupDistance > config.proximityThreshold) {
    isMatched = false;
    reasons.push(
      `Pickup is too far from route: ${(pickupDistance / 1000).toFixed(2)} km (Limit: ${config.proximityThreshold} m)`
    );
  }
  if (dropDistance > config.proximityThreshold) {
    isMatched = false;
    reasons.push(
      `Drop-off is too far from route: ${(dropDistance / 1000).toFixed(2)} km (Limit: ${config.proximityThreshold} m)`
    );
  }

  // 4. Sequence Check (pickup index occurs before drop index)
  if (pickupIndex >= dropIndex) {
    isMatched = false;
    reasons.push("Direction mismatch: Pickup is located after the drop-off along the driver's route direction.");
  }

  // 5. Time window validation
  const timeDiff = Math.abs(getTimeDifference(driver.departureTime, passenger.requestedTime));
  if (timeDiff > config.timeWindow) {
    isMatched = false;
    reasons.push(`Departure time mismatch: Difference of ${timeDiff} mins exceeds the ${config.timeWindow}-minute window.`);
  }

  // 6. Capacity Check
  if (driver.availableSeats < passenger.seatsNeeded) {
    isMatched = false;
    reasons.push(`Insufficient seats: Needs ${passenger.seatsNeeded}, only ${driver.availableSeats} available.`);
  }

  // 7. Detour distance estimation
  // If the driver deviates to pick up and drop off:
  // Detour = (distance from route to pickup) * 2 + (distance from route to drop) * 2 (approximate deviation overhead)
  // Let's also verify that the detour doesn't exceed configured limits.
  const detourDistance = (pickupDistance + dropDistance) * 1.5; // factor in return loops
  if (detourDistance > config.detourLimit) {
    isMatched = false;
    reasons.push(`Detour too long: Estimated detour of ${(detourDistance / 1000).toFixed(2)} km exceeds limit of ${(config.detourLimit / 1000).toFixed(2)} km.`);
  }

  if (isMatched) {
    reasons.push("Perfect match! Proximity, sequence, departure time, seats, and detour are all valid.");
  }

  // 8. Estimate Fare
  // Passenger pays for the distance traveled along the route between their pickup and drop-off points
  const passengerDistance = getDistanceToFractionalIndex(polyline, dropIndex) - getDistanceToFractionalIndex(polyline, pickupIndex);
  const estimatedFare = Math.max(5.00, Number(((passengerDistance / 1000) * driver.pricePerKm).toFixed(2))); // minimum fare of $5.00

  return {
    pickupDistance,
    dropDistance,
    pickupIndex,
    dropIndex,
    originalRouteDistance,
    detourDistance,
    isMatched,
    reasons,
    estimatedFare,
  };
}

// Decodes Google's encoded polyline format into an array of Point objects
export function decodeGooglePolyline(encoded: string): Point[] {
  const points: Point[] = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;

  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }
  return points;
}

