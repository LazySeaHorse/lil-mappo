export const MAPBOX_TOKEN = 'pk.eyJ1Ijoieml0c2NoZXIiLCJhIjoibVQ3WUhmWSJ9.ZQRt1dTOnlSSxrjxtAMVgQ';

export const MAP_STYLES: Record<string, { label: string; url: string }> = {
  standard:          { label: 'Standard',           url: 'mapbox://styles/mapbox/standard' },
  streets:           { label: 'Streets',            url: 'mapbox://styles/mapbox/streets-v12' },
  outdoors:          { label: 'Outdoors',           url: 'mapbox://styles/mapbox/outdoors-v12' },
  light:             { label: 'Light',              url: 'mapbox://styles/mapbox/light-v11' },
  dark:              { label: 'Dark',               url: 'mapbox://styles/mapbox/dark-v11' },
  satellite:         { label: 'Satellite',          url: 'mapbox://styles/mapbox/satellite-v9' },
  satelliteStreets:  { label: 'Satellite Streets',  url: 'mapbox://styles/mapbox/satellite-streets-v12' },
};

export type MapStyleKey = keyof typeof MAP_STYLES;
