import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { LoginForm } from "./LoginForm";
import "./login.css";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const query = searchParams ? await searchParams : {};
  const rawNext = typeof query.next === "string" ? query.next : null;
  const nextPath = rawNext?.startsWith("/") ? rawNext : null;
  await getDictionary(lang as Locale);

  return (
    <main className="main-content">
      <LoginForm lang={(lang === "en" ? "en" : "es")} nextPath={nextPath} />
    </main>
  );
}
