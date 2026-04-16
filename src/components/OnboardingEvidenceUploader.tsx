"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type OnboardingEvidenceUploaderProps = {
  organizationId: string;
  lang: "es" | "en";
  disabled: boolean;
};

const COPY = {
  es: {
    dropLabel: "Arrastra un archivo aquí o selecciónalo",
    select: "Seleccionar archivo",
    upload: "Subir a Google Drive",
    uploading: "Subiendo...",
    noFile: "Selecciona o arrastra un archivo primero.",
    success: "Archivo enviado a Google Drive.",
  },
  en: {
    dropLabel: "Drop a file here or pick one",
    select: "Choose file",
    upload: "Upload to Google Drive",
    uploading: "Uploading...",
    noFile: "Choose or drop a file first.",
    success: "File uploaded to Google Drive.",
  },
} as const;

export function OnboardingEvidenceUploader(props: OnboardingEvidenceUploaderProps) {
  const copy = COPY[props.lang];
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileLabel = useMemo(() => {
    if (!file) {
      return null;
    }
    const kb = (file.size / 1024).toFixed(1);
    return `${file.name} (${kb} KB)`;
  }, [file]);

  async function upload() {
    if (props.disabled) {
      return;
    }
    if (!file) {
      setError(copy.noFile);
      setMessage(null);
      return;
    }

    setIsUploading(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("organizationId", props.organizationId);
      formData.set("evidenceFile", file);
      const response = await fetch("/api/onboarding/evidence/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Upload failed.");
        return;
      }
      setFile(null);
      setMessage(copy.success);
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="onboarding-uploader">
      <div
        className={`onboarding-dropzone${isDragging ? " dragging" : ""}${props.disabled ? " disabled" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!props.disabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (props.disabled) {
            return;
          }
          const droppedFile = event.dataTransfer.files?.[0] ?? null;
          if (droppedFile) {
            setFile(droppedFile);
            setError(null);
            setMessage(null);
          }
        }}
      >
        <p>{copy.dropLabel}</p>
        <label className="phase-next-link onboarding-dropzone-select">
          {copy.select}
          <input
            type="file"
            style={{ display: "none" }}
            disabled={props.disabled}
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0] ?? null;
              setFile(selected);
              setError(null);
              setMessage(null);
            }}
          />
        </label>
        {fileLabel ? <p className="phase-review-hint">{fileLabel}</p> : null}
      </div>

      <button
        type="button"
        className="phase-review-button"
        onClick={upload}
        disabled={props.disabled || isUploading}
      >
        {isUploading ? copy.uploading : copy.upload}
      </button>

      {error ? <p className="phase-gate-warning">{error}</p> : null}
      {message ? <p className="phase-gate-ready">{message}</p> : null}
    </div>
  );
}
