import Sidebar from "@/components/sidebar";
import type { Locale } from "@/i18n/config";
import { isValidLocale } from "@/i18n/config";
import { notFound } from "next/navigation";

export default async function ExamplesLayout({
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
    <>
      <Sidebar lang={lang as Locale} activePath={`/${lang}/examples`} />
      <main className="main-content">{children}</main>
    </>
  );
}
