import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { syncDiagnosisToGoogleSheets, type DiagnosisGoogleSheetsPayload } from "../src/lib/google-sheets-sync";

const DIGITAL_QUESTION_KEYS = ["D1", "D2", "D3", "D4", "D5", "D6"] as const;
const OPEN_QUESTION_KEY = "C5";

type DiagnosisResponseRecord = {
  id: string;
  submittedAt: Date;
  definition: {
    version: string;
  };
  organization: {
    id: string;
    name: string;
  };
  submittedBy: {
    id: string | null;
    name: string | null;
  } | null;
  answers: Array<{
    numericValue: number | null;
    optionValue: string | null;
    textValue: string | null;
    isNoInformation: boolean;
    question: {
      questionKey: string;
      questionType: string;
      interpretationNote: string | null;
    };
  }>;
};

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const line = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
      value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    } else {
      const commentIndex = value.indexOf("#");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    process.env[key] = value;
  }
}

function getQuestionOptionLabel(interpretationNote: string | null, optionValue: string): string {
  if (!interpretationNote) {
    return optionValue;
  }

  try {
    const parsed = JSON.parse(interpretationNote);
    const options = Array.isArray(parsed?.options) ? parsed.options : [];
    const option = options.find(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { value?: unknown }).value === "string" &&
        typeof (entry as { label?: unknown }).label === "string" &&
        (entry as { value: string }).value === optionValue,
    );
    return typeof option?.label === "string" ? option.label : optionValue;
  } catch {
    return optionValue;
  }
}

function formatMultiSelectAnswerForSheets(interpretationNote: string | null, rawTextValue: string | null) {
  if (!rawTextValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawTextValue);
    const selectedOptions = Array.isArray(parsed?.selectedOptions) ? parsed.selectedOptions : null;
    if (!selectedOptions) {
      return rawTextValue;
    }

    return selectedOptions
      .filter((value: unknown): value is string => typeof value === "string")
      .map((value) => getQuestionOptionLabel(interpretationNote, value.trim()))
      .filter((value) => value.length > 0)
      .join(" | ");
  } catch {
    return rawTextValue;
  }
}

function formatGoogleSheetsAnswerValue(
  questionType: string,
  interpretationNote: string | null,
  answer: {
    numericValue: number | null;
    optionValue: string | null;
    textValue: string | null;
    isNoInformation: boolean;
  },
): string | number | boolean | null {
  if (typeof answer.numericValue === "number") {
    return answer.numericValue;
  }

  if (answer.optionValue) {
    return getQuestionOptionLabel(interpretationNote, answer.optionValue);
  }

  if (answer.textValue) {
    return questionType === "multi_select"
      ? formatMultiSelectAnswerForSheets(interpretationNote, answer.textValue)
      : answer.textValue;
  }

  if (answer.isNoInformation) {
    return "no_information";
  }

  return null;
}

function summarizeInterpretation(scores: Record<string, number | null>) {
  const d1 = scores.D1;
  const d2 = scores.D2;
  const d3 = scores.D3;
  const d4 = scores.D4;
  const d5 = scores.D5;
  const d6 = scores.D6;

  const signals: string[] = [];
  if ((d1 ?? 5) <= 2 || (d3 ?? 5) <= 2) {
    signals.push("access-collaboration");
  }
  if ((d2 ?? 5) <= 2 || (d4 ?? 5) <= 2) {
    signals.push("information-tracking");
  }
  if ((d5 ?? 5) <= 2) {
    signals.push("adaptability");
  }
  if ((d6 ?? 5) <= 2) {
    signals.push("digital-security");
  }

  const validScores = Object.values(scores).filter((value): value is number => typeof value === "number");
  const average = validScores.length
    ? validScores.reduce((sum, value) => sum + value, 0) / validScores.length
    : 0;

  if (signals.includes("digital-security")) {
    return { classification: "risk" as const, signals };
  }

  if (signals.length > 0 || average < 3.5) {
    return { classification: "bottleneck" as const, signals };
  }

  return { classification: "enabler" as const, signals };
}

function buildPayload(response: DiagnosisResponseRecord): DiagnosisGoogleSheetsPayload {
  const answers: Record<string, string | number | boolean | null> = {};
  const digitalScores: Record<string, number | null> = {
    D1: null,
    D2: null,
    D3: null,
    D4: null,
    D5: null,
    D6: null,
  };

  let keyBarrier: string | null = null;

  for (const answer of response.answers) {
    const normalizedValue = formatGoogleSheetsAnswerValue(
      answer.question.questionType,
      answer.question.interpretationNote,
      answer,
    );

    answers[answer.question.questionKey] = normalizedValue;

    if (DIGITAL_QUESTION_KEYS.includes(answer.question.questionKey as (typeof DIGITAL_QUESTION_KEYS)[number])) {
      digitalScores[answer.question.questionKey] = typeof normalizedValue === "number" ? normalizedValue : null;
    }

    if (answer.question.questionKey === OPEN_QUESTION_KEY) {
      keyBarrier = typeof normalizedValue === "string" ? normalizedValue : null;
    }
  }

  const interpretation = summarizeInterpretation(digitalScores);

  return {
    event: "diagnosis_survey_submitted",
    emittedAt: new Date().toISOString(),
    responseId: response.id,
    organization: {
      id: response.organization.id,
      name: response.organization.name,
    },
    submittedBy: {
      id: response.submittedBy?.id ?? null,
      name: response.submittedBy?.name ?? null,
    },
    definitionVersion: response.definition.version,
    submittedAt: response.submittedAt.toISOString(),
    interpretation: {
      classification: interpretation.classification,
      keyBarrier,
      digitalScores,
    },
    answers,
  };
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env"));
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));

  process.env.GOOGLE_SHEETS_SYNC_ENABLED = "true";

  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim() || "";
  const webhookSecret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET?.trim() || "";
  if (!webhookUrl) {
    throw new Error("Missing GOOGLE_SHEETS_WEBHOOK_URL in the loaded environment.");
  }
  if (!webhookSecret) {
    throw new Error("Missing GOOGLE_SHEETS_WEBHOOK_SECRET in the loaded environment.");
  }

  const { prisma } = await import("../src/lib/prisma");

  const dryRun = process.argv.includes("--dry-run");
  const responses = await prisma.diagnosisSurveyResponse.findMany({
    where: { responseStatus: "submitted" },
    orderBy: { submittedAt: "asc" },
    include: {
      organization: {
        select: { id: true, name: true },
      },
      submittedBy: {
        select: { id: true, name: true },
      },
      definition: {
        select: { version: true },
      },
      answers: {
        include: {
          question: {
            select: {
              questionKey: true,
              questionType: true,
              interpretationNote: true,
            },
          },
        },
      },
    },
  });

  console.info("[backfill] starting diagnosis survey backfill", {
    responsesFound: responses.length,
    dryRun,
  });

  let sent = 0;
  let failed = 0;

  for (const response of responses as DiagnosisResponseRecord[]) {
    const payload = buildPayload(response);

    if (dryRun) {
      console.info("[backfill] dry-run payload prepared", {
        responseId: payload.responseId,
        organizationId: payload.organization.id,
        submittedAt: payload.submittedAt,
        definitionVersion: payload.definitionVersion,
      });
      continue;
    }

    try {
      const result = await syncDiagnosisToGoogleSheets(payload);
      if (result.skipped) {
        console.info("[backfill] skipped", {
          responseId: payload.responseId,
          reason: result.reason,
        });
      } else {
        sent += 1;
        console.info("[backfill] synced", {
          responseId: payload.responseId,
          organizationId: payload.organization.id,
        });
      }
    } catch (error) {
      failed += 1;
      console.error("[backfill] failed to sync response", {
        responseId: payload.responseId,
        error,
      });
    }
  }

  console.info("[backfill] finished diagnosis survey backfill", {
    responsesFound: responses.length,
    sent,
    failed,
    dryRun,
  });

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[backfill] fatal error", error);
  process.exitCode = 1;
});
