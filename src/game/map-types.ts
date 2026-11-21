export type Point = [x: number, y: number];
export type RouteLeg = [way: number, first: number, last: number];
export type FurnitureKind =
  | 'bench'
  | 'planter'
  | 'bollard'
  | 'busStop'
  | 'guidepost'
  | 'bin'
  | 'postBox';

export interface Road {
  id: number;
  name: string;
  access: string;
  oneway: number;
  width: number;
  lanes: number;
  layer: number;
  points: Point[];
}

export interface MapData {
  width: number;
  height: number;
  roads: Road[];
  paths: { kind: string; name?: string; width: number; points: Point[] }[];
  areas: { kind: string; holes?: Point[][]; points: Point[] }[];
  buildings: { name: string; rings: Point[][] }[];
  furniture: { kind: FurnitureKind; x: number; y: number }[];
  trees: Point[];
  routes: RouteLeg[][];
  crossings: { centre: Point; signal: boolean; walk: Point[] }[];
  walking_paths: Point[][];
}
