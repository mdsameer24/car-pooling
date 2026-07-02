import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Plus, 
  MapPin, 
  Clock, 
  Users, 
  Settings, 
  Sliders, 
  User, 
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  DollarSign,
  Edit,
  Activity,
  Layers,
  X
} from "lucide-react";

import { MapContainer } from "./components/MapContainer";
import type { 
  Point, 
  Driver, 
  Passenger, 
  MatchDetails
} from "./utils/MatchingEngine";
import { matchRide } from "./utils/MatchingEngine";
import { fetchRoute, searchAddress } from "./utils/RoutingService";
import type { GeocodeResult } from "./utils/RoutingService";

// Pre-populated realistic India Mock Data
const INITIAL_DRIVERS: Driver[] = [
  {
    id: "drv_1",
    name: "Rajesh Kumar",
    startLocation: "Kempegowda International Airport (BLR), Bengaluru",
    endLocation: "Electronic City Phase 1, Bengaluru",
    routePolyline: [
      { lat: 13.1986, lng: 77.7066 }, // BLR Airport
      { lat: 13.0359, lng: 77.5970 }, // Hebbal
      { lat: 13.0084, lng: 77.5896 }, // Mekhri Circle
      { lat: 12.9644, lng: 77.6101 }, // Richmond Town
      { lat: 12.9352, lng: 77.6245 }, // Koramangala
      { lat: 12.8452, lng: 77.6602 }, // Electronic City
    ],
    departureTime: "14:00",
    availableSeats: 4,
    totalSeats: 4,
    pricePerKm: 15.00,
  },
  {
    id: "drv_2",
    name: "Priya Sharma",
    startLocation: "Connaught Place, New Delhi",
    endLocation: "DLF Cyber City, Gurugram",
    routePolyline: [
      { lat: 28.6304, lng: 77.2177 }, // Connaught Place
      { lat: 28.6129, lng: 77.2295 }, // India Gate
      { lat: 28.5684, lng: 77.2064 }, // AIIMS Flyover
      { lat: 28.5387, lng: 77.1622 }, // Vasant Kunj
      { lat: 28.4950, lng: 77.0890 }, // DLF Cyber City
    ],
    departureTime: "09:30",
    availableSeats: 3,
    totalSeats: 4,
    pricePerKm: 12.00,
  }
];

const INITIAL_PASSENGERS: Passenger[] = [
  {
    id: "psg_1",
    name: "Rahul Verma (Matched)",
    pickup: { lat: 13.0350, lng: 77.5975 }, // Near Hebbal (approx 100m from Rajesh's route)
    pickupAddress: "Hebbal Flyover, Bengaluru",
    drop: { lat: 12.9350, lng: 77.6250 }, // Near Koramangala (approx 65m from Rajesh's route)
    dropAddress: "Koramangala 5th Block, Bengaluru",
    requestedTime: "14:15",
    seatsNeeded: 2,
  },
  {
    id: "psg_2",
    name: "Aisha Gupta (Too Far Mismatch)",
    pickup: { lat: 12.9176, lng: 77.4837 }, // Kengeri (approx 12km from Rajesh's route)
    pickupAddress: "Kengeri Satellite Town, Bengaluru",
    drop: { lat: 12.8009, lng: 77.5750 }, // Bannerghatta National Park (approx 10km from route)
    dropAddress: "Bannerghatta National Park, Bengaluru",
    requestedTime: "14:30",
    seatsNeeded: 1,
  },
  {
    id: "psg_3",
    name: "Amit Sen (Direction/Sequence Mismatch)",
    pickup: { lat: 12.9352, lng: 77.6245 }, // Koramangala (Pickup)
    pickupAddress: "Koramangala Forum Mall, Bengaluru",
    drop: { lat: 13.0359, lng: 77.5970 }, // Hebbal (Drop - which is passed BEFORE Koramangala)
    dropAddress: "Hebbal Police Station, Bengaluru",
    requestedTime: "14:05",
    seatsNeeded: 1,
  }
];

export default function App() {
  // App State
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);
  const [passengers, setPassengers] = useState<Passenger[]>(INITIAL_PASSENGERS);
  
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(INITIAL_DRIVERS[0]);
  const [selectedPassenger, setSelectedPassenger] = useState<Passenger | null>(INITIAL_PASSENGERS[0]);
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null);



  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [proximityThreshold, setProximityThreshold] = useState(500); // meters
  const [detourLimit, setDetourLimit] = useState(3000); // meters (3km)
  const [timeWindow, setTimeWindow] = useState(30); // minutes

  // Google Maps Integration Settings
  const [mapProvider, setMapProvider] = useState<"osm" | "google">("osm");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [googleLoaded, setGoogleLoaded] = useState(false);

  // Dynamically load Google Maps Javascript API SDK
  useEffect(() => {
    if (mapProvider === "google" && googleApiKey && !googleLoaded) {
      const existingScript = document.getElementById("google-maps-api");
      if (existingScript) {
        setGoogleLoaded(true);
        return;
      }

      const script = document.createElement("script");
      script.id = "google-maps-api";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setGoogleLoaded(true);
        console.log("Google Maps API SDK loaded successfully.");
      };
      script.onerror = () => {
        alert("Failed to load Google Maps SDK. Please check your API Key and network connection.");
      };
      document.head.appendChild(script);
    }
  }, [mapProvider, googleApiKey, googleLoaded]);

  // Form State - Driver Creation
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverStart, setNewDriverStart] = useState("");
  const [newDriverStartCoord, setNewDriverStartCoord] = useState<Point | null>(null);
  const [newDriverEnd, setNewDriverEnd] = useState("");
  const [newDriverEndCoord, setNewDriverEndCoord] = useState<Point | null>(null);
  const [newDriverTime, setNewDriverTime] = useState("10:00");
  const [newDriverSeats, setNewDriverSeats] = useState(4);
  const [newDriverPrice, setNewDriverPrice] = useState(1.50);

  // Form State - Passenger Creation
  const [newPassengerName, setNewPassengerName] = useState("");
  const [newPassengerPickup, setNewPassengerPickup] = useState("");
  const [newPassengerPickupCoord, setNewPassengerPickupCoord] = useState<Point | null>(null);
  const [newPassengerDrop, setNewPassengerDrop] = useState("");
  const [newPassengerDropCoord, setNewPassengerDropCoord] = useState<Point | null>(null);
  const [newPassengerTime, setNewPassengerTime] = useState("10:15");
  const [newPassengerSeats, setNewPassengerSeats] = useState(1);

  // Address Autocomplete UI
  const [startSuggestions, setStartSuggestions] = useState<GeocodeResult[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<GeocodeResult[]>([]);
  const [pickupSuggestions, setPickupSuggestions] = useState<GeocodeResult[]>([]);
  const [dropSuggestions, setDropSuggestions] = useState<GeocodeResult[]>([]);

  // Map coordinate placement state
  const [placementMode, setPlacementMode] = useState<"driver-start" | "driver-end" | "passenger-pickup" | "passenger-drop" | null>(null);

  // Modal drawers visibility
  const [showDriverDrawer, setShowDriverDrawer] = useState(false);
  const [showPassengerDrawer, setShowPassengerDrawer] = useState(false);

  // Ride Simulation State
  const [simulatingRideId, setSimulatingRideId] = useState<string | null>(null);
  const [simProgress, setSimProgress] = useState(0);
  const [simStatus, setSimStatus] = useState<"idle" | "matching" | "driving_to_pickup" | "otp_verification" | "driving_to_drop" | "completed">("idle");
  const [currentSimPosition, setCurrentSimPosition] = useState<Point | null>(null);
  const [simDetouredPolyline, setSimDetouredPolyline] = useState<Point[]>([]);
  const [pickupIndexInDetour, setPickupIndexInDetour] = useState<number>(-1);
  const [dropIndexInDetour, setDropIndexInDetour] = useState<number>(-1);
  
  // OTP Verification Simulation
  const [randomOTP, setRandomOTP] = useState("");
  const [enteredOTP, setEnteredOTP] = useState("");
  const [otpError, setOtpError] = useState(false);

  // Ref to hold intervals
  const simIntervalRef = useRef<number | null>(null);

  // Re-run match check whenever selections or config options change
  useEffect(() => {
    if (selectedDriver && selectedPassenger) {
      const details = matchRide(selectedDriver, selectedPassenger, {
        proximityThreshold,
        detourLimit,
        timeWindow,
      });
      setMatchDetails(details);
    } else {
      setMatchDetails(null);
    }
  }, [selectedDriver, selectedPassenger, proximityThreshold, detourLimit, timeWindow]);

  // Geocoding query triggers
  const handleAddressLookup = async (query: string, type: "driver-start" | "driver-end" | "passenger-pickup" | "passenger-drop") => {
    if (query.trim().length < 3) return;
    const results = await searchAddress(query, mapProvider === "google" && googleLoaded);
    if (type === "driver-start") setStartSuggestions(results);
    if (type === "driver-end") setEndSuggestions(results);
    if (type === "passenger-pickup") setPickupSuggestions(results);
    if (type === "passenger-drop") setDropSuggestions(results);
  };

  // Click on Map coordinates handler
  const handleMapClick = useCallback((latlng: Point) => {
    if (!placementMode) return;

    const formattedAddress = `Selected on Map (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;

    if (placementMode === "driver-start") {
      setNewDriverStart(formattedAddress);
      setNewDriverStartCoord(latlng);
      setShowDriverDrawer(true);
    } else if (placementMode === "driver-end") {
      setNewDriverEnd(formattedAddress);
      setNewDriverEndCoord(latlng);
      setShowDriverDrawer(true);
    } else if (placementMode === "passenger-pickup") {
      setNewPassengerPickup(formattedAddress);
      setNewPassengerPickupCoord(latlng);
      setShowPassengerDrawer(true);
    } else if (placementMode === "passenger-drop") {
      setNewPassengerDrop(formattedAddress);
      setNewPassengerDropCoord(latlng);
      setShowPassengerDrawer(true);
    }

    setPlacementMode(null); // Reset placement mode
  }, [placementMode]);

  // Create Driver
  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName || !newDriverStartCoord || !newDriverEndCoord) {
      alert("Please specify driver name and locations.");
      return;
    }

    // Fetch OSRM or Google route
    const routePoints = await fetchRoute(newDriverStartCoord, newDriverEndCoord, mapProvider === "google" && googleLoaded);
    
    const newDriver: Driver = {
      id: `drv_${Date.now()}`,
      name: newDriverName,
      startLocation: newDriverStart,
      endLocation: newDriverEnd,
      routePolyline: routePoints,
      departureTime: newDriverTime,
      availableSeats: newDriverSeats,
      totalSeats: newDriverSeats,
      pricePerKm: newDriverPrice,
    };

    setDrivers([newDriver, ...drivers]);
    setSelectedDriver(newDriver);
    
    // Reset Form
    setNewDriverName("");
    setNewDriverStart("");
    setNewDriverEnd("");
    setNewDriverStartCoord(null);
    setNewDriverEndCoord(null);
    
    setShowDriverDrawer(false);
  };

  // Create Passenger
  const handleCreatePassenger = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassengerName || !newPassengerPickupCoord || !newPassengerDropCoord) {
      alert("Please specify passenger name and coordinates.");
      return;
    }

    const newPassenger: Passenger = {
      id: `psg_${Date.now()}`,
      name: newPassengerName,
      pickup: newPassengerPickupCoord,
      pickupAddress: newPassengerPickup,
      drop: newPassengerDropCoord,
      dropAddress: newPassengerDrop,
      requestedTime: newPassengerTime,
      seatsNeeded: newPassengerSeats,
    };

    setPassengers([newPassenger, ...passengers]);
    setSelectedPassenger(newPassenger);

    // Reset Form
    setNewPassengerName("");
    setNewPassengerPickup("");
    setNewPassengerDrop("");
    setNewPassengerPickupCoord(null);
    setNewPassengerDropCoord(null);

    setShowPassengerDrawer(false);
  };

  // Compile full detoured route and start simulation loop
  const startSimulation = () => {
    if (!selectedDriver || !selectedPassenger || !matchDetails || !matchDetails.isMatched) return;

    // Build the detoured polyline points array
    const driverRoute = selectedDriver.routePolyline;
    const pickupProjIndex = matchDetails.pickupIndex;
    const dropProjIndex = matchDetails.dropIndex;
    const passengerPickup = selectedPassenger.pickup;
    const passengerDrop = selectedPassenger.drop;

    const points: Point[] = [];
    const pickupFloor = Math.floor(pickupProjIndex);
    const dropFloor = Math.floor(dropProjIndex);

    // Part 1: Start to pickup floor
    for (let i = 0; i <= pickupFloor; i++) {
      points.push(driverRoute[i]);
    }
    // Add passenger pickup
    const pickupIdx = points.length;
    points.push(passengerPickup);

    // Part 2: Pickup ceil to drop floor
    for (let i = Math.ceil(pickupProjIndex); i <= dropFloor; i++) {
      if (i >= 0 && i < driverRoute.length) {
        points.push(driverRoute[i]);
      }
    }
    // Add passenger drop
    const dropIdx = points.length;
    points.push(passengerDrop);

    // Part 3: Drop ceil to finish
    for (let i = Math.ceil(dropProjIndex); i < driverRoute.length; i++) {
      if (i >= 0) {
        points.push(driverRoute[i]);
      }
    }

    // Set simulation track state
    setSimDetouredPolyline(points);
    setPickupIndexInDetour(pickupIdx);
    setDropIndexInDetour(dropIdx);
    
    // Generate random 4-digit OTP
    const generatedOTP = Math.floor(1000 + Math.random() * 9000).toString();
    setRandomOTP(generatedOTP);
    setEnteredOTP("");
    setOtpError(false);

    setSimulatingRideId(`${selectedDriver.id}_${selectedPassenger.id}`);
    setSimProgress(0);
    setSimStatus("driving_to_pickup");
    setCurrentSimPosition(points[0]);
  };

  // Simulation tick logic
  useEffect(() => {
    if (simulatingRideId && simStatus !== "idle" && simStatus !== "otp_verification" && simStatus !== "completed") {
      simIntervalRef.current = window.setInterval(() => {
        setSimProgress((prev) => {
          const nextProgress = prev + 1; // Increment progress by 1% each tick
          
          if (nextProgress >= 100) {
            clearInterval(simIntervalRef.current!);
            setSimStatus("completed");
            setCurrentSimPosition(simDetouredPolyline[simDetouredPolyline.length - 1]);
            return 100;
          }

          // Compute float index in polyline
          const totalPoints = simDetouredPolyline.length;
          const currentFloatIndex = (nextProgress / 100) * (totalPoints - 1);
          const lowerIndex = Math.floor(currentFloatIndex);
          const upperIndex = Math.ceil(currentFloatIndex);
          const rem = currentFloatIndex - lowerIndex;

          const lat = simDetouredPolyline[lowerIndex].lat + rem * (simDetouredPolyline[upperIndex].lat - simDetouredPolyline[lowerIndex].lat);
          const lng = simDetouredPolyline[lowerIndex].lng + rem * (simDetouredPolyline[upperIndex].lng - simDetouredPolyline[lowerIndex].lng);
          setCurrentSimPosition({ lat, lng });

          // State check for Passenger Pickup (around pickupIndexInDetour)
          if (lowerIndex === pickupIndexInDetour - 1 && simStatus === "driving_to_pickup") {
            clearInterval(simIntervalRef.current!);
            setSimStatus("otp_verification");
          }

          // State check for Passenger Drop-off (around dropIndexInDetour)
          if (lowerIndex === dropIndexInDetour - 1 && simStatus === "driving_to_drop") {
            setSimStatus("driving_to_drop"); // Stay driving, we could show a drop toast
          }

          return nextProgress;
        });
      }, 250); // Speed: 250ms per step
    }

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [simulatingRideId, simStatus, simDetouredPolyline, pickupIndexInDetour, dropIndexInDetour]);

  // Handle OTP Submission
  const handleVerifyOTP = () => {
    if (enteredOTP === randomOTP) {
      setSimStatus("driving_to_drop");
      setOtpError(false);
    } else {
      setOtpError(true);
    }
  };

  const resetSimulation = () => {
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    setSimulatingRideId(null);
    setSimStatus("idle");
    setSimProgress(0);
    setCurrentSimPosition(null);
    setRandomOTP("");
    setEnteredOTP("");
  };

  return (
    <div className="app-container">
      {/* Sidebar Controls */}
      <div className="sidebar" style={{ position: "relative" }}>
        {/* Header Title */}
        <div className="sidebar-header">
          <Sparkles className="app-logo" size={24} />
          <h1>Antigravity Carpool Match</h1>
        </div>

        {/* Scrollable Feed Column */}
        <div className="sidebar-content" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Active Route Card */}
          <div className="card active-route-card" style={{ margin: 0 }}>
            <div className="card-title">
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Active Route</span>
              <span className="edit-link" onClick={() => {
                if (selectedPassenger) {
                  setShowPassengerDrawer(true);
                } else {
                  setShowDriverDrawer(true);
                }
              }} style={{ fontSize: "0.75rem", color: "var(--color-match)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                <Edit size={12} /> Edit
              </span>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "4px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-match)" }}></div>
                  <div style={{ width: "2px", height: "24px", backgroundColor: "var(--border-color)", margin: "4px 0" }}></div>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-driver)" }}></div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.02em" }}>Pickup</div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {selectedPassenger ? selectedPassenger.pickupAddress.split(",")[0] : "Select Passenger Pickup"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.02em" }}>Drop-off</div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {selectedPassenger ? selectedPassenger.dropAddress.split(",")[0] : "Select Passenger Drop-off"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats row with light blue highlights */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <div style={{ backgroundColor: "rgba(14, 165, 233, 0.08)", padding: "8px", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-match)" }}>
                  {matchDetails ? `${(matchDetails.originalRouteDistance / 1000).toFixed(1)} km` : "--"}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: "2px" }}>Distance</div>
              </div>
              <div style={{ backgroundColor: "rgba(99, 102, 241, 0.08)", padding: "8px", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-driver)" }}>
                  {selectedDriver ? `${selectedDriver.departureTime}` : "--"}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: "2px" }}>ETA</div>
              </div>
              <div style={{ backgroundColor: "rgba(16, 185, 129, 0.08)", padding: "8px", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-passenger)" }}>
                  {selectedDriver ? `${selectedDriver.availableSeats} seats` : "--"}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: "2px" }}>Available</div>
              </div>
            </div>
          </div>

          {/* Workflows side-by-side cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="card workflow-card" onClick={() => setShowDriverDrawer(true)} style={{ padding: "14px", cursor: "pointer", borderLeft: "4px solid var(--color-driver)", margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <div style={{ backgroundColor: "var(--color-driver-glow)", color: "var(--color-driver)", padding: "6px", borderRadius: "6px", display: "flex" }}>
                  <Users size={14} />
                </div>
                <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>Driver</span>
              </div>
              <p style={{ fontSize: "0.68rem", color: "var(--text-secondary)", lineHeight: "1.3" }}>
                Publish route, set seats & ETA via Google Routes API
              </p>
            </div>
            
            <div className="card workflow-card" onClick={() => setShowPassengerDrawer(true)} style={{ padding: "14px", cursor: "pointer", borderLeft: "4px solid var(--color-passenger)", margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <div style={{ backgroundColor: "var(--color-passenger-glow)", color: "var(--color-passenger)", padding: "6px", borderRadius: "6px", display: "flex" }}>
                  <User size={14} />
                </div>
                <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>Passenger</span>
              </div>
              <p style={{ fontSize: "0.68rem", color: "var(--text-secondary)", lineHeight: "1.3" }}>
                Enter stops — matched to nearby encoded polylines
              </p>
            </div>
          </div>

          {/* Route Matching Engine checklist */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <div style={{ backgroundColor: "rgba(14, 165, 233, 0.1)", color: "var(--color-match)", padding: "6px", borderRadius: "6px", display: "flex" }}>
                <Activity size={14} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700 }}>Route Matching Engine</h4>
                <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>PostGIS + Haversine proximity check</span>
              </div>
            </div>

            <div className="matching-criteria-list" style={{ gap: "12px" }}>
              {/* Checkpoint 1: Polyline decoding */}
              <div className="criteria-item" style={{ gap: "10px" }}>
                <div style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  backgroundColor: selectedDriver ? "var(--color-driver-glow)" : "var(--bg-secondary)",
                  color: selectedDriver ? "var(--color-driver)" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {selectedDriver ? "✓" : "1"}
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>Decode driver's encoded polyline into GPS coords</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "1px" }}>
                    {selectedDriver ? `Successfully parsed ${selectedDriver.routePolyline.length} coordinates` : "No active driver polyline loaded"}
                  </div>
                </div>
              </div>

              {/* Checkpoint 2: Min Proximity */}
              <div className="criteria-item" style={{ gap: "10px" }}>
                <div style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  backgroundColor: matchDetails && matchDetails.pickupDistance <= proximityThreshold && matchDetails.dropDistance <= proximityThreshold ? "var(--color-passenger-glow)" : matchDetails ? "rgba(239, 68, 68, 0.1)" : "var(--bg-secondary)",
                  color: matchDetails && matchDetails.pickupDistance <= proximityThreshold && matchDetails.dropDistance <= proximityThreshold ? "var(--color-success)" : matchDetails ? "var(--color-error)" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {matchDetails && matchDetails.pickupDistance <= proximityThreshold && matchDetails.dropDistance <= proximityThreshold ? "✓" : "2"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Min. distance from passenger stops to route line</span>
                    <span style={{ backgroundColor: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", padding: "1px 5px", borderRadius: "4px", fontSize: "0.6rem", fontWeight: 600 }}>
                      {proximityThreshold}m limit
                    </span>
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "1px" }}>
                    {matchDetails 
                      ? `Pickup: ${matchDetails.pickupDistance.toFixed(0)}m away | Drop-off: ${matchDetails.dropDistance.toFixed(0)}m away` 
                      : "Awaiting route selection validation"}
                  </div>
                </div>
              </div>

              {/* Checkpoint 3: Sequence check */}
              <div className="criteria-item" style={{ gap: "10px" }}>
                <div style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  backgroundColor: matchDetails && matchDetails.pickupIndex < matchDetails.dropIndex ? "var(--color-passenger-glow)" : matchDetails ? "rgba(239, 68, 68, 0.1)" : "var(--bg-secondary)",
                  color: matchDetails && matchDetails.pickupIndex < matchDetails.dropIndex ? "var(--color-success)" : matchDetails ? "var(--color-error)" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {matchDetails && matchDetails.pickupIndex < matchDetails.dropIndex ? "✓" : "3"}
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>Verify pickup occurs before drop-off on route</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "1px" }}>
                    {matchDetails 
                      ? (matchDetails.pickupIndex < matchDetails.dropIndex ? `Correct order (Pickup: index ${matchDetails.pickupIndex.toFixed(1)} < Drop: index ${matchDetails.dropIndex.toFixed(1)})` : "Reverse direction sequence mismatch") 
                      : "Awaiting route direction validation"}
                  </div>
                </div>
              </div>

              {/* Checkpoint 4: Capacity check */}
              <div className="criteria-item" style={{ gap: "10px" }}>
                <div style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  backgroundColor: matchDetails && matchDetails.isMatched ? "var(--color-passenger-glow)" : matchDetails ? "rgba(239, 68, 68, 0.1)" : "var(--bg-secondary)",
                  color: matchDetails && matchDetails.isMatched ? "var(--color-success)" : matchDetails ? "var(--color-error)" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {matchDetails && matchDetails.isMatched ? "✓" : "4"}
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>Confirm available seats, accept & notify driver</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "1px" }}>
                    {selectedDriver && selectedPassenger && matchDetails
                      ? (selectedDriver.availableSeats >= selectedPassenger.seatsNeeded 
                        ? `Capacity checks OK (${selectedPassenger.seatsNeeded} requested vs ${selectedDriver.availableSeats} available)` 
                        : "Insufficient seats available in driver's vehicle")
                      : "Awaiting driver passenger allocation checks"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Matched Passengers List */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Matched Passengers</span>
              <span style={{ fontSize: "0.65rem", backgroundColor: "rgba(99, 102, 241, 0.08)", color: "var(--color-driver)", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                {selectedDriver ? `${selectedDriver.totalSeats - selectedDriver.availableSeats} / ${selectedDriver.totalSeats} seats` : "0 / 4 seats"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {passengers.map((psg, idx) => {
                const isMatchedWithDriver = selectedDriver && matchRide(selectedDriver, psg, { proximityThreshold, detourLimit, timeWindow }).isMatched;
                const isSelected = selectedPassenger?.id === psg.id;
                
                // Assign a mock avatar index
                const avatarUrl = `https://randomuser.me/api/portraits/thumb/${idx % 2 === 0 ? 'women' : 'men'}/${10 + idx}.jpg`;

                return (
                  <div 
                    key={psg.id} 
                    onClick={() => setSelectedPassenger(psg)}
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      padding: "8px 12px", 
                      borderRadius: "8px", 
                      backgroundColor: isSelected ? "rgba(14, 165, 233, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: isSelected ? "1px solid var(--color-match)" : "1px solid var(--border-color)",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <img 
                        src={avatarUrl} 
                        alt={psg.name} 
                        style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }} 
                      />
                      <div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>{psg.name}</div>
                        <div style={{ fontSize: "0.62rem", color: "var(--text-secondary)" }}>
                          {psg.pickupAddress.split(",")[0].substring(0, 15)}... ➔ {psg.dropAddress.split(",")[0].substring(0, 15)}...
                        </div>
                      </div>
                    </div>
                    <div>
                      {isMatchedWithDriver ? (
                        <span style={{ fontSize: "0.65rem", backgroundColor: "rgba(16, 185, 129, 0.1)", color: "var(--color-success)", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                          Confirmed
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.65rem", backgroundColor: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                          Waiting
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Google Cloud APIs status grid */}
          <div className="card" style={{ padding: "16px 20px", margin: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <div style={{ backgroundColor: "rgba(99, 102, 241, 0.1)", color: "var(--color-driver)", padding: "6px", borderRadius: "6px", display: "flex" }}>
                <Layers size={14} />
              </div>
              <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Google Cloud APIs</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {[
                { name: "Maps SDK", active: mapProvider === "google" && googleLoaded },
                { name: "Places API", active: mapProvider === "google" && googleLoaded },
                { name: "Directions API", active: mapProvider === "google" && googleLoaded },
                { name: "Distance Matrix", active: mapProvider === "google" && googleLoaded },
                { name: "Geocoding API", active: mapProvider === "google" && googleLoaded },
                { name: "Routes API", active: mapProvider === "google" && googleLoaded }
              ].map((api, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "6px", 
                    padding: "8px 10px", 
                    borderRadius: "6px", 
                    backgroundColor: api.active ? "rgba(16, 185, 129, 0.08)" : "rgba(255, 255, 255, 0.03)",
                    border: api.active ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid var(--border-color)",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: api.active ? "var(--text-primary)" : "var(--text-secondary)"
                  }}
                >
                  <div style={{ 
                    width: "6px", 
                    height: "6px", 
                    borderRadius: "50%", 
                    backgroundColor: api.active ? "var(--color-success)" : "var(--text-muted)" 
                  }}></div>
                  {api.name}
                </div>
              ))}
            </div>
          </div>

          {/* Live Tracking Connection Status */}
          <div className="card" style={{ padding: "16px 20px", margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={14} style={{ color: "var(--color-match)" }} />
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>Live Tracking</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>WebSocket · Every 5-10 sec</div>
                </div>
              </div>
              <span style={{ fontSize: "0.65rem", backgroundColor: simulatingRideId ? "rgba(16, 185, 129, 0.1)" : "rgba(255, 255, 255, 0.08)", color: simulatingRideId ? "var(--color-success)" : "var(--text-muted)", padding: "2px 8px", borderRadius: "10px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: simulatingRideId ? "var(--color-success)" : "var(--text-muted)", display: "inline-block" }}></span>
                {simulatingRideId ? "ON" : "OFF"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <div style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700 }}>Firebase</div>
                <div style={{ fontSize: "0.58rem", color: "var(--text-muted)", marginTop: "2px" }}>Realtime DB</div>
              </div>
              <div style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700 }}>WebSocket</div>
                <div style={{ fontSize: "0.58rem", color: "var(--text-muted)", marginTop: "2px" }}>FastAPI</div>
              </div>
              <div style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700 }}>ETA</div>
                <div style={{ fontSize: "0.58rem", color: "var(--text-muted)", marginTop: "2px" }}>Updated Live</div>
              </div>
            </div>
          </div>

        </div>

        {/* Sticky Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-color)", background: "var(--bg-secondary)", display: "flex", gap: "12px", alignItems: "center", zIndex: 10, flexShrink: 0 }}>
          <button 
            className="btn-secondary" 
            onClick={() => setShowSettings(!showSettings)} 
            style={{ width: "48px", height: "48px", padding: 0, borderRadius: "12px", flexShrink: 0 }}
          >
            <Settings size={20} />
          </button>
          
          <button 
            className="btn-primary" 
            onClick={startSimulation}
            disabled={simulatingRideId !== null || !matchDetails || !matchDetails.isMatched}
            style={{ flex: 1, height: "48px" }}
          >
            <Play size={16} /> Start Route
          </button>
        </div>

        {/* Sliding Driver Drawer Overlay */}
        {showDriverDrawer && (
          <div className="drawer-overlay" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "var(--bg-secondary)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div className="sidebar-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Users className="app-logo" size={20} style={{ color: "var(--color-driver)" }} />
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Register a Ride Offer</h3>
              </div>
              <button 
                onClick={() => setShowDriverDrawer(false)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex" }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              <form onSubmit={handleCreateDriver} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div className="form-group">
                  <label className="form-label">Driver Name</label>
                  <div className="input-container">
                    <User className="input-icon" size={16} />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Rajesh Kumar"
                      value={newDriverName}
                      onChange={(e) => setNewDriverName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group" style={{ position: "relative" }}>
                  <label className="form-label">Start Location</label>
                  <div className="input-container">
                    <MapPin className="input-icon" size={16} style={{ color: "var(--color-driver)" }} />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Type address..."
                      value={newDriverStart}
                      onChange={(e) => {
                        setNewDriverStart(e.target.value);
                        handleAddressLookup(e.target.value, "driver-start");
                      }}
                      required
                    />
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      style={{ position: "absolute", right: 8, padding: "4px 8px", width: "auto" }}
                      onClick={() => {
                        setShowDriverDrawer(false); // hide drawer temporarily
                        setPlacementMode("driver-start");
                      }}
                    >
                      Pin
                    </button>
                  </div>
                  {startSuggestions.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {startSuggestions.map((item, idx) => (
                        <div 
                          key={idx} 
                          className="autocomplete-item"
                          onClick={() => {
                            setNewDriverStart(item.display_name);
                            setNewDriverStartCoord({ lat: item.lat, lng: item.lng });
                            setStartSuggestions([]);
                          }}
                        >
                          {item.display_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ position: "relative" }}>
                  <label className="form-label">End Destination</label>
                  <div className="input-container">
                    <MapPin className="input-icon" size={16} style={{ color: "var(--color-driver)" }} />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Type destination..."
                      value={newDriverEnd}
                      onChange={(e) => {
                        setNewDriverEnd(e.target.value);
                        handleAddressLookup(e.target.value, "driver-end");
                      }}
                      required
                    />
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      style={{ position: "absolute", right: 8, padding: "4px 8px", width: "auto" }}
                      onClick={() => {
                        setShowDriverDrawer(false); // hide drawer temporarily
                        setPlacementMode("driver-end");
                      }}
                    >
                      Pin
                    </button>
                  </div>
                  {endSuggestions.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {endSuggestions.map((item, idx) => (
                        <div 
                          key={idx} 
                          className="autocomplete-item"
                          onClick={() => {
                            setNewDriverEnd(item.display_name);
                            setNewDriverEndCoord({ lat: item.lat, lng: item.lng });
                            setEndSuggestions([]);
                          }}
                        >
                          {item.display_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Departure Time</label>
                    <div className="input-container">
                      <Clock className="input-icon" size={16} />
                      <input 
                        type="time" 
                        className="form-input"
                        value={newDriverTime}
                        onChange={(e) => setNewDriverTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Available Seats</label>
                    <div className="input-container">
                      <Users className="input-icon" size={16} />
                      <input 
                        type="number" 
                        min="1" 
                        max="8" 
                        className="form-input"
                        value={newDriverSeats}
                        onChange={(e) => setNewDriverSeats(parseInt(e.target.value) || 4)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Price per Km ($)</label>
                  <div className="input-container">
                    <DollarSign className="input-icon" size={16} />
                    <input 
                      type="number" 
                      min="0.5" 
                      max="50" 
                      step="0.1" 
                      className="form-input"
                      value={newDriverPrice}
                      onChange={(e) => setNewDriverPrice(parseFloat(e.target.value) || 15.00)}
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: "10px" }}>
                  <Plus size={16} /> Publish Ride Offer
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Sliding Passenger Drawer Overlay */}
        {showPassengerDrawer && (
          <div className="drawer-overlay" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "var(--bg-secondary)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div className="sidebar-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <User className="app-logo" size={20} style={{ color: "var(--color-passenger)" }} />
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Request a Carpool Ride</h3>
              </div>
              <button 
                onClick={() => setShowPassengerDrawer(false)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex" }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              <form onSubmit={handleCreatePassenger} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div className="form-group">
                  <label className="form-label">Passenger Name</label>
                  <div className="input-container">
                    <User className="input-icon" size={16} />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Rahul Verma"
                      value={newPassengerName}
                      onChange={(e) => setNewPassengerName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group" style={{ position: "relative" }}>
                  <label className="form-label">Pickup Address</label>
                  <div className="input-container">
                    <MapPin className="input-icon" size={16} style={{ color: "var(--color-passenger)" }} />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Type pickup address..."
                      value={newPassengerPickup}
                      onChange={(e) => {
                        setNewPassengerPickup(e.target.value);
                        handleAddressLookup(e.target.value, "passenger-pickup");
                      }}
                      required
                    />
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      style={{ position: "absolute", right: 8, padding: "4px 8px", width: "auto" }}
                      onClick={() => {
                        setShowPassengerDrawer(false); // hide drawer temporarily
                        setPlacementMode("passenger-pickup");
                      }}
                    >
                      Pin
                    </button>
                  </div>
                  {pickupSuggestions.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {pickupSuggestions.map((item, idx) => (
                        <div 
                          key={idx} 
                          className="autocomplete-item"
                          onClick={() => {
                            setNewPassengerPickup(item.display_name);
                            setNewPassengerPickupCoord({ lat: item.lat, lng: item.lng });
                            setPickupSuggestions([]);
                          }}
                        >
                          {item.display_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ position: "relative" }}>
                  <label className="form-label">Drop-off Destination</label>
                  <div className="input-container">
                    <MapPin className="input-icon" size={16} style={{ color: "var(--color-passenger)" }} />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Type drop-off address..."
                      value={newPassengerDrop}
                      onChange={(e) => {
                        setNewPassengerDrop(e.target.value);
                        handleAddressLookup(e.target.value, "passenger-drop");
                      }}
                      required
                    />
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      style={{ position: "absolute", right: 8, padding: "4px 8px", width: "auto" }}
                      onClick={() => {
                        setShowPassengerDrawer(false); // hide drawer temporarily
                        setPlacementMode("passenger-drop");
                      }}
                    >
                      Pin
                    </button>
                  </div>
                  {dropSuggestions.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {dropSuggestions.map((item, idx) => (
                        <div 
                          key={idx} 
                          className="autocomplete-item"
                          onClick={() => {
                            setNewPassengerDrop(item.display_name);
                            setNewPassengerDropCoord({ lat: item.lat, lng: item.lng });
                            setDropSuggestions([]);
                          }}
                        >
                          {item.display_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Requested Time</label>
                    <div className="input-container">
                      <Clock className="input-icon" size={16} />
                      <input 
                        type="time" 
                        className="form-input"
                        value={newPassengerTime}
                        onChange={(e) => setNewPassengerTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Seats Needed</label>
                    <div className="input-container">
                      <Users className="input-icon" size={16} />
                      <input 
                        type="number" 
                        min="1" 
                        max="4" 
                        className="form-input"
                        value={newPassengerSeats}
                        onChange={(e) => setNewPassengerSeats(parseInt(e.target.value) || 1)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: "10px", background: "linear-gradient(135deg, var(--color-passenger) 0%, #059669 100%)", boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)" }}>
                  <Plus size={16} /> Request Route Match
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Map Backing */}
      <MapContainer 
        drivers={drivers}
        passengers={passengers}
        selectedDriver={selectedDriver}
        selectedPassenger={selectedPassenger}
        matchDetails={matchDetails}
        placementMode={placementMode}
        onMapClick={handleMapClick}
        simulatingRideId={simulatingRideId}
        simProgress={simProgress}
        simStatus={simStatus}
        currentSimPosition={currentSimPosition}
        mapProvider={mapProvider}
        googleLoaded={googleLoaded}
      />

      {/* Floating Settings Button */}
      <button 
        className="floating-settings-btn"
        onClick={() => setShowSettings(!showSettings)}
      >
        <Settings size={20} />
      </button>

      {/* Settings Dialog Overlay */}
      {showSettings && (
        <div className="settings-overlay">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
            <Sliders size={18} style={{ color: "var(--color-match)" }} />
            <h4 style={{ margin: 0, fontWeight: 700 }}>Matching Parameters</h4>
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span>Proximity Threshold</span>
              <span>{proximityThreshold}m</span>
            </div>
            <input 
              type="range" 
              min="100" 
              max="1500" 
              step="50" 
              className="slider-input"
              value={proximityThreshold}
              onChange={(e) => setProximityThreshold(parseInt(e.target.value))}
            />
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
              Max walking/driving distance from original route path
            </span>
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span>Max Detour Limit</span>
              <span>{(detourLimit / 1000).toFixed(1)} km</span>
            </div>
            <input 
              type="range" 
              min="500" 
              max="10000" 
              step="500" 
              className="slider-input"
              value={detourLimit}
              onChange={(e) => setDetourLimit(parseInt(e.target.value))}
            />
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
              Total extra route distance driver is willing to add
            </span>
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span>Departure Time Window</span>
              <span>{timeWindow} mins</span>
            </div>
            <input 
              type="range" 
              min="10" 
              max="120" 
              step="5" 
              className="slider-input"
              value={timeWindow}
              onChange={(e) => setTimeWindow(parseInt(e.target.value))}
            />
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
              Acceptable difference in scheduled pickup times
            </span>
          </div>

          <hr style={{ border: "0", height: "1px", background: "var(--border-color)", margin: "14px 0" }} />

          <div className="form-group" style={{ marginBottom: "14px" }}>
            <label className="form-label" style={{ fontSize: "0.7rem" }}>Map Provider</label>
            <select 
              className="form-input" 
              style={{ padding: "8px 12px", background: "var(--bg-tertiary)" }}
              value={mapProvider}
              onChange={(e) => setMapProvider(e.target.value as "osm" | "google")}
            >
              <option value="osm">OpenStreetMap (Free)</option>
              <option value="google">Google Maps Platform</option>
            </select>
          </div>

          {mapProvider === "google" && (
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label className="form-label" style={{ fontSize: "0.7rem" }}>Google API Key</label>
              <input 
                type="text" 
                className="form-input" 
                style={{ padding: "8px 12px" }}
                placeholder="AIzaSy..."
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
              />
              {googleLoaded ? (
                <span style={{ fontSize: "0.65rem", color: "var(--color-success)", display: "block", marginTop: "4px" }}>
                  ✓ Google SDK Loaded Successfully
                </span>
              ) : (
                <span style={{ fontSize: "0.65rem", color: "var(--color-warning)", display: "block", marginTop: "4px" }}>
                  ⚠ Awaiting API Key validation
                </span>
              )}
            </div>
          )}

          <button className="btn-secondary" style={{ marginTop: "8px" }} onClick={() => setShowSettings(false)}>
            Close
          </button>
        </div>
      )}

      {/* Ride Simulation Progress HUD */}
      {simulatingRideId && selectedDriver && selectedPassenger && (
        <div className="simulation-panel">
          <div className="sim-header">
            <div className="sim-title">
              <div className="sim-status-dot" style={{ backgroundColor: simStatus === "completed" ? "var(--color-success)" : "var(--color-match)" }}></div>
              <span className="sim-status-text">
                {simStatus === "driving_to_pickup" && "En Route to Pickup"}
                {simStatus === "otp_verification" && "Awaiting OTP Verification"}
                {simStatus === "driving_to_drop" && "Passenger Picked Up - Heading to Drop-off"}
                {simStatus === "completed" && "Trip Completed Successfully"}
              </span>
            </div>
            <div className="sim-controls">
              <button className="sim-btn sim-btn-reset" onClick={resetSimulation}>
                <RotateCcw size={12} style={{ marginRight: 4 }} /> Terminate Simulation
              </button>
            </div>
          </div>

          <div className="sim-progress-bar-container">
            <div className="sim-progress-bar" style={{ width: `${simProgress}%` }}></div>
          </div>

          <div className="sim-stats">
            <div className="sim-stat-box">
              <span className="sim-stat-label">Driver / Car</span>
              <div className="sim-stat-value">{selectedDriver.name}</div>
            </div>
            <div className="sim-stat-box">
              <span className="sim-stat-label">Passenger</span>
              <div className="sim-stat-value">{selectedPassenger.name}</div>
            </div>
            <div className="sim-stat-box">
              <span className="sim-stat-label">Fare Split Payment</span>
              <div className="sim-stat-value" style={{ color: "var(--color-passenger)" }}>
                ${matchDetails?.estimatedFare.toFixed(2)}
              </div>
            </div>
            <div className="sim-stat-box">
              <span className="sim-stat-label">Trip Progress</span>
              <div className="sim-stat-value">{simProgress}%</div>
            </div>
          </div>
        </div>
      )}

      {/* OTP verification popup */}
      {simStatus === "otp_verification" && selectedPassenger && (
        <div className="otp-modal">
          <div className="otp-title">OTP Pickup Verification</div>
          <p className="otp-subtitle">
            Provide the passenger's matching OTP to confirm pickup.
            <br />
            <strong style={{ color: "var(--color-passenger)", fontSize: "0.95rem" }}>
              Passenger's App OTP: {randomOTP}
            </strong>
          </p>
          <div className="otp-boxes">
            <input 
              type="text" 
              maxLength={4}
              className="otp-box"
              style={{ width: "100%", letterSpacing: "8px", paddingLeft: "10px" }}
              placeholder="••••"
              value={enteredOTP}
              onChange={(e) => {
                setEnteredOTP(e.target.value);
                setOtpError(false);
              }}
            />
          </div>
          {otpError && (
            <p style={{ color: "var(--color-error)", fontSize: "0.75rem", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <AlertTriangle size={12} /> Incorrect OTP. Try again.
            </p>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn-primary" onClick={handleVerifyOTP} style={{ flex: 1 }}>
              Verify OTP
            </button>
            <button className="btn-secondary" onClick={resetSimulation}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
