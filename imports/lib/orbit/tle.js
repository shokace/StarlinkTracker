export function parseTleFeed(text = "") {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const records = [];

  for (let index = 0; index < lines.length; index += 3) {
    const name = lines[index];
    const tleLine1 = lines[index + 1];
    const tleLine2 = lines[index + 2];

    if (!name || !tleLine1 || !tleLine2) {
      continue;
    }

    records.push({
      name: name.trim(),
      tleLine1,
      tleLine2,
      noradId: parseInt(tleLine1.slice(2, 7), 10),
      intlDes: tleLine1.slice(9, 17).trim() || null,
      epoch: parseTleEpoch(tleLine1),
    });
  }

  return records;
}

export function parseTleEpoch(tleLine1) {
  if (!tleLine1 || tleLine1.length < 32) {
    return null;
  }

  const epochYear = parseInt(tleLine1.slice(18, 20), 10);
  const epochDay = parseFloat(tleLine1.slice(20, 32));

  if (!Number.isFinite(epochYear) || !Number.isFinite(epochDay)) {
    return null;
  }

  const fullYear = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
  const startOfYear = Date.UTC(fullYear, 0, 1, 0, 0, 0, 0);
  return new Date(startOfYear + (epochDay - 1) * 24 * 60 * 60 * 1000);
}
