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

  const deltaMs = Date.now() - value.getTime();
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

export function formatNumberLabel(value, suffix = "", maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value)}${suffix}`;
}
