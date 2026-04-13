import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/feature-flags";

export default async function DeliverablesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!isFeatureEnabled("deliverablesLifecycle")) {
    return (
      <section style={{ padding: "1rem", border: "1px solid #fecaca", borderRadius: "0.75rem" }}>
        <h1 style={{ margin: 0 }}>
          {lang === "es" ? "Entregables en despliegue" : "Deliverables rolling out"}
        </h1>
        <p style={{ marginBottom: 0 }}>
          {lang === "es"
            ? "El modulo de entregables esta deshabilitado temporalmente por feature flag."
            : "Deliverables module is currently disabled by feature flag."}
        </p>
      </section>
    );
  }

  redirect(`/${lang}/phases/6`);
}
