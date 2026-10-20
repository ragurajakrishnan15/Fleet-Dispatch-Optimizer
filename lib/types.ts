export type ZoneType =
  | "residential"
  | "commercial"
  | "airport"
  | "entertainment"
  | "tech_campus";

export interface Zone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_km: number;
  type: ZoneType;
}

export interface Vehicle {
  id: string;
  lat: number;
  lng: number;
  status: "idle" | "assigned" | "en_route" | "occupied";
}

export interface Assignment {
  vehicleId: string;
  zoneId: string;
  /** predicted_demand share x avg_fare - travel_cost, in dollars */
  expectedValue: number;
  travelTimeMinutes: number;
}

export interface Ride {
  id: string;
  timestamp: string;
  pickup_zone: string;
  dropoff_zone: string;
  fare: number;
  pickup_wait_min: number;
  trip_duration_min: number;
  distance_km: number;
}

export interface DailyMetrics {
  day: number;
  revenuePerVehicleHr: number;
  pickupEtaMin: number;
  utilizationPct: number;
  ridesCompleted: number;
}

export interface DemandModel {
  zone_base_rates: Record<string, number>;
  avg_fare_by_zone: Record<string, number>;
  /** per zone type, 24 hourly multipliers for weekday / weekend */
  hour_multipliers: Record<ZoneType, { weekday: number[]; weekend: number[] }>;
  /** index 0 = Sunday */
  dow_factors: number[];
}
