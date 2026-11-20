export async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

export const postJson = (path, body) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// #run=…&promo=… / #new / #how — the same deep links the Python UI uses.
export function hashParams() {
  const out = {};
  for (const part of window.location.hash.slice(1).split("&")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
    else if (part) out[part] = true;
  }
  return out;
}

export function setHash(obj) {
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  const next = parts.length ? `#${parts.join("&")}` : "";
  if (window.location.hash !== next) window.history.replaceState(null, "", next || window.location.pathname);
}
