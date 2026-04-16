import { ROLES, type UserSession } from "./auth.ts";
import { writeAuditEvent, writeDeniedAccessEvent } from "./audit.ts";
import { prisma } from "./prisma.ts";
import { refreshDeliverableReadiness } from "./deliverables.ts";
import { getPhaseOutputStatus, getPhaseStatus } from "./phases.ts";

export const DEFAULT_HOURLY_RATE_USD = 20;
export const DEFAULT_BASELINE_MANUAL_HOURS_PER_TASK = 1.5;
export const SESSION_TIMEOUT_MINUTES = 10;
export const DEFAULT_REPORTING_DAYS = 30;

type Window = {
  windowStart: Date;
  windowEnd: Date;
};

type RoiValues = {
  platformHours: number;
  manualHoursEstimate: number;
  hoursSaved: number;
  usdSaved: number;
};

type ScopedSettingInput = {
  organizationId?: string | null;
  hourlyRateUsd: number;
  baselineManualHoursPerTask: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumberOrDefault(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function nextUtcDay(date: Date): Date {
  const d = startOfUtcDay(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function normalizePhaseNumber(phaseNumber: number | null | undefined): number {
  if (!phaseNumber || phaseNumber < 1) {
    return 0;
  }
  return phaseNumber;
}

function getRollingWindow(days = DEFAULT_REPORTING_DAYS, until = new Date()): Window {
  const safeDays = Math.max(1, days);
  const windowEnd = nextUtcDay(until);
  const windowStart = new Date(windowEnd);
  windowStart.setUTCDate(windowStart.getUTCDate() - safeDays);
  return { windowStart, windowEnd };
}

function getPriorWindow(current: Window): Window {
  const spanMs = current.windowEnd.getTime() - current.windowStart.getTime();
  const windowEnd = new Date(current.windowStart);
  const windowStart = new Date(windowEnd.getTime() - spanMs);
  return { windowStart, windowEnd };
}

function trendPercent(currentValue: number, previousValue: number): number {
  if (previousValue <= 0) {
    return currentValue > 0 ? 100 : 0;
  }
  return round2(((currentValue - previousValue) / previousValue) * 100);
}

function isPrismaForeignKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2003"
  );
}

function canUpdateRoiScope(session: UserSession, organizationId?: string | null): boolean {
  if (session.role === ROLES.FACILITATOR) {
    return true;
  }

  if (session.role === ROLES.NGO_ADMIN) {
    return Boolean(
      organizationId &&
        session.organizationId &&
        organizationId === session.organizationId,
    );
  }

  return false;
}

export function canAccessCohortAnalytics(session: UserSession): boolean {
  return session.role === ROLES.FOCUS_COORDINATOR;
}

export function calculateRoiValues(input: {
  trackedMinutes: number;
  completedTasks: number;
  hourlyRateUsd: number;
  baselineManualHoursPerTask: number;
}): RoiValues {
  const trackedMinutes = Math.max(0, toNumberOrDefault(input.trackedMinutes, 0));
  const completedTasks = Math.max(0, toNumberOrDefault(input.completedTasks, 0));
  const hourlyRateUsd = Math.max(0, toNumberOrDefault(input.hourlyRateUsd, DEFAULT_HOURLY_RATE_USD));
  const baselineManualHoursPerTask = Math.max(
    0,
    toNumberOrDefault(input.baselineManualHoursPerTask, DEFAULT_BASELINE_MANUAL_HOURS_PER_TASK),
  );

  const platformHours = trackedMinutes / 60;
  const manualHoursEstimate = completedTasks * baselineManualHoursPerTask;
  const hoursSaved = Math.max(manualHoursEstimate - platformHours, 0);
  const usdSaved = hoursSaved * hourlyRateUsd;

  return {
    platformHours: round2(platformHours),
    manualHoursEstimate: round2(manualHoursEstimate),
    hoursSaved: round2(hoursSaved),
    usdSaved: round2(usdSaved),
  };
}

async function createOrUpdateRoiSnapshot(input: {
  organizationId?: string | null;
  scope: "organization" | "cohort";
  window: Window;
  hourlyRateUsd: number;
  baselineManualHoursPerTask: number;
  trackedMinutes: number;
  completedTasks: number;
}) {
  const roi = calculateRoiValues({
    trackedMinutes: input.trackedMinutes,
    completedTasks: input.completedTasks,
    hourlyRateUsd: input.hourlyRateUsd,
    baselineManualHoursPerTask: input.baselineManualHoursPerTask,
  });

  const existing = await prisma.roiSnapshot.findFirst({
    where: {
      organizationId: input.organizationId ?? null,
      scope: input.scope,
      periodStart: input.window.windowStart,
      periodEnd: input.window.windowEnd,
    },
    orderBy: { updatedAt: "desc" },
  });

  const data = {
    organizationId: input.organizationId ?? null,
    scope: input.scope,
    periodStart: input.window.windowStart,
    periodEnd: input.window.windowEnd,
    platformHours: roi.platformHours,
    manualHoursEstimate: roi.manualHoursEstimate,
    hoursSaved: roi.hoursSaved,
    usdSaved: roi.usdSaved,
    hourlyRateUsd: input.hourlyRateUsd,
    baselineManualHoursPerTask: input.baselineManualHoursPerTask,
    totalCompletedTasks: Math.max(0, input.completedTasks),
    totalTrackedMinutes: Math.max(0, input.trackedMinutes),
    generatedAt: new Date(),
  };

  if (input.organizationId) {
    const organizationExists = await prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organizationExists) {
      // Organization may have been deleted during analytics reconciliation/test cleanup.
      return null;
    }
  }

  try {
    if (existing) {
      return await prisma.roiSnapshot.update({
        where: { id: existing.id },
        data,
      });
    }

    return await prisma.roiSnapshot.create({ data });
  } catch (error) {
    if (input.organizationId && isPrismaForeignKeyError(error)) {
      // Ignore transient FK races; metrics can still be returned without persisting snapshot.
      return null;
    }
    throw error;
  }
}

export async function ensureDefaultRoiSetting(updatedBy = "system-seed") {
  const existing = await prisma.roiSetting.findFirst({
    where: { organizationId: null, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.roiSetting.create({
    data: {
      organizationId: null,
      isDefault: true,
      hourlyRateUsd: DEFAULT_HOURLY_RATE_USD,
      baselineManualHoursPerTask: DEFAULT_BASELINE_MANUAL_HOURS_PER_TASK,
      updatedBy,
    },
  });
}

export async function getEffectiveRoiSetting(organizationId?: string | null) {
  const defaultSetting = await ensureDefaultRoiSetting();
  if (!organizationId) {
    return defaultSetting;
  }

  const organizationSetting = await prisma.roiSetting.findFirst({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
  });

  return organizationSetting ?? defaultSetting;
}

async function refreshOrgRoiSnapshot(organizationId: string, date = new Date()) {
  const window = getRollingWindow(DEFAULT_REPORTING_DAYS, date);
  const rows = await prisma.sectionEngagement.findMany({
    where: {
      organizationId,
      windowStart: {
        gte: window.windowStart,
        lt: window.windowEnd,
      },
    },
  });

  const trackedMinutes = rows.reduce((total, row) => total + row.totalMinutes, 0);
  const completedTasks = rows.reduce((total, row) => total + row.completedTasks, 0);
  const setting = await getEffectiveRoiSetting(organizationId);

  return createOrUpdateRoiSnapshot({
    organizationId,
    scope: "organization",
    window,
    hourlyRateUsd: setting.hourlyRateUsd,
    baselineManualHoursPerTask: setting.baselineManualHoursPerTask,
    trackedMinutes,
    completedTasks,
  });
}

async function refreshCohortRoiSnapshot(date = new Date()) {
  const window = getRollingWindow(DEFAULT_REPORTING_DAYS, date);
  const rows = await prisma.sectionEngagement.findMany({
    where: {
      windowStart: {
        gte: window.windowStart,
        lt: window.windowEnd,
      },
    },
  });

  const trackedMinutes = rows.reduce((total, row) => total + row.totalMinutes, 0);
  const completedTasks = rows.reduce((total, row) => total + row.completedTasks, 0);
  const setting = await getEffectiveRoiSetting(null);

  return createOrUpdateRoiSnapshot({
    organizationId: null,
    scope: "cohort",
    window,
    hourlyRateUsd: setting.hourlyRateUsd,
    baselineManualHoursPerTask: setting.baselineManualHoursPerTask,
    trackedMinutes,
    completedTasks,
  });
}

async function aggregateFinalizedSession(session: {
  organizationId: string;
  sectionKey: string;
  phaseNumber: number;
  startedAt: Date;
  durationMinutes: number | null;
}) {
  const windowStart = startOfUtcDay(session.startedAt);
  const windowEnd = nextUtcDay(session.startedAt);
  const phaseNumber = normalizePhaseNumber(session.phaseNumber);
  const minutes = Math.max(1, toNumberOrDefault(session.durationMinutes, 1));

  await prisma.sectionEngagement.upsert({
    where: {
      org_phase_section_window: {
        organizationId: session.organizationId,
        phaseNumber,
        sectionKey: session.sectionKey,
        windowStart,
        windowEnd,
      },
    },
    create: {
      organizationId: session.organizationId,
      phaseNumber,
      sectionKey: session.sectionKey,
      windowStart,
      windowEnd,
      totalMinutes: minutes,
      sessionsCount: 1,
      completedTasks: 0,
    },
    update: {
      totalMinutes: { increment: minutes },
      sessionsCount: { increment: 1 },
    },
  });
}

async function finalizeSessionByIdInternal(sessionId: string, closedByTimeout: boolean) {
  const existing = await prisma.activitySession.findUnique({
    where: { id: sessionId },
  });

  if (!existing) {
    return null;
  }

  if (existing.endedAt) {
    return existing;
  }

  const now = new Date();
  const timeoutCappedEnd = new Date(
    existing.lastActivityAt.getTime() + SESSION_TIMEOUT_MINUTES * 60 * 1000,
  );
  const endedAt = closedByTimeout
    ? timeoutCappedEnd < now
      ? timeoutCappedEnd
      : now
    : now;
  const safeEndedAt =
    endedAt.getTime() < existing.startedAt.getTime() ? existing.startedAt : endedAt;
  const durationMinutes = Math.max(
    1,
    Math.ceil((safeEndedAt.getTime() - existing.startedAt.getTime()) / 60000),
  );

  const closed = await prisma.activitySession.update({
    where: { id: existing.id },
    data: {
      endedAt: safeEndedAt,
      durationMinutes,
      isClosedByTimeout: closedByTimeout,
      lastActivityAt: closedByTimeout ? existing.lastActivityAt : safeEndedAt,
    },
  });

  await aggregateFinalizedSession(closed);
  await refreshOrgRoiSnapshot(closed.organizationId, closed.endedAt ?? new Date());
  await refreshCohortRoiSnapshot(closed.endedAt ?? new Date());

  return closed;
}

async function closeExpiredSessionsForUser(session: UserSession) {
  if (!session.organizationId) {
    return;
  }

  const timeoutThreshold = new Date(Date.now() - SESSION_TIMEOUT_MINUTES * 60 * 1000);
  const staleSessions = await prisma.activitySession.findMany({
    where: {
      organizationId: session.organizationId,
      userId: session.id,
      endedAt: null,
      lastActivityAt: { lt: timeoutThreshold },
    },
    select: { id: true },
  });

  for (const stale of staleSessions) {
    await finalizeSessionByIdInternal(stale.id, true);
  }
}

export async function startOrResumeActivitySession(input: {
  session: UserSession;
  sectionKey: string;
  phaseNumber?: number | null;
}) {
  const { session, sectionKey } = input;
  if (!session.organizationId) {
    throw new Error("Current user has no organization context.");
  }

  await closeExpiredSessionsForUser(session);

  const now = new Date();
  const threshold = new Date(now.getTime() - SESSION_TIMEOUT_MINUTES * 60 * 1000);
  const phaseNumber = normalizePhaseNumber(input.phaseNumber);

  const active = await prisma.activitySession.findFirst({
    where: {
      organizationId: session.organizationId,
      userId: session.id,
      sectionKey,
      endedAt: null,
      lastActivityAt: { gte: threshold },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  if (active) {
    return prisma.activitySession.update({
      where: { id: active.id },
      data: {
        lastActivityAt: now,
        userRole: session.role,
        phaseNumber,
      },
    });
  }

  return prisma.activitySession.create({
    data: {
      organizationId: session.organizationId,
      userId: session.id,
      userRole: session.role,
      phaseNumber,
      sectionKey,
      startedAt: now,
      lastActivityAt: now,
    },
  });
}

export async function touchActivitySession(input: {
  session: UserSession;
  sessionId: string;
}) {
  if (!input.session.organizationId) {
    throw new Error("Current user has no organization context.");
  }

  const existing = await prisma.activitySession.findUnique({
    where: { id: input.sessionId },
  });

  if (!existing) {
    throw new Error("Session not found.");
  }

  if (
    existing.organizationId !== input.session.organizationId ||
    existing.userId !== input.session.id
  ) {
    throw new Error("Not authorized to update this session.");
  }

  if (existing.endedAt) {
    return existing;
  }

  return prisma.activitySession.update({
    where: { id: existing.id },
    data: { lastActivityAt: new Date() },
  });
}

export async function finalizeActivitySessionById(input: {
  session: UserSession;
  sessionId: string;
  closedByTimeout?: boolean;
}) {
  if (!input.session.organizationId) {
    throw new Error("Current user has no organization context.");
  }

  const existing = await prisma.activitySession.findUnique({
    where: { id: input.sessionId },
  });

  if (!existing) {
    throw new Error("Session not found.");
  }

  if (
    existing.organizationId !== input.session.organizationId ||
    existing.userId !== input.session.id
  ) {
    throw new Error("Not authorized to finalize this session.");
  }

  return finalizeSessionByIdInternal(existing.id, Boolean(input.closedByTimeout));
}

export async function finalizeLatestSessionForSection(input: {
  session: UserSession;
  sectionKey: string;
  closedByTimeout?: boolean;
}) {
  if (!input.session.organizationId) {
    throw new Error("Current user has no organization context.");
  }

  const active = await prisma.activitySession.findFirst({
    where: {
      organizationId: input.session.organizationId,
      userId: input.session.id,
      sectionKey: input.sectionKey,
      endedAt: null,
    },
    orderBy: { lastActivityAt: "desc" },
  });

  if (!active) {
    return null;
  }

  return finalizeSessionByIdInternal(active.id, Boolean(input.closedByTimeout));
}

export async function recordTaskCompletion(input: {
  organizationId: string;
  sectionKey: string;
  phaseNumber?: number | null;
  count?: number;
  completedAt?: Date;
}) {
  const completedAt = input.completedAt ?? new Date();
  const phaseNumber = normalizePhaseNumber(input.phaseNumber);
  const count = Math.max(1, input.count ?? 1);
  const windowStart = startOfUtcDay(completedAt);
  const windowEnd = nextUtcDay(completedAt);

  await prisma.sectionEngagement.upsert({
    where: {
      org_phase_section_window: {
        organizationId: input.organizationId,
        phaseNumber,
        sectionKey: input.sectionKey,
        windowStart,
        windowEnd,
      },
    },
    create: {
      organizationId: input.organizationId,
      phaseNumber,
      sectionKey: input.sectionKey,
      windowStart,
      windowEnd,
      completedTasks: count,
      totalMinutes: 0,
      sessionsCount: 0,
    },
    update: {
      completedTasks: { increment: count },
    },
  });

  await refreshOrgRoiSnapshot(input.organizationId, completedAt);
  await refreshCohortRoiSnapshot(completedAt);
}

type OrganizationMetrics = {
  organizationId: string;
  windowStart: Date;
  windowEnd: Date;
  totals: {
    trackedMinutes: number;
    completedTasks: number;
    sessionsCount: number;
  };
  bySection: Array<{
    sectionKey: string;
    trackedMinutes: number;
    completedTasks: number;
    sessionsCount: number;
  }>;
  byPhase: Array<{
    phaseNumber: number;
    trackedMinutes: number;
    completedTasks: number;
    sessionsCount: number;
  }>;
  trends: {
    trackedMinutesPct: number;
    completedTasksPct: number;
    sessionsCountPct: number;
  };
  roi: {
    hourlyRateUsd: number;
    baselineManualHoursPerTask: number;
    platformHours: number;
    manualHoursEstimate: number;
    hoursSaved: number;
    usdSaved: number;
  };
  phase: {
    currentPhase: number | null;
    currentPhaseStatus: string | null;
    gateRequiredOutputs: number;
    gateCompletedOutputs: number;
    gateMissingOutputs: number;
    gateStatus: "ready" | "blocked" | "unknown";
  };
  deliverables: {
    latestVersionNumber: number | null;
    latestStatus: string | null;
    readinessStatus: string | null;
    versionsCount: number;
    pendingAction: string;
    bottleneck: string;
  };
  projection: {
    stale: boolean;
    warnings: string[];
  };
  dataState: "ready" | "empty";
};

function aggregateRowsBySection(rows: Array<{
  sectionKey: string;
  totalMinutes: number;
  completedTasks: number;
  sessionsCount: number;
}>) {
  const map = new Map<
    string,
    { trackedMinutes: number; completedTasks: number; sessionsCount: number }
  >();

  for (const row of rows) {
    const entry = map.get(row.sectionKey) ?? {
      trackedMinutes: 0,
      completedTasks: 0,
      sessionsCount: 0,
    };

    entry.trackedMinutes += row.totalMinutes;
    entry.completedTasks += row.completedTasks;
    entry.sessionsCount += row.sessionsCount;
    map.set(row.sectionKey, entry);
  }

  return Array.from(map.entries()).map(([sectionKey, value]) => ({
    sectionKey,
    ...value,
  }));
}

function aggregateRowsByPhase(rows: Array<{
  phaseNumber: number;
  totalMinutes: number;
  completedTasks: number;
  sessionsCount: number;
}>) {
  const map = new Map<
    number,
    { trackedMinutes: number; completedTasks: number; sessionsCount: number }
  >();

  for (const row of rows) {
    const phase = normalizePhaseNumber(row.phaseNumber);
    const entry = map.get(phase) ?? {
      trackedMinutes: 0,
      completedTasks: 0,
      sessionsCount: 0,
    };

    entry.trackedMinutes += row.totalMinutes;
    entry.completedTasks += row.completedTasks;
    entry.sessionsCount += row.sessionsCount;
    map.set(phase, entry);
  }

  return Array.from(map.entries())
    .map(([phaseNumber, value]) => ({ phaseNumber, ...value }))
    .sort((a, b) => a.phaseNumber - b.phaseNumber);
}

async function getSectionRowsForWindow(organizationId: string, window: Window) {
  return prisma.sectionEngagement.findMany({
    where: {
      organizationId,
      windowStart: {
        gte: window.windowStart,
        lt: window.windowEnd,
      },
    },
    orderBy: [{ windowStart: "asc" }],
  });
}

function derivePendingDeliverableAction(input: {
  latestStatus: string | null;
  readinessStatus: string | null;
}): string {
  if (!input.latestStatus) {
    return "generate_version";
  }
  if (input.readinessStatus === "not_ready") {
    return "complete_upstream_outputs";
  }
  if (input.latestStatus === "draft") {
    return "submit_for_review";
  }
  if (input.latestStatus === "in_review") {
    return "facilitator_approval";
  }
  if (input.latestStatus === "approved") {
    return "publish";
  }
  return "none";
}

function deriveDeliverablesBottleneck(input: {
  latestStatus: string | null;
  readinessStatus: string | null;
  pendingAction: string;
}): string {
  if (!input.latestStatus) {
    return "awaiting_generation";
  }
  if (input.readinessStatus === "not_ready") {
    return "blocked_by_outputs";
  }
  if (input.pendingAction === "submit_for_review") {
    return "awaiting_review_request";
  }
  if (input.pendingAction === "facilitator_approval") {
    return "awaiting_facilitator";
  }
  if (input.pendingAction === "publish") {
    return "awaiting_publication";
  }
  return "none";
}

function sumRows(rows: Array<{ totalMinutes: number; completedTasks: number; sessionsCount: number }>) {
  return rows.reduce(
    (acc, row) => {
      acc.trackedMinutes += row.totalMinutes;
      acc.completedTasks += row.completedTasks;
      acc.sessionsCount += row.sessionsCount;
      return acc;
    },
    { trackedMinutes: 0, completedTasks: 0, sessionsCount: 0 },
  );
}

export async function getOrganizationMetrics(input: {
  organizationId: string;
  days?: number;
  until?: Date;
}): Promise<OrganizationMetrics> {
  const window = getRollingWindow(input.days, input.until);
  const priorWindow = getPriorWindow(window);

  const [
    rows,
    priorRows,
    setting,
    latestDeliverable,
    deliverableVersionsCount,
    phaseStatus,
  ] = await Promise.all([
    getSectionRowsForWindow(input.organizationId, window),
    getSectionRowsForWindow(input.organizationId, priorWindow),
    getEffectiveRoiSetting(input.organizationId),
    prisma.deliverable.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
    }),
    prisma.deliverable.count({
      where: { organizationId: input.organizationId },
    }),
    getPhaseStatus(input.organizationId),
  ]);

  const totals = sumRows(rows);
  const priorTotals = sumRows(priorRows);
  const roi = calculateRoiValues({
    trackedMinutes: totals.trackedMinutes,
    completedTasks: totals.completedTasks,
    hourlyRateUsd: setting.hourlyRateUsd,
    baselineManualHoursPerTask: setting.baselineManualHoursPerTask,
  });

  await createOrUpdateRoiSnapshot({
    organizationId: input.organizationId,
    scope: "organization",
    window,
    hourlyRateUsd: setting.hourlyRateUsd,
    baselineManualHoursPerTask: setting.baselineManualHoursPerTask,
    trackedMinutes: totals.trackedMinutes,
    completedTasks: totals.completedTasks,
  });

  const currentPhase = phaseStatus?.currentPhase ?? null;
  const currentPhaseRow =
    currentPhase !== null
      ? phaseStatus?.phases.find((phase) => phase.phaseNumber === currentPhase) ?? null
      : null;

  const projectionWarnings: string[] = [];
  let gateSummary: Awaited<ReturnType<typeof getPhaseOutputStatus>> | null = null;
  if (currentPhase) {
    try {
      gateSummary = await getPhaseOutputStatus(input.organizationId, currentPhase);
    } catch (error) {
      const phaseTrackerStateError =
        error instanceof Error &&
        (error.message.includes("Organization has no phase tracker") ||
          error.message.includes("Phase ") && error.message.includes(" not found"));
      if (!isPrismaForeignKeyError(error) && !phaseTrackerStateError) {
        throw error;
      }

      projectionWarnings.push(
        "Phase output status could not be resolved; defaulted gate status to unknown.",
      );
      gateSummary = null;
    }
  }
  const gateMissingOutputs = gateSummary?.missingOutputs.length ?? 0;
  const gateRequiredOutputs = gateSummary?.requiredCount ?? 0;
  const gateCompletedOutputs = gateSummary?.completedCount ?? 0;
  const gateStatus: "ready" | "blocked" | "unknown" =
    gateSummary === null ? "unknown" : gateMissingOutputs > 0 ? "blocked" : "ready";

  const pendingAction = derivePendingDeliverableAction({
    latestStatus: latestDeliverable?.status ?? null,
    readinessStatus: latestDeliverable?.readinessStatus ?? null,
  });
  const deliverablesBottleneck = deriveDeliverablesBottleneck({
    latestStatus: latestDeliverable?.status ?? null,
    readinessStatus: latestDeliverable?.readinessStatus ?? null,
    pendingAction,
  });
  if (
    latestDeliverable &&
    latestDeliverable.status !== "draft" &&
    latestDeliverable.readinessStatus === "not_ready"
  ) {
    projectionWarnings.push(
      "Deliverable is beyond draft but still marked not_ready.",
    );
  }
  if (currentPhase === 6 && !latestDeliverable) {
    projectionWarnings.push(
      "Organization is in deliverables phase without a generated deliverable version.",
    );
  }

  return {
    organizationId: input.organizationId,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    totals,
    bySection: aggregateRowsBySection(rows),
    byPhase: aggregateRowsByPhase(rows),
    trends: {
      trackedMinutesPct: trendPercent(totals.trackedMinutes, priorTotals.trackedMinutes),
      completedTasksPct: trendPercent(totals.completedTasks, priorTotals.completedTasks),
      sessionsCountPct: trendPercent(totals.sessionsCount, priorTotals.sessionsCount),
    },
    roi: {
      hourlyRateUsd: setting.hourlyRateUsd,
      baselineManualHoursPerTask: setting.baselineManualHoursPerTask,
      ...roi,
    },
    phase: {
      currentPhase,
      currentPhaseStatus: currentPhaseRow?.status ?? null,
      gateRequiredOutputs,
      gateCompletedOutputs,
      gateMissingOutputs,
      gateStatus,
    },
    deliverables: {
      latestVersionNumber: latestDeliverable?.versionNumber ?? null,
      latestStatus: latestDeliverable?.status ?? null,
      readinessStatus: latestDeliverable?.readinessStatus ?? null,
      versionsCount: deliverableVersionsCount,
      pendingAction,
      bottleneck: deliverablesBottleneck,
    },
    projection: {
      stale: projectionWarnings.length > 0,
      warnings: projectionWarnings,
    },
    dataState: rows.length > 0 ? "ready" : "empty",
  };
}

type CohortOrgMetrics = {
  organizationId: string;
  organizationName: string;
  currentPhase: number | null;
  currentPhaseStatus: string | null;
  timeInPhaseDays: number | null;
  gateStatus: "ready" | "blocked" | "unknown";
  gateMissingOutputs: number;
  gateRequiredOutputs: number;
  gateCompletedOutputs: number;
  trackedMinutes: number;
  completedTasks: number;
  sessionsCount: number;
  roiUsdSaved: number;
  roiHoursSaved: number;
  deliverablesLatestStatus: string | null;
  deliverablesReadinessStatus: string | null;
  deliverablesVersion: number | null;
  deliverablesPendingAction: string;
  deliverablesBottleneck: string;
};

function normalizeOrganizationName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function compareCohortOrgPriority(left: CohortOrgMetrics, right: CohortOrgMetrics): number {
  if (right.trackedMinutes !== left.trackedMinutes) {
    return right.trackedMinutes - left.trackedMinutes;
  }
  if (right.completedTasks !== left.completedTasks) {
    return right.completedTasks - left.completedTasks;
  }
  if (right.sessionsCount !== left.sessionsCount) {
    return right.sessionsCount - left.sessionsCount;
  }
  if ((right.currentPhase ?? 0) !== (left.currentPhase ?? 0)) {
    return (right.currentPhase ?? 0) - (left.currentPhase ?? 0);
  }
  if ((right.deliverablesVersion ?? 0) !== (left.deliverablesVersion ?? 0)) {
    return (right.deliverablesVersion ?? 0) - (left.deliverablesVersion ?? 0);
  }
  if (right.roiUsdSaved !== left.roiUsdSaved) {
    return right.roiUsdSaved - left.roiUsdSaved;
  }
  return left.organizationId.localeCompare(right.organizationId);
}

function dedupeCohortOrganizationsByName(rows: CohortOrgMetrics[]): CohortOrgMetrics[] {
  const grouped = new Map<string, CohortOrgMetrics[]>();
  for (const row of rows) {
    const key = normalizeOrganizationName(row.organizationName);
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }

  const deduped: CohortOrgMetrics[] = [];
  for (const [nameKey, group] of grouped.entries()) {
    if (group.length === 1) {
      deduped.push(group[0]!);
      continue;
    }

    const sortedGroup = [...group].sort(compareCohortOrgPriority);
    const canonical = sortedGroup[0]!;

    const totals = group.reduce(
      (acc, item) => {
        acc.trackedMinutes += item.trackedMinutes;
        acc.completedTasks += item.completedTasks;
        acc.sessionsCount += item.sessionsCount;
        acc.roiUsdSaved += item.roiUsdSaved;
        acc.roiHoursSaved += item.roiHoursSaved;
        return acc;
      },
      {
        trackedMinutes: 0,
        completedTasks: 0,
        sessionsCount: 0,
        roiUsdSaved: 0,
        roiHoursSaved: 0,
      },
    );

    deduped.push({
      ...canonical,
      organizationName: canonical.organizationName.trim() || nameKey,
      trackedMinutes: totals.trackedMinutes,
      completedTasks: totals.completedTasks,
      sessionsCount: totals.sessionsCount,
      roiUsdSaved: round2(totals.roiUsdSaved),
      roiHoursSaved: round2(totals.roiHoursSaved),
    });
  }

  return deduped;
}

const PHASE_STATUS_SORT_ORDER: Record<string, number> = {
  review_requested: 0,
  in_progress: 1,
  locked: 2,
  approved: 3,
};

function getPhaseStatusSortRank(status: string | null): number {
  if (!status) {
    return Number.MAX_SAFE_INTEGER;
  }
  return PHASE_STATUS_SORT_ORDER[status] ?? Number.MAX_SAFE_INTEGER;
}

function calculateTimeInPhaseDays(startedAt: Date | null, until: Date): number | null {
  if (!startedAt) {
    return null;
  }
  const msInDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((until.getTime() - startedAt.getTime()) / msInDay));
}

export async function getCohortMetrics(input: {
  days?: number;
  until?: Date;
}) {
  const effectiveUntil = input.until ?? new Date();
  const window = getRollingWindow(input.days, effectiveUntil);
  const organizations = await prisma.organization.findMany({
    include: {
      phaseTracker: {
        include: {
          phases: {
            select: {
              phaseNumber: true,
              status: true,
              startedAt: true,
            },
            orderBy: { phaseNumber: "asc" },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const perOrganization: CohortOrgMetrics[] = [];
  for (const organization of organizations) {
    const metrics = await getOrganizationMetrics({
      organizationId: organization.id,
      days: input.days,
      until: input.until,
    });
    const currentPhaseNumber = organization.phaseTracker?.currentPhase ?? null;
    const currentPhaseData =
      currentPhaseNumber !== null
        ? organization.phaseTracker?.phases.find(
            (phase) => phase.phaseNumber === currentPhaseNumber,
          ) ?? null
        : null;

    perOrganization.push({
      organizationId: organization.id,
      organizationName: organization.name,
      currentPhase: currentPhaseNumber,
      currentPhaseStatus: currentPhaseData?.status ?? null,
      timeInPhaseDays: calculateTimeInPhaseDays(
        currentPhaseData?.startedAt ?? null,
        effectiveUntil,
      ),
      gateStatus: metrics.phase.gateStatus,
      gateMissingOutputs: metrics.phase.gateMissingOutputs,
      gateRequiredOutputs: metrics.phase.gateRequiredOutputs,
      gateCompletedOutputs: metrics.phase.gateCompletedOutputs,
      trackedMinutes: metrics.totals.trackedMinutes,
      completedTasks: metrics.totals.completedTasks,
      sessionsCount: metrics.totals.sessionsCount,
      roiUsdSaved: metrics.roi.usdSaved,
      roiHoursSaved: metrics.roi.hoursSaved,
      deliverablesLatestStatus: metrics.deliverables.latestStatus,
      deliverablesReadinessStatus: metrics.deliverables.readinessStatus,
      deliverablesVersion: metrics.deliverables.latestVersionNumber,
      deliverablesPendingAction: metrics.deliverables.pendingAction,
      deliverablesBottleneck: metrics.deliverables.bottleneck,
    });
  }

  const dedupedOrganizations = dedupeCohortOrganizationsByName(perOrganization);

  dedupedOrganizations.sort((left, right) => {
    const statusRankDiff =
      getPhaseStatusSortRank(left.currentPhaseStatus) -
      getPhaseStatusSortRank(right.currentPhaseStatus);
    if (statusRankDiff !== 0) {
      return statusRankDiff;
    }

    const leftTime = left.timeInPhaseDays ?? -1;
    const rightTime = right.timeInPhaseDays ?? -1;
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    const leftPhase = left.currentPhase ?? Number.MAX_SAFE_INTEGER;
    const rightPhase = right.currentPhase ?? Number.MAX_SAFE_INTEGER;
    if (leftPhase !== rightPhase) {
      return leftPhase - rightPhase;
    }

    return left.organizationName.localeCompare(right.organizationName);
  });

  const totals = dedupedOrganizations.reduce(
    (acc, org) => {
      acc.trackedMinutes += org.trackedMinutes;
      acc.completedTasks += org.completedTasks;
      acc.sessionsCount += org.sessionsCount;
      acc.roiUsdSaved += org.roiUsdSaved;
      acc.roiHoursSaved += org.roiHoursSaved;
      return acc;
    },
    {
      trackedMinutes: 0,
      completedTasks: 0,
      sessionsCount: 0,
      roiUsdSaved: 0,
      roiHoursSaved: 0,
    },
  );

  const allRows = await prisma.sectionEngagement.findMany({
    where: {
      windowStart: {
        gte: window.windowStart,
        lt: window.windowEnd,
      },
    },
  });
  const sectionMap = new Map<string, number>();
  for (const row of allRows) {
    sectionMap.set(row.sectionKey, (sectionMap.get(row.sectionKey) ?? 0) + row.totalMinutes);
  }

  const setting = await getEffectiveRoiSetting(null);
  await createOrUpdateRoiSnapshot({
    organizationId: null,
    scope: "cohort",
    window,
    hourlyRateUsd: setting.hourlyRateUsd,
    baselineManualHoursPerTask: setting.baselineManualHoursPerTask,
    trackedMinutes: totals.trackedMinutes,
    completedTasks: totals.completedTasks,
  });

  return {
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    totals: {
      trackedMinutes: totals.trackedMinutes,
      completedTasks: totals.completedTasks,
      sessionsCount: totals.sessionsCount,
      roiUsdSaved: round2(totals.roiUsdSaved),
      roiHoursSaved: round2(totals.roiHoursSaved),
    },
    bySection: Array.from(sectionMap.entries())
      .map(([sectionKey, trackedMinutes]) => ({ sectionKey, trackedMinutes }))
      .sort((a, b) => b.trackedMinutes - a.trackedMinutes),
    organizations: dedupedOrganizations,
    bottlenecks: {
      blockedByGate: dedupedOrganizations.filter((org) => org.gateStatus === "blocked").length,
      deliverablesPending: dedupedOrganizations.filter(
        (org) => org.deliverablesBottleneck !== "none",
      ).length,
    },
    benchmark: {
      hourlyRateUsd: setting.hourlyRateUsd,
      baselineManualHoursPerTask: setting.baselineManualHoursPerTask,
    },
    dataState: dedupedOrganizations.length > 0 ? "ready" : "empty",
  };
}

export async function updateRoiSetting(input: {
  session: UserSession;
  organizationId?: string | null;
  hourlyRateUsd: number;
  baselineManualHoursPerTask: number;
}) {
  const organizationId = input.organizationId ?? null;
  if (!canUpdateRoiScope(input.session, organizationId)) {
    await writeDeniedAccessEvent({
      session: input.session,
      organizationId,
      targetEntityType: "roi_setting",
      reason: "roi_setting_update_forbidden",
      metadata: {
        requestedOrganizationId: organizationId,
      },
    });
    throw new Error("Not authorized to update ROI settings.");
  }

  const hourlyRateUsd = Math.max(0, toNumberOrDefault(input.hourlyRateUsd, DEFAULT_HOURLY_RATE_USD));
  const baselineManualHoursPerTask = Math.max(
    0,
    toNumberOrDefault(input.baselineManualHoursPerTask, DEFAULT_BASELINE_MANUAL_HOURS_PER_TASK),
  );

  if (organizationId) {
    const existing = await prisma.roiSetting.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
    });

    const updated = existing
      ? await prisma.roiSetting.update({
          where: { id: existing.id },
          data: {
            hourlyRateUsd,
            baselineManualHoursPerTask,
            updatedBy: input.session.id,
          },
        })
      : await prisma.roiSetting.create({
          data: {
            organizationId,
            hourlyRateUsd,
            baselineManualHoursPerTask,
            isDefault: false,
            updatedBy: input.session.id,
          },
        });

    await prisma.roiBenchmarkChange.create({
      data: {
        organizationId,
        scope: "organization",
        previousHourlyRateUsd: existing?.hourlyRateUsd ?? null,
        newHourlyRateUsd: updated.hourlyRateUsd,
        previousBaselineManualHoursPerTask:
          existing?.baselineManualHoursPerTask ?? null,
        newBaselineManualHoursPerTask: updated.baselineManualHoursPerTask,
        changedById: input.session.id,
      },
    });
    await writeAuditEvent({
      eventKey: "roi.benchmark.updated",
      eventType: "mutation",
      actorId: input.session.id,
      actorRole: input.session.role,
      organizationId,
      targetEntityType: "roi_setting",
      targetEntityId: updated.id,
      metadata: {
        scope: "organization",
        previousHourlyRateUsd: existing?.hourlyRateUsd ?? null,
        newHourlyRateUsd: updated.hourlyRateUsd,
        previousBaselineManualHoursPerTask:
          existing?.baselineManualHoursPerTask ?? null,
        newBaselineManualHoursPerTask: updated.baselineManualHoursPerTask,
      },
    });
    await refreshOrgRoiSnapshot(organizationId);
    await refreshCohortRoiSnapshot();
    return updated;
  }

  const currentDefault = await ensureDefaultRoiSetting(input.session.id);
  const updated = await prisma.roiSetting.update({
    where: { id: currentDefault.id },
    data: {
      hourlyRateUsd,
      baselineManualHoursPerTask,
      updatedBy: input.session.id,
      isDefault: true,
      organizationId: null,
    },
  });

  await prisma.roiBenchmarkChange.create({
    data: {
      organizationId: null,
      scope: "default",
      previousHourlyRateUsd: currentDefault.hourlyRateUsd,
      newHourlyRateUsd: updated.hourlyRateUsd,
      previousBaselineManualHoursPerTask:
        currentDefault.baselineManualHoursPerTask,
      newBaselineManualHoursPerTask: updated.baselineManualHoursPerTask,
      changedById: input.session.id,
    },
  });
  await writeAuditEvent({
    eventKey: "roi.benchmark.updated",
    eventType: "mutation",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.session.organizationId,
    targetEntityType: "roi_setting",
    targetEntityId: updated.id,
    metadata: {
      scope: "default",
      previousHourlyRateUsd: currentDefault.hourlyRateUsd,
      newHourlyRateUsd: updated.hourlyRateUsd,
      previousBaselineManualHoursPerTask:
        currentDefault.baselineManualHoursPerTask,
      newBaselineManualHoursPerTask: updated.baselineManualHoursPerTask,
    },
  });

  await refreshCohortRoiSnapshot();
  return updated;
}

export async function getScopedRoiSetting(input: {
  session: UserSession;
  organizationId?: string | null;
}) {
  const organizationId = input.organizationId ?? input.session.organizationId ?? null;
  if (
    organizationId &&
    input.session.organizationId &&
    organizationId !== input.session.organizationId &&
    input.session.role !== ROLES.FOCUS_COORDINATOR &&
    input.session.role !== ROLES.FACILITATOR
  ) {
    await writeDeniedAccessEvent({
      session: input.session,
      organizationId,
      targetEntityType: "roi_setting",
      reason: "roi_setting_read_forbidden",
      metadata: {
        requestedOrganizationId: organizationId,
      },
    });
    throw new Error("Not authorized to read settings for this organization.");
  }

  return getEffectiveRoiSetting(organizationId);
}

export async function getRoiBenchmarkHistory(input: {
  session: UserSession;
  organizationId?: string | null;
  limit?: number;
}) {
  const requestedOrganizationId = input.organizationId ?? null;
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);

  if (input.session.role === ROLES.NGO_ADMIN) {
    const sessionOrganizationId = input.session.organizationId ?? null;
    if (
      sessionOrganizationId &&
      requestedOrganizationId &&
      requestedOrganizationId !== sessionOrganizationId
    ) {
      await writeDeniedAccessEvent({
        session: input.session,
        organizationId: requestedOrganizationId,
        targetEntityType: "roi_benchmark_change",
        reason: "roi_history_read_forbidden",
      });
      throw new Error("Not authorized to read benchmark history for this organization.");
    }
  }

  const where =
    input.session.role === ROLES.NGO_ADMIN
      ? { organizationId: input.session.organizationId ?? "__no_org__" }
      : requestedOrganizationId === null
        ? {}
        : { organizationId: requestedOrganizationId };

  return prisma.roiBenchmarkChange.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function backfillRoiDefaultsForExistingOrganizations(updatedBy = "system-backfill") {
  await ensureDefaultRoiSetting(updatedBy);
  const organizations = await prisma.organization.findMany({
    select: { id: true },
  });

  for (const organization of organizations) {
    await refreshOrgRoiSnapshot(organization.id);
  }
  await refreshCohortRoiSnapshot();
}

export async function reconcileAnalyticsProjection(input?: { organizationId?: string }) {
  const organizations = input?.organizationId
    ? await prisma.organization.findMany({
        where: { id: input.organizationId },
        select: { id: true },
      })
    : await prisma.organization.findMany({
        select: { id: true },
      });

  let organizationsProcessed = 0;
  const warnings: string[] = [];

  for (const organization of organizations) {
    organizationsProcessed += 1;
    await refreshOrgRoiSnapshot(organization.id);
    const readiness = await refreshDeliverableReadiness(organization.id);

    if (readiness.readinessStatus === "not_ready" && readiness.missingOutputs.length === 0) {
      const warning = `Org ${organization.id} flagged as not_ready without missing outputs.`;
      warnings.push(warning);
      console.warn(warning);
    }
  }

  await refreshCohortRoiSnapshot();

  return {
    organizationsProcessed,
    warnings,
    reconciledAt: new Date().toISOString(),
  };
}
