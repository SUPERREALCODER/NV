import React, { useEffect, useState, useRef } from "react";
import { View, TextInput, StyleSheet, Dimensions, Text, PermissionsAndroid, Platform } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";
import RNBluetoothClassic from 'react-native-bluetooth-classic';

const { width, height } = Dimensions.get("window");

export default function HomeScreen() {
  const [hc05Connection, setHc05Connection] = useState(null);
  const [location, setLocation] = useState(null);
  const [destination, setDestination] = useState(null);
  const [search, setSearch] = useState("");
  const [routeCoords, setRouteCoords] = useState([]);
  const [distance, setDistance] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [steps, setSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const mapRef = useRef(null);
  const locationWatcher = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        console.log("🔄 Starting setup...");

        // 🟦 Request Bluetooth permissions
        const btPermsGranted = await requestBluetoothPermissions();
        console.log("🔋 Bluetooth permissions granted:", btPermsGranted);
        if (!btPermsGranted) {
          console.log("❌ Bluetooth permissions denied");
          return;
        }

        // 🔍 Find HC-05
        const devices = await RNBluetoothClassic.getBondedDevices();
        console.log("📱 Paired Bluetooth devices:", devices.map(d => d.name));
        const hc05 = devices.find(d => d.name === 'HC-05' || d.name.includes('HC'));

        if (hc05) {
          try {
            const connected = await hc05.connect();
            if (connected) {
              console.log("✅ Connected to HC-05");
              setHc05Connection(hc05);
            }
          } catch (err) {
            console.error("❌ HC-05 connection error:", err);
          }
        } else {
          console.warn("⚠️ HC-05 not found in paired devices");
        }

        // 🟨 Location Permissions
        const { status } = await Location.requestForegroundPermissionsAsync();
        console.log("📍 Location permission status:", status);

        if (status !== "granted") {
          console.log("❌ Location permission denied");
          return;
        }

        // 🌍 Get current location
        try {
          const currentLoc = await Location.getCurrentPositionAsync({});
          console.log("📍 Initial current location:", currentLoc);
          setLocation(currentLoc.coords);
        } catch (locErr) {
          console.error("❌ Failed to get current location:", locErr);
          return;
        }

        // 🛰️ Start watching location
        locationWatcher.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Highest,
            timeInterval: 2000,
            distanceInterval: 5,
          },
          (loc) => {
            if (!loc || !loc.coords) {
              console.warn("⚠️ Received invalid location update:", loc);
              return;
            }

            console.log("📡 Location updated:", loc.coords);
            const currentCoords = loc.coords;
            setLocation(currentCoords);

            // 🔁 Update route if destination is set
            if (destination) {
              console.log("🧭 Destination exists, updating route...");
              getRoute(currentCoords, destination);
            }

            // 📌 Step tracking
            if (steps.length > 0) {
              const closestStep = findClosestStep(currentCoords, steps, currentStepIndex);
              if (closestStep.index !== currentStepIndex) {
                console.log("➡️ Step changed:", closestStep.step.maneuver.instruction);
                setCurrentStepIndex(closestStep.index);
                setInstruction(closestStep.step.maneuver.instruction);
                sendToHC05(distance, closestStep.step.maneuver.instruction);
              }
            }
          }
        );
      } catch (globalErr) {
        console.error("💥 Error in setup:", globalErr);
      }
    })();

    return () => {
      if (locationWatcher.current) {
        console.log("🛑 Cleaning up location watcher");
        locationWatcher.current.remove();
      }
    };
  }, [destination, steps]);


  const handleSearch = async () => {
    try {
      const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
        params: {
          q: search,
          format: 'json',
          addressdetails: 1,
          limit: 1,
        },
        headers: {
          'User-Agent': 'GeoSearchApp/1.0 (debabratag542@gmail.com)',
          'Accept-Language': 'en',
        },
      });

      if (response.data.length > 0) {
        const { lat, lon } = response.data[0];
        const dest = {
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
        };
        setDestination(dest);
        getRoute(location, dest);
      }
    } catch (error) {
      console.error("Search error:", error);
    }
  };

  const getRoute = async (start, end) => {
    try {
      const res = await axios.get(
        `http://router.project-osrm.org/route/v1/foot/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`
      );

      const route = res.data.routes[0];
      const coords = route.geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));

      setRouteCoords(coords);
      setDistance((route.distance / 1000).toFixed(2));

      const stepsData = route.legs[0].steps;
      console.log("stepsData", stepsData);
      setSteps(stepsData);
      setCurrentStepIndex(0);
      if (stepsData.length > 0) {
        setInstruction(stepsData[0].maneuver.instruction);
      }
    } catch (err) {
      console.log("Routing error", err);
    }
  };

  const sendToHC05 = async (distance, instruction) => {
    if (!hc05Connection) return;

    const message = `D:${distance}km | Dir:${instruction}\n`;
    try {
      await hc05Connection.write(message);
      console.log("📤 Sent to HC-05:", message);
    } catch (err) {
      console.error("❌ Failed to send to HC-05:", err);
    }
  };

  const requestBluetoothPermissions = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const allGranted = Object.values(granted).every(
        (p) => p === PermissionsAndroid.RESULTS.GRANTED
      );
      return allGranted;
    }
    return true;
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchBar}
        placeholder="Search location"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={handleSearch}
      />

      {location && (
        <MapView
          ref={mapRef}
          style={styles.map}
          region={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation
          followsUserLocation
        >
          {destination && <Marker coordinate={destination} title="Destination" />}
          {routeCoords.length > 0 && (
            <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="blue" />
          )}
        </MapView>
      )}

      {distance && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>🛣️ Distance: {distance} km</Text>
          <Text style={styles.infoText}>🧭 Direction: {instruction}</Text>
        </View>
      )}
    </View>
  );
}

// ======== UTILS ========
function getDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000;
}

function findClosestStep(currentCoords, steps, fromIndex = 0) {
  let closest = { index: fromIndex, step: steps[fromIndex], dist: Infinity };

  for (let i = fromIndex; i < steps.length; i++) {
    const { maneuver } = steps[i];
    const dist = getDistance(
      currentCoords.latitude,
      currentCoords.longitude,
      maneuver.location[1],
      maneuver.location[0]
    );
    if (dist < closest.dist && dist < 30) {
      closest = { index: i, step: steps[i], dist };
    }
  }

  return closest;
}

// ======== STYLES ========
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    position: "absolute",
    top: 50,
    left: 10,
    right: 10,
    zIndex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    elevation: 5,
  },
  map: {
    width: width,
    height: height,
  },
  infoBox: {
    position: "absolute",
    bottom: 30,
    left: 10,
    right: 10,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 10,
    elevation: 4,
  },
  infoText: {
    fontSize: 16,
    marginBottom: 4,
  },
});