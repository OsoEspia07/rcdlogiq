"use client";

import { useEffect, useRef, useState } from "react";
import { LiveRouteMap } from "@/components/live-route-map";
import type { ServiceStatus } from "@/lib/database.types";

const stages = [
  { status: "Servicio asignado", mapStatus: "asignado", title: "Recolección programada", description: "Un vehículo y un transportador fueron asignados a la obra.", point: 0, time: "08:12" },
  { status: "En camino a la obra", mapStatus: "en camino", title: "Vehículo en ruta", description: "El transportador inició el recorrido hacia la obra en Bogotá.", point: 26, time: "08:18" },
  { status: "En la obra", mapStatus: "cargando", title: "Llegada confirmada", description: "El vehículo llegó al punto de recolección y comenzó la atención.", point: 26, time: "08:31" },
  { status: "Material cargado", mapStatus: "cargado", title: "Carga completada", description: "Los residuos quedaron cargados y el servicio continúa hacia la planta.", point: 26, time: "08:46" },
  { status: "En tránsito", mapStatus: "en transito", title: "Traslado a planta", description: "El material está en camino a la planta de aprovechamiento asignada.", point: 82, time: "08:52" },
  { status: "Recibido en planta", mapStatus: "recibido en planta", title: "Recepción confirmada", description: "La planta recibió el material y continúa el proceso de pesaje.", point: 96, time: "09:14" },
  { status: "Certificado generado", mapStatus: "certificado generado", title: "Trazabilidad completada", description: "El recorrido quedó registrado y el certificado está disponible.", point: 100, time: "09:28" },
];

const route = [
  { lat: 4.700, lng: -74.045 }, // Punto de salida al norte de la obra
  { lat: 4.668, lng: -74.052 }, // Obra Los Cedros, Chapinero
  { lat: 4.678, lng: -74.145 }, // Planta Fontibón
];

function TruckIcon({ small = false }: { small?: boolean }) {
  return (
    <svg aria-hidden="true" className={small ? "h-5 w-5" : "h-7 w-7"} viewBox="0 0 36 28" fill="none">
      <path d="M2 4h20v16H2zM22 10h7l5 6v4H22z" fill="#2f6b4f" stroke="white" strokeWidth="2" />
      <circle cx="9" cy="22" r="3.5" fill="#101820" stroke="white" strokeWidth="2" />
      <circle cx="28" cy="22" r="3.5" fill="#101820" stroke="white" strokeWidth="2" />
    </svg>
  );
}

function RouteMap({ progress, status }: { progress: number; status: string }) {
  const mapStatus = (stages.find((stage) => stage.status === status)?.mapStatus ?? "en camino") as ServiceStatus;
  return (
    <LiveRouteMap
      simulatedProgress={progress}
      destination={{ label: "Planta de aprovechamiento Fontibón", latitude: route[2].lat, longitude: route[2].lng }}
      routeOrigin={{ label: "Obra Los Cedros · Chapinero", latitude: route[1].lat, longitude: route[1].lng }}
      serviceStatus={mapStatus}
      vehicle={{ label: "HTZ774 · Transportes Andinos", latitude: route[0].lat, longitude: route[0].lng, speed: progress > 0 && progress < 100 ? 32 : 0 }}
    />
  );
}

export function JourneyClient() {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(stages[0].point);
  const progressRef = useRef(stages[0].point);
  const [completed, setCompleted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [activeModule, setActiveModule] = useState("Solicitudes activas");
  const stage = stages[stageIndex];
  const navigation = ["Solicitar recolección", "Mis obras", "Solicitudes activas", "Certificados"];

  useEffect(() => {
    if (!playing || completed) return;
    const startProgress = progressRef.current;
    const nextIndex = stageIndex + 1;
    if (nextIndex >= stages.length) {
      const finishTimer = window.setTimeout(() => {
        setCompleted(true);
        setPlaying(false);
      }, 12_000);
      return () => window.clearTimeout(finishTimer);
    }
    const target = stages[nextIndex].point;
    const startedAt = performance.now();
    const duration = nextIndex === 1 ? 90_000 : nextIndex === 4 ? 70_000 : nextIndex === 2 || nextIndex === 3 ? 12_000 : 8_000;
    const timer = window.setInterval(() => {
      const ratio = Math.min(1, (performance.now() - startedAt) / duration);
      const nextProgress = startProgress + (target - startProgress) * ratio;
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      if (ratio >= 1) {
        window.clearInterval(timer);
        setStageIndex(nextIndex);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [completed, playing, stageIndex]);

  function restartJourney() {
    setPlaying(false);
    setCompleted(false);
    progressRef.current = stages[0].point;
    setProgress(stages[0].point);
    setStageIndex(0);
    window.setTimeout(() => setPlaying(true), 50);
  }

  function advanceJourney() {
    const nextIndex = Math.min(stageIndex + 1, stages.length - 1);
    progressRef.current = stages[nextIndex].point;
    setProgress(stages[nextIndex].point);
    setStageIndex(nextIndex);
  }

  return (
    <main className="min-h-screen text-[#101820]">
      <header className="border-b border-[#d8ded6] bg-white/95">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-8">
          <div>
            <p className="font-mono text-[11px] font-black tracking-[.18em] text-[#2f6b4f]">RCDLOGIQ <span className="mx-1 text-[#c8d2db]">/</span> CLIENTE</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Tu recolección, en cada paso.</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#66736b]">Sigue el recorrido del material desde la obra hasta su recepción en planta, con trazabilidad en tiempo real.</p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[#d8ded6] bg-white px-3 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e5f4ea] text-[#2f6b4f]"><TruckIcon small /></div>
            <div><p className="text-xs font-black">Obra Los Cedros</p><p className="text-[11px] text-[#66736b]">Servicio RCD-2026-084</p></div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] gap-6 px-4 py-6 lg:grid-cols-[270px_1fr] lg:px-8">
        <aside className="space-y-4">
          <section className="rounded-lg border border-[#d8ded6] bg-white p-4">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#101820] text-lg font-black text-white">R</div><div><h2 className="text-lg font-black">Panel cliente</h2><p className="text-sm text-[#66736b]">RCDlogiq</p><p className="mt-1 text-xs text-[#2f6b4f]">● Operación en vivo</p></div></div>
          </section>
          <section className="rounded-lg border border-[#d8ded6] bg-white p-4">
            <h2 className="text-lg font-black">Módulos</h2>
            <nav aria-label="Módulos de cliente" className="mt-3 grid gap-2">{navigation.map((item) => <button aria-current={activeModule === item ? "page" : undefined} className={`rounded-md px-3 py-2.5 text-left text-sm font-bold transition-colors ${activeModule === item ? "bg-[#101820] text-white" : "bg-[#f5f7f3] text-[#536059] hover:bg-[#e5f4ea]"}`} key={item} onClick={() => setActiveModule(item)} type="button">{item}</button>)}</nav>
          </section>
          <section className="rounded-lg border border-[#d8ded6] bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-[#66736b]">Transportador asignado</p><p className="mt-2 font-black">Transportes Andinos</p><p className="mt-1 text-sm text-[#66736b]">Vehículo HTZ774 · Volqueta</p><p className="mt-3 border-t border-[#edf0eb] pt-3 text-xs text-[#66736b]">Ruta Bogotá · Actualización automática</p></section>
        </aside>

        <section className="min-w-0 space-y-4">
          <section aria-label="Resumen del servicio" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {[ ["SOLICITUDES ACTIVAS", "1"], ["ESTADO ACTUAL", stage.status], ["CERTIFICADOS", stageIndex === stages.length - 1 ? "1" : "Pendiente"], ["ÚLTIMA ACTUALIZACIÓN", stage.time], ["RESIDUO", "Escombro mixto"] ].map(([label, value]) => <div className="rounded-lg border border-[#d8ded6] bg-white p-3" key={label}><p className="text-[10px] font-bold uppercase tracking-wider text-[#66736b]">{label}</p><p className="mt-1 truncate text-sm font-black text-[#101820]">{value}</p></div>)}</section>

          {activeModule === "Solicitudes activas" ? <>
            <section className="grid gap-4 rounded-lg border border-[#d8ded6] bg-white p-4 xl:grid-cols-[minmax(0,1fr)_290px]">
              <div className="min-w-0"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Mapa operacional</h2><p className="text-sm text-[#66736b]">Vehículo, obra y destino de tu recolección.</p></div><span className="rounded-full bg-[#e5f4ea] px-3 py-1.5 text-xs font-black">{stage.status}</span></div><RouteMap progress={progress} status={stage.status} /><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#66736b]"><span>Vehículo HTZ774 · Bogotá</span><span>Obra Los Cedros → Planta Fontibón</span></div></div>
              <aside className="flex flex-col rounded-lg bg-[#f5f7f3] p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-wider text-[#66736b]">Seguimiento del servicio</p><span className="flex items-center gap-1.5 text-[10px] font-bold text-[#2f6b4f]"><span className="h-1.5 w-1.5 rounded-full bg-[#2f6b4f]"/>EN VIVO</span></div><p aria-live="polite" className="mt-4 text-xl font-black leading-tight">{stage.title}</p><p className="mt-2 text-sm leading-6 text-[#536059]">{stage.description}</p><div className="my-5 h-2 overflow-hidden rounded-full bg-[#dce4db]"><div className="h-full rounded-full bg-[#2f6b4f] transition-all duration-1000" style={{ width: `${stage.point}%` }} /></div><div className="flex justify-between text-[10px] font-semibold text-[#66736b]"><span>Obra</span><span>{stage.point}%</span><span>Planta</span></div><div className="mt-auto rounded-md border border-[#d8ded6] bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#66736b]">Próxima parada</p><p className="mt-1 text-sm font-black">{stageIndex < 2 ? "Obra Los Cedros" : "Planta de aprovechamiento"}</p><p className="mt-1 text-xs text-[#66736b]">Bogotá, Colombia</p></div></aside>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <article className="rounded-lg border border-[#d8ded6] bg-white p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#2f6b4f]">Servicio actual · RCD-2026-084</p><h2 className="mt-1 text-xl font-black">Obra Los Cedros</h2><p className="mt-1 text-sm text-[#66736b]">Carrera 7 # 82-35, Chapinero, Bogotá</p></div><span className="shrink-0 rounded-full border border-[#b7d7c1] bg-[#e5f4ea] px-3 py-1 text-xs font-black text-[#2f6b4f]">{stage.status}</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Residuo", "Escombro mixto"], ["Volumen", "Mediano"], ["Destino", "Planta Fontibón"], ["Peso", stageIndex >= 5 ? "2.40 t" : "En proceso"]].map(([label, value]) => <div className="rounded-md bg-[#f5f7f3] p-3" key={label}><p className="text-[10px] font-bold uppercase tracking-wider text-[#66736b]">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>)}</div></article>

              <article className="rounded-lg border border-[#d8ded6] bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Actividad del servicio</h2><p className="text-xs text-[#66736b]">Cada actualización queda asociada al recorrido.</p></div><div className="flex gap-2"><button aria-label={playing ? "Pausar recorrido" : "Reanudar recorrido"} className="rounded-md border border-[#c8d2db] px-3 py-2 text-xs font-bold hover:bg-[#f5f7f3]" onClick={() => setPlaying(!playing)} type="button">{playing ? "Pausar" : "Continuar"}</button><button aria-label="Avanzar al siguiente evento" className="rounded-md bg-[#101820] px-3 py-2 text-xs font-bold text-white hover:bg-[#2f6b4f]" onClick={() => completed ? restartJourney() : advanceJourney()} type="button">{completed ? "Reiniciar" : "Siguiente"}</button></div></div><ol aria-live="polite" className="mt-4 space-y-0">{stages.map((item, index) => { const done = index <= stageIndex; const current = index === stageIndex; return <li className="relative flex gap-3 pb-4 last:pb-0" key={item.status}><div className="relative flex w-4 shrink-0 justify-center"><span className={`z-10 mt-1 h-3 w-3 rounded-full border-2 ${current ? "border-[#2f6b4f] bg-white ring-4 ring-[#e5f4ea]" : done ? "border-[#2f6b4f] bg-[#2f6b4f]" : "border-[#c8d2db] bg-white"}`} />{index < stages.length - 1 ? <span className={`absolute top-4 h-full w-px ${index < stageIndex ? "bg-[#2f6b4f]" : "bg-[#d8ded6]"}`} /> : null}</div><div className="flex min-w-0 flex-1 items-start justify-between gap-3"><div><p className={`text-xs font-black ${done ? "text-[#101820]" : "text-[#8b958e]"}`}>{item.title}</p>{current ? <p className="mt-1 text-xs leading-5 text-[#66736b]">{item.description}</p> : null}</div><time className={`shrink-0 text-[10px] font-semibold ${current ? "text-[#2f6b4f]" : "text-[#9ba49d]"}`}>{done ? item.time : "—"}</time></div></li>; })}</ol></article>
            </section>
          </> : <section className="rounded-lg border border-[#d8ded6] bg-white p-8"><p className="font-mono text-xs font-bold uppercase tracking-wider text-[#2f6b4f]">{activeModule}</p><h2 className="mt-2 text-2xl font-black">Información de tu operación</h2><p className="mt-2 text-sm text-[#66736b]">{activeModule === "Mis obras" ? "Obra Los Cedros · Carrera 7 # 82-35, Chapinero, Bogotá" : activeModule === "Certificados" ? stageIndex === stages.length - 1 ? "Certificado de aprovechamiento · 2.40 toneladas · Disponible" : "El certificado estará disponible cuando la planta confirme el procesamiento del material." : "Programa una recolección de residuos de construcción desde tu panel de cliente."}</p><button className="mt-5 rounded-md bg-[#2f6b4f] px-4 py-2.5 text-sm font-bold text-white" onClick={() => setActiveModule("Solicitudes activas")} type="button">Ver seguimiento del servicio</button></section>}
        </section>
      </div>
      <footer className="border-t border-[#d8ded6] bg-white/80"><div className="mx-auto flex max-w-[1480px] flex-wrap justify-between gap-2 px-4 py-4 text-xs text-[#66736b] lg:px-8"><span>RCDlogiq · Trazabilidad de residuos de construcción y demolición</span><span>Actualización más reciente · {stage.time}</span></div></footer>
    </main>
  );
}
