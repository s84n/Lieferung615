// Zentrale Spielkonstanten
export const VERSION = 'v1.00';   // bei jedem Release erhöhen (steht im Titelbild)
export const TILE = 4;            // Weltgröße eines Block-Tiles
export const ROAD_W = 7;          // Breite einer Straßenachse (breiter als Block-Tiles)
export const N = 25;              // Tiles pro Kante
export const ROAD_EVERY = 6;      // alle 6 Tiles eine Straße
export const ROUND_TIME = 180;    // Sekunden pro Runde
export const CAPACITY = 3;        // Ladefläche
export const ACTIVE_ORDERS = 4;   // gleichzeitig sichtbare Aufträge
export const MAX_CLOCKS = 4;      // max. Zeit-Uhren pro Runde

export const COLORS = {
  red: 0xb5002f,
  redDark: 0x8a0024,
  gold: 0xf5b800,
  white: 0xffffff,
};

const params = new URLSearchParams(location.search);
export const QUALITY = params.get('q') === 'low' ? 'low' : 'high';
export const DEBUG = params.has('debug');
// Bildraten-Grenze (?fps=0 = unbegrenzt, z. B. zum Messen)
export const FPS_CAP = params.has('fps') ? Number(params.get('fps')) || 0 : 60;
