import type { Metadata } from "next";
import localFont from "next/font/local";
import "../globals.css";
import { isValidLocale } from "@/i18n/config";
import { notFound } from "next/navigation";

const manrope = localFont({
  src: "../fonts/manrope-variable.woff2",
  variable: "--font-display",
  weight: "200 800",
  style: "normal",
  display: "swap",
});

const workSans = localFont({
  src: "../fonts/work-sans-variable.woff2",
  variable: "--font-body",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Espacio de Acompañamiento Estratégico | Strategic Accompaniment Workspace",
  description:
    "Sistema de acompañamiento virtual guiado para la planificación estratégica de organizaciones de la sociedad civil.",
};

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!isValidLocale(lang)) {
    notFound();
  }

  return (
    <html lang={lang} className={`${manrope.variable} ${workSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
