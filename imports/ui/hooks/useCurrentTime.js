import { useEffect, useState } from "react";

export function useCurrentTime(intervalMs = 1000) {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [intervalMs]);

  return currentTime;
}
