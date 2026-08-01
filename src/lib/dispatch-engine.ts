import "server-only";

import type { PoolClient, QueryResultRow } from "pg";
import { query } from "@/lib/postgres";
import type { ResidueType, VolumeSize } from "@/lib/database.types";

type Coordinates = {
  latitude: number | null;
  longitude: number | null;
};

type PickupContext = {
  id: string;
  residue_type: ResidueType;
  volume_size: VolumeSize;
  project_city: string;
  project_latitude: string | null;
  project_longitude: string | null;
};

export type TransporterSuggestion = {
  transporterId: string;
  transporterName: string;
  vehicleId: string;
  vehicleLabel: string;
  score: number;
  distanceKm: number | null;
  etaMinutes: number | null;
  activeLoad: number;
  capacityTons: number;
  reasons: string[];
};

export type PlantSuggestion = {
  plantId: string;
  plantName: string;
  score: number;
  distanceKm: number | null;
  etaMinutes: number | null;
  capacityAvailableTons: number;
  reasons: string[];
};

const volumeCapacityTons: Record<VolumeSize, number> = {
  pequeno: 4,
  mediano: 10,
  grande: 18,
};

function runQuery<T extends QueryResultRow>(client: PoolClient | undefined, text: string, params: unknown[] = []) {
  return client ? client.query<T>(text, params) : query<T>(text, params);
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateDistance(from: Coordinates, to: Coordinates) {
  if (from.latitude === null || from.longitude === null || to.latitude === null || to.longitude === null) {
    return null;
  }

  const radiusKm = 6371;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Number((radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

export function calculateETA(distanceKm: number | null, speedKmh = 28) {
  if (distanceKm === null) return null;
  return Math.max(5, Math.round((distanceKm / speedKmh) * 60));
}

async function getPickupContext(pickupRequestId: string, client?: PoolClient) {
  const result = await runQuery<PickupContext>(client,
    `select
      pr.id,
      pr.residue_type,
      pr.volume_size,
      coalesce(pj.city, 'Bogota') as project_city,
      pj.latitude::text as project_latitude,
      pj.longitude::text as project_longitude
    from pickup_requests pr
    join projects pj on pj.id = pr.project_id
    where pr.id = $1`,
    [pickupRequestId],
  );
  return result.rows[0] ?? null;
}

export async function suggestTransporter(pickupRequestId: string, client?: PoolClient): Promise<TransporterSuggestion | null> {
  const pickup = await getPickupContext(pickupRequestId, client);
  if (!pickup) return null;
  const requiredCapacity = volumeCapacityTons[pickup.volume_size as VolumeSize];
  const origin = {
    latitude: toNumber(pickup.project_latitude),
    longitude: toNumber(pickup.project_longitude),
  };

  const candidates = await runQuery<{
    transporter_id: string;
    transporter_name: string;
    vehicle_id: string;
    plate: string;
    vehicle_type: string;
    capacity_tons: string;
    city: string;
    current_latitude: string | null;
    current_longitude: string | null;
    active_load: string;
    score: string | null;
  }>(client,
    `select
      u.id as transporter_id,
      coalesce(u.company_name, u.full_name) as transporter_name,
      v.id as vehicle_id,
      v.plate,
      v.vehicle_type,
      v.capacity_tons::text,
      v.city,
      v.current_latitude::text,
      v.current_longitude::text,
      count(ta.id) filter (where pr.status not in ('finalizado', 'certificado generado'))::text as active_load,
      ts.score::text
    from users u
    join vehicles v on v.transporter_id = u.id and v.active = true and v.available = true
    left join transporter_scores ts on ts.transporter_id = u.id
    left join transport_assignments ta on ta.transporter_id = u.id
    left join pickup_requests pr on pr.id = ta.pickup_request_id
    where u.role = 'transportador'
      and v.capacity_tons >= $1
    group by u.id, u.company_name, u.full_name, v.id, v.plate, v.vehicle_type, v.capacity_tons, v.city, v.current_latitude, v.current_longitude, ts.score`,
    [requiredCapacity],
  );

  const ranked = candidates.rows
    .map((candidate) => {
      const distanceKm = calculateDistance(origin, {
        latitude: toNumber(candidate.current_latitude),
        longitude: toNumber(candidate.current_longitude),
      });
      const activeLoad = Number(candidate.active_load);
      const score = Number(candidate.score ?? 82);
      const sameCity = candidate.city.toLowerCase() === pickup.project_city.toLowerCase();
      const distanceScore = distanceKm === null ? 20 : Math.max(0, 35 - distanceKm);
      const loadScore = Math.max(0, 18 - activeLoad * 4);
      const finalScore = (sameCity ? 18 : 0) + distanceScore + loadScore + score * 0.22;
      const reasons = [
        sameCity ? "misma ciudad/zona" : "zona secundaria",
        `capacidad ${Number(candidate.capacity_tons).toFixed(1)}t`,
        `carga activa ${activeLoad}`,
        `score operacional ${score.toFixed(1)}`,
      ];
      return {
        transporterId: candidate.transporter_id,
        transporterName: candidate.transporter_name,
        vehicleId: candidate.vehicle_id,
        vehicleLabel: `${candidate.plate} - ${candidate.vehicle_type}`,
        score: Number(finalScore.toFixed(2)),
        distanceKm,
        etaMinutes: calculateETA(distanceKm),
        activeLoad,
        capacityTons: Number(candidate.capacity_tons),
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}

export async function suggestPlant(pickupRequestId: string, client?: PoolClient): Promise<PlantSuggestion | null> {
  const pickup = await getPickupContext(pickupRequestId, client);
  if (!pickup) return null;
  const origin = {
    latitude: toNumber(pickup.project_latitude),
    longitude: toNumber(pickup.project_longitude),
  };

  const candidates = await runQuery<{
    id: string;
    name: string;
    latitude: string | null;
    longitude: string | null;
    daily_capacity_tons: string;
    current_load_tons: string;
    operational_status: string;
  }>(client,
    `select id, name, latitude::text, longitude::text, daily_capacity_tons::text, current_load_tons::text, operational_status
     from plants
     where active = true
       and operational_status = 'operativa'
       and $1::residue_type = any(accepted_residue_types)
       and current_load_tons < daily_capacity_tons`,
    [pickup.residue_type],
  );

  const ranked = candidates.rows
    .map((candidate) => {
      const distanceKm = calculateDistance(origin, {
        latitude: toNumber(candidate.latitude),
        longitude: toNumber(candidate.longitude),
      });
      const available = Number(candidate.daily_capacity_tons) - Number(candidate.current_load_tons);
      const distanceScore = distanceKm === null ? 25 : Math.max(0, 45 - distanceKm);
      const capacityScore = Math.min(30, available / 2);
      const finalScore = distanceScore + capacityScore + 25;
      return {
        plantId: candidate.id,
        plantName: candidate.name,
        score: Number(finalScore.toFixed(2)),
        distanceKm,
        etaMinutes: calculateETA(distanceKm, 24),
        capacityAvailableTons: Number(available.toFixed(2)),
        reasons: [
          `acepta ${pickup.residue_type}`,
          `${available.toFixed(1)}t disponibles`,
          candidate.operational_status,
        ],
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}

export async function persistDispatchSuggestion(pickupRequestId: string, client: PoolClient) {
  const [transporter, plant] = await Promise.all([
    suggestTransporter(pickupRequestId, client),
    suggestPlant(pickupRequestId, client),
  ]);

  if (!transporter && !plant) return null;

  const result = await client.query(
    `insert into dispatch_suggestions (
      pickup_request_id, transporter_id, vehicle_id, plant_id, transporter_score,
      plant_score, eta_minutes, distance_km, reason
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    returning *`,
    [
      pickupRequestId,
      transporter?.transporterId ?? null,
      transporter?.vehicleId ?? null,
      plant?.plantId ?? null,
      transporter?.score ?? null,
      plant?.score ?? null,
      transporter?.etaMinutes ?? plant?.etaMinutes ?? null,
      transporter?.distanceKm ?? plant?.distanceKm ?? null,
      {
        transporter: transporter?.reasons ?? [],
        plant: plant?.reasons ?? [],
      },
    ],
  );
  return result.rows[0] ?? null;
}
