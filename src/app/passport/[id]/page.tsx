import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EvidenceGrid, OperationalMap, StatusBadge, TrackingTimeline } from "@/components/operation-ui";
import { getPassportDetail } from "@/lib/passport";
import { getCurrentUserContext } from "@/lib/dashboard";

export default async function PassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUserContext();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const passport = await getPassportDetail(id);
  if (!passport) notFound();

  return (
    <main className="min-h-screen px-4 py-5 md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="rounded-[6px] border border-[#c8d2db] bg-white px-3 py-2 text-sm font-bold" href="/">
            Volver al centro operativo
          </Link>
          <StatusBadge status={passport.status} />
        </div>

        <section className="rounded-[8px] border border-[#d8ded6] bg-white p-4 shadow-sm md:p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#2f6b4f]">{passport.passportUniqueId}</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-[#101820] md:text-5xl">Trazabilidad del residuo</h1>
              <p className="mt-3 max-w-3xl text-[#536059]">
                Identidad RCDlogiq para {passport.residue} de {passport.project}. Cada evento, evidencia y certificado queda asociado a este residuo.
              </p>
            </div>
            <div className="rounded-[8px] border border-[#d8ded6] bg-[#f5f7f3] p-3">
              <div className="qr-grid h-40 rounded-[6px]" />
              <p className="mt-2 break-all font-mono text-[11px] text-[#536059]">{passport.qrCode}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Metric label="Cliente" value={passport.client} />
          <Metric label="Transportador" value={passport.transporter} />
          <Metric label="Vehiculo" value={passport.vehicle} />
          <Metric label="Peso final" value={passport.netWeightKg ? `${(passport.netWeightKg / 1000).toFixed(2)} t` : "Pendiente"} />
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-black">Mapa operacional</h2>
          <OperationalMap
            plant={{ label: passport.plant, latitude: passport.plantLatitude, longitude: passport.plantLongitude }}
            project={{ label: passport.address, latitude: passport.projectLatitude, longitude: passport.projectLongitude }}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="rounded-[8px] border border-[#d8ded6] bg-[#f8faf7] p-4">
            <h2 className="text-2xl font-black">Linea de trazabilidad</h2>
            <div className="mt-4">
              <TrackingTimeline events={passport.events} photos={passport.photos} />
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
              <h2 className="text-xl font-black">Validacion</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <Info label="Planta" value={passport.plant} />
                <Info label="Direccion planta" value={passport.plantAddress ?? "Planta pendiente"} />
                <Info label="Programado" value={passport.scheduledAt.replace("T", " ").slice(0, 16)} />
                <Info label="Verificacion" value={passport.verificationHash?.slice(0, 24) ?? "Pendiente"} />
              </dl>
              <a className="mt-4 block rounded-[6px] bg-[#101820] px-3 py-3 text-center text-sm font-black text-white" href={`/api/certificates/${passport.pickupId}`} target="_blank">
                Descargar certificado
              </a>
            </div>
            <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
              <h2 className="text-xl font-black">Evidencias</h2>
              <div className="mt-3">
                <EvidenceGrid photos={passport.photos} />
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#d8ded6] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#66736b]">{label}</p>
      <p className="mt-2 text-lg font-black text-[#101820]">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.08em] text-[#66736b]">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-[#101820]">{value}</dd>
    </div>
  );
}
