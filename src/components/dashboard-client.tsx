"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LiveRouteMap } from "@/components/live-route-map";
import { EvidenceGrid, StatusBadge, TrackingTimeline } from "@/components/operation-ui";
import type { ControlTowerData, DashboardOption, DashboardService, DashboardStats } from "@/lib/dashboard";
import type { ServiceStatus, UserRole } from "@/lib/database.types";
import { clientStatusLabel } from "@/lib/status-labels";

type Props = {
  role: UserRole;
  services: DashboardService[];
  availableServices: DashboardService[];
  plants: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; address: string }>;
  transporters: DashboardOption[];
  vehicles: DashboardOption[];
  stats: DashboardStats;
  controlTower: ControlTowerData;
};

type AddressSuggestion = {
  label: string;
  latitude: number;
  longitude: number;
  precision?: "exacta" | "aproximada";
};

type LiveVehicleLocation = {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  updatedAt: number;
};

const statuses: ServiceStatus[] = ["pendiente", "asignado", "aceptado", "en camino", "cargando", "cargado", "en transito", "planta", "retrasado", "recibido en planta", "pesado", "procesado", "certificado generado", "finalizado"];
const residues = ["concreto", "ladrillo", "mixto", "madera", "drywall", "metal", "otros"];
const volumes = ["pequeno", "mediano", "grande"];
const clientModules = ["Solicitar recoleccion", "Mis obras", "Solicitudes activas", "Certificados"] as const;
type ClientModule = (typeof clientModules)[number];
const transporterModules = ["Ruta actual", "Servicios asignados", "Evidencias", "Vehiculo", "Historial de servicios", "Ganancias estimadas"] as const;
type TransporterModule = (typeof transporterModules)[number];
const plantModules = ["Recepciones pendientes", "Vehiculos en transito", "Bascula", "Tickets bascula", "Clasificacion", "Certificados"] as const;
type PlantModule = (typeof plantModules)[number];
const adminModules = ["Dashboard global", "Asignacion operativa", "Asignaciones", "Monitor operativo", "Indicadores", "Trazabilidad", "Usuarios", "Vehiculos", "Plantas", "Parametros"] as const;
type AdminModule = (typeof adminModules)[number];

function money(cents: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cents / 100);
}

function stableDate(value: string) {
  return value.slice(0, 10);
}

function StatusPill({ status }: { status: ServiceStatus }) {
  return <StatusBadge status={status} />;
}

function MiniIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 2h2v-2h4v6h-6v-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-[#f5f7f3] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#66736b]">{label}</p>
      <p className="mt-1 font-semibold text-[#101820]">{value}</p>
    </div>
  );
}

function serviceVehiclePoint(service?: DashboardService | null, liveLocation?: LiveVehicleLocation | null) {
  if (!service?.vehicleId) return null;
  return {
    label: service.vehicle,
    latitude: liveLocation?.latitude ?? service.vehicleLatitude,
    longitude: liveLocation?.longitude ?? service.vehicleLongitude,
    heading: liveLocation?.heading ?? null,
    speed: liveLocation?.speed ?? null,
    isLive: Boolean(liveLocation),
  };
}

function VehicleSummary({ vehicle }: { vehicle: DashboardOption }) {
  return (
    <article className="overflow-hidden rounded-[8px] border border-[#d8ded6] bg-white text-sm">
      {vehicle.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`Vehiculo ${vehicle.label}`} className="h-52 w-full bg-[#f5f7f3] object-contain p-1" src={vehicle.photoUrl} />
      ) : null}
      <div className="grid gap-2 p-3">
        <p className="font-black text-[#101820]">{vehicle.label}</p>
        <p className="font-semibold text-[#66736b]">{vehicle.meta}</p>
        {vehicle.driverName ? <p><span className="font-bold text-[#101820]">Conductor:</span> {vehicle.driverName}</p> : null}
        {vehicle.driverPhone ? <p><span className="font-bold text-[#101820]">Telefono:</span> {vehicle.driverPhone}</p> : null}
        {vehicle.driverDocument ? <p><span className="font-bold text-[#101820]">Documento:</span> {vehicle.driverDocument}</p> : null}
        {vehicle.licenseStatus ? <p><span className="font-bold text-[#101820]">Licencia:</span> {vehicle.licenseStatus}</p> : null}
        {vehicle.consentStatus ? <p><span className="font-bold text-[#101820]">Datos:</span> {vehicle.consentStatus}</p> : null}
      </div>
    </article>
  );
}

const roleShell: Record<UserRole, { title: string; subtitle: string; nav: string[]; focus: string; empty: string }> = {
  cliente: {
    title: "Retira RCD sin friccion.",
    subtitle: "Solicita recolecciones, consulta tracking simple y descarga certificados legales de tus obras.",
    nav: ["Solicitar recoleccion", "Mis obras", "Solicitudes activas", "Certificados"],
    focus: "RCDlogiq",
    empty: "Aun no tienes solicitudes activas. Crea una obra y agenda tu primer retiro.",
  },
  transportador: {
    title: "Servicios y ruta actual.",
    subtitle: "Acepta servicios, registra llegada, cargue, salida y evidencias desde una vista rapida para campo.",
    nav: ["Servicios asignados", "Ruta actual", "Evidencias", "Vehiculo", "Historial", "Ganancias"],
    focus: "RCDlogiq transporte",
    empty: "No tienes servicios asignados en este momento.",
  },
  planta: {
    title: "Recepcion y bascula RCD.",
    subtitle: "Controla cargas entrantes, registra peso, clasifica material y habilita certificados.",
    nav: ["Recepciones", "Vehiculos en transito", "Bascula", "Tickets", "Certificados"],
    focus: "RCDlogiq planta",
    empty: "No hay cargas visibles para esta planta.",
  },
  admin: {
    title: "RCDlogiq operaciones.",
    subtitle: "Monitorea la red completa, asigna servicios, revisa cumplimiento, ingresos, toneladas y alertas.",
    nav: ["Dashboard global", "Asignacion operativa", "Asignaciones", "Monitor", "Indicadores", "Trazabilidad", "Usuarios", "Flota", "Plantas"],
    focus: "RCDlogiq admin",
    empty: "No hay servicios en la red operacional.",
  },
};

function roleMetrics(role: UserRole, services: DashboardService[], stats: DashboardStats) {
  const completed = services.filter((service) => ["finalizado", "certificado generado", "certificado"].includes(service.status)).length;
  const certificates = services.filter((service) => service.certificateUrl || service.status === "certificado generado" || service.status === "certificado").length;
  const active = services.filter((service) => !["finalizado", "certificado generado", "certificado"].includes(service.status)).length;
  const kg = services.reduce((sum, service) => sum + (service.netWeightKg ?? 0), 0);
  if (role === "cliente") {
    return [
      ["Solicitudes activas", `${active}`],
      ["Completadas", `${completed}`],
      ["Certificados", `${certificates}`],
      ["Ultimo retiro", services[0] ? stableDate(services[0].createdAt) : "Sin retiros"],
      ["RCD retirado", `${(kg / 1000).toFixed(2)} t`],
    ];
  }
  if (role === "transportador") {
    return [
      ["Servicios hoy", `${services.length}`],
      ["Completados", `${completed}`],
      ["Estado actual", services[0]?.status ?? "Sin servicio"],
      ["Tiempo prom.", "Calculando"],
      ["Ganancia est.", money(services.reduce((sum, service) => sum + service.priceCents, 0) * 0.62)],
    ];
  }
  if (role === "planta") {
    return [
      ["Entradas hoy", `${services.length}`],
      ["Toneladas recibidas", `${(kg / 1000).toFixed(2)} t`],
      ["Pendientes pesaje", `${services.filter((service) => ["recibido en planta", "en transito"].includes(service.status)).length}`],
      ["Vehiculos esperando", `${services.filter((service) => service.status === "recibido en planta").length}`],
      ["Tipos residuo", `${new Set(services.map((service) => service.residue)).size}`],
    ];
  }
  return [
    ["Servicios activos", `${stats.active}`],
    ["Ingresos", money(stats.revenueToday)],
    ["Toneladas", `${Number(stats.tonsToday).toFixed(2)} t`],
    ["Cumplimiento", "86%"],
    ["Utilizacion flota", `${Math.min(100, services.filter((service) => service.transporterId).length * 18)}%`],
    ["Certificados", `${stats.certificatesToday}`],
  ];
}

function nextTransportActions(status: ServiceStatus): Array<{ label: string; status: ServiceStatus }> {
  if (status === "asignado") return [{ label: "Aceptar servicio", status: "aceptado" }];
  if (status === "aceptado") return [{ label: "Iniciar ruta", status: "en camino" }];
  if (status === "en camino") return [{ label: "Llegue", status: "cargando" }];
  if (status === "cargando") return [{ label: "Completar cargue", status: "cargado" }];
  if (status === "cargado") return [{ label: "Salir a planta", status: "en transito" }];
  if (status === "en transito") return [{ label: "Llegue planta", status: "recibido en planta" }];
  return [];
}

function nextPlantAction(status: ServiceStatus): { label: string; status: ServiceStatus } | null {
  if (status === "en transito") return { label: "Registrar llegada", status: "recibido en planta" };
  return null;
}

export function DashboardClient({ role, services, availableServices, plants, projects, transporters, vehicles, stats, controlTower }: Props) {
  const router = useRouter();
  const shell = roleShell[role];
  const metricItems = roleMetrics(role, services, stats);
  const [selectedStatus, setSelectedStatus] = useState("todos");
  const [activeClientModule, setActiveClientModule] = useState<ClientModule>("Solicitudes activas");
  const [activeTransporterModule, setActiveTransporterModule] = useState<TransporterModule>("Ruta actual");
  const [activePlantModule, setActivePlantModule] = useState<PlantModule>("Recepciones pendientes");
  const [activeAdminModule, setActiveAdminModule] = useState<AdminModule>("Dashboard global");
  const [message, setMessage] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<Record<string, string>>({});
  const [projectAddress, setProjectAddress] = useState("");
  const [projectCity, setProjectCity] = useState("Bogota");
  const [projectLatitude, setProjectLatitude] = useState("");
  const [projectLongitude, setProjectLongitude] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearchState, setAddressSearchState] = useState<"idle" | "loading" | "done">("idle");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLatitude, setPickupLatitude] = useState("");
  const [pickupLongitude, setPickupLongitude] = useState("");
  const [pickupSuggestions, setPickupSuggestions] = useState<AddressSuggestion[]>([]);
  const [pickupSearchState, setPickupSearchState] = useState<"idle" | "loading" | "done">("idle");
  const [selectedVehicleByService, setSelectedVehicleByService] = useState<Record<string, string>>({});
  const [liveVehicleLocation, setLiveVehicleLocation] = useState<LiveVehicleLocation | null>(null);
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(false);
  const [vehicleLocationState, setVehicleLocationState] = useState<"idle" | "requesting" | "active" | "denied" | "unavailable">("idle");
  const [isPending, startTransition] = useTransition();
  const lastVehicleLocationSentAt = useRef(0);
  const liveVehicleLocationRef = useRef<LiveVehicleLocation | null>(null);

  const visibleStatuses = role === "cliente" ? ["todos", "pendiente", "asignado", "en camino", "en transito", "certificado generado", "finalizado"] : ["todos", ...statuses];
  const filtered = selectedStatus === "todos" ? services : services.filter((service) => service.status === selectedStatus);
  const clientCurrentService = services.find((service) => !["finalizado", "certificado generado", "certificado"].includes(service.status)) ?? services[0];
  const clientCertificates = services.filter((service) => service.certificateUrl || service.status === "certificado generado" || service.status === "certificado");
  const transporterCurrentService = services.find((service) => !["finalizado", "certificado generado", "certificado"].includes(service.status)) ?? services[0];
  const transporterAssignedServices = services.filter((service) => service.status === "asignado");
  const canShareVehicleLocation = role === "transportador" && transporterCurrentService?.vehicleId && ["aceptado", "en camino", "cargando", "cargado", "en transito"].includes(transporterCurrentService.status);
  const transporterVehiclePoint = serviceVehiclePoint(transporterCurrentService, liveVehicleLocation);
  const transporterHistory = services.filter((service) => ["finalizado", "certificado generado", "certificado"].includes(service.status));
  const transporterEstimated = services.reduce((sum, service) => sum + service.priceCents, 0) * 0.62;
  const plantPendingServices = services.filter((service) => ["en transito", "recibido en planta", "pesado", "procesado"].includes(service.status));
  const plantTransitServices = services.filter((service) => service.status === "en transito");
  const plantScaleServices = services.filter((service) => ["recibido en planta", "pesado"].includes(service.status));
  const plantTicketServices = services.filter((service) => service.netWeightKg);
  const plantClassificationServices = services.filter((service) => service.netWeightKg && ["pesado", "procesado"].includes(service.status));
  const plantCertificateServices = services.filter((service) => service.certificateUrl || service.status === "certificado generado" || service.status === "certificado");
  const adminDispatchServices = services.filter((service) => service.status === "pendiente" || service.status === "asignado" || !service.transporterId || !service.plantId);
  const adminActiveServices = services.filter((service) => !["finalizado", "certificado generado", "certificado"].includes(service.status));
  const adminCertifiedServices = services.filter((service) => service.certificateUrl || service.status === "certificado generado" || service.status === "certificado");
  const criticalAlerts = controlTower.alerts.filter((alert) => alert.severity === "critical").length;
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (role === "transportador" && liveVehicleLocationRef.current) return;
      startTransition(() => router.refresh());
    }, 8000);
    return () => window.clearInterval(interval);
  }, [role, router]);

  useEffect(() => {
    if (!canShareVehicleLocation || !transporterCurrentService?.vehicleId) {
      liveVehicleLocationRef.current = null;
      window.setTimeout(() => {
        setLocationTrackingEnabled(false);
        setLiveVehicleLocation(null);
        setVehicleLocationState("idle");
      }, 0);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      window.setTimeout(() => {
        setLocationTrackingEnabled(false);
        setVehicleLocationState("unavailable");
        setMessage("Este dispositivo no permite compartir ubicacion en tiempo real.");
      }, 0);
      return;
    }
    if (!navigator.permissions?.query) {
      window.setTimeout(() => setVehicleLocationState("idle"), 0);
      return;
    }

    let cancelled = false;
    let permissionStatus: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        permissionStatus = status;
        const applyPermissionState = () => {
          if (status.state === "granted") {
            setLocationTrackingEnabled(true);
            setVehicleLocationState((current) => (current === "active" ? "active" : "requesting"));
            return;
          }
          if (status.state === "denied") {
            setLocationTrackingEnabled(false);
            setVehicleLocationState("denied");
            setMessage("La ubicacion esta bloqueada para este sitio. Activa el permiso desde el navegador.");
            return;
          }
          setLocationTrackingEnabled(false);
          setVehicleLocationState("idle");
        };
        applyPermissionState();
        status.onchange = applyPermissionState;
      })
      .catch(() => window.setTimeout(() => setVehicleLocationState("idle"), 0));

    return () => {
      cancelled = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [canShareVehicleLocation, transporterCurrentService?.vehicleId]);

  useEffect(() => {
    if (!canShareVehicleLocation || !locationTrackingEnabled || !transporterCurrentService?.vehicleId) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let stopped = false;

    async function saveVehiclePosition(position: GeolocationPosition) {
      if (stopped || !transporterCurrentService?.vehicleId) return;
      const nextLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        heading: position.coords.heading,
        speed: position.coords.speed,
        updatedAt: Date.now(),
      };
      liveVehicleLocationRef.current = nextLocation;
      setLiveVehicleLocation(nextLocation);
      setVehicleLocationState("active");
      const now = Date.now();
      if (now - lastVehicleLocationSentAt.current < 10_000) return;
      lastVehicleLocationSentAt.current = now;
      await fetch("/api/vehicle-locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vehicle_id: transporterCurrentService.vehicleId,
          pickup_request_id: transporterCurrentService.id,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
        }),
      });
    }

    function handleLocationError() {
      if (stopped) return;
      setVehicleLocationState("denied");
      setMessage("Activa permisos de ubicacion para mostrar el vehiculo en ruta.");
    }

    window.setTimeout(() => setVehicleLocationState("requesting"), 0);
    const watchId = navigator.geolocation.watchPosition(
      saveVehiclePosition,
      handleLocationError,
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [canShareVehicleLocation, locationTrackingEnabled, transporterCurrentService?.id, transporterCurrentService?.vehicleId]);

  useEffect(() => {
    if (role !== "cliente" && role !== "admin") return;
    const address = projectAddress.trim();
    if (address.length < 4) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAddressSearchState("loading");
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}&city=${encodeURIComponent(projectCity || "Bogota")}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (response.ok && Array.isArray(result.data)) {
          setAddressSuggestions(result.data);
          setAddressSearchState("done");
        } else {
          setAddressSuggestions([]);
          setAddressSearchState("done");
        }
      } catch {
        if (!controller.signal.aborted) {
          setAddressSuggestions([]);
          setAddressSearchState("done");
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [projectAddress, projectCity, role]);

  useEffect(() => {
    if (role !== "cliente" && role !== "admin") return;
    const address = pickupAddress.trim();
    if (address.length < 4) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPickupSearchState("loading");
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}&city=${encodeURIComponent(projectCity || "Bogota")}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (response.ok && Array.isArray(result.data)) {
          setPickupSuggestions(result.data);
          setPickupSearchState("done");
        } else {
          setPickupSuggestions([]);
          setPickupSearchState("done");
        }
      } catch {
        if (!controller.signal.aborted) {
          setPickupSuggestions([]);
          setPickupSearchState("done");
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [pickupAddress, projectCity, role]);

  async function createPickup(formData: FormData) {
    setMessage(null);
    if (!formData.get("latitude") || !formData.get("longitude")) {
      setMessage("Selecciona una direccion sugerida para ubicar la recoleccion.");
      return;
    }
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/pickup-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "No se pudo crear la solicitud.");
      return;
    }
    setMessage("Solicitud creada con trazabilidad RCDlogiq.");
    startTransition(() => router.refresh());
  }

  async function createProject(formData: FormData) {
    setMessage(null);
    if (!formData.get("latitude") || !formData.get("longitude")) {
      setMessage("Selecciona una direccion sugerida o ingresa latitud y longitud.");
      return;
    }
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    const result = await response.json();
    setMessage(response.ok ? "Obra creada." : result.error ?? "No se pudo crear la obra.");
    if (response.ok) startTransition(() => router.refresh());
  }

  async function updateStatus(serviceId: string, status: ServiceStatus) {
    const response = await fetch("/api/tracking-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pickup_request_id: serviceId,
        status,
        event_name: `estado actualizado a ${status}`,
      }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Estado actualizado." : result.error ?? "No se pudo actualizar el estado.");
    if (response.ok) startTransition(() => router.refresh());
  }

  async function assignTrip(formData: FormData) {
    setMessage(null);
    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    const result = await response.json();
    setMessage(response.ok ? "Servicio asignado." : result.error ?? "No se pudo asignar.");
    if (response.ok) startTransition(() => router.refresh());
  }

  async function acceptAvailableService(serviceId: string) {
    setMessage(null);
    const vehicleId = selectedVehicleByService[serviceId] || vehicles[0]?.id || null;
    const response = await fetch("/api/assignments/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pickup_request_id: serviceId,
        vehicle_id: vehicleId,
      }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Servicio aceptado. Ya puedes iniciar la ruta." : result.error ?? "No se pudo aceptar el servicio.");
    if (response.ok) {
      setActiveTransporterModule("Ruta actual");
      startTransition(() => router.refresh());
    }
  }

  async function recordWeight(formData: FormData) {
    setMessage(null);
    const response = await fetch("/api/weight-tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    const result = await response.json();
    setMessage(response.ok ? "Peso aprobado y certificado habilitado." : result.error ?? "No se pudo registrar bascula.");
    if (response.ok) startTransition(() => router.refresh());
  }

  async function uploadEvidence(formData: FormData) {
    setMessage(null);
    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    setMessage(response.ok ? "Evidencia cargada." : result.error ?? "No se pudo subir evidencia.");
    if (response.ok) startTransition(() => router.refresh());
  }

  function selectAddressSuggestion(suggestion: AddressSuggestion) {
    setProjectAddress(suggestion.label);
    setProjectLatitude(String(suggestion.latitude));
    setProjectLongitude(String(suggestion.longitude));
    setAddressSuggestions([]);
  }

  function selectPickupSuggestion(suggestion: AddressSuggestion) {
    setPickupAddress(suggestion.label);
    setPickupLatitude(String(suggestion.latitude));
    setPickupLongitude(String(suggestion.longitude));
    setPickupSuggestions([]);
  }

  function requestCurrentLocation(target: "project" | "pickup") {
    if (!navigator.geolocation) {
      setMessage("Tu navegador no permite compartir ubicacion.");
      return;
    }

    setMessage("Solicitando ubicacion del telefono...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(7);
        const longitude = position.coords.longitude.toFixed(7);
        const label = `Ubicacion compartida (${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)})`;

        if (target === "project") {
          setProjectLatitude(latitude);
          setProjectLongitude(longitude);
          setProjectAddress((current) => current.trim() || label);
          setAddressSuggestions([]);
          setAddressSearchState("done");
        } else {
          setPickupLatitude(latitude);
          setPickupLongitude(longitude);
          setPickupAddress((current) => current.trim() || label);
          setPickupSuggestions([]);
          setPickupSearchState("done");
        }

        setMessage("Ubicacion guardada. Ya puedes continuar.");
      },
      () => {
        setMessage("No pude tomar la ubicacion. Revisa permisos del navegador.");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }

  function requestTransporterLiveLocation() {
    if (!canShareVehicleLocation || !transporterCurrentService?.vehicleId) {
      setMessage("Primero acepta un servicio para activar la ubicacion en ruta.");
      return;
    }
    if (liveVehicleLocationRef.current) {
      setLocationTrackingEnabled(true);
      setVehicleLocationState("active");
      setMessage("Ubicacion real activa.");
      return;
    }
    if (!navigator.geolocation) {
      setVehicleLocationState("unavailable");
      setMessage("Este dispositivo no permite compartir ubicacion en tiempo real.");
      return;
    }

    setVehicleLocationState("requesting");
    setMessage("Solicitando permiso de ubicacion del telefono...");
    const waitingMessage = window.setTimeout(() => {
      if (!liveVehicleLocationRef.current) {
        setMessage("Sigo esperando la ubicacion del navegador. Revisa que el permiso haya quedado en Permitir.");
      }
    }, 8000);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        window.clearTimeout(waitingMessage);
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          updatedAt: Date.now(),
        };
        liveVehicleLocationRef.current = nextLocation;
        setLiveVehicleLocation(nextLocation);
        setLocationTrackingEnabled(true);
        setVehicleLocationState("active");
        lastVehicleLocationSentAt.current = Date.now();
        await fetch("/api/vehicle-locations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            vehicle_id: transporterCurrentService.vehicleId,
            pickup_request_id: transporterCurrentService.id,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            speed: position.coords.speed,
            heading: position.coords.heading,
          }),
        });
        setMessage("Ubicacion real activa. La ruta se actualiza con este telefono.");
      },
      () => {
        window.clearTimeout(waitingMessage);
        setLocationTrackingEnabled(false);
        setVehicleLocationState("denied");
        setMessage("No pude activar ubicacion. Revisa el permiso del sitio en el navegador.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 },
    );
  }

  async function createVehicle(formData: FormData) {
    setMessage(null);
    const response = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    const result = await response.json();
    setMessage(response.ok ? "Vehiculo registrado." : result.error ?? "No se pudo registrar el vehiculo.");
    if (response.ok) startTransition(() => router.refresh());
  }

  function previewFile(serviceId: string, file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setUploadPreview((current) => ({ ...current, [serviceId]: url }));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen">
      <section className="industrial-grid border-b border-[#d8ded6]">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#2f6b4f]">{shell.focus} - {role}</p>
              <h1 className="mt-2 max-w-3xl text-4xl font-black leading-[1.03] tracking-normal text-[#101820] md:text-6xl">
                {shell.title}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-[#536059]">
                {shell.subtitle}
              </p>
              <p className="mt-2 text-sm font-semibold text-[#2f6b4f]">{isPending ? "Sincronizando cambios..." : "Sincronizado con la operacion"}</p>
            </div>
            <div className="grid min-w-[280px] gap-3 sm:grid-cols-2 lg:min-w-[540px] lg:grid-cols-3">
              {metricItems.map(([label, value]) => <Metric key={label} label={label} value={value} />)}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#101820] text-white">
                <MiniIcon />
              </div>
              <div>
                <h2 className="text-xl font-black">Panel {role}</h2>
                <p className="text-sm text-[#66736b]">{shell.focus}</p>
                <p className="mt-1 text-xs text-[#66736b]">Operacion en vivo</p>
              </div>
            </div>
            <button className="mt-5 w-full rounded-[6px] border border-[#c8d2db] px-3 py-2 text-sm font-bold" onClick={logout} type="button">
              Cerrar sesion
            </button>
          </section>

          <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
            <h2 className="text-lg font-black">Modulos</h2>
            <nav className="mt-3 grid gap-2">
              {role === "cliente"
                ? clientModules.map((item) => (
                    <button
                      key={item}
                      className={`rounded-[6px] px-3 py-2 text-left text-sm font-bold ${activeClientModule === item ? "bg-[#101820] text-white" : "bg-[#f5f7f3] text-[#536059]"}`}
                      onClick={() => setActiveClientModule(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))
                : role === "transportador"
                  ? transporterModules.map((item) => (
                      <button
                        key={item}
                        className={`rounded-[6px] px-3 py-2 text-left text-sm font-bold ${activeTransporterModule === item ? "bg-[#101820] text-white" : "bg-[#f5f7f3] text-[#536059]"}`}
                        onClick={() => setActiveTransporterModule(item)}
                        type="button"
                      >
                        {item}
                      </button>
                    ))
                  : role === "planta"
                    ? plantModules.map((item) => (
                        <button
                          key={item}
                          className={`rounded-[6px] px-3 py-2 text-left text-sm font-bold ${activePlantModule === item ? "bg-[#101820] text-white" : "bg-[#f5f7f3] text-[#536059]"}`}
                          onClick={() => setActivePlantModule(item)}
                          type="button"
                        >
                          {item}
                        </button>
                      ))
                    : adminModules.map((item) => (
                        <button
                          key={item}
                          className={`rounded-[6px] px-3 py-2 text-left text-sm font-bold ${activeAdminModule === item ? "bg-[#101820] text-white" : "bg-[#f5f7f3] text-[#536059]"}`}
                          onClick={() => setActiveAdminModule(item)}
                          type="button"
                        >
                          {item}
                        </button>
                      ))}
            </nav>
          </section>
        </aside>

        <section className="space-y-4">
          {message ? <p className="rounded-[8px] border border-[#afd0bb] bg-[#e5f4ea] px-4 py-3 text-sm font-semibold text-[#245b3e]">{message}</p> : null}

          {role === "cliente" ? (
            <>
              {activeClientModule === "Solicitar recoleccion" ? (
                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-2xl font-black">Crear obra</h2>
                    <form action={createProject} className="mt-4 space-y-3">
                      <label className="block text-sm font-semibold">
                        Nombre
                        <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3" name="name" required />
                      </label>
                      <label className="block text-sm font-semibold">
                        Direccion, conjunto o punto de referencia
                        <input
                          className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3"
                          name="address"
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setProjectAddress(value);
                            setProjectLatitude("");
                            setProjectLongitude("");
                            if (value.trim().length < 4) {
                              setAddressSuggestions([]);
                              setAddressSearchState("idle");
                            }
                          }}
                          required
                          value={projectAddress}
                        />
                      </label>
                      <button className="w-full rounded-[6px] border border-[#2f6b4f] px-4 py-3 text-sm font-black text-[#2f6b4f]" onClick={() => requestCurrentLocation("project")} type="button">
                        Usar mi ubicacion actual
                      </button>
                      {addressSearchState === "loading" ? <p className="text-xs font-semibold text-[#536059]">Buscando direcciones...</p> : null}
                      {addressSuggestions.length > 0 ? (
                        <div className="grid gap-2 rounded-[8px] border border-[#d8ded6] bg-[#f8faf7] p-2">
                          {addressSuggestions.map((suggestion) => (
                            <button
                              className="rounded-[6px] bg-white px-3 py-2 text-left text-xs font-semibold text-[#101820] hover:bg-[#e5f4ea]"
                              key={`${suggestion.latitude}-${suggestion.longitude}-${suggestion.label}`}
                              onClick={() => selectAddressSuggestion(suggestion)}
                              type="button"
                            >
                              {suggestion.label}
                              <span className="mt-1 block text-[#66736b]">{suggestion.latitude.toFixed(5)}, {suggestion.longitude.toFixed(5)} - {suggestion.precision ?? "exacta"}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {addressSearchState === "done" && projectAddress.trim().length >= 4 && addressSuggestions.length === 0 ? (
                        <p className="rounded-[6px] border border-[#ead197] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#6a5520]">
                          No encontre una direccion exacta. Busca por nombre del conjunto o pega coordenadas.
                        </p>
                      ) : null}
                      <label className="block text-sm font-semibold">
                        Ciudad
                        <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3" name="city" onChange={(event) => setProjectCity(event.currentTarget.value)} required value={projectCity} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-semibold">
                          Latitud
                          <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3" inputMode="decimal" name="latitude" onChange={(event) => setProjectLatitude(event.currentTarget.value)} value={projectLatitude} />
                        </label>
                        <label className="block text-sm font-semibold">
                          Longitud
                          <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3" inputMode="decimal" name="longitude" onChange={(event) => setProjectLongitude(event.currentTarget.value)} value={projectLongitude} />
                        </label>
                      </div>
                      <button className="w-full rounded-[6px] border border-[#c8d2db] px-4 py-3 text-sm font-black" disabled={isPending} type="submit">
                        Guardar obra
                      </button>
                    </form>
                  </div>

                  <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-2xl font-black">Crear solicitud</h2>
                    <form action={createPickup} className="mt-4 space-y-3">
                      <label className="block text-sm font-semibold">
                        Obra
                        <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="project_id" required>
                          <option value="">Seleccionar obra</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-semibold">
                          Tipo de residuo
                          <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="residue_type" required>
                            {residues.map((residue) => <option key={residue}>{residue}</option>)}
                          </select>
                        </label>
                        <label className="block text-sm font-semibold">
                          Volumen
                          <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="volume_size" required>
                            {volumes.map((volume) => <option key={volume}>{volume}</option>)}
                          </select>
                        </label>
                      </div>
                      <label className="block text-sm font-semibold">
                        Fecha/hora
                        <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3" name="scheduled_at" required type="datetime-local" />
                      </label>
                      <label className="block text-sm font-semibold">
                        Direccion, conjunto o punto de referencia
                        <input
                          className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3"
                          name="address"
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setPickupAddress(value);
                            setPickupLatitude("");
                            setPickupLongitude("");
                            if (value.trim().length < 4) {
                              setPickupSuggestions([]);
                              setPickupSearchState("idle");
                            }
                          }}
                          required
                          value={pickupAddress}
                        />
                      </label>
                      <button className="w-full rounded-[6px] border border-[#2f6b4f] px-4 py-3 text-sm font-black text-[#2f6b4f]" onClick={() => requestCurrentLocation("pickup")} type="button">
                        Usar mi ubicacion actual
                      </button>
                      {pickupSearchState === "loading" ? <p className="text-xs font-semibold text-[#536059]">Buscando direcciones...</p> : null}
                      {pickupSuggestions.length > 0 ? (
                        <div className="grid gap-2 rounded-[8px] border border-[#d8ded6] bg-[#f8faf7] p-2">
                          {pickupSuggestions.map((suggestion) => (
                            <button
                              className="rounded-[6px] bg-white px-3 py-2 text-left text-xs font-semibold text-[#101820] hover:bg-[#e5f4ea]"
                              key={`${suggestion.latitude}-${suggestion.longitude}-${suggestion.label}`}
                              onClick={() => selectPickupSuggestion(suggestion)}
                              type="button"
                            >
                              {suggestion.label}
                              <span className="mt-1 block text-[#66736b]">{suggestion.latitude.toFixed(5)}, {suggestion.longitude.toFixed(5)} - {suggestion.precision ?? "exacta"}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {pickupSearchState === "done" && pickupAddress.trim().length >= 4 && pickupSuggestions.length === 0 ? (
                        <p className="rounded-[6px] border border-[#ead197] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#6a5520]">
                          No encontre una direccion exacta. Busca por nombre del conjunto o pega coordenadas.
                        </p>
                      ) : null}
                      <input name="latitude" type="hidden" value={pickupLatitude} />
                      <input name="longitude" type="hidden" value={pickupLongitude} />
                      <input name="plant_id" type="hidden" value="" />
                      <input name="price_cents" type="hidden" value="0" />
                      <button className="w-full rounded-[6px] bg-[#2f6b4f] px-4 py-3 text-sm font-black text-white" disabled={isPending} type="submit">
                        Solicitar recoleccion
                      </button>
                    </form>
                  </div>
                </section>
              ) : null}

              {activeClientModule === "Solicitudes activas" ? (
                <>
                  <div className="grid gap-3 rounded-[8px] border border-[#d8ded6] bg-white p-4 md:grid-cols-[280px_1fr]">
                    <div>
                      <h2 className="text-xl font-black">Mapa operacional</h2>
                      <p className="text-sm text-[#66736b]">Servicio actual, proxima parada y seguimiento.</p>
                    </div>
                    <LiveRouteMap
                      destination={null}
                      routeOrigin={{ label: clientCurrentService?.address ?? "Obra sin solicitud", latitude: clientCurrentService?.projectLatitude ?? null, longitude: clientCurrentService?.projectLongitude ?? null }}
                      serviceStatus={clientCurrentService?.status ?? "pendiente"}
                      vehicle={serviceVehiclePoint(clientCurrentService)}
                    />
                  </div>

                  {clientCurrentService ? (
                    <article className="rounded-[8px] border border-[#d8ded6] bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-mono text-xs font-semibold text-[#2f6b4f]">Servicio actual</p>
                          <h3 className="mt-1 text-lg font-bold text-[#101820]">{clientCurrentService.project}</h3>
                          <p className="mt-1 text-sm text-[#66736b]">{clientCurrentService.address}</p>
                        </div>
                        <div className="flex flex-col items-start gap-2 md:items-end">
                          <StatusPill status={clientCurrentService.status} />
                          <p className="text-right text-xs font-bold text-[#536059]">{clientStatusLabel(clientCurrentService.status)}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <Metric label="Residuo" value={clientCurrentService.residue} />
                        <Metric label="Volumen" value={clientCurrentService.volume} />
                        <Metric label="Destino" value={clientCurrentService.plant} />
                        <Metric label="Peso" value={clientCurrentService.netWeightKg ? `${(clientCurrentService.netWeightKg / 1000).toFixed(2)} t` : "pendiente"} />
                      </div>
                      <div className="mt-4 rounded-[8px] bg-[#f5f7f3] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#66736b]">Tracking simplificado</p>
                        <div className="mt-2">
                          <TrackingTimeline events={clientCurrentService.timeline} photos={clientCurrentService.photos} />
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <form action={uploadEvidence} className="rounded-[8px] border border-dashed border-[#c8d2db] bg-[#f8faf7] p-2 sm:col-span-2">
                          <input name="pickup_request_id" type="hidden" value={clientCurrentService.id} />
                          <input name="kind" type="hidden" value="residuo" />
                          <input className="w-full text-xs" name="file" required type="file" accept="image/*,.pdf" onChange={(event) => previewFile(clientCurrentService.id, event.currentTarget.files?.[0])} />
                          {uploadPreview[clientCurrentService.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt="Preview evidencia" className="mt-2 h-28 w-full rounded-[6px] object-cover" src={uploadPreview[clientCurrentService.id]} />
                          ) : null}
                          <button className="mt-2 w-full rounded-[6px] border border-[#c8d2db] px-3 py-2 text-sm font-bold" type="submit">Subir fotos</button>
                        </form>
                        <div className="grid gap-2">
                          {clientCurrentService.status === "pendiente" ? <button className="rounded-[6px] border border-[#b5473f] px-3 py-3 text-sm font-black text-[#b5473f]" type="button" onClick={() => updateStatus(clientCurrentService.id, "finalizado")}>Cancelar solicitud</button> : null}
                          {clientCurrentService.status === "certificado generado" || clientCurrentService.status === "certificado" ? (
                            <a className="rounded-[6px] bg-[#101820] px-3 py-3 text-center text-sm font-black text-white" href={`/api/certificates/${clientCurrentService.id}`} target="_blank">Descargar certificado</a>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ) : (
                    <div className="rounded-[8px] border border-dashed border-[#c8d2db] bg-white p-8 text-center">
                      <h3 className="text-xl font-black">{shell.empty}</h3>
                    </div>
                  )}
                </>
              ) : null}

              {activeClientModule === "Mis obras" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Historial de la cuenta</h2>
                  <div className="mt-4 grid gap-3">
                    {services.map((service) => (
                      <div key={service.id} className="rounded-[8px] border border-[#d8ded6] p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-bold text-[#101820]">{service.project}</p>
                            <p className="text-sm text-[#66736b]">{service.address}</p>
                          </div>
                          <StatusPill status={service.status} />
                        </div>
                      </div>
                    ))}
                    {services.length === 0 ? <p className="text-sm text-[#66736b]">Todavia no hay historial para esta cuenta.</p> : null}
                  </div>
                </section>
              ) : null}

              {activeClientModule === "Certificados" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Certificados</h2>
                  <div className="mt-4 grid gap-3">
                    {clientCertificates.map((service) => (
                      <a key={service.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#d8ded6] px-4 py-3 text-sm font-black text-[#101820]" href={`/api/certificates/${service.id}`} target="_blank">
                        <span>{service.project}</span>
                        <span>Descargar PDF</span>
                      </a>
                    ))}
                    {clientCertificates.length === 0 ? <p className="text-sm text-[#66736b]">Aun no tienes certificados disponibles.</p> : null}
                  </div>
                </section>
              ) : null}

            </>
          ) : null}

          {role === "transportador" ? (
            <>
              {activeTransporterModule === "Ruta actual" ? (
                <>
                  <div className="grid gap-3 rounded-[8px] border border-[#d8ded6] bg-white p-4 md:grid-cols-[280px_1fr]">
                    <div>
                      <h2 className="text-xl font-black">Ruta actual</h2>
                      <p className="text-sm text-[#66736b]">Ruta a la proxima parada y seguimiento en vivo.</p>
                    </div>
                    <LiveRouteMap
                      allowLocationRequest
                      destination={null}
                      onRequestLocation={requestTransporterLiveLocation}
                      routeOrigin={{ label: transporterCurrentService?.address ?? "Obra sin servicio", latitude: transporterCurrentService?.projectLatitude ?? null, longitude: transporterCurrentService?.projectLongitude ?? null }}
                      serviceStatus={transporterCurrentService?.status ?? "pendiente"}
                      vehicle={transporterVehiclePoint}
                    />
                  </div>

                  {transporterCurrentService ? (
                    <article className="rounded-[8px] border border-[#d8ded6] bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-mono text-xs font-semibold text-[#2f6b4f]">Servicio actual</p>
                          <h3 className="mt-1 text-lg font-bold text-[#101820]">{transporterCurrentService.project}</h3>
                          <p className="mt-1 text-sm text-[#66736b]">{transporterCurrentService.address}</p>
                        </div>
                        <StatusPill status={transporterCurrentService.status} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <Metric label="Residuo" value={transporterCurrentService.residue} />
                        <Metric label="Volumen" value={transporterCurrentService.volume} />
                        <Metric label="Proxima parada" value={transporterCurrentService.address} />
                        <Metric label="Vehiculo" value={transporterCurrentService.vehicle} />
                      </div>
                      {canShareVehicleLocation ? (
                        <div className={`mt-3 flex flex-col gap-3 rounded-[8px] px-3 py-3 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between ${vehicleLocationState === "active" ? "bg-[#e5f4ea] text-[#245b3e]" : "bg-[#fff8e8] text-[#6a5520]"}`}>
                          <span>
                            {vehicleLocationState === "active"
                              ? "Ubicacion real activa. La ruta se recalcula sin recargar el mapa en cada punto GPS."
                              : vehicleLocationState === "requesting"
                                ? "Solicitando permiso de ubicacion para activar la ruta en vivo..."
                                : vehicleLocationState === "unavailable"
                                  ? "Este dispositivo no permite compartir ubicacion en tiempo real."
                                  : vehicleLocationState === "denied"
                                    ? "Ubicacion bloqueada. Activa el permiso del sitio en el navegador."
                                    : "Activa ubicacion para iniciar navegacion en vivo."}
                          </span>
                          <button className="rounded-[6px] bg-[#101820] px-3 py-2 text-xs font-black text-white" onClick={requestTransporterLiveLocation} type="button">
                            Activar ubicacion
                          </button>
                        </div>
                      ) : null}
                      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_240px]">
                        <div className="rounded-[8px] bg-[#f5f7f3] p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#66736b]">Timeline operativo</p>
                          <div className="mt-2">
                            <TrackingTimeline events={transporterCurrentService.timeline} photos={transporterCurrentService.photos} />
                          </div>
                        </div>
                        <div className="grid content-start gap-2">
                          {nextTransportActions(transporterCurrentService.status).map((action) => (
                            <button key={action.label} className="rounded-[6px] bg-[#101820] px-4 py-4 text-sm font-black text-white" type="button" onClick={() => updateStatus(transporterCurrentService.id, action.status)}>
                              {action.label}
                            </button>
                          ))}
                          {transporterCurrentService.status === "asignado" ? (
                            <button className="rounded-[6px] border border-[#b5473f] px-4 py-4 text-sm font-black text-[#b5473f]" type="button" onClick={() => updateStatus(transporterCurrentService.id, "pendiente")}>
                              Rechazar
                            </button>
                          ) : null}
                          {nextTransportActions(transporterCurrentService.status).length === 0 ? <p className="rounded-[8px] bg-[#f5f7f3] p-3 text-sm font-semibold text-[#536059]">No hay accion pendiente para este servicio.</p> : null}
                        </div>
                      </div>
                    </article>
                  ) : (
                    <div className="rounded-[8px] border border-dashed border-[#c8d2db] bg-white p-8 text-center">
                      <h3 className="text-xl font-black">No tienes ruta activa</h3>
                      <p className="mt-2 text-sm text-[#66736b]">Revisa Servicios asignados para aceptar tu siguiente servicio.</p>
                    </div>
                  )}
                </>
              ) : null}

              {activeTransporterModule === "Servicios asignados" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Servicios disponibles y asignados</h2>
                  <div className="mt-4 grid gap-3">
                    {availableServices.length > 0 ? (
                      <div className="grid gap-3">
                        <p className="text-sm font-black uppercase tracking-[0.08em] text-[#2f6b4f]">Disponibles para aceptar</p>
                        {availableServices.map((service) => (
                          <article key={service.id} className="rounded-[8px] border border-[#c8d2db] bg-[#f8faf7] p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="font-bold text-[#101820]">{service.project}</p>
                                <p className="text-sm text-[#66736b]">{service.address}</p>
                                <p className="mt-2 text-xs font-semibold text-[#536059]">{service.residue} - {service.volume} - Quarzium S.A.S</p>
                              </div>
                              <div className="grid gap-2 sm:min-w-52">
                                <select
                                  className="rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3 text-sm font-bold text-[#101820]"
                                  onChange={(event) => setSelectedVehicleByService((current) => ({ ...current, [service.id]: event.currentTarget.value }))}
                                  value={selectedVehicleByService[service.id] ?? vehicles[0]?.id ?? ""}
                                >
                                  {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}
                                </select>
                                <button className="rounded-[6px] bg-[#2f6b4f] px-4 py-3 text-sm font-black text-white" type="button" onClick={() => acceptAvailableService(service.id)}>
                                  Aceptar viaje
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-sm font-black uppercase tracking-[0.08em] text-[#536059]">Asignados a tu cuenta</p>
                    {transporterAssignedServices.map((service) => (
                      <article key={service.id} className="rounded-[8px] border border-[#d8ded6] p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-bold text-[#101820]">{service.project}</p>
                            <p className="text-sm text-[#66736b]">{service.address}</p>
                            <p className="mt-2 text-xs font-semibold text-[#536059]">{service.residue} - {service.volume} - {service.plant}</p>
                          </div>
                          <div className="grid gap-2 sm:min-w-40">
                            <button className="rounded-[6px] bg-[#2f6b4f] px-3 py-3 text-sm font-black text-white" type="button" onClick={() => updateStatus(service.id, "aceptado")}>Aceptar servicio</button>
                            <button className="rounded-[6px] border border-[#b5473f] px-3 py-3 text-sm font-black text-[#b5473f]" type="button" onClick={() => updateStatus(service.id, "pendiente")}>Rechazar</button>
                          </div>
                        </div>
                      </article>
                    ))}
                    {transporterAssignedServices.length === 0 ? <p className="rounded-[8px] border border-dashed border-[#c8d2db] p-4 text-sm text-[#66736b]">No tienes servicios asignados por aceptar.</p> : null}
                  </div>
                </section>
              ) : null}

              {activeTransporterModule === "Evidencias" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Evidencias</h2>
                  {transporterCurrentService ? (
                    <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
                      <form action={uploadEvidence} className="space-y-3 rounded-[8px] border border-dashed border-[#c8d2db] bg-[#f8faf7] p-3">
                        <input name="pickup_request_id" type="hidden" value={transporterCurrentService.id} />
                        <label className="block text-sm font-semibold">
                          Tipo de evidencia
                          <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="kind">
                            <option value="antes">Foto llegada</option>
                            <option value="cargue">Foto cargue</option>
                            <option value="despues">Foto descarga</option>
                            <option value="residuo">Residuo</option>
                          </select>
                        </label>
                        <label className="block cursor-pointer rounded-[6px] bg-white p-3 text-center text-xs font-bold text-[#536059]">
                          Seleccionar evidencia
                          <input className="mt-2 w-full text-xs" name="file" required type="file" accept="image/*,.pdf" onChange={(event) => previewFile(transporterCurrentService.id, event.currentTarget.files?.[0])} />
                        </label>
                        {uploadPreview[transporterCurrentService.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt="Preview evidencia" className="h-32 w-full rounded-[6px] object-cover" src={uploadPreview[transporterCurrentService.id]} />
                        ) : null}
                        <button className="w-full rounded-[6px] bg-[#101820] px-3 py-3 text-sm font-black text-white" type="submit">Subir evidencia</button>
                      </form>
                      <EvidenceGrid photos={transporterCurrentService.photos} />
                    </div>
                  ) : <p className="mt-4 text-sm text-[#66736b]">No tienes servicio activo para subir evidencias.</p>}
                </section>
              ) : null}

              {activeTransporterModule === "Vehiculo" ? (
                <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
                  <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-2xl font-black">Registrar vehiculo</h2>
                    <form action={createVehicle} className="mt-4 grid gap-3">
                      <label className="block text-sm font-semibold">
                        Placa
                        <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3 uppercase" name="plate" required />
                      </label>
                      <label className="block text-sm font-semibold">
                        Tipo
                        <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="vehicle_type" required>
                          <option value="volqueta">Volqueta</option>
                          <option value="camion">Camion</option>
                          <option value="dobletroque">Dobletroque</option>
                          <option value="otro">Otro</option>
                        </select>
                      </label>
                      <label className="block text-sm font-semibold">
                        Capacidad toneladas
                        <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3" inputMode="decimal" name="capacity_tons" required type="number" step="0.1" />
                      </label>
                      <label className="block text-sm font-semibold">
                        Ciudad
                        <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3" defaultValue="Bogota" name="city" required />
                      </label>
                      <button className="rounded-[6px] bg-[#2f6b4f] px-4 py-3 text-sm font-black text-white" type="submit">Guardar vehiculo</button>
                    </form>
                  </div>
                  <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-2xl font-black">Mis vehiculos</h2>
                    {transporterCurrentService && transporterCurrentService.vehicle !== "Vehiculo pendiente" ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <Metric label="Vehiculo activo" value={transporterCurrentService.vehicle} />
                        <Metric label="Servicio" value={transporterCurrentService.project} />
                        <Metric label="Estado" value={transporterCurrentService.status} />
                      </div>
                    ) : null}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {vehicles.map((vehicle) => <VehicleSummary key={vehicle.id} vehicle={vehicle} />)}
                      {vehicles.length === 0 ? <p className="rounded-[8px] border border-dashed border-[#c8d2db] p-4 text-sm font-semibold text-[#66736b]">Registra tu primer vehiculo para recibir asignaciones completas.</p> : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {activeTransporterModule === "Historial de servicios" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Historial de servicios</h2>
                  <div className="mt-4 grid gap-3">
                    {transporterHistory.map((service) => (
                      <div key={service.id} className="rounded-[8px] border border-[#d8ded6] p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-bold text-[#101820]">{service.project}</p>
                            <p className="text-sm text-[#66736b]">{service.plant} - {service.netWeightKg ? `${(service.netWeightKg / 1000).toFixed(2)} t` : "peso pendiente"}</p>
                          </div>
                          <StatusPill status={service.status} />
                        </div>
                      </div>
                    ))}
                    {transporterHistory.length === 0 ? <p className="text-sm text-[#66736b]">Todavia no hay servicios cerrados.</p> : null}
                  </div>
                </section>
              ) : null}

              {activeTransporterModule === "Ganancias estimadas" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Ganancias estimadas</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="Servicios completados" value={`${transporterHistory.length}`} />
                    <Metric label="Estimado total" value={money(transporterEstimated)} />
                    <Metric label="Pendientes cierre" value={`${services.length - transporterHistory.length}`} />
                    <Metric label="Semana" value={money(transporterEstimated)} />
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {role === "planta" ? (
            <>
              {activePlantModule === "Recepciones pendientes" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Recepciones pendientes</h2>
                  <p className="mt-1 text-sm text-[#66736b]">Cola de cargas para llegada, bascula, clasificacion y aprobacion.</p>
                  <div className="mt-4 grid gap-3">
                    {plantPendingServices.map((service) => {
                      const action = nextPlantAction(service.status);
                      return (
                        <article key={service.id} className="rounded-[8px] border border-[#d8ded6] p-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="font-bold text-[#101820]">{service.project}</p>
                              <p className="text-sm text-[#66736b]">{service.address}</p>
                              <p className="mt-2 text-xs font-semibold text-[#536059]">Transportador: {service.transporter} - Vehiculo: {service.vehicle}</p>
                              <p className="text-xs font-semibold text-[#536059]">{service.residue} - {service.volume}</p>
                            </div>
                            <div className="grid gap-2 sm:min-w-48">
                              <StatusPill status={service.status} />
                              {action ? (
                                <button className="rounded-[6px] bg-[#101820] px-3 py-3 text-sm font-black text-white" type="button" onClick={() => updateStatus(service.id, action.status)}>
                                  {action.label}
                                </button>
                              ) : null}
                              {service.status === "recibido en planta" ? (
                                <button className="rounded-[6px] bg-[#d7a642] px-3 py-3 text-sm font-black text-[#101820]" type="button" onClick={() => setActivePlantModule("Bascula")}>
                                  Ir a bascula
                                </button>
                              ) : null}
                              {service.status === "pesado" ? (
                                <button className="rounded-[6px] bg-[#101820] px-3 py-3 text-sm font-black text-white" type="button" onClick={() => setActivePlantModule("Clasificacion")}>
                                  Ir a clasificacion
                                </button>
                              ) : null}
                              {service.status === "procesado" && service.netWeightKg ? (
                                <button className="rounded-[6px] bg-[#2f6b4f] px-3 py-3 text-sm font-black text-white" type="button" onClick={() => setActivePlantModule("Certificados")}>
                                  Ver certificado
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {plantPendingServices.length === 0 ? <p className="rounded-[8px] border border-dashed border-[#c8d2db] p-4 text-sm text-[#66736b]">No hay recepciones pendientes para esta planta.</p> : null}
                  </div>
                </section>
              ) : null}

              {activePlantModule === "Vehiculos en transito" ? (
                <section className="space-y-4">
                  <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-2xl font-black">Vehiculos en transito</h2>
                    <p className="text-sm text-[#66736b]">Cargas que vienen hacia la planta.</p>
                  </div>
                  {plantTransitServices.map((service) => (
                    <article key={service.id} className="grid gap-3 rounded-[8px] border border-[#d8ded6] bg-white p-4 md:grid-cols-[260px_1fr]">
                      <div>
                        <StatusPill status={service.status} />
                        <h3 className="mt-3 font-black text-[#101820]">{service.project}</h3>
                        <p className="text-sm text-[#66736b]">{service.transporter} - {service.vehicle}</p>
                        <p className="mt-2 text-xs font-semibold text-[#536059]">{service.residue} - {stableDate(service.scheduledAt)}</p>
                      </div>
                      <LiveRouteMap
                        destination={null}
                        routeOrigin={{ label: service.address, latitude: service.projectLatitude, longitude: service.projectLongitude }}
                        serviceStatus={service.status}
                        vehicle={serviceVehiclePoint(service)}
                      />
                    </article>
                  ))}
                  {plantTransitServices.length === 0 ? <p className="rounded-[8px] border border-dashed border-[#c8d2db] bg-white p-4 text-sm text-[#66736b]">No hay vehiculos en transito.</p> : null}
                </section>
              ) : null}

              {activePlantModule === "Bascula" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Bascula</h2>
                  <div className="mt-4 grid gap-4">
                    {plantScaleServices.map((service) => (
                      <article key={service.id} className="grid gap-3 rounded-[8px] border border-[#d8ded6] p-3 lg:grid-cols-[1fr_320px]">
                        <div>
                          <StatusPill status={service.status} />
                          <h3 className="mt-3 font-black text-[#101820]">{service.project}</h3>
                          <p className="text-sm text-[#66736b]">{service.vehicle} - {service.residue}</p>
                          <p className="mt-2 text-xs font-semibold text-[#536059]">Peso actual: {service.netWeightKg ? `${(service.netWeightKg / 1000).toFixed(2)} t` : "pendiente"}</p>
                        </div>
                        <form action={recordWeight} className="grid gap-2">
                          <input name="pickup_request_id" type="hidden" value={service.id} />
                          <input name="plant_id" type="hidden" value={service.plantId ?? ""} />
                          <label className="grid gap-1 text-xs font-bold text-[#536059]">
                            Peso bruto kg
                            <input className="rounded-[6px] border border-[#c8d2db] px-3 py-2 text-sm text-[#101820]" name="gross_weight_kg" required type="number" />
                          </label>
                          <label className="grid gap-1 text-xs font-bold text-[#536059]">
                            Tara kg
                            <input className="rounded-[6px] border border-[#c8d2db] px-3 py-2 text-sm text-[#101820]" name="tare_weight_kg" required type="number" />
                          </label>
                          <label className="grid gap-1 text-xs font-bold text-[#536059]">
                            Clasificacion
                            <select className="rounded-[6px] border border-[#c8d2db] px-3 py-2 text-sm text-[#101820]" name="material_classification">
                              {residues.map((residue) => <option key={residue}>{residue}</option>)}
                            </select>
                          </label>
                          <label className="grid gap-1 text-xs font-bold text-[#536059]">
                            Disposicion
                            <select className="rounded-[6px] border border-[#c8d2db] px-3 py-2 text-sm text-[#101820]" name="disposition">
                              <option value="reciclaje">reciclaje</option>
                              <option value="trituracion">trituracion</option>
                              <option value="disposicion final">disposicion final</option>
                            </select>
                          </label>
                          <button className="rounded-[6px] bg-[#d7a642] px-3 py-3 text-sm font-black text-[#101820]" type="submit">Registrar peso y aprobar recepcion</button>
                        </form>
                      </article>
                    ))}
                    {plantScaleServices.length === 0 ? <p className="rounded-[8px] border border-dashed border-[#c8d2db] p-4 text-sm text-[#66736b]">No hay servicios listos para bascula.</p> : null}
                  </div>
                </section>
              ) : null}

              {activePlantModule === "Tickets bascula" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Tickets bascula</h2>
                  <div className="mt-4 grid gap-3">
                    {plantTicketServices.map((service) => (
                      <div key={service.id} className="grid gap-2 rounded-[8px] border border-[#d8ded6] p-3 text-sm sm:grid-cols-5">
                        <span className="font-bold text-[#101820]">{stableDate(service.createdAt)}</span>
                        <span>{service.project}</span>
                        <span>{service.vehicle}</span>
                        <span>{service.residue}</span>
                        <span className="font-black">{service.netWeightKg ? `${service.netWeightKg} kg` : "pendiente"}</span>
                      </div>
                    ))}
                    {plantTicketServices.length === 0 ? <p className="text-sm text-[#66736b]">Aun no hay tickets registrados.</p> : null}
                  </div>
                </section>
              ) : null}

              {activePlantModule === "Clasificacion" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Clasificacion</h2>
                  <div className="mt-4 grid gap-3">
                    {plantClassificationServices.map((service) => (
                      <div key={service.id} className="flex flex-col gap-3 rounded-[8px] border border-[#d8ded6] p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-[#101820]">{service.project}</p>
                          <p className="text-sm text-[#66736b]">{service.residue} - {service.netWeightKg ? `${(service.netWeightKg / 1000).toFixed(2)} t` : "peso pendiente"}</p>
                        </div>
                        {service.status === "pesado" ? (
                          <button className="rounded-[6px] bg-[#101820] px-3 py-3 text-sm font-black text-white" type="button" onClick={() => updateStatus(service.id, "procesado")}>Clasificar material</button>
                        ) : (
                          <button className="rounded-[6px] bg-[#2f6b4f] px-3 py-3 text-sm font-black text-white" type="button" onClick={() => setActivePlantModule("Certificados")}>Ver certificado</button>
                        )}
                      </div>
                    ))}
                    {plantClassificationServices.length === 0 ? <p className="text-sm text-[#66736b]">No hay cargas con peso validado para clasificar.</p> : null}
                  </div>
                </section>
              ) : null}

              {activePlantModule === "Certificados" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Certificados</h2>
                  <div className="mt-4 grid gap-3">
                    {plantCertificateServices.map((service) => (
                      <a key={service.id} className="flex flex-col gap-1 rounded-[8px] border border-[#d8ded6] px-4 py-3 text-sm font-black text-[#101820] sm:flex-row sm:items-center sm:justify-between" href={`/api/certificates/${service.id}`} target="_blank">
                        <span>{service.project} - {service.netWeightKg ? `${(service.netWeightKg / 1000).toFixed(2)} t` : "peso validado"}</span>
                        <span>Descargar PDF</span>
                      </a>
                    ))}
                    {plantCertificateServices.length === 0 ? <p className="text-sm text-[#66736b]">Aun no hay certificados asociados a esta planta.</p> : null}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {role === "admin" ? (
            <>
              {activeAdminModule === "Dashboard global" ? (
                <>
                  <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-2xl font-black">Dashboard global</h2>
                    <p className="text-sm text-[#66736b]">Vision ejecutiva de red, alertas y servicios criticos.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Metric label="Servicios activos" value={`${stats.active}`} />
                      <Metric label="Pendientes" value={`${stats.pending}`} />
                      <Metric label="En transito" value={`${stats.inTransit}`} />
                      <Metric label="Certificados" value={`${adminCertifiedServices.length}`} />
                      <Metric label="Toneladas hoy" value={`${Number(stats.tonsToday).toFixed(2)} t`} />
                      <Metric label="Ingresos hoy" value={money(stats.revenueToday)} />
                      <Metric label="Utilizacion flota" value={`${Math.min(100, services.filter((service) => service.transporterId).length * 18)}%`} />
                      <Metric label="Alertas abiertas" value={`${controlTower.alerts.length}`} />
                      <Metric label="Criticas" value={`${criticalAlerts}`} />
                    </div>
                  </section>
                  <section className="grid gap-3 rounded-[8px] border border-[#d8ded6] bg-white p-4 lg:grid-cols-3">
                    <div>
                      <h2 className="text-xl font-black">Operacion RCDlogiq</h2>
                      <p className="text-sm text-[#66736b]">Alertas, cumplimiento y automatizacion operacional en una sola lectura.</p>
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                      {controlTower.alerts.slice(0, 4).map((alert) => (
                        <div key={alert.id} className={`rounded-[8px] border p-3 text-sm ${alert.severity === "critical" ? "border-[#e3a4a4] bg-[#fff0f0]" : "border-[#ead197] bg-[#fff8e8]"}`}>
                          <p className="font-black text-[#101820]">{alert.type} - {alert.severity}</p>
                          <p className="text-[#66736b]">{alert.message}</p>
                        </div>
                      ))}
                      {controlTower.alerts.length === 0 ? <p className="rounded-[8px] border border-dashed border-[#c8d2db] p-3 text-sm text-[#66736b]">Sin alertas abiertas.</p> : null}
                    </div>
                  </section>
                  <section className="grid gap-3 rounded-[8px] border border-[#d8ded6] bg-white p-4 md:grid-cols-[280px_1fr]">
                    <div>
                      <h2 className="text-xl font-black">Mapa operacional general</h2>
                      <p className="text-sm text-[#66736b]">Primer servicio critico visible en la red.</p>
                    </div>
                    <LiveRouteMap
                      destination={null}
                      routeOrigin={{ label: adminActiveServices[0]?.address ?? "Obra sin solicitud", latitude: adminActiveServices[0]?.projectLatitude ?? null, longitude: adminActiveServices[0]?.projectLongitude ?? null }}
                      serviceStatus={adminActiveServices[0]?.status ?? "pendiente"}
                      vehicle={serviceVehiclePoint(adminActiveServices[0])}
                    />
                  </section>
                  <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-xl font-black">Servicios criticos</h2>
                    <div className="mt-3 grid gap-3">
                      {adminDispatchServices.slice(0, 5).map((service) => (
                        <div key={service.id} className="flex flex-col gap-2 rounded-[8px] border border-[#d8ded6] p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-bold text-[#101820]">{service.project}</p>
                            <p className="text-sm text-[#66736b]">{service.transporter} - {service.plant}</p>
                          </div>
                          <StatusPill status={service.status} />
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-xl font-black">Cumplimiento reciente</h2>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {controlTower.sla.slice(0, 6).map((sla) => (
                        <div key={sla.pickup_request_id} className="rounded-[8px] border border-[#d8ded6] p-3 text-sm">
                          <p className="font-black text-[#101820]">{sla.sla_status}</p>
                          <p className="text-[#66736b]">Total: {sla.total_service_duration_minutes ?? "en curso"} min · Asignacion: {sla.request_to_assignment_minutes ?? "pendiente"} min</p>
                        </div>
                      ))}
                      {controlTower.sla.length === 0 ? <p className="text-sm text-[#66736b]">El cumplimiento se calculara con los siguientes eventos operativos.</p> : null}
                    </div>
                  </section>
                </>
              ) : null}

              {activeAdminModule === "Asignacion operativa" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Asignacion operativa</h2>
                  <p className="mt-1 text-sm text-[#66736b]">Solicitudes que necesitan transportador, vehiculo, planta o reasignacion.</p>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {controlTower.suggestions.slice(0, 4).map((suggestion) => (
                      <div key={suggestion.id} className="rounded-[8px] border border-[#afd0bb] bg-[#f1fbf4] p-3 text-sm">
                        <p className="font-black text-[#101820]">Sugerencia automatica</p>
                        <p className="mt-1 text-[#536059]">{suggestion.transporter ?? "Transportador pendiente"} - {suggestion.plate ?? "Vehiculo pendiente"} - {suggestion.plant ?? "Planta pendiente"}</p>
                        <p className="mt-1 text-xs font-semibold text-[#2f6b4f]">Llegada estimada {suggestion.eta_minutes ?? "por calcular"} min - {suggestion.distance_km ?? "por calcular"} km - afinidad {suggestion.transporter_score ?? "-"} / {suggestion.plant_score ?? "-"}</p>
                      </div>
                    ))}
                    {controlTower.suggestions.length === 0 ? <p className="rounded-[8px] border border-dashed border-[#c8d2db] p-3 text-sm text-[#66736b]">RCDlogiq mostrara sugerencias cuando entren solicitudes nuevas.</p> : null}
                  </div>
                  <form action={assignTrip} className="mt-4 grid gap-3 lg:grid-cols-4">
                    <label className="block text-sm font-semibold">
                      Solicitud
                      <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="pickup_request_id" required>
                        {adminDispatchServices.map((service) => <option key={service.id} value={service.id}>{service.project} - {service.status}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold">
                      Transportador
                      <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="transporter_id" required>
                        {transporters.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold">
                      Vehiculo
                      <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="vehicle_id">
                        <option value="">Vehiculo pendiente</option>
                        {vehicles.map((option) => <option key={option.id} value={option.id}>{option.label} - {option.meta}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold">
                      Destino
                      <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="plant_id" required>
                        {plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}
                      </select>
                    </label>
                    <button className="rounded-[6px] bg-[#2f6b4f] px-4 py-3 text-sm font-black text-white lg:col-span-4" type="submit">Asignar servicio</button>
                  </form>
                </section>
              ) : null}

              {activeAdminModule === "Asignaciones" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Asignaciones</h2>
                  <div className="mt-4 grid gap-3">
                    {services.filter((service) => service.transporterId || service.vehicleId || service.plantId).map((service) => (
                      <div key={service.id} className="grid gap-2 rounded-[8px] border border-[#d8ded6] p-3 text-sm md:grid-cols-5">
                        <span className="font-bold text-[#101820]">{service.project}</span>
                        <span>{service.transporter}</span>
                        <span>{service.vehicle}</span>
                        <span>{service.plant}</span>
                        <StatusPill status={service.status} />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeAdminModule === "Monitor operativo" ? (
                <section className="space-y-4">
                  <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-2xl font-black">Monitor operativo</h2>
                    <label className="mt-3 block max-w-xs text-sm font-semibold">
                      Estado
                      <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-2" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                        {visibleStatuses.map((status) => <option key={status} value={status}>{status === "todos" ? "Todos" : status}</option>)}
                      </select>
                    </label>
                  </div>
                  {filtered.map((service) => (
                    <article key={service.id} className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-bold text-[#101820]">{service.project}</p>
                          <p className="text-sm text-[#66736b]">{service.transporter} - {service.vehicle} - {service.plant}</p>
                        </div>
                        <select className="rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3 text-sm font-semibold" defaultValue={service.status} onChange={(event) => updateStatus(service.id, event.target.value as ServiceStatus)}>
                          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                      <div className="mt-4">
                        <LiveRouteMap
                          destination={null}
                          routeOrigin={{ label: service.address, latitude: service.projectLatitude, longitude: service.projectLongitude }}
                          serviceStatus={service.status}
                          vehicle={serviceVehiclePoint(service)}
                        />
                      </div>
                      <div className="mt-4">
                        <TrackingTimeline events={service.timeline} photos={service.photos} />
                      </div>
                    </article>
                  ))}
                </section>
              ) : null}

              {activeAdminModule === "Indicadores" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Indicadores</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Metric label="Toneladas" value={`${(services.reduce((sum, service) => sum + (service.netWeightKg ?? 0), 0) / 1000).toFixed(2)} t`} />
                    <Metric label="Servicios" value={`${services.length}`} />
                    <Metric label="Residuos por tipo" value={`${new Set(services.map((service) => service.residue)).size}`} />
                    <Metric label="Clientes recurrentes" value={`${new Set(services.map((service) => service.client)).size}`} />
                    <Metric label="Tiempo promedio" value="Calculando" />
                    <Metric label="Emisiones evitadas" value={`${(services.reduce((sum, service) => sum + (service.netWeightKg ?? 0), 0) * 0.00018).toFixed(2)} tCO2e`} />
                  </div>
                  <div className="mt-5 grid gap-3">
                    {controlTower.analytics.map((item) => (
                      <div key={`${item.city}-${item.residue_type}`} className="grid gap-2 rounded-[8px] border border-[#d8ded6] p-3 text-sm md:grid-cols-5">
                        <span className="font-black text-[#101820]">{item.city}</span>
                        <span>{item.residue_type}</span>
                        <span>{item.services} servicios</span>
                        <span>{(Number(item.kg_collected) / 1000).toFixed(2)} t</span>
                        <span>{item.avg_service_minutes ?? "en curso"} min prom.</span>
                      </div>
                    ))}
                    {controlTower.analytics.length === 0 ? <p className="text-sm text-[#66736b]">Los indicadores se alimentan con los servicios procesados.</p> : null}
                  </div>
                </section>
              ) : null}

              {activeAdminModule === "Trazabilidad" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Trazabilidad</h2>
                  <div className="mt-4 space-y-3">
                    {services.flatMap((service) => service.timeline.map((event) => ({ ...event, service: service.project }))).slice(0, 30).map((event) => (
                      <div key={event.id} className="rounded-[8px] border border-[#d8ded6] p-3 text-sm">
                        <p className="font-bold text-[#101820]">{event.service} - {event.event}</p>
                        <p className="text-[#66736b]">{event.role ?? "RCDlogiq"} - {event.actor ?? "RCDlogiq"} - {event.createdAt.slice(0, 16)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeAdminModule === "Usuarios" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Usuarios</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="Clientes" value={`${new Set(services.map((service) => service.client)).size}`} />
                    <Metric label="Transportadores" value={`${transporters.length}`} />
                    <Metric label="Plantas" value={`${plants.length}`} />
                    <Metric label="Admins" value="1" />
                  </div>
                </section>
              ) : null}

              {activeAdminModule === "Vehiculos" ? (
                <section className="grid gap-4 lg:grid-cols-[340px_1fr]">
                  <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-2xl font-black">Registrar vehiculo</h2>
                    <form action={createVehicle} className="mt-4 grid gap-3">
                      <label className="block text-sm font-semibold">
                        Transportador
                        <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="transporter_id" required>
                          {transporters.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="block text-sm font-semibold">
                        Placa
                        <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3 uppercase" name="plate" required />
                      </label>
                      <label className="block text-sm font-semibold">
                        Tipo
                        <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] bg-white px-3 py-3" name="vehicle_type" required>
                          <option value="volqueta">Volqueta</option>
                          <option value="camion">Camion</option>
                          <option value="dobletroque">Dobletroque</option>
                          <option value="otro">Otro</option>
                        </select>
                      </label>
                      <label className="block text-sm font-semibold">
                        Capacidad toneladas
                        <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3" inputMode="decimal" name="capacity_tons" required type="number" step="0.1" />
                      </label>
                      <label className="block text-sm font-semibold">
                        Ciudad
                        <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-3" defaultValue="Bogota" name="city" required />
                      </label>
                      <button className="rounded-[6px] bg-[#2f6b4f] px-4 py-3 text-sm font-black text-white" type="submit">Guardar vehiculo</button>
                    </form>
                  </div>
                  <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                    <h2 className="text-2xl font-black">Vehiculos</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {vehicles.map((vehicle) => <VehicleSummary key={vehicle.id} vehicle={vehicle} />)}
                      {vehicles.length === 0 ? <p className="rounded-[8px] border border-dashed border-[#c8d2db] p-4 text-sm text-[#66736b]">Aun no hay vehiculos registrados.</p> : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {activeAdminModule === "Plantas" ? (
                <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
                  <h2 className="text-2xl font-black">Plantas</h2>
                  <div className="mt-4 grid gap-3">
                    {plants.map((plant) => <div key={plant.id} className="rounded-[8px] border border-[#d8ded6] p-3 text-sm font-bold">{plant.name}</div>)}
                  </div>
                </section>
              ) : null}

              {activeAdminModule === "Parametros" ? (
                <section className="rounded-[8px] border border-dashed border-[#c8d2db] bg-white p-8">
                  <h2 className="text-2xl font-black">Parametros</h2>
                  <p className="mt-2 text-sm text-[#66736b]">Tarifas, estados permitidos, tipos de residuo y datos de certificados usados por RCDlogiq.</p>
                </section>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
