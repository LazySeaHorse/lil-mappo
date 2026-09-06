export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  coordinates: [number, number]; // [lng, lat]
}

export type RawAirportTuple = [
  iata: string,
  icao: string,
  name: string,
  city: string,
  country: string,
  lng: number,
  lat: number
];
