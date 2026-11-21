import type { Appearance } from './garage';

export interface Position {
  x: number;
  y: number;
}
export interface Pose extends Position {
  angle: number;
}
export interface Vehicle extends Pose {
  id: string;
  color: string;
  roof?: string;
  stripe?: string;
  plate?: string;
  model?: Appearance['model'];
  speed: number;
  slideX?: number;
  slideY?: number;
  rearLights?: 'tail' | 'brake' | 'reverse';
  indicating?: boolean;
  parked?: boolean;
  shared?: boolean;
}
export interface TrafficCar extends Vehicle {
  lane: number;
  d: number;
}
export interface Player extends Vehicle, Appearance {
  name: string;
  // Guests have no account, so their names are not reserved.
  guest?: boolean;
  model: Appearance['model'];
  // Set while walking. While borrowing, the personal vehicle stays at the same spot.
  parkedCar: Vehicle | null;
  borrowed?: { id: string; ownCar: Vehicle };
}
export interface Pedestrian extends Position {
  id: string;
  color: string;
  route: number;
  next: number;
  crossing: boolean;
}
export interface Racer {
  id: string;
  name: string;
  next: number;
  elapsed: number | null;
  withdrawn: boolean;
}
export interface Race {
  id: string;
  phase: 'open' | 'countdown' | 'racing' | 'results';
  startAt: number | null;
  racers: Racer[];
}
export interface World {
  time: number;
  players: Player[];
  streetCars: Vehicle[];
  traffic: TrafficCar[];
  people: Pedestrian[];
  race: Race | null;
}

export function parkedVehicles(world: World): Vehicle[] {
  const parked = [...world.streetCars];
  for (const player of world.players) {
    const own = player.parkedCar ?? player.borrowed?.ownCar;
    if (own) parked.push(own);
  }
  return parked;
}
