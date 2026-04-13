import assert from "node:assert/strict";
import test from "node:test";
import {
  type DiagnosisAnswerInput,
  getActiveDiagnosisSurveyDefinition,
  getLatestDiagnosisSummary,
  submitDiagnosisSurveyResponse,
} from "./diagnosis-survey.ts";
import { prisma } from "./prisma.ts";

function suffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

async function cleanupOrganization(organizationId: string) {
  const responses = await prisma.diagnosisSurveyResponse.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const responseIds = responses.map((response) => response.id);
  if (responseIds.length > 0) {
    await prisma.diagnosisSurveyAnswer.deleteMany({
      where: { responseId: { in: responseIds } },
    });
  }
  await prisma.diagnosisSurveyResponse.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

function buildValidAnswers(
  overrides: Partial<Record<string, DiagnosisAnswerInput>> = {},
): Record<string, DiagnosisAnswerInput> {
  const answers: Record<string, DiagnosisAnswerInput> = {};

  for (let index = 1; index <= 10; index += 1) {
    answers[`A${index}`] = { numericValue: 3 };
  }
  for (let index = 1; index <= 10; index += 1) {
    answers[`B${index}`] = { numericValue: 3 };
  }
  for (let index = 1; index <= 6; index += 1) {
    answers[`D${index}`] = { numericValue: 3 };
  }

  answers.C1 = { optionValue: "updated_last_12m" };
  answers.C2 = {
    optionValues: ["strategic_plan_documented", "strategic_priorities_defined"],
  };
  answers.C3 = {
    textValue: "The strategy process is not used consistently in weekly decisions.",
  };
  answers.C4 = {
    textValue: "Define one strategic review cadence with clear owners and deadlines.",
  };
  answers.C5 = {
    textValue: "The team lacks stable internet for coordinated follow-up.",
  };

  const merged: Record<string, DiagnosisAnswerInput> = { ...answers };
  for (const [key, value] of Object.entries(overrides)) {
    if (value) {
      merged[key] = value;
    }
  }
  return merged;
}

test("active diagnosis survey definition includes all guide question keys", async () => {
  const definition = await getActiveDiagnosisSurveyDefinition();
  const keys = new Set(definition.questions.map((question) => question.questionKey));

  for (const key of [
    "A1",
    "A2",
    "A3",
    "A4",
    "A5",
    "A6",
    "A7",
    "A8",
    "A9",
    "A10",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "B6",
    "B7",
    "B8",
    "B9",
    "B10",
    "D1",
    "D2",
    "D3",
    "D4",
    "D5",
    "D6",
    "C1",
    "C2",
    "C3",
    "C4",
    "C5",
  ]) {
    assert.equal(keys.has(key), true);
  }
});

test("active diagnosis survey definition bootstrap is race-safe", async () => {
  const definitions = await Promise.all([
    getActiveDiagnosisSurveyDefinition(),
    getActiveDiagnosisSurveyDefinition(),
    getActiveDiagnosisSurveyDefinition(),
    getActiveDiagnosisSurveyDefinition(),
  ]);

  const version = definitions[0]?.version ?? "";
  assert.ok(version.length > 0);
  assert.equal(definitions.every((definition) => definition.version === version), true);

  const versionCount = await prisma.diagnosisSurveyDefinition.count({
    where: { version },
  });
  assert.equal(versionCount, 1);
});

test("diagnosis submission persists survey version and interpretation summary", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Diagnosis Org ${id}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `diagnosis-user-${id}@example.org`,
      name: "Diagnosis User",
      role: "ngo_admin",
      organizationId: organization.id,
    },
  });

  try {
    const submitted = await submitDiagnosisSurveyResponse({
      organizationId: organization.id,
      submittedById: user.id,
      answers: buildValidAnswers({
        D1: { numericValue: 2 },
        D2: { numericValue: 2 },
        D4: { numericValue: 2 },
        D6: { numericValue: 2 },
      }),
    });

    assert.ok(submitted.responseId);
    assert.ok(submitted.definitionVersion);

    const latest = await getLatestDiagnosisSummary(organization.id);
    assert.ok(latest);
    assert.equal(latest?.definitionVersion, submitted.definitionVersion);
    assert.equal(latest?.keyBarrier?.length ? true : false, true);
    assert.equal(latest?.interpretation.classification, "risk");
    assert.equal(Array.isArray(latest?.interpretation.signals), true);
  } finally {
    await cleanupOrganization(organization.id);
  }
});

test("diagnosis submission rejects invalid digital scale values", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Diagnosis Invalid Org ${id}` },
  });

  try {
    await assert.rejects(
      () =>
        submitDiagnosisSurveyResponse({
          organizationId: organization.id,
          answers: buildValidAnswers({
            D1: { numericValue: 6 },
            D6: { optionValue: "no_information", isNoInformation: true },
          }),
        }),
      /must be between 1 and 5/,
    );
  } finally {
    await cleanupOrganization(organization.id);
  }
});
