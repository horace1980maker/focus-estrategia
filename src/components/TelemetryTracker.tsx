"use client";

import { useEffect, useRef } from "react";

type TelemetryTrackerProps = {
  sectionKey: string;
  phaseNumber?: number;
  enabled?: boolean;
};

const IDLE_TIMEOUT_MS = 10 * 60_000;
const ACTIVITY_SIGNAL_THROTTLE_MS = 1_000;
const TOUCH_THROTTLE_MS = 30_000;

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
  const lastActivitySignalAtRef = useRef(0);
  const lastTouchSentAtRef = useRef(0);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    function clearIdleTimeout() {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
    }

    const end = (closedByTimeout: boolean) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      sessionIdRef.current = null;
      clearIdleTimeout();
      sendSessionEnd({ sessionId, sectionKey, closedByTimeout });
    };

    function scheduleIdleTimeout() {
      clearIdleTimeout();

      const sessionId = sessionIdRef.current;
      if (!sessionId || !isMounted) {
        return;
      }

      const elapsedSinceActivity = Date.now() - lastActivitySignalAtRef.current;
      const timeoutInMs = Math.max(IDLE_TIMEOUT_MS - elapsedSinceActivity, 1_000);

      idleTimeoutRef.current = setTimeout(() => {
        if (!isMounted || !sessionIdRef.current) {
          return;
        }

        if (!isDocumentVisible()) {
          end(true);
          return;
        }

        const idleForMs = Date.now() - lastActivitySignalAtRef.current;
        if (idleForMs >= IDLE_TIMEOUT_MS) {
          end(true);
          return;
        }

        scheduleIdleTimeout();
      }, timeoutInMs + 250);
    }

    function sendTouchIfNeeded() {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }

      const now = Date.now();
      if (now - lastTouchSentAtRef.current < TOUCH_THROTTLE_MS) {
        return;
      }

      lastTouchSentAtRef.current = now;
      void fetch("/api/analytics/sessions/touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        cache: "no-store",
      }).catch(() => undefined);
    }

    function noteActivity() {
      if (!isMounted || !isDocumentVisible()) {
        return;
      }

      const now = Date.now();
      if (now - lastActivitySignalAtRef.current < ACTIVITY_SIGNAL_THROTTLE_MS) {
        return;
      }

      lastActivitySignalAtRef.current = now;

      if (!sessionIdRef.current) {
        void start();
        return;
      }

      scheduleIdleTimeout();
      sendTouchIfNeeded();
    }

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
        const now = Date.now();
        lastActivitySignalAtRef.current = now;
        lastTouchSentAtRef.current = now;
        scheduleIdleTimeout();
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
      if (sessionIdRef.current) {
        noteActivity();
        return;
      }
      void start();
    };

    void start();

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
      "focus",
    ];
    const onUserActivity = () => {
      noteActivity();
    };

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, onUserActivity);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, onUserActivity);
      }
      clearIdleTimeout();
      end(false);
    };
  }, [enabled, phaseNumber, sectionKey]);

  return null;
}
