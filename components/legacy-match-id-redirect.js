"use client";

import { useEffect } from "react";

export default function LegacyMatchIdRedirect({ id }) {
  useEffect(() => {
    if (!id) {
      window.location.replace("/");
      return;
    }
    window.location.replace("/details/?id=" + encodeURIComponent(id));
  }, [id]);

  return (
    <main className="shell detail-shell">
      <section className="panel">
        <p className="fineprint">Redirecting to the latest Supabase match view…</p>
      </section>
    </main>
  );
}
