import React, { useEffect, useState, useRef } from "react";
import { View, TextInput, StyleSheet, Dimensions } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";

const { width, height } = Dimensions.get("window");

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [destination, setDestination] = useState(null);
  const [search, setSearch] = useState("");
  const [routeCoords, setRouteCoords] = useState([]);

  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Permission denied");
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    })();
  }, []);

  const handleSearch = async () => {
    try {
       const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
            params: {
              q: search,
              format: 'json',
              addressdetails: 1,
              limit: 5
            },
            headers: {
              'User-Agent': 'GeoSearchApp/1.0 (debabratag542@gmail.com)',
              'Accept-Language': 'en'
            }
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
        `http://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`
      );
      const coords = res.data.routes[0].geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));
      setRouteCoords(coords);
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
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          <Marker coordinate={location} title="You are here" />
          {destination && <Marker coordinate={destination} title="Destination" />}
          {routeCoords.length > 0 && (
            <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="blue" />
          )}
        </MapView>
      )}
    </View>
  );
}

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
});
