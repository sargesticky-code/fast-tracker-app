"use client";

import { useEffect } from "react";

export default function LegacyRouteRedirect() {
  useEffect(() => {
    const path = window.location.pathname || "";
    const legacy = path.match(/^\/match\/([^/]+)\/?$/i);
    if (legacy?.[1]) {
      const id = decodeURIComponent(legacy[1]);
      window.location.replace("/details/?id=" + encodeURIComponent(id));
      return;
    }

    if (/^\/match\/?$/i.test(path)) {
      const id = new URLSearchParams(window.location.search).get("id");
      if (id) window.location.replace("/details/?id=" + encodeURIComponent(id));
    }
  }, []);

  return null;
}
