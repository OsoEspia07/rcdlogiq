import Link from "next/link";
import { PasswordField } from "@/components/password-field";
import { signInAction } from "@/lib/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-[8px] border border-[#d8ded6] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#2f6b4f]">RCDlogiq</p>
          <h1 className="mt-2 text-3xl font-black text-[#101820]">Ingresar</h1>
          <p className="mt-2 text-sm leading-6 text-[#66736b]">Accede a solicitudes, tracking, evidencias y certificados con tu rol operativo.</p>
        </div>

        {params.error ? (
          <p className="mb-4 rounded-[6px] border border-[#e7b8b3] bg-[#fff0ee] px-3 py-2 text-sm font-semibold text-[#9c352e]">
            {params.error}
          </p>
        ) : null}

        <form action={signInAction} className="space-y-4">
          <label className="block text-sm font-semibold">
            Email
            <input autoComplete="email" className="mt-1 w-full rounded-[6px] border border-[#c8d2db] px-3 py-2" inputMode="email" name="email" required type="text" />
          </label>
          <label className="block text-sm font-semibold">
            Contrasena
            <PasswordField />
          </label>
          <button className="w-full rounded-[6px] bg-[#2f6b4f] px-4 py-2.5 text-sm font-black text-white" type="submit">
            Ingresar
          </button>
        </form>

        <p className="mt-5 text-sm text-[#66736b]">
          No tienes cuenta?{" "}
          <Link className="font-bold text-[#2f6b4f]" href="/auth/signup">
            Crear cuenta
          </Link>
        </p>
      </section>
    </main>
  );
}
