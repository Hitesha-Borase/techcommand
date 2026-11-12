/**
 * Map Configuration & Free OpenStreetMap Tile Settings
 * 
 * OpenStreetMap public tile URL: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
 * 100% Free - Requires NO API key, NO billing account, NO Google Maps API.
 * Configurable via NEXT_PUBLIC_MAP_TILE_URL if a custom tile server is used in future.
 */

export const MAP_CONFIG = {
  tileUrl:
    process.env.NEXT_PUBLIC_MAP_TILE_URL ||
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 19,
  defaultCenter: [40.125, -82.932] as [number, number], // Central Hub (Westerville / Columbus, OH)
  defaultZoom: 11,
};

// Types for Leaflet instance when loaded dynamically
export type LeafletModule = any;

/**
 * Safely loads Leaflet JS & CSS into the browser dynamically.
 * Prevents Next.js SSR crashes ("window is not defined") and bundler asset resolution bugs.
 */
export async function loadLeaflet(): Promise<LeafletModule> {
  if (typeof window === "undefined") {
    throw new Error("Leaflet can only be initialized on the client side.");
  }

  // Ensure Leaflet CSS is injected
  if (!document.getElementById("leaflet-stylesheet")) {
    const link = document.createElement("link");
    link.id = "leaflet-stylesheet";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.crossOrigin = "";
    document.head.appendChild(link);
  }

  // If window.L is already present, return it
  if ((window as any).L) {
    return (window as any).L;
  }

  // Load Leaflet JS
  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById("leaflet-script") as HTMLScriptElement | null;
    if (existingScript) {
      if ((window as any).L) {
        resolve((window as any).L);
      } else {
        existingScript.addEventListener("load", () => resolve((window as any).L));
        existingScript.addEventListener("error", (e) => reject(e));
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "leaflet-script";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.crossOrigin = "";
    script.onload = () => {
      resolve((window as any).L);
    };
    script.onerror = () => {
      reject(new Error("Failed to load Leaflet script from CDN."));
    };
    document.head.appendChild(script);
  });
}

