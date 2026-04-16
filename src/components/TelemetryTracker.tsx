"use client";

import { useEffect, useRef } from "react";

type TelemetryTrackerProps = {
  sectionKey: string;
  phaseNumber?: number;
  enabled?: boolean;
};

const HEARTBEAT_MS = 60_000;

type SessionEndPayload = {
  sessionId: string;
  sectionKey: string;
  closedByTimeout?: boolean;
};

function sendSessionEnd(payload: SessionEndPayload) {
  const body = JSON.stringify(payload);
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/sessions/end", blob);
    return;
  }

  void fetch("/api/analytics/sessions/end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function TelemetryTracker({
  sectionKey,
  phaseNumber = 0,
  enabled = true,
}: TelemetryTrackerProps) {
  const sessionIdRef = useRef<string | null>(null);
  const isStartingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const end = (closedByTimeout: boolean) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      sessionIdRef.current = null;
      sendSessionEnd({ sessionId, sectionKey, closedByTimeout });
    };

    const start = async () => {
      if (
        !isMounted ||
        sessionIdRef.current ||
        isStartingRef.current ||
        !isDocumentVisible()
      ) {
        return;
      }

      isStartingRef.current = true;
      try {
        const response = await fetch("/api/analytics/sessions/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionKey, phaseNumber }),
          cache: "no-store",
        });

        if (!response.ok || !isMounted) {
          return;
        }

        const payload = (await response.json()) as { sessionId?: string };
        if (!payload.sessionId) {
          return;
        }

        sessionIdRef.current = payload.sessionId;
      } catch {
        // Best-effort tracker: do not block UI when telemetry fails.
      } finally {
        isStartingRef.current = false;
      }
    };

    const onVisibilityChange = () => {
      if (!isMounted) {
        return;
      }
      if (!isDocumentVisible()) {
        end(true);
        return;
      }
      void start();
    };

    void start();
    heartbeat = setInterval(() => {
      if (!isDocumentVisible()) {
        return;
      }

      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        void start();
        return;
      }

      void fetch("/api/analytics/sessions/touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        cache: "no-store",
      }).catch(() => undefined);
    }, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      end(false);
    };
  }, [enabled, phaseNumber, sectionKey]);

  return null;
}
