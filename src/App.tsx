import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Plus, 
  MapPin, 
  Clock, 
  Users, 
  Navigation, 
  Settings, 
  Sliders, 
  User, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  DollarSign
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

  // Tab Navigation: 'drivers' | 'passengers' | 'matches'
  const [activeTab, setActiveTab] = useState<"drivers" | "passengers" | "matches">("matches");

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
    } else if (placementMode === "driver-end") {
      setNewDriverEnd(formattedAddress);
      setNewDriverEndCoord(latlng);
    } else if (placementMode === "passenger-pickup") {
      setNewPassengerPickup(formattedAddress);
      setNewPassengerPickupCoord(latlng);
    } else if (placementMode === "passenger-drop") {
      setNewPassengerDrop(formattedAddress);
      setNewPassengerDropCoord(latlng);
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
    
    setActiveTab("matches");
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

    setActiveTab("matches");
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
      <div className="sidebar">
        {/* Header Title */}
        <div className="sidebar-header">
          <Sparkles className="app-logo" size={24} />
          <h1>Antigravity Carpool Match</h1>
        </div>

        {/* Tab Selection */}
        <div className="sidebar-tabs">
          <button 
            className={`tab-btn driver ${activeTab === "drivers" ? "active" : ""}`}
            onClick={() => setActiveTab("drivers")}
          >
            <Users size={16} /> Drivers
          </button>
          <button 
            className={`tab-btn passenger ${activeTab === "passengers" ? "active" : ""}`}
            onClick={() => setActiveTab("passengers")}
          >
            <User size={16} /> Passengers
          </button>
          <button 
            className={`tab-btn matches ${activeTab === "matches" ? "active" : ""}`}
            onClick={() => setActiveTab("matches")}
          >
            <Navigation size={16} /> Matching Engine
          </button>
        </div>

        {/* Sidebar Tabs Content */}
        <div className="sidebar-content">
          
          {/* DRIVER PANEL */}
          {activeTab === "drivers" && (
            <div>
              <h3 style={{ fontSize: "1rem", marginBottom: "16px" }}>Register a Ride Offer</h3>
              
              <form onSubmit={handleCreateDriver} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div className="form-group">
                  <label className="form-label">Driver Name</label>
                  <div className="input-container">
                    <User className="input-icon" size={16} />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. John Doe"
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
                      onClick={() => setPlacementMode("driver-start")}
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
                      onClick={() => setPlacementMode("driver-end")}
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
                    <label className="form-label">Departure</label>
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
                    <label className="form-label">Seats</label>
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
                      max="10" 
                      step="0.1" 
                      className="form-input"
                      value={newDriverPrice}
                      onChange={(e) => setNewDriverPrice(parseFloat(e.target.value) || 1.50)}
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary">
                  <Plus size={16} /> Publish Ride Offer
                </button>
              </form>

              <hr style={{ border: "0", height: "1px", background: "var(--border-color)", margin: "24px 0" }} />

              <h4 style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "12px" }}>Active Drivers</h4>
              {drivers.length === 0 ? (
                <div className="empty-state">No drivers registered yet.</div>
              ) : (
                drivers.map((drv) => (
                  <div 
                    key={drv.id} 
                    className={`card ${selectedDriver?.id === drv.id ? "selected" : ""}`}
                    onClick={() => setSelectedDriver(drv)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="card-title">
                      <span>{drv.name}</span>
                      <span className="tag tag-driver">Driver</span>
                    </div>
                    <div className="card-meta">
                      <div className="meta-row">
                        <MapPin size={12} style={{ color: "var(--color-driver)" }} />
                        <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {drv.startLocation.split(",")[0]} ➔ {drv.endLocation.split(",")[0]}
                        </span>
                      </div>
                      <div className="form-row" style={{ marginTop: "4px" }}>
                        <div className="meta-row"><Clock size={12} /> {drv.departureTime}</div>
                        <div className="meta-row"><Users size={12} /> {drv.availableSeats} / {drv.totalSeats} seats</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* PASSENGER PANEL */}
          {activeTab === "passengers" && (
            <div>
              <h3 style={{ fontSize: "1rem", marginBottom: "16px" }}>Request a Carpool Ride</h3>
              
              <form onSubmit={handleCreatePassenger} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div className="form-group">
                  <label className="form-label">Passenger Name</label>
                  <div className="input-container">
                    <User className="input-icon" size={16} />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Alice Smith"
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
                      onClick={() => setPlacementMode("passenger-pickup")}
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
                      onClick={() => setPlacementMode("passenger-drop")}
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

                <button type="submit" className="btn-primary" style={{ background: "linear-gradient(135deg, var(--color-passenger) 0%, #059669 100%)", boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)" }}>
                  <Plus size={16} /> Request Route Match
                </button>
              </form>

              <hr style={{ border: "0", height: "1px", background: "var(--border-color)", margin: "24px 0" }} />

              <h4 style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "12px" }}>Active Requests</h4>
              {passengers.length === 0 ? (
                <div className="empty-state">No requests registered yet.</div>
              ) : (
                passengers.map((psg) => (
                  <div 
                    key={psg.id} 
                    className={`card ${selectedPassenger?.id === psg.id ? "selected" : ""}`}
                    onClick={() => setSelectedPassenger(psg)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="card-title">
                      <span>{psg.name}</span>
                      <span className="tag tag-passenger">Passenger</span>
                    </div>
                    <div className="card-meta">
                      <div className="meta-row">
                        <MapPin size={12} style={{ color: "var(--color-passenger)" }} />
                        <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {psg.pickupAddress.split(",")[0]} ➔ {psg.dropAddress.split(",")[0]}
                        </span>
                      </div>
                      <div className="form-row" style={{ marginTop: "4px" }}>
                        <div className="meta-row"><Clock size={12} /> {psg.requestedTime}</div>
                        <div className="meta-row"><Users size={12} /> {psg.seatsNeeded} seats</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* MATCHING ENGINE DASHBOARD */}
          {activeTab === "matches" && (
            <div>
              <h3 style={{ fontSize: "1rem", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Navigation size={18} style={{ color: "var(--color-match)" }} /> Route Matching Scorecard
              </h3>

              {!selectedDriver || !selectedPassenger ? (
                <div className="empty-state">
                  <AlertTriangle size={24} style={{ color: "var(--color-warning)" }} />
                  <p>Select both a Driver and a Passenger to run spatial checks.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Driver Card Summary */}
                  <div style={{ background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Selected Driver</div>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", marginTop: "2px" }}>{selectedDriver.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Route: {selectedDriver.startLocation.split(",")[0]} ➔ {selectedDriver.endLocation.split(",")[0]}
                    </div>
                  </div>

                  {/* Passenger Card Summary */}
                  <div style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Selected Passenger</div>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", marginTop: "2px" }}>{selectedPassenger.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Ride: {selectedPassenger.pickupAddress.split(",")[0]} ➔ {selectedPassenger.dropAddress.split(",")[0]}
                    </div>
                  </div>

                  {/* Criteria Results */}
                  {matchDetails && (
                    <div className="card" style={{ padding: "20px", borderColor: matchDetails.isMatched ? "var(--color-success)" : "var(--color-error)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                        {matchDetails.isMatched ? (
                          <CheckCircle size={28} style={{ color: "var(--color-success)" }} />
                        ) : (
                          <XCircle size={28} style={{ color: "var(--color-error)" }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>
                            {matchDetails.isMatched ? "Match Eligible!" : "Not Eligible"}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            Spatial & Temporal evaluation checks
                          </div>
                        </div>
                      </div>

                      <div className="matching-criteria-list">
                        {/* 1. Pickup Proximity */}
                        <div className="criteria-item">
                          {matchDetails.pickupDistance <= proximityThreshold ? (
                            <CheckCircle className="criteria-icon success" size={14} />
                          ) : (
                            <XCircle className="criteria-icon error" size={14} />
                          )}
                          <div>
                            <strong>Pickup Proximity:</strong> {(matchDetails.pickupDistance).toFixed(0)}m from route 
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", display: "block" }}>
                              Threshold limit: {proximityThreshold}m
                            </span>
                          </div>
                        </div>

                        {/* 2. Drop Proximity */}
                        <div className="criteria-item">
                          {matchDetails.dropDistance <= proximityThreshold ? (
                            <CheckCircle className="criteria-icon success" size={14} />
                          ) : (
                            <XCircle className="criteria-icon error" size={14} />
                          )}
                          <div>
                            <strong>Drop-off Proximity:</strong> {(matchDetails.dropDistance).toFixed(0)}m from route 
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", display: "block" }}>
                              Threshold limit: {proximityThreshold}m
                            </span>
                          </div>
                        </div>

                        {/* 3. Sequence Check */}
                        <div className="criteria-item">
                          {matchDetails.pickupIndex < matchDetails.dropIndex ? (
                            <CheckCircle className="criteria-icon success" size={14} />
                          ) : (
                            <XCircle className="criteria-icon error" size={14} />
                          )}
                          <div>
                            <strong>Sequence Order:</strong> {matchDetails.pickupIndex < matchDetails.dropIndex ? "Pickup before Drop (PASS)" : "Pickup after Drop (FAIL)"}
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", display: "block" }}>
                              Pickup Index: {matchDetails.pickupIndex.toFixed(2)} | Drop Index: {matchDetails.dropIndex.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* 4. Time Check */}
                        <div className="criteria-item">
                          {Math.abs(selectedDriver.departureTime.localeCompare(selectedPassenger.requestedTime)) <= 100 ? ( // Simple text check, matchRide does precise min diff
                            <CheckCircle className="criteria-icon success" size={14} />
                          ) : (
                            <XCircle className="criteria-icon error" size={14} />
                          )}
                          <div>
                            <strong>Departure window:</strong> {selectedDriver.departureTime} (drv) vs {selectedPassenger.requestedTime} (psg)
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", display: "block" }}>
                              Time limit window: +/- {timeWindow} mins
                            </span>
                          </div>
                        </div>

                        {/* 5. Seats Check */}
                        <div className="criteria-item">
                          {selectedDriver.availableSeats >= selectedPassenger.seatsNeeded ? (
                            <CheckCircle className="criteria-icon success" size={14} />
                          ) : (
                            <XCircle className="criteria-icon error" size={14} />
                          )}
                          <div>
                            <strong>Seats:</strong> Needs {selectedPassenger.seatsNeeded}, Available {selectedDriver.availableSeats}
                          </div>
                        </div>

                        {/* 6. Detour limit */}
                        <div className="criteria-item">
                          {matchDetails.detourDistance <= detourLimit ? (
                            <CheckCircle className="criteria-icon success" size={14} />
                          ) : (
                            <XCircle className="criteria-icon error" size={14} />
                          )}
                          <div>
                            <strong>Detour Overhead:</strong> {(matchDetails.detourDistance / 1000).toFixed(2)} km
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", display: "block" }}>
                              Max detour limit: {(detourLimit / 1000).toFixed(1)} km
                            </span>
                          </div>
                        </div>
                      </div>

                      {matchDetails.isMatched && (
                        <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-color)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                            <div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Passenger Est. Fare</div>
                              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-passenger)", display: "flex", alignItems: "center" }}>
                                <DollarSign size={20} />{matchDetails.estimatedFare.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textAlign: "right" }}>Driver Route length</div>
                              <div style={{ fontSize: "1.1rem", fontWeight: 700, textAlign: "right" }}>
                                {(matchDetails.originalRouteDistance / 1000).toFixed(1)} km
                              </div>
                            </div>
                          </div>

                          <button 
                            className="btn-primary"
                            onClick={startSimulation}
                            disabled={simulatingRideId !== null}
                          >
                            <Play size={16} /> Simulate Carpool Trip
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
