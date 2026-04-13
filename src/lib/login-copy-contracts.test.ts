import assert from "node:assert/strict";
import test from "node:test";
import en from "../i18n/dictionaries/en.json";
import es from "../i18n/dictionaries/es.json";

function getLoginCopy(dict: unknown): Record<string, string> {
  if (
    typeof dict === "object" &&
    dict &&
    "login" in dict &&
    typeof (dict as { login?: unknown }).login === "object" &&
    (dict as { login?: unknown }).login
  ) {
    return (dict as { login: Record<string, string> }).login;
  }
  return {};
}

test("login dictionaries expose required home-link copy keys", () => {
  const enLogin = getLoginCopy(en);
  const esLogin = getLoginCopy(es);

  assert.equal(typeof enLogin.home_link, "string", "Missing en.login.home_link");
  assert.equal(typeof esLogin.home_link, "string", "Missing es.login.home_link");
  assert.notEqual(enLogin.home_link.trim().length, 0, "Empty en.login.home_link");
  assert.notEqual(esLogin.home_link.trim().length, 0, "Empty es.login.home_link");
});
