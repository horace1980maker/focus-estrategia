type PrimitiveValue = string | number | boolean | null;

export type DiagnosisGoogleSheetsPayload = {
  event: "diagnosis_survey_submitted";
  emittedAt: string;
  responseId: string;
  organization: {
    id: string;
    name: string;
  };
  submittedBy: {
    id: string | null;
    name: string | null;
  };
  definitionVersion: string;
  submittedAt: string;
  interpretation: {
    classification: "enabler" | "bottleneck" | "risk";
    keyBarrier: string | null;
    digitalScores: Record<string, number | null>;
  };
  answers: Record<string, PrimitiveValue>;
};

type SyncResult = {
  skipped: boolean;
  reason?: string;
};

async function postWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

function appendSecretToWebhookUrl(url: string, secret: string | null): string {
  if (!secret) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set("secret", secret);
  return parsed.toString();
}

function shouldSyncToGoogleSheets(): { enabled: boolean; webhookUrl: string | null } {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim() || null;
  const enabled = process.env.GOOGLE_SHEETS_SYNC_ENABLED === "true";
  return { enabled, webhookUrl };
}

export async function syncDiagnosisToGoogleSheets(
  payload: DiagnosisGoogleSheetsPayload,
): Promise<SyncResult> {
  const { enabled, webhookUrl } = shouldSyncToGoogleSheets();
  if (!enabled) {
    return { skipped: true, reason: "sync_disabled" };
  }
  if (!webhookUrl) {
    return { skipped: true, reason: "missing_webhook_url" };
  }

  const timeoutMs = Math.max(1000, Number(process.env.GOOGLE_SHEETS_SYNC_TIMEOUT_MS ?? "5000"));
  const webhookSecret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET?.trim();
  const webhookUrlWithSecret = appendSecretToWebhookUrl(webhookUrl, webhookSecret || null);

  const response = await postWithTimeout(
    webhookUrlWithSecret,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `Google Sheets sync failed with status ${response.status}. ${bodyText.slice(0, 240)}`,
    );
  }

  return { skipped: false };
}
