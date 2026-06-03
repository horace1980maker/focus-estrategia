"use server";

import { revalidatePath } from "next/cache";
import { saveFrameworkWorkspace } from "@/lib/framework-workspace-service";
import { getSession } from "@/lib/session";

type ActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

function revalidateFrameworkPaths() {
  for (const lang of ["es", "en"] as const) {
    revalidatePath(`/${lang}/phases/3`);
    revalidatePath(`/${lang}/dashboard`);
  }
}

export async function saveFrameworkWorkspaceAction(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getSession();

    const materialsFolderUrl = formData.get("materials") !== null ? String(formData.get("materials") ?? "") : undefined;
    const materialsFolderUrl2 = formData.get("materials-session-2") !== null ? String(formData.get("materials-session-2") ?? "") : undefined;
    const materialsFolderUrl3 = formData.get("materials-session-3") !== null ? String(formData.get("materials-session-3") ?? "") : undefined;
    const materialsFolderUrl4 = formData.get("materials-session-4") !== null ? String(formData.get("materials-session-4") ?? "") : undefined;

    await saveFrameworkWorkspace({
      session,
      organizationId,
      materialsFolderUrl,
      materialsFolderUrl2,
      materialsFolderUrl3,
      materialsFolderUrl4,
    });

    revalidateFrameworkPaths();
    return { success: true, message: "Framework workspace links saved." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save framework links.",
    };
  }
}
