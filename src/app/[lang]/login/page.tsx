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
  const locale = lang === "en" ? "en" : "es";
  const query = searchParams ? await searchParams : {};
  const rawNext = typeof query.next === "string" ? query.next : null;
  const nextPath = rawNext?.startsWith("/") ? rawNext : null;
  const dict = await getDictionary(locale as Locale);

  return (
    <main className="main-content">
      <LoginForm
        lang={locale}
        nextPath={nextPath}
        homeLinkLabel={dict.login.home_link}
      />
    </main>
  );
}
