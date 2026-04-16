type DriveUploadResult = {
  skipped: boolean;
  reason?: string;
  driveFileId?: string | null;
  driveFileUrl?: string | null;
};

function appendSecretToWebhookUrl(url: string, secret: string | null) {
  if (!secret) {
    return url;
  }
  const parsed = new URL(url);
  parsed.searchParams.set("secret", secret);
  return parsed.toString();
}

async function postWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

function getDriveUploadConfig() {
  return {
    enabled: process.env.GOOGLE_DRIVE_UPLOAD_ENABLED === "true",
    webhookUrl: process.env.GOOGLE_DRIVE_UPLOAD_WEBHOOK_URL?.trim() || null,
    webhookSecret: process.env.GOOGLE_DRIVE_UPLOAD_WEBHOOK_SECRET?.trim() || null,
    timeoutMs: Math.max(1000, Number(process.env.GOOGLE_DRIVE_UPLOAD_TIMEOUT_MS ?? "15000")),
  };
}

export async function uploadFileToGoogleDriveWebhook(input: {
  organizationId: string;
  folderUrl: string;
  fileName: string;
  mimeType: string | null;
  fileBytes: Buffer;
}): Promise<DriveUploadResult> {
  const config = getDriveUploadConfig();
  if (!config.enabled) {
    return { skipped: true, reason: "sync_disabled" };
  }
  if (!config.webhookUrl) {
    return { skipped: true, reason: "missing_webhook_url" };
  }

  const webhookUrl = appendSecretToWebhookUrl(config.webhookUrl, config.webhookSecret);
  const formData = new FormData();
  formData.set("organizationId", input.organizationId);
  formData.set("folderUrl", input.folderUrl);
  formData.set("fileName", input.fileName);
  if (input.mimeType) {
    formData.set("mimeType", input.mimeType);
  }
  const binary = Uint8Array.from(input.fileBytes);
  formData.set(
    "file",
    new Blob([binary], { type: input.mimeType || "application/octet-stream" }),
    input.fileName,
  );

  const response = await postWithTimeout(
    webhookUrl,
    {
      method: "POST",
      headers: config.webhookSecret
        ? {
            "x-webhook-secret": config.webhookSecret,
          }
        : undefined,
      body: formData,
    },
    config.timeoutMs,
  );

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `Google Drive upload failed with status ${response.status}. ${bodyText.slice(0, 240)}`,
    );
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return { skipped: false };
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        fileId?: string;
        webViewLink?: string;
        driveFileId?: string;
        driveFileUrl?: string;
      }
    | null;

  return {
    skipped: false,
    driveFileId: payload?.driveFileId ?? payload?.fileId ?? null,
    driveFileUrl: payload?.driveFileUrl ?? payload?.webViewLink ?? null,
  };
}
