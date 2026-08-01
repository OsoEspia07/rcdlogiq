import Link from "next/link";
import type { ServiceStatus, UserRole } from "@/lib/database.types";

export type OperationEvent = {
  id: string;
  event: string;
  status: ServiceStatus | null;
  createdAt: string;
  actor?: string | null;
  role?: UserRole | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type OperationPhoto = {
  id: string;
  kind: string;
  url: string;
  createdAt: string;
};

function stableDateTime(value: string) {
  return value.replace("T", " ").slice(0, 16);
}

const statusStyles: Record<string, { label: string; className: string; icon: string }> = {
  pendiente: { label: "Pendiente", className: "border-[#ead197] bg-[#fff5dc] text-[#79520c]", icon: "!" },
  asignado: { label: "Asignado", className: "border-[#c8d2db] bg-[#e9eef2] text-[#23313d]", icon: "A" },
  aceptado: { label: "Aceptado", className: "border-[#b7d6c4] bg-[#e5f4ea] text-[#245b3e]", icon: "OK" },
  "en camino": { label: "En camino", className: "border-[#b8d7e8] bg-[#e7f4fb] text-[#23566c]", icon: ">" },
  cargando: { label: "Cargando", className: "border-[#dccaa2] bg-[#fbf2d9] text-[#6a5520]", icon: "C" },
  cargado: { label: "Cargado", className: "border-[#c9d6ad] bg-[#eef5df] text-[#455c20]", icon: "KG" },
  "en transito": { label: "En transito", className: "border-[#b8d7e8] bg-[#e7f4fb] text-[#23566c]", icon: "T" },
  planta: { label: "Planta", className: "border-[#c8d2db] bg-[#e9eef2] text-[#23313d]", icon: "P" },
  retrasado: { label: "Retrasado", className: "border-[#e3a4a4] bg-[#fff0f0] text-[#8a1f1f]", icon: "!" },
  recibido: { label: "Recibido", className: "border-[#c8d2db] bg-[#e9eef2] text-[#23313d]", icon: "R" },
  "recibido en planta": { label: "Recibido", className: "border-[#c8d2db] bg-[#e9eef2] text-[#23313d]", icon: "R" },
  pesado: { label: "Pesado", className: "border-[#dccaa2] bg-[#fbf2d9] text-[#6a5520]", icon: "B" },
  procesado: { label: "Procesado", className: "border-[#c9d6ad] bg-[#eef5df] text-[#455c20]", icon: "P" },
  certificado: { label: "Certificado", className: "border-[#afd0bb] bg-[#e5f4ea] text-[#245b3e]", icon: "#" },
  "certificado generado": { label: "Certificado", className: "border-[#afd0bb] bg-[#e5f4ea] text-[#245b3e]", icon: "#" },
  finalizado: { label: "Finalizado", className: "border-[#afd0bb] bg-[#e5f4ea] text-[#245b3e]", icon: "F" },
};

export function getStatusStyle(status: ServiceStatus | null) {
  return status ? statusStyles[status] ?? statusStyles.pendiente : { label: "Evento", className: "border-[#c8d2db] bg-white text-[#23313d]", icon: "E" };
}

export function StatusBadge({ status }: { status: ServiceStatus }) {
  const style = getStatusStyle(status);
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${style.className}`}>{style.label}</span>;
}

function Coordinates({ latitude, longitude }: { latitude?: number | null; longitude?: number | null }) {
  if (latitude === null || longitude === null || latitude === undefined || longitude === undefined) return <span>Sin ubicacion</span>;
  return <span>{latitude.toFixed(5)}, {longitude.toFixed(5)}</span>;
}

type MapPoint = {
  label: string;
  latitude: number | null;
  longitude: number | null;
  heading?: number | null;
  isLive?: boolean;
};

function hasCoords(point?: MapPoint | null): point is MapPoint & { latitude: number; longitude: number } {
  return point?.latitude !== null && point?.longitude !== null && point?.latitude !== undefined && point?.longitude !== undefined;
}

export function TrackingTimeline({ events, photos = [] }: { events: OperationEvent[]; photos?: OperationPhoto[] }) {
  return (
    <div className="relative space-y-3">
      <div className="absolute bottom-4 left-5 top-4 w-px bg-[#c8d2db]" />
      {events.length === 0 ? <p className="rounded-[8px] border border-dashed border-[#c8d2db] p-4 text-sm text-[#66736b]">Sin eventos operativos todavia.</p> : null}
      {events.map((event, index) => {
        const style = getStatusStyle(event.status);
        const photo = photos[index % Math.max(photos.length, 1)];
        return (
          <article key={event.id} className="relative grid grid-cols-[42px_1fr] gap-3">
            <div className={`z-10 flex h-10 w-10 items-center justify-center rounded-full border text-[11px] font-black ${style.className}`}>{style.icon}</div>
            <div className="rounded-[8px] border border-[#d8ded6] bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-[#101820]">{event.status ?? "evento"}</p>
                  <p className="mt-1 text-sm text-[#536059]">{event.event}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-black ${style.className}`}>{event.role ?? "RCDlogiq"}</span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-[#66736b] sm:grid-cols-3">
                <p><span className="font-bold text-[#101820]">Actor:</span> {event.actor ?? "RCDlogiq"}</p>
                <p><span className="font-bold text-[#101820]">Hora:</span> {stableDateTime(event.createdAt)}</p>
                <p><span className="font-bold text-[#101820]">Geo:</span> <Coordinates latitude={event.latitude} longitude={event.longitude} /></p>
              </div>
              {photo ? (
                <div className="mt-3 flex items-center gap-2 rounded-[8px] bg-[#f5f7f3] p-2 text-xs font-semibold text-[#536059]">
                  <div className="grid h-10 w-10 place-items-center rounded-[6px] bg-[#101820] text-white">EVD</div>
                  <span>Evidencia {photo.kind} asociada al servicio</span>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function EvidenceGrid({ photos }: { photos: OperationPhoto[] }) {
  if (photos.length === 0) return <p className="rounded-[8px] border border-dashed border-[#c8d2db] p-4 text-sm text-[#66736b]">Sin evidencias cargadas.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo) => (
        <a key={photo.id} className="overflow-hidden rounded-[8px] border border-[#d8ded6] bg-white shadow-sm" href={photo.url} target="_blank">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={`Evidencia ${photo.kind}`} className="h-44 w-full bg-[#f5f7f3] object-contain p-1" src={photo.url} />
          <div className="p-3">
            <p className="text-sm font-black text-[#101820]">{photo.kind}</p>
            <p className="text-xs text-[#66736b]">{stableDateTime(photo.createdAt)}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

export function OperationalMap({
  project,
  plant,
  vehicle,
  routeTarget,
}: {
  project: MapPoint;
  plant: MapPoint;
  vehicle?: MapPoint | null;
  routeTarget?: MapPoint | null;
}) {
  const hasProjectCoords = hasCoords(project);
  const hasPlantCoords = hasCoords(plant);
  const hasVehicleCoords = hasCoords(vehicle);
  const hasRouteTargetCoords = hasCoords(routeTarget);
  const activeRouteTarget = hasRouteTargetCoords ? routeTarget : plant;
  const hasActiveRouteTargetCoords = hasCoords(activeRouteTarget);
  const vehicleHeading = typeof vehicle?.heading === "number" ? vehicle.heading : 42;
  const src =
    hasVehicleCoords && hasActiveRouteTargetCoords
      ? `https://maps.google.com/maps?saddr=${vehicle.latitude},${vehicle.longitude}&daddr=${activeRouteTarget.latitude},${activeRouteTarget.longitude}&z=14&output=embed`
      : hasProjectCoords && hasPlantCoords
      ? `https://maps.google.com/maps?saddr=${project.latitude},${project.longitude}&daddr=${plant.latitude},${plant.longitude}&z=13&output=embed`
      : hasProjectCoords
        ? `https://maps.google.com/maps?q=${project.latitude},${project.longitude}&z=16&output=embed`
        : "https://maps.google.com/maps?q=4.7110,-74.0721&z=12&output=embed";
  return (
    <div className="overflow-hidden rounded-[8px] border border-[#d8ded6] bg-white">
      <div className="relative h-72 w-full overflow-hidden">
        <iframe
          className="h-full w-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={src}
          title="Mapa operacional RCD"
        />
        {hasVehicleCoords && vehicle.isLive ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 grid -translate-x-1/2 -translate-y-1/2 place-items-center">
            <div className="relative grid h-14 w-14 place-items-center rounded-full border border-white/80 bg-[#101820]/10 shadow-[0_12px_30px_rgba(16,24,32,0.28)] backdrop-blur-sm">
              <div
                className="grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-[#101820] shadow-lg"
                style={{ transform: `rotate(${vehicleHeading}deg)` }}
              >
                <svg aria-hidden="true" className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2 20 21 12 17.5 4 21 12 2Z" />
                </svg>
              </div>
              <span className="absolute -bottom-7 whitespace-nowrap rounded-full border border-[#b7d6c4] bg-white px-2 py-1 text-[11px] font-black text-[#245b3e] shadow-sm">
                Ubicacion real
              </span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 border-t border-[#d8ded6] p-3 text-xs text-[#66736b] sm:grid-cols-3">
        <p><span className="font-black text-[#b5473f]">Obra:</span> {project.label} - <Coordinates latitude={project.latitude} longitude={project.longitude} /></p>
        {vehicle ? <p><span className="font-black text-[#101820]">Vehiculo:</span> {vehicle.label} - <Coordinates latitude={vehicle.latitude} longitude={vehicle.longitude} /></p> : null}
        <p><span className="font-black text-[#2f6b4f]">{hasVehicleCoords ? "Siguiente parada" : "Destino"}:</span> {activeRouteTarget.label} - <Coordinates latitude={activeRouteTarget.latitude} longitude={activeRouteTarget.longitude} /></p>
      </div>
    </div>
  );
}

export function PassportLink({ passportId, pickupId }: { passportId: string | null; pickupId: string }) {
  return (
    <Link className="block rounded-[6px] border border-[#c8d2db] px-3 py-2 text-center text-sm font-bold" href={`/passport/${passportId ?? pickupId}`}>
      Ver trazabilidad
    </Link>
  );
}
