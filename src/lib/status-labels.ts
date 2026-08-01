import type { ServiceStatus } from "@/lib/database.types";

export function clientStatusLabel(status: ServiceStatus) {
  const labels: Record<ServiceStatus, string> = {
    pendiente: "Estamos validando tu solicitud",
    asignado: "Transportador asignado",
    aceptado: "Tu retiro fue aceptado",
    "en camino": "Tu conductor va en camino",
    cargando: "Estamos cargando tus residuos",
    cargado: "Carga completada",
    "en transito": "Tus residuos van hacia planta",
    planta: "Tus residuos estan en planta",
    retrasado: "Tu servicio presenta retraso operativo",
    recibido: "Tus residuos llegaron a planta",
    "recibido en planta": "Tus residuos llegaron a planta",
    pesado: "La planta esta validando el peso",
    procesado: "Tus residuos estan siendo procesados",
    certificado: "Tu certificado ya esta listo",
    "certificado generado": "Tu certificado ya esta listo",
    finalizado: "Servicio finalizado",
  };
  return labels[status];
}
