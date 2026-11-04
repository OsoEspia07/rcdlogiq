"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ServiceStatus } from "@/lib/database.types";

type MapPoint = {
  label: string;
  latitude: number | null;
  longitude: number | null;
};

type VehiclePoint = MapPoint & {
  heading?: number | null;
  speed?: number | null;
};

type Props = {
  allowLocationRequest?: boolean;
  autoFollowVehicle?: boolean;
  simulatedProgress?: number;
  destination: MapPoint | null;
  onRequestLocation?: () => void;
  routeOrigin: MapPoint | null;
  serviceStatus: ServiceStatus;
  vehicle: VehiclePoint | null;
};

type GoogleNamespace = {
  maps: {
    DirectionsRenderer: new (options: Record<string, unknown>) => GoogleDirectionsRenderer;
    DirectionsService: new () => GoogleDirectionsService;
    LatLng: new (lat: number, lng: number) => GoogleLatLng;
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
    Marker: new (options: Record<string, unknown>) => GoogleMarker;
    SymbolPath: { FORWARD_CLOSED_ARROW: unknown };
    TravelMode: { DRIVING: string };
    event: { addListener: (instance: unknown, eventName: string, handler: () => void) => { remove: () => void } };
  };
};

type GoogleMap = {
  fitBounds: (bounds: unknown) => void;
  panTo: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
};

type GoogleLatLng = {
  lat: () => number;
  lng: () => number;
};

type GoogleMarker = {
  setIcon: (icon: Record<string, unknown>) => void;
  setMap: (map: GoogleMap | null) => void;
  setPosition: (position: { lat: number; lng: number }) => void;
  setTitle: (title: string) => void;
};

type GoogleDirectionsResult = {
  routes: Array<{
    bounds: unknown;
    overview_path: GoogleLatLng[];
    legs?: Array<{ steps?: Array<{ path: GoogleLatLng[] }> }>;
  }>;
};

type GoogleDirectionsRenderer = {
  set: (key: string, value: unknown) => void;
  setDirections: (result: GoogleDirectionsResult) => void;
};

type GoogleDirectionsService = {
  route: (
    request: Record<string, unknown>,
    callback: (result: GoogleDirectionsResult | null, status: string) => void,
  ) => void;
};

type GoogleWindow = Window & {
  google?: GoogleNamespace;
  __rcdGoogleMapsReady?: () => void;
};

let googleMapsPromise: Promise<GoogleNamespace["maps"]> | null = null;

function hasCoords(point: MapPoint | null): point is MapPoint & { latitude: number; longitude: number } {
  return point?.latitude !== null && point?.longitude !== null && point?.latitude !== undefined && point?.longitude !== undefined;
}

function formatCoords(point: MapPoint | null) {
  if (!hasCoords(point)) return "Sin ubicacion";
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

function googleEmbedRouteUrl(origin: MapPoint | null, stop: MapPoint | null, destination: MapPoint | null) {
  if (hasCoords(origin) && hasCoords(stop) && hasCoords(destination)) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&waypoints=${stop.latitude},${stop.longitude}&travelmode=driving&output=embed`;
  }
  if (hasCoords(origin) && hasCoords(stop)) {
    return `https://maps.google.com/maps?saddr=${origin.latitude},${origin.longitude}&daddr=${stop.latitude},${stop.longitude}&z=14&output=embed`;
  }
  if (hasCoords(origin) && hasCoords(destination)) {
    return `https://maps.google.com/maps?saddr=${origin.latitude},${origin.longitude}&daddr=${destination.latitude},${destination.longitude}&z=14&output=embed`;
  }
  if (hasCoords(destination)) {
    return `https://maps.google.com/maps?q=${destination.latitude},${destination.longitude}&z=15&output=embed`;
  }
  if (hasCoords(origin)) {
    return `https://maps.google.com/maps?q=${origin.latitude},${origin.longitude}&z=15&output=embed`;
  }
  return "https://maps.google.com/maps?q=4.7110,-74.0721&z=12&output=embed";
}

function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const earthRadius = 6371000;
  const latA = (a.latitude * Math.PI) / 180;
  const latB = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const value =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function pointToSegmentMeters(
  point: { latitude: number; longitude: number },
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
) {
  const latScale = 111320;
  const lngScale = Math.cos((point.latitude * Math.PI) / 180) * 111320;
  const pointX = point.longitude * lngScale;
  const pointY = point.latitude * latScale;
  const startX = start.longitude * lngScale;
  const startY = start.latitude * latScale;
  const endX = end.longitude * lngScale;
  const endY = end.latitude * latScale;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.hypot(pointX - startX, pointY - startY);
  const ratio = Math.max(0, Math.min(1, ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared));
  return Math.hypot(pointX - (startX + ratio * deltaX), pointY - (startY + ratio * deltaY));
}

function distanceToRouteMeters(point: { latitude: number; longitude: number }, routePath: GoogleLatLng[]) {
  if (routePath.length < 2) return Infinity;
  let nearest = Infinity;
  for (let index = 1; index < routePath.length; index += 1) {
    const start = { latitude: routePath[index - 1].lat(), longitude: routePath[index - 1].lng() };
    const end = { latitude: routePath[index].lat(), longitude: routePath[index].lng() };
    nearest = Math.min(nearest, pointToSegmentMeters(point, start, end));
  }
  return nearest;
}

function routePointAtProgress(path: GoogleLatLng[], progress: number) {
  if (!path.length) return null;
  if (path.length === 1) return { latitude: path[0].lat(), longitude: path[0].lng(), heading: 0 };
  const lengths = path.slice(1).map((point, index) => metersBetween(
    { latitude: path[index].lat(), longitude: path[index].lng() },
    { latitude: point.lat(), longitude: point.lng() },
  ));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = (Math.max(0, Math.min(100, progress)) / 100) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1) {
      const ratio = length === 0 ? 0 : Math.min(1, remaining / length);
      const start = path[index];
      const end = path[index + 1];
      const latitude = start.lat() + (end.lat() - start.lat()) * ratio;
      const longitude = start.lng() + (end.lng() - start.lng()) * ratio;
      const deltaLongitude = ((end.lng() - start.lng()) * Math.PI) / 180;
      const latitude1 = (start.lat() * Math.PI) / 180;
      const latitude2 = (end.lat() * Math.PI) / 180;
      const y = Math.sin(deltaLongitude) * Math.cos(latitude2);
      const x = Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(deltaLongitude);
      return { latitude, longitude, heading: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 };
    }
    remaining -= length;
  }
  return null;
}

function simulatedRoutePoint(legs: GoogleLatLng[][], progress: number) {
  if (!legs.length) return null;
  const value = Math.max(0, Math.min(100, progress));
  if (legs.length === 1) return routePointAtProgress(legs[0], value);
  const stopProgress = 26;
  const legIndex = value <= stopProgress ? 0 : 1;
  const legProgress = legIndex === 0 ? value / stopProgress * 100 : (value - stopProgress) / (100 - stopProgress) * 100;
  return routePointAtProgress(legs[Math.min(legIndex, legs.length - 1)], legProgress);
}

function loadGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps solo esta disponible en el navegador."));
  const googleWindow = window as GoogleWindow;
  if (googleWindow.google?.maps) return Promise.resolve(googleWindow.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-rcd-google-maps='true']");
    googleWindow.__rcdGoogleMapsReady = () => {
      if (googleWindow.google?.maps) resolve(googleWindow.google.maps);
      else reject(new Error("Google Maps no cargo correctamente."));
    };
    if (existing) return;

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.dataset.rcdGoogleMaps = "true";
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=__rcdGoogleMapsReady`;
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export function LiveRouteMap({ allowLocationRequest = false, autoFollowVehicle = true, simulatedProgress, destination, onRequestLocation, routeOrigin, serviceStatus, vehicle }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const mapsRef = useRef<GoogleNamespace["maps"] | null>(null);
  const vehicleMarkerRef = useRef<GoogleMarker | null>(null);
  const originMarkerRef = useRef<GoogleMarker | null>(null);
  const destinationMarkerRef = useRef<GoogleMarker | null>(null);
  const directionsServiceRef = useRef<GoogleDirectionsService | null>(null);
  const directionsRendererRef = useRef<GoogleDirectionsRenderer | null>(null);
  const routePathRef = useRef<GoogleLatLng[]>([]);
  const routeLegPathsRef = useRef<GoogleLatLng[][]>([]);
  const lastRouteAtRef = useRef(0);
  const lastRouteOriginRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastTargetKeyRef = useRef("");
  const followPausedUntilRef = useRef(0);
  const [followVehicle, setFollowVehicle] = useState(true);
  const [mapState, setMapState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [routeState, setRouteState] = useState<"idle" | "calculating" | "ready" | "error">("idle");
  const [routeMessage, setRouteMessage] = useState("Activa ubicacion para iniciar navegacion.");

  const initialCenter = useMemo(() => {
    if (hasCoords(vehicle)) return { lat: vehicle.latitude, lng: vehicle.longitude };
    if (hasCoords(routeOrigin)) return { lat: routeOrigin.latitude, lng: routeOrigin.longitude };
    if (hasCoords(destination)) return { lat: destination.latitude, lng: destination.longitude };
    return { lat: 4.711, lng: -74.0721 };
  }, [destination, routeOrigin, vehicle]);
  const initialCenterRef = useRef(initialCenter);

  const originKey = hasCoords(routeOrigin) ? `${routeOrigin.latitude.toFixed(6)},${routeOrigin.longitude.toFixed(6)}` : "sin-origen";
  const targetKey = hasCoords(destination) ? `${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)}` : "sin-destino";
  const hasPendingStopOnlyRoute = !hasCoords(destination) && !["cargado", "en transito", "recibido en planta", "pesado", "procesado", "certificado generado", "finalizado"].includes(serviceStatus);
  const activeRouteTarget = hasCoords(destination) ? destination : hasPendingStopOnlyRoute ? routeOrigin : null;
  const activeRouteTargetKey = hasCoords(activeRouteTarget) ? `${activeRouteTarget.latitude.toFixed(6)},${activeRouteTarget.longitude.toFixed(6)}` : "seguimiento-libre";
  const routeMode = hasCoords(destination) ? (hasCoords(vehicle) ? "vehiculo-parada-destino" : "parada-destino") : hasPendingStopOnlyRoute ? "vehiculo-parada" : "seguimiento";
  const routeSignature = `${routeMode}:${originKey}->${activeRouteTargetKey}`;

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    setMapState("loading");

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapsRef.current = maps;
        const map = new maps.Map(containerRef.current, {
          center: initialCenterRef.current,
          disableDefaultUI: false,
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          zoom: 15,
        });
        mapRef.current = map;
        directionsServiceRef.current = new maps.DirectionsService();
        directionsRendererRef.current = new maps.DirectionsRenderer({
          map,
          preserveViewport: true,
          polylineOptions: {
            icons: [
              {
                icon: {
                  fillColor: "#ffffff",
                  fillOpacity: 1,
                  path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 2.8,
                  strokeColor: "#2f46ff",
                  strokeWeight: 1.5,
                },
                offset: "12%",
                repeat: "90px",
              },
            ],
            strokeColor: "#2f46ff",
            strokeOpacity: 0.95,
            strokeWeight: 6,
          },
          suppressMarkers: true,
        });
        originMarkerRef.current = new maps.Marker({
          map,
          title: "Obra",
          position: initialCenterRef.current,
        });
        destinationMarkerRef.current = new maps.Marker({
          map,
          title: "Destino",
          position: initialCenterRef.current,
        });
        vehicleMarkerRef.current = new maps.Marker({
          map,
          title: "Vehiculo",
          position: initialCenterRef.current,
        });
        const dragListener = maps.event.addListener(map, "dragstart", () => {
          followPausedUntilRef.current = Date.now() + 20_000;
          setFollowVehicle(false);
        });
        const zoomListener = maps.event.addListener(map, "zoom_changed", () => {
          followPausedUntilRef.current = Date.now() + 20_000;
          setFollowVehicle(false);
        });
        setMapState("ready");
        return () => {
          dragListener.remove();
          zoomListener.remove();
        };
      })
      .catch(() => {
        if (!cancelled) setMapState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  function vehicleIcon(heading = vehicle?.heading ?? 0) {
    const maps = mapsRef.current;
    if (!maps) return {};
    return {
      fillColor: "#101820",
      fillOpacity: 1,
      path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
      rotation: heading,
      scale: 6,
      strokeColor: "#ffffff",
      strokeWeight: 2,
    };
  }

  function recalculateRoute(reason: "manual" | "target" | "off-route" | "movement") {
    const maps = mapsRef.current;
    const directionsService = directionsServiceRef.current;
    const directionsRenderer = directionsRendererRef.current;
    const startsAtVehicle = hasCoords(vehicle);
    const routeStart = startsAtVehicle ? vehicle : routeOrigin;
    if (!maps || !directionsService || !directionsRenderer) return;
    if (!hasCoords(activeRouteTarget)) {
      directionsRenderer.set("directions", null);
      routePathRef.current = [];
      lastTargetKeyRef.current = routeSignature;
      setRouteState("ready");
      setRouteMessage(hasCoords(vehicle) ? "Seguimiento GPS activo." : "Seguimiento listo, pendiente de ubicacion.");
      return;
    }
    if (!hasCoords(routeStart)) return;
    const useWorksiteStop = startsAtVehicle && hasCoords(routeOrigin) && hasCoords(destination);

    setRouteState("calculating");
    setRouteMessage(reason === "manual" ? "Recalculando ruta..." : "Actualizando ruta operacional...");
    directionsService.route(
      {
        destination: { lat: activeRouteTarget.latitude, lng: activeRouteTarget.longitude },
        origin: { lat: routeStart.latitude, lng: routeStart.longitude },
        travelMode: maps.TravelMode.DRIVING,
        waypoints: useWorksiteStop
          ? [{ location: { lat: routeOrigin.latitude, lng: routeOrigin.longitude }, stopover: true }]
          : [],
      },
      (result, status) => {
        if (status !== "OK" || !result?.routes[0]) {
          setRouteState("error");
          setRouteMessage("No se pudo calcular la ruta con Google Maps.");
          return;
        }
        directionsRenderer.setDirections(result);
        routePathRef.current = result.routes[0].overview_path;
        routeLegPathsRef.current = result.routes[0].legs?.map((leg) => {
          const path = leg.steps?.flatMap((step) => step.path) ?? [];
          return path.length ? path : result.routes[0].overview_path;
        }) ?? [result.routes[0].overview_path];
        lastRouteAtRef.current = Date.now();
        lastRouteOriginRef.current = hasCoords(vehicle) ? { latitude: vehicle.latitude, longitude: vehicle.longitude } : null;
        lastTargetKeyRef.current = routeSignature;
        setRouteState("ready");
        setRouteMessage(useWorksiteStop ? "Ruta activa con parada operativa." : "Ruta hacia proxima parada activa.");
        if (hasCoords(vehicle) && autoFollowVehicle && followVehicle && Date.now() > followPausedUntilRef.current) {
          mapRef.current?.panTo({ lat: vehicle.latitude, lng: vehicle.longitude });
        }
      },
    );
  }

  useEffect(() => {
    if (mapState !== "ready") return;
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;

    if (hasCoords(routeOrigin)) {
      originMarkerRef.current?.setPosition({ lat: routeOrigin.latitude, lng: routeOrigin.longitude });
      originMarkerRef.current?.setTitle(routeOrigin.label);
    }
    if (hasCoords(destination)) {
      destinationMarkerRef.current?.setPosition({ lat: destination.latitude, lng: destination.longitude });
      destinationMarkerRef.current?.setTitle(destination.label);
      destinationMarkerRef.current?.setMap(map);
    } else {
      destinationMarkerRef.current?.setMap(null);
    }
    if (!hasCoords(vehicle)) window.setTimeout(() => setRouteMessage("Ruta operacional visible. Activa ubicacion para ver el vehiculo real."), 0);

    const simulatedPoint = simulatedProgress === undefined ? null : simulatedRoutePoint(routeLegPathsRef.current, simulatedProgress);
    const markerPoint = simulatedPoint ?? (hasCoords(vehicle) ? { latitude: vehicle.latitude, longitude: vehicle.longitude, heading: (vehicle as VehiclePoint).heading ?? 0 } : null);

    if (markerPoint && hasCoords(vehicle)) {
      vehicleMarkerRef.current?.setMap(map);
      vehicleMarkerRef.current?.setPosition({ lat: markerPoint.latitude, lng: markerPoint.longitude });
      vehicleMarkerRef.current?.setTitle(vehicle.label);
      vehicleMarkerRef.current?.setIcon(vehicleIcon(markerPoint.heading));
    }

    if (markerPoint && autoFollowVehicle && followVehicle && Date.now() > followPausedUntilRef.current) {
      map.panTo({ lat: markerPoint.latitude, lng: markerPoint.longitude });
    }

    const movedFromLastRoute = hasCoords(vehicle) && lastRouteOriginRef.current ? metersBetween(lastRouteOriginRef.current, vehicle) : 0;
    const offRoute = simulatedProgress === undefined && hasCoords(vehicle) ? distanceToRouteMeters(vehicle, routePathRef.current) > 60 : false;
    const canRecalculate = Date.now() - lastRouteAtRef.current > 20_000;
    if (lastTargetKeyRef.current !== routeSignature) {
      recalculateRoute("target");
    } else if (canRecalculate && offRoute) {
      recalculateRoute("off-route");
    } else if (simulatedProgress === undefined && canRecalculate && movedFromLastRoute > 80) {
      recalculateRoute("movement");
    }
  // The route recalculation helpers intentionally read the latest marker refs and props in this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRouteTargetKey, autoFollowVehicle, destination, followVehicle, mapState, originKey, routeOrigin, routeSignature, serviceStatus, simulatedProgress, targetKey, vehicle]);

  function centerVehicle() {
    if (!hasCoords(vehicle)) {
      if (allowLocationRequest && onRequestLocation) onRequestLocation();
      else if (hasCoords(routeOrigin)) mapRef.current?.panTo({ lat: routeOrigin.latitude, lng: routeOrigin.longitude });
      return;
    }
    followPausedUntilRef.current = 0;
    setFollowVehicle(true);
    mapRef.current?.panTo({ lat: vehicle.latitude, lng: vehicle.longitude });
    mapRef.current?.setZoom(16);
  }

  if (!apiKey) {
    return (
      <div className="overflow-hidden rounded-[8px] border border-[#d8ded6] bg-white">
        <div className="relative h-[360px] min-h-72 w-full">
          <iframe
            className="h-full w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={googleEmbedRouteUrl(routeOrigin, null, destination)}
            title="Ruta operacional de respaldo"
          />
          <div className="absolute left-3 top-3 max-w-sm rounded-[8px] border border-[#ead197] bg-white/95 p-3 text-xs font-semibold text-[#6a5520] shadow-sm">
            Mapa vivo pendiente de key. Mostrando ruta de respaldo.
          </div>
        </div>
        <div className="grid gap-2 border-t border-[#d8ded6] p-3 text-xs text-[#536059] sm:grid-cols-3">
          <p><span className="font-black text-[#101820]">Vehiculo:</span> {vehicle?.label ?? "Sin ubicacion"} - {formatCoords(vehicle)}</p>
          <p><span className="font-black text-[#b5473f]">Proxima parada:</span> {routeOrigin?.label ?? "Sin parada"} - {formatCoords(routeOrigin)}</p>
          {destination ? <p><span className="font-black text-[#2f6b4f]">Llegada:</span> {destination.label} - {formatCoords(destination)}</p> : null}
        </div>
        {allowLocationRequest && !hasCoords(vehicle) ? (
          <div className="border-t border-[#d8ded6] p-3">
            <button className="rounded-[6px] bg-[#101820] px-4 py-3 text-sm font-black text-white" onClick={onRequestLocation} type="button">
              Activar ubicacion
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[8px] border border-[#d8ded6] bg-white">
      <div className="relative h-[420px] min-h-80 w-full">
        <div className="h-full w-full" ref={containerRef} />
        <div className="absolute right-3 top-3 grid gap-2">
          <button className="rounded-[6px] bg-white px-3 py-2 text-xs font-black text-[#101820] shadow" onClick={centerVehicle} type="button">
            {hasCoords(vehicle) ? "Centrar vehiculo" : "Centrar ruta"}
          </button>
          <button className="rounded-[6px] bg-[#101820] px-3 py-2 text-xs font-black text-white shadow" onClick={() => recalculateRoute("manual")} type="button">
            Recalcular ruta
          </button>
        </div>
        {mapState !== "ready" ? (
          <div className="absolute inset-0 grid place-items-center bg-white/90 p-4 text-center">
            <div>
              <p className="text-lg font-black text-[#101820]">{mapState === "error" ? "No se pudo cargar Google Maps" : "Cargando mapa en vivo..."}</p>
              <p className="mt-2 text-sm font-semibold text-[#66736b]">{mapState === "error" ? "Revisa la key publica y restricciones de dominio." : "Preparando ruta operacional."}</p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 border-t border-[#d8ded6] p-3 text-xs text-[#66736b] sm:grid-cols-3">
        <p><span className="font-black text-[#101820]">Vehiculo:</span> {vehicle?.label ?? "Sin ubicacion"} - {formatCoords(vehicle)}</p>
        <p><span className="font-black text-[#b5473f]">Proxima parada:</span> {routeOrigin?.label ?? "Sin parada"} - {formatCoords(routeOrigin)}</p>
        {destination ? <p><span className="font-black text-[#2f6b4f]">Llegada:</span> {destination.label} - {formatCoords(destination)}</p> : null}
        <p><span className="font-black text-[#536059]">Ruta:</span> {serviceStatus} - {routeState === "calculating" ? "calculando..." : routeMessage}</p>
      </div>
    </div>
  );
}
