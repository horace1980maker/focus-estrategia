import Link from "next/link";

export default async function ForbiddenPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  return (
    <main className="main-content">
      <section className="card" style={{ maxWidth: 640, margin: "2rem auto" }}>
        <h1 style={{ marginTop: 0 }}>
          {lang === "es" ? "Acceso denegado" : "Access denied"}
        </h1>
        <p>
          {lang === "es"
            ? "Tu rol no tiene permisos para esta vista o accion."
            : "Your role does not have permission for this view or action."}
        </p>
        <Link href={`/${lang}/dashboard`} className="btn btn-primary">
          {lang === "es" ? "Volver al panel" : "Back to dashboard"}
        </Link>
      </section>
    </main>
  );
}
