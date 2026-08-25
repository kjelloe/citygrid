// What this device can do. Read once at boot; drives the honest unsupported
// screen and the map-size advice (ruling 011).

/** WebGL2 is required — instancing, DataTexture overlays and the single-pass
 * overlay shader all assume it. Probed with a throwaway canvas so the failure
 * is a message rather than a black screen. */
export function hasWebGL2() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

export function isCoarsePointer() {
  return globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
}

export function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Rough device class. deviceMemory is Chromium-only, so absence means
 * "assume mid" rather than "assume weak" — guessing low would push desktop
 * Firefox users onto a small map for no reason. */
export function deviceClass() {
  const memory = navigator.deviceMemory ?? 0;
  const cores = navigator.hardwareConcurrency ?? 0;
  const coarse = isCoarsePointer();
  if (coarse && (memory > 0 && memory <= 4)) return "phone-weak";
  if (coarse) return "phone";
  if (memory > 0 && memory <= 4 && cores <= 4) return "desktop-weak";
  return "desktop";
}

/** Ruling 011: advise, never forbid. A phone may still join a large region
 * that someone else created — that path degrades, it does not break. */
export function recommendedMapSize() {
  switch (deviceClass()) {
    case "phone-weak": return 48;
    case "phone": return 64;
    case "desktop-weak": return 64;
    default: return 128;
  }
}

export function sizeAdvice(size) {
  const recommended = recommendedMapSize();
  if (size <= recommended) return "recommended";
  return "heavy";
}

export function preferredLocale() {
  const languages = navigator.languages ?? [navigator.language ?? "en"];
  for (const tag of languages) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (base === "no" || base === "nb" || base === "nn") return "no";
    if (base === "en") return "en";
  }
  return "en";
}
