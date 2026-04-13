import Link from "next/link";
import { ArrowRightIcon, SparkleIcon } from "@/components/icons";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import {
  LANDING_WORKSPACE_ENTRY_ORDER,
  getWorkspaceIntentPath,
} from "@/lib/role-dashboard-contracts";
import "./landing.css";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale = lang === "en" ? "en" : "es";
  const dict = await getDictionary(locale as Locale);
  const otherLocale = lang === "es" ? "en" : "es";

  const phases = [
    {
      num: 1,
      title: dict.phases.phase1,
      desc:
        lang === "es"
          ? "Perfil organizacional, participantes, compromisos y calendario"
          : "Organizational profile, participants, commitments, and calendar",
    },
    {
      num: 2,
      title: dict.phases.phase2,
      desc:
        lang === "es"
          ? "Evaluacion de coherencia, capacidades y brechas estrategicas"
          : "Coherence assessment, capabilities, and strategic gaps",
    },
    {
      num: 3,
      title: dict.phases.phase3,
      desc:
        lang === "es"
          ? "Teoria de Cambio, prioridades y objetivos estrategicos"
          : "Theory of Change, priorities, and strategic objectives",
    },
    {
      num: 4,
      title: dict.phases.phase4,
      desc:
        lang === "es"
          ? "Resultados, lineas de accion, cronograma y borrador del plan"
          : "Results, lines of action, timeline, and plan draft",
    },
    {
      num: 5,
      title: dict.phases.phase5,
      desc:
        lang === "es"
          ? "Revision final facilitada y ajustes del plan"
          : "Facilitated final review and plan adjustments",
    },
    {
      num: 6,
      title: dict.phases.phase6,
      desc:
        lang === "es"
          ? "Empaquetado de entregables, versionado y exportacion final"
          : "Deliverables packaging, versioning, and final export",
    },
  ];

  return (
    <div className="landing">
      <nav
        className="landing-nav"
        aria-label={lang === "es" ? "Navegacion principal" : "Main navigation"}
      >
        <div className="landing-logo">{dict.app.title}</div>
        <div className="landing-nav-actions">
          <Link
            href={`/${otherLocale}`}
            className="locale-switch"
            aria-label={lang === "es" ? "Switch to English" : "Cambiar a espanol"}
          >
            {otherLocale.toUpperCase()}
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-badge">
            <SparkleIcon size={16} />
            {lang === "es" ? "Acompañamiento, no curso" : "Accompaniment, not course"}
          </div>
          <h1>{dict.landing.hero_title}</h1>
          <p className="hero-subtitle">{dict.landing.hero_subtitle}</p>
          <div className="hero-actions">
            {LANDING_WORKSPACE_ENTRY_ORDER.map((intent, index) => (
              <Link
                key={intent}
                href={getWorkspaceIntentPath(intent, locale)}
                className={index === 0 ? "btn btn-primary btn-lg" : "btn btn-secondary btn-lg"}
              >
                {dict.landing.role_entries[intent]}
                {index === 0 ? <ArrowRightIcon size={18} /> : null}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="principles">
        {[
          dict.landing.structured,
          dict.landing.participatory,
          dict.landing.contextualized,
          dict.landing.deliverable_driven,
        ].map((principle) => (
          <div key={principle} className="principle">
            <span className="principle-dot" />
            {principle}
          </div>
        ))}
      </div>

      <section className="landing-phases">
        <div className="landing-phases-inner">
          <h2>{lang === "es" ? "Seis fases de acompanamiento" : "Six phases of accompaniment"}</h2>
          <div className="phase-cards">
            {phases.map((phase) => (
              <div key={phase.num} className="phase-card">
                <div className="phase-number">{phase.num}</div>
                <h3>{phase.title}</h3>
                <p>{phase.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        (c) {new Date().getFullYear()} - {dict.app.title}
      </footer>
    </div>
  );
}
