"use client";

import { useState } from "react";

type PasswordFieldProps = {
  minLength?: number;
};

export function PasswordField({ minLength }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-1">
      <input
        className="w-full rounded-[6px] border border-[#c8d2db] px-3 py-2 pr-12"
        minLength={minLength}
        name="password"
        required
        type={visible ? "text" : "password"}
      />
      <button
        aria-label={visible ? "Ocultar contrasena" : "Ver contrasena"}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#536059]"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? (
          <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M3 3l18 18" strokeLinecap="round" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" strokeLinecap="round" />
            <path d="M9.3 5.4A10.8 10.8 0 0 1 12 5c5 0 8.5 4.1 9.6 5.7.3.5.3 1.1 0 1.6a16 16 0 0 1-3 3.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6.4 6.8a16.2 16.2 0 0 0-4 3.9c-.3.5-.3 1.1 0 1.6C3.5 13.9 7 18 12 18c1.4 0 2.7-.3 3.8-.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M2.4 10.7C3.5 9.1 7 5 12 5s8.5 4.1 9.6 5.7c.3.5.3 1.1 0 1.6C20.5 13.9 17 18 12 18s-8.5-4.1-9.6-5.7a1.5 1.5 0 0 1 0-1.6Z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="11.5" r="2.5" />
          </svg>
        )}
      </button>
    </div>
  );
}
