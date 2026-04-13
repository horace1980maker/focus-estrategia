import Link from "next/link";
import { redirect } from "next/navigation";
import { TelemetryTracker } from "@/components/TelemetryTracker";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildLoginRedirectPath, buildPathWithQuery } from "@/lib/auth-routing";
import { hasPermission } from "@/lib/auth";
import {
  getAllExampleLibraryItems,
  getExamplesForPhase,
} from "@/lib/example-library";
import { getSessionOrNull } from "@/lib/session";
import "./examples.css";

function parsePhaseFilter(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 6) {
    return null;
  }
  return parsed;
}

export default async function ExamplesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const locale = lang as Locale;
  const query = searchParams ? await searchParams : {};

  const [dict, session] = await Promise.all([getDictionary(locale), getSessionOrNull()]);
  if (!session) {
    const nextPath = buildPathWithQuery(`/${lang}/examples`, query);
    redirect(buildLoginRedirectPath({ locale, nextPath }));
  }
  const phaseFilter = parsePhaseFilter(query.phase);
  const canApplyPatterns = hasPermission(session.role, "canEditOrgData");

  const exactPhaseExamples = phaseFilter
    ? getExamplesForPhase(phaseFilter, locale).filter((item) =>
        item.phases.includes(phaseFilter),
      )
    : [];

  const examples = phaseFilter
    ? getExamplesForPhase(phaseFilter, locale)
    : getAllExampleLibraryItems(locale);

  return (
    <>
      <TelemetryTracker
        sectionKey={phaseFilter ? `examples-library-phase-${phaseFilter}` : "examples-library"}
        phaseNumber={phaseFilter ?? 0}
        enabled={Boolean(session.organizationId)}
      />

      <section className="examples-header">
        <h1>{dict.nav.examples}</h1>
        <p>
          {lang === "es"
            ? "Biblioteca curada con patrones aplicables por fase para acelerar trabajo y calidad."
            : "Curated library of phase-ready patterns to speed up work and improve quality."}
        </p>
      </section>

      <section className="examples-filters">
        <Link
          href={`/${lang}/examples`}
          className={`examples-filter-pill${phaseFilter === null ? " active" : ""}`}
        >
          {lang === "es" ? "Todas las fases" : "All phases"}
        </Link>
        {Array.from({ length: 6 }, (_, index) => index + 1).map((phase) => (
          <Link
            key={phase}
            href={`/${lang}/examples?phase=${phase}`}
            className={`examples-filter-pill${phaseFilter === phase ? " active" : ""}`}
          >
            {lang === "es" ? `Fase ${phase}` : `Phase ${phase}`}
          </Link>
        ))}
      </section>

      {phaseFilter && exactPhaseExamples.length === 0 ? (
        <p className="examples-empty-note">
          {lang === "es"
            ? "No hay ejemplos exactos para esta fase. Mostramos patrones cercanos para mantener el flujo."
            : "No exact examples for this phase yet. Showing adjacent patterns to keep momentum."}
        </p>
      ) : null}

      <section className="examples-grid">
        {examples.map((item) => {
          const targetPhase = phaseFilter ?? item.phases[0] ?? 1;
          const applyHref = `/${lang}/phases/${targetPhase}?pattern=${item.id}&applyPattern=1`;

          return (
            <article key={item.id} className="example-card">
              <header>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </header>

              <div className="example-phases">
                {(lang === "es" ? "Aplica en" : "Relevant phases") + ": "}
                {item.phases.map((phase) => (
                  <span key={`${item.id}-${phase}`} className="example-phase-chip">
                    {lang === "es" ? `Fase ${phase}` : `Phase ${phase}`}
                  </span>
                ))}
              </div>

              <pre className="example-preview">{item.template}</pre>

              <div className="example-actions">
                {canApplyPatterns ? (
                  <Link className="example-apply-button" href={applyHref}>
                    {lang === "es" ? "Usar este patron" : "Use this pattern"}
                  </Link>
                ) : (
                  <span className="example-apply-disabled">
                    {lang === "es"
                      ? "Tu rol puede revisar ejemplos, pero no aplicarlos."
                      : "Your role can review examples, but cannot apply them."}
                  </span>
                )}
                <Link className="example-link" href={`/${lang}/phases/${targetPhase}`}>
                  {lang === "es" ? "Ir a la fase" : "Go to phase"}
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
