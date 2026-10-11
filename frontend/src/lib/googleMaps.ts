// Loads the Google Maps JavaScript API once, and only when a key is set.
export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const HAS_MAPS_KEY = MAPS_KEY !== "";

const READY_CALLBACK = "__parkspotzMapsReady";
let loading: Promise<void> | null = null;

// Resolves when google.maps (Map, Marker, Circle) and google.maps.places are ready.
export function loadGoogleMaps(): Promise<void> {
  if (!HAS_MAPS_KEY) return Promise.reject(new Error("No Google Maps API key"));
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      (window as unknown as Record<string, () => void>)[READY_CALLBACK] = () => {
        Promise.all([
          google.maps.importLibrary("maps"),
          google.maps.importLibrary("marker"),
          google.maps.importLibrary("places"),
        ]).then(() => resolve(), reject);
      };
      const script = document.createElement("script");
      script.src =
        "https://maps.googleapis.com/maps/api/js" +
        `?key=${encodeURIComponent(MAPS_KEY)}&v=weekly&loading=async&callback=${READY_CALLBACK}`;
      script.async = true;
      script.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(script);
    });
  }
  return loading;
}

// Marker icons hosted by Google.
export const PIN_ICONS = {
  space: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
  selected: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
  destination: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
};
