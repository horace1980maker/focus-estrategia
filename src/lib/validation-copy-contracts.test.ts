import assert from "node:assert/strict";
import test from "node:test";
import en from "../i18n/dictionaries/en.json";
import es from "../i18n/dictionaries/es.json";

const REQUIRED_VALIDATION_KEYS = [
  "title",
  "subtitle",
  "validated_banner_title",
  "validated_banner_description",
  "readonly_notice",
  "section_review_title",
  "section_review_caption",
  "approval_without_comments",
  "no_approval_review_found",
  "organization_response_label",
  "organization_response_placeholder",
  "save_response",
  "section_signoff_title",
  "section_signoff_description",
  "entered_by",
  "delete",
  "add_signature_title",
  "name_placeholder",
  "role_placeholder",
  "add_signature",
] as const;

function getValidationCopy(dict: unknown): Record<string, string> {
  if (
    typeof dict === "object" &&
    dict &&
    "validation" in dict &&
    typeof (dict as { validation?: unknown }).validation === "object" &&
    (dict as { validation?: unknown }).validation
  ) {
    return (dict as { validation: Record<string, string> }).validation;
  }
  return {};
}

test("validation dictionaries expose all required keys in English and Spanish", () => {
  const enValidation = getValidationCopy(en);
  const esValidation = getValidationCopy(es);

  for (const key of REQUIRED_VALIDATION_KEYS) {
    assert.equal(typeof enValidation[key], "string", `Missing en.validation.${key}`);
    assert.equal(typeof esValidation[key], "string", `Missing es.validation.${key}`);
    assert.notEqual(enValidation[key].trim().length, 0, `Empty en.validation.${key}`);
    assert.notEqual(esValidation[key].trim().length, 0, `Empty es.validation.${key}`);
  }
});
