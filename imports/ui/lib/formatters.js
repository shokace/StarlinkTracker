export function formatDateTimeLabel(value) {
  if (!value) {
    return "—";
  }

  const dateValue = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(dateValue.getTime())) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(dateValue);
  } catch (error) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(dateValue);
  }
}

export function formatDistanceToNowLabel(value) {
  if (!value) {
    return "never";
  }

  const dateValue = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(dateValue.getTime())) {
    return "never";
  }

  const deltaMs = Date.now() - dateValue.getTime();
  const deltaMinutes = Math.round(deltaMs / 60000);

  if (deltaMinutes < 1) {
    return "just now";
  }

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function formatCountdownLabel(value) {
  if (!value) {
    return "--:--:--";
  }

  const dateValue = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(dateValue.getTime())) {
    return "--:--:--";
  }

  const remainingMs = dateValue.getTime() - Date.now();

  if (remainingMs <= 0) {
    return "00:00:00";
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatNumberLabel(value, suffix = "", maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value)}${suffix}`;
}
