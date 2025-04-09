import React, { useEffect, useState, useRef } from "react";
import { View, TextInput, StyleSheet, Dimensions, Text } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";

const { width, height } = Dimensions.get("window");

export default function HomeScreen() {
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
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Permission denied");
        return;
      }

      const currentLoc = await Location.getCurrentPositionAsync({});
      setLocation(currentLoc.coords);

      locationWatcher.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (loc) => {
          const currentCoords = loc.coords;
          setLocation(currentCoords);

          if (destination) {
            getRoute(currentCoords, destination);
          }

          // Step tracking
          if (steps.length > 0) {
            const closestStep = findClosestStep(currentCoords, steps, currentStepIndex);
            if (closestStep.index !== currentStepIndex) {
              setCurrentStepIndex(closestStep.index);
              setInstruction(closestStep.step.maneuver.instruction);
            }
          }
        }
      );
    })();

    return () => {
      if (locationWatcher.current) {
        locationWatcher.current.remove();
      }
    };
  }, [destination, steps]);

  const handleSearch = async () => {
    try {
      const response = await axios.get("https://nominatim.openstreetmap.org/search", {
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
      setDistance((route.distance / 1000).toFixed(2)); // in km

      const stepsData = route.legs[0].steps;
      console.log("stepsData",stepsData);
      setSteps(stepsData);
      setCurrentStepIndex(0);
      if (stepsData.length > 0) {
       console.log("yes",stepsData[1].maneuver.type);
        setInstruction(stepsData[6].maneuver.modifier);
      }
    } catch (err) {
      console.log("Routing error", err);
    }
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
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // in meters
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
    if (dist < closest.dist && dist < 30) { // 30 meters threshold
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