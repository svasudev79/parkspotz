// Well-known Bangalore destinations. Used when no Google Maps key is set
// (destination search and the owner's location picker), and for seed data.
export interface Place {
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

export const LANDMARKS: Place[] = [
  { name: "MG Road Metro", lat: 12.9755, lng: 77.6068 },
  { name: "Indiranagar Metro", lat: 12.9784, lng: 77.6386 },
  { name: "Koramangala Forum Mall", lat: 12.9345, lng: 77.6113 },
  { name: "Majestic", lat: 12.9767, lng: 77.5713 },
  { name: "Cubbon Park", lat: 12.9763, lng: 77.5929 },
  { name: "Lalbagh", lat: 12.9507, lng: 77.5848 },
  { name: "Whitefield ITPL", lat: 12.9857, lng: 77.7365 },
  { name: "Electronic City", lat: 12.8452, lng: 77.6602 },
  { name: "Jayanagar 4th Block", lat: 12.9299, lng: 77.5826 },
  { name: "Malleshwaram", lat: 13.0031, lng: 77.5643 },
  { name: "HSR Layout", lat: 12.9116, lng: 77.6389 },
  { name: "Yeshwanthpur", lat: 13.023, lng: 77.55 },
  { name: "Hebbal", lat: 13.0358, lng: 77.597 },
  { name: "Brigade Road", lat: 12.9719, lng: 77.607 },
  { name: "UB City", lat: 12.9716, lng: 77.5963 },
];

// Centre of Bangalore, used as the map's starting view.
export const BANGALORE_CENTER = { lat: 12.9716, lng: 77.5946 };
