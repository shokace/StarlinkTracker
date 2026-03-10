import { useEffect, useState } from "react";

export function useCurrentTime(intervalMs = 1000) {
  const getSteppedDate = () => new Date(Math.floor(Date.now() / intervalMs) * intervalMs);
  const [currentTime, setCurrentTime] = useState(() => getSteppedDate());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(getSteppedDate());
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [intervalMs]);

  return currentTime;
}
