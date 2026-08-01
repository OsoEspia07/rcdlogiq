import Link from "next/link";
import { redirect } from "next/navigation";
import { getDatabaseEnv } from "@/lib/env";
import { getCurrentUserContext, getDashboardData } from "@/lib/dashboard";
import { DashboardClient } from "@/components/dashboard-client";

export default async function Home() {
  const env = getDatabaseEnv();

  if (!env.isConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className="max-w-2xl rounded-[8px] border border-[#d8ded6] bg-white p-6 shadow-sm">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#2f6b4f]">Modo dev sin PostgreSQL</p>
          <h1 className="mt-2 text-3xl font-black text-[#101820]">Configura PostgreSQL para operar con persistencia real.</h1>
          <p className="mt-3 leading-7 text-[#66736b]">
            La operacion real necesita PostgreSQL. En local ejecuta `db/schema.sql`, `db/phase3.sql` si aplica y `db/phase6.sql`; en Vercel usa Neon con `DATABASE_URL`, `SESSION_SECRET` y `NEXT_PUBLIC_APP_URL`.
          </p>
          <pre className="mt-5 overflow-auto rounded-[8px] bg-[#101820] p-4 text-xs text-white">{`cp .env.example .env.local
# Ejecuta db/schema.sql en pgAdmin 4
npm run dev`}</pre>
        </section>
      </main>
    );
  }

  const { user, profile } = await getCurrentUserContext();

  if (!user) {
    redirect("/auth/login");
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className="max-w-xl rounded-[8px] border border-[#d8ded6] bg-white p-6 text-center shadow-sm">
          <h1 className="text-3xl font-black text-[#101820]">Perfil operativo pendiente</h1>
          <p className="mt-3 text-[#66736b]">Tu sesion existe, pero falta el registro de usuario operativo.</p>
          <Link className="mt-5 inline-flex rounded-[6px] bg-[#2f6b4f] px-4 py-2 text-sm font-black text-white" href="/auth/signup">
            Completar perfil
          </Link>
        </section>
      </main>
    );
  }

  const data = await getDashboardData(profile.role);

  return (
    <DashboardClient
      plants={data.plants}
      projects={data.projects}
      role={profile.role}
      availableServices={data.availableServices}
      services={data.services}
      stats={data.stats}
      controlTower={data.controlTower}
      transporters={data.transporters}
      vehicles={data.vehicles}
    />
  );
}
