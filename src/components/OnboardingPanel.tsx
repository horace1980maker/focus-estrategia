import Link from "next/link";
import { deleteOnboardingEvidenceAction, saveOnboardingWorkspaceAction } from "@/app/actions/onboarding";
import { OnboardingEvidenceUploader } from "@/components/OnboardingEvidenceUploader";
import { getOnboardingWorkspace } from "@/lib/onboarding-service";
import { getSession } from "@/lib/session";
import type { Locale } from "@/i18n/config";

type OnboardingPanelProps = {
  lang: Locale;
  organizationId: string;
  isEditable: boolean;
};

const COPY = {
  es: {
    title: "Arranque y alineación",
    subtitle:
      "Fase 1 solo requiere Memorándum de Entendimiento y Documentación de la organización.",
    readiness: "Estado Gate 1",
    mou: "Memorándum de Entendimiento (MOU)",
    docs: "Documentación de la organización",
    mouLink: "Enlace MOU (Google Drive / Docs)",
    folderLink: "Carpeta de documentación (Google Drive)",
    saveLinks: "Guardar enlaces",
    openMou: "Abrir MOU",
    openFolder: "Abrir carpeta",
    noMou: "Aún no hay enlace MOU configurado.",
    noFolder: "Aún no hay carpeta de documentación configurada.",
    noDocs: "Aún no hay archivos cargados.",
    remove: "Eliminar",
    criterionMet: "Cumplido",
    criterionMissing: "Pendiente",
    critMou: "MOU configurado",
    critDocs: "Documentación cargada",
    readonly: "Solo ONG admin y facilitador pueden actualizar enlaces.",
    uploadReadonly: "Solo ONG admin puede cargar o eliminar documentación.",
    uploadedAt: "Cargado",
  },
  en: {
    title: "Kickoff and alignment",
    subtitle:
      "Phase 1 only requires Memorandum of Understanding and Organization Documentation.",
    readiness: "Gate 1 status",
    mou: "Memorandum of Understanding (MOU)",
    docs: "Organization documentation",
    mouLink: "MOU link (Google Drive / Docs)",
    folderLink: "Documentation folder (Google Drive)",
    saveLinks: "Save links",
    openMou: "Open MOU",
    openFolder: "Open folder",
    noMou: "No MOU link configured yet.",
    noFolder: "No documentation folder configured yet.",
    noDocs: "No files uploaded yet.",
    remove: "Remove",
    criterionMet: "Complete",
    criterionMissing: "Pending",
    critMou: "MOU configured",
    critDocs: "Documentation uploaded",
    readonly: "Only ngo_admin and facilitator can update links.",
    uploadReadonly: "Only ngo_admin can upload or remove documentation.",
    uploadedAt: "Uploaded",
  },
} as const;

export default async function OnboardingPanel(props: OnboardingPanelProps) {
  const session = await getSession();
  const copy = COPY[props.lang];
  const data = await getOnboardingWorkspace({
    session,
    organizationId: props.organizationId,
  });

  const saveAction = saveOnboardingWorkspaceAction.bind(null, props.organizationId);
  const canEditLinks = session.role === "ngo_admin" || session.role === "facilitator";
  const canUploadDocs = props.isEditable;

  const criteria = [
    { label: copy.critMou, value: data.readiness.criteria.mouDocumentAvailable },
    {
      label: copy.critDocs,
      value: data.readiness.criteria.organizationDocumentationAvailable,
    },
  ];

  return (
    <section className="phase-workspace-shell" id="phase-onboarding-panel">
      <header className="phase-workspace-header">
        <p className="phase-workspace-eyebrow">{copy.title}</p>
        <p>{copy.subtitle}</p>
      </header>

      <div className="phase-status-card" style={{ marginBottom: "var(--space-lg)" }}>
        <div className="phase-status-label">{copy.readiness}</div>
        <div className="phase-output-grid" style={{ marginTop: "var(--space-md)" }}>
          {criteria.map((criterion) => (
            <article key={criterion.label} className="phase-output-card">
              <h3>{criterion.label}</h3>
              <p className={`phase-output-state ${criterion.value ? "done" : "todo"}`}>
                {criterion.value ? copy.criterionMet : copy.criterionMissing}
              </p>
            </article>
          ))}
        </div>
      </div>

      <form
        action={async (formData: FormData) => {
          "use server";
          await saveAction(formData);
        }}
        className="phase-review-form"
      >
        <h3>{copy.mou}</h3>
        <label>
          {copy.mouLink}
          <input
            name="mouDocumentUrl"
            type="url"
            defaultValue={data.workspace.mouDocumentUrl ?? ""}
            readOnly={!canEditLinks}
          />
        </label>
        {data.workspace.mouDocumentUrl ? (
          <Link
            href={data.workspace.mouDocumentUrl}
            className="phase-next-link"
            target="_blank"
            rel="noreferrer"
          >
            {copy.openMou}
          </Link>
        ) : (
          <p className="phase-review-hint">{copy.noMou}</p>
        )}

        <h3>{copy.docs}</h3>
        <label>
          {copy.folderLink}
          <input
            name="documentsFolderUrl"
            type="url"
            defaultValue={data.workspace.documentsFolderUrl ?? ""}
            readOnly={!canEditLinks}
          />
        </label>
        {data.workspace.documentsFolderUrl ? (
          <Link
            href={data.workspace.documentsFolderUrl}
            className="phase-next-link"
            target="_blank"
            rel="noreferrer"
          >
            {copy.openFolder}
          </Link>
        ) : (
          <p className="phase-review-hint">{copy.noFolder}</p>
        )}

        {canEditLinks ? (
          <button type="submit" className="phase-review-button">
            {copy.saveLinks}
          </button>
        ) : (
          <p className="phase-review-hint">{copy.readonly}</p>
        )}
      </form>

      <section className="phase-review-form">
        <h3>{copy.docs}</h3>
        <OnboardingEvidenceUploader
          organizationId={props.organizationId}
          lang={props.lang === "es" ? "es" : "en"}
          disabled={!canUploadDocs}
        />
        {!canUploadDocs ? <p className="phase-review-hint">{copy.uploadReadonly}</p> : null}

        {data.evidence.length === 0 ? (
          <p className="phase-review-hint">{copy.noDocs}</p>
        ) : (
          <div className="phase-output-grid">
            {data.evidence.map((evidence) => (
              <article key={evidence.id} className="phase-output-card">
                <h3>{evidence.fileName}</h3>
                <p className="phase-output-key">
                  {(evidence.fileSizeBytes / 1024).toFixed(1)} KB · {copy.uploadedAt}:{" "}
                  {new Date(evidence.createdAt).toLocaleDateString(
                    props.lang === "es" ? "es-GT" : "en-US",
                  )}
                </p>
                {canUploadDocs ? (
                  <form
                    action={async () => {
                      "use server";
                      await deleteOnboardingEvidenceAction(props.organizationId, evidence.id);
                    }}
                  >
                    <button type="submit" className="phase-output-toggle">
                      {copy.remove}
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
