// Small formatters, ported 1:1 from the Python UI so numbers look identical.
export const fmtTs = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};

export const parseTs = (s) => {
  const parts = String(s).trim().replace(",", ".").split(":");
  const secs = parseFloat(parts[parts.length - 1]);
  const mins = parts.length >= 2 ? parseInt(parts[parts.length - 2], 10) : 0;
  const hrs = parts.length >= 3 ? parseInt(parts[parts.length - 3], 10) : 0;
  return hrs * 3600 + mins * 60 + secs;
};

export const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "show";

export const round2 = (n) => Math.round(n * 100) / 100;
