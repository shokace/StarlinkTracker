import { useEffect, useState } from "react";

const COARSE_STEP_DEGREES = 0.5;

function roundToCoarseDegrees(value) {
  return Math.round(value / COARSE_STEP_DEGREES) * COARSE_STEP_DEGREES;
}

function toApproximateLocation(position) {
  const latitudeDeg = roundToCoarseDegrees(position.coords.latitude);
  const longitudeDeg = roundToCoarseDegrees(position.coords.longitude);
  const accuracyKm = Math.max((position.coords.accuracy || 0) / 1000, 50);

  return {
    latitudeDeg,
    longitudeDeg,
    accuracyKm,
    capturedAt: new Date(position.timestamp || Date.now()),
  };
}

export function useApproximateLocation() {
  const [status, setStatus] = useState("prompt");
  const [location, setLocation] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }

    if (!navigator.permissions?.query) {
      return;
    }

    let cancelled = false;

    navigator.permissions
      .query({ name: "geolocation" })
      .then((permissionStatus) => {
        if (cancelled) {
          return;
        }

        const syncPermission = () => {
          if (cancelled) {
            return;
          }

          if (permissionStatus.state === "granted") {
            setStatus("granted");
          } else if (permissionStatus.state === "denied") {
            setStatus("denied");
          } else {
            setStatus("prompt");
          }
        };

        syncPermission();
        permissionStatus.onchange = syncPermission;
      })
      .catch(() => {
        setStatus("prompt");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "granted" || location) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation(toApproximateLocation(position));
        setErrorMessage("");
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "prompt");
        setErrorMessage(error.message || "Unable to determine your approximate location.");
      },
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 10,
        timeout: 10000,
      },
    );
  }, [location, status]);

  function requestLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }

    setStatus("requesting");
    setErrorMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Show only general whereabouts, not exact coordinates.
        setLocation(toApproximateLocation(position));
        setStatus("granted");
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "prompt");
        setErrorMessage(error.message || "Unable to determine your approximate location.");
      },
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 10,
        timeout: 10000,
      },
    );
  }

  return {
    status,
    location,
    errorMessage,
    requestLocation,
  };
}
