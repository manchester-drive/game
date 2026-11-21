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
  parkedCar: Vehicle | null;
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
  traffic: TrafficCar[];
  people: Pedestrian[];
  race: Race | null;
}
