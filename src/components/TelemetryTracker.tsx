"use client";

import { useEffect, useRef } from "react";

type TelemetryTrackerProps = {
  sectionKey: string;
  phaseNumber?: number;
  enabled?: boolean;
};

const HEARTBEAT_MS = 60_000;

function sendSessionEnd(payload: { sessionId: string; sectionKey: string }) {
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
  });
}

export function TelemetryTracker({
  sectionKey,
  phaseNumber = 0,
  enabled = true,
}: TelemetryTrackerProps) {
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const start = async () => {
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
        heartbeat = setInterval(() => {
          const sessionId = sessionIdRef.current;
          if (!sessionId) {
            return;
          }

          void fetch("/api/analytics/sessions/touch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
            cache: "no-store",
          });
        }, HEARTBEAT_MS);
      } catch {
        // Best-effort tracker: do not block UI when telemetry fails.
      }
    };

    void start();

    return () => {
      isMounted = false;
      if (heartbeat) {
        clearInterval(heartbeat);
      }

      const sessionId = sessionIdRef.current;
      if (sessionId) {
        sendSessionEnd({ sessionId, sectionKey });
      }
    };
  }, [enabled, phaseNumber, sectionKey]);

  return null;
}
