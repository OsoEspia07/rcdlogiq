import Link from "next/link";
import { PasswordField } from "@/components/password-field";
import { signUpAction } from "@/lib/auth-actions";
import type { UserRole } from "@/lib/database.types";

const roles: Array<{ value: UserRole; label: string }> = [
  { value: "cliente", label: "Cliente / generador" },
  { value: "transportador", label: "Transportador" },
  { value: "planta", label: "Planta RCD" },
];

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-xl rounded-[8px] border border-[#d8ded6] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#2f6b4f]">RCDlogiq</p>
          <h1 className="mt-2 text-3xl font-black text-[#101820]">Crear cuenta operativa</h1>
          <p className="mt-2 text-sm leading-6 text-[#66736b]">El rol define tus solicitudes, servicios, recepciones y permisos.</p>
        </div>

        {params.error ? (
          <p className="mb-4 rounded-[6px] border border-[#e7b8b3] bg-[#fff0ee] px-3 py-2 text-sm font-semibold text-[#9c352e]">
            {params.error}
          </p>
        ) : null}

        <form action={signUpAction} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Nombre
            <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-2" name="full_name" required />
          </label>
          <label className="text-sm font-semibold">
            Rol
            <select className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-2" name="role">
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Email
            <input autoComplete="email" className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-2" inputMode="email" name="email" required type="text" />
          </label>
          <label className="text-sm font-semibold">
            Contrasena
            <PasswordField minLength={8} />
          </label>
          <label className="text-sm font-semibold">
            Empresa
            <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-2" name="company_name" />
          </label>
          <label className="text-sm font-semibold">
            Telefono
            <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-2" name="phone" />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Documento / NIT / autorizacion
            <input className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-2" name="document_id" />
          </label>
          <button className="rounded-[6px] bg-[#2f6b4f] px-4 py-2.5 text-sm font-black text-white sm:col-span-2" type="submit">
            Crear cuenta
          </button>
        </form>

        <p className="mt-5 text-sm text-[#66736b]">
          Ya tienes cuenta?{" "}
          <Link className="font-bold text-[#2f6b4f]" href="/auth/login">
            Ingresar
          </Link>
        </p>
      </section>
    </main>
  );
}
