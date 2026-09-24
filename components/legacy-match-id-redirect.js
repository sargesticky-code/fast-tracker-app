"use client";

import { useEffect } from "react";
import { matchDetailHref } from "@/lib/fast-tracker";

export default function LegacyMatchIdRedirect({ id }) {
  useEffect(() => {
    window.location.replace(id ? matchDetailHref(id) : "/");
  }, [id]);

  return (
    <main className="shell detail-shell">
      <section className="panel">
        <p className="fineprint">Redirecting to the latest Supabase match view…</p>
      </section>
    </main>
  );
}
