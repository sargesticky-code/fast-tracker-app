"use client";

import { useEffect } from "react";
import { matchDetailHref } from "@/lib/fast-tracker";

export default function LegacyRouteRedirect() {
  useEffect(() => {
    const path = window.location.pathname || "";
    const legacy = path.match(/^\/match\/([^/]+)\/?$/i);
    if (legacy?.[1]) {
      const id = decodeURIComponent(legacy[1]);
      window.location.replace(matchDetailHref(id));
      return;
    }

    if (/^\/match\/?$/i.test(path)) {
      const id = new URLSearchParams(window.location.search).get("id");
      window.location.replace(id ? matchDetailHref(id) : "/");
    }
  }, []);

  return (
    <main className="shell detail-shell">
      <section className="panel">
        <p className="fineprint">Redirecting to the latest Supabase match view…</p>
      </section>
    </main>
  );
}
