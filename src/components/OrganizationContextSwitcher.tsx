"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type OrganizationOption = {
  id: string;
  name: string;
};

type OrganizationContextSwitcherProps = {
  label: string;
  organizations: OrganizationOption[];
  selectedOrganizationId: string | null;
  disabled?: boolean;
};

export function OrganizationContextSwitcher({
  label,
  organizations,
  selectedOrganizationId,
  disabled = false,
}: OrganizationContextSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isSyncingFromQuery, setIsSyncingFromQuery] = useState(false);
  const [localSelectedOrganizationId, setLocalSelectedOrganizationId] = useState(
    selectedOrganizationId ?? "",
  );
  const syncedQueryOrganizationRef = useRef<string | null>(null);

  const requestedOrganizationId = useMemo(() => {
    const queryOrg = searchParams.get("org");
    if (!queryOrg) {
      return null;
    }
    const existsInOptions = organizations.some((organization) => organization.id === queryOrg);
    return existsInOptions ? queryOrg : null;
  }, [organizations, searchParams]);

  useEffect(() => {
    setLocalSelectedOrganizationId(selectedOrganizationId ?? "");
  }, [selectedOrganizationId]);

  useEffect(() => {
    if (disabled || !requestedOrganizationId) {
      return;
    }

    setLocalSelectedOrganizationId(requestedOrganizationId);

    if (
      requestedOrganizationId === selectedOrganizationId ||
      syncedQueryOrganizationRef.current === requestedOrganizationId
    ) {
      return;
    }

    let cancelled = false;
    setIsSyncingFromQuery(true);
    void fetch("/api/auth/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: requestedOrganizationId }),
    })
      .then((response) => {
        if (cancelled || !response.ok) {
          return;
        }
        syncedQueryOrganizationRef.current = requestedOrganizationId;
      })
      .finally(() => {
        if (!cancelled) {
          setIsSyncingFromQuery(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [disabled, requestedOrganizationId, selectedOrganizationId]);

  return (
    <label className="sidebar-context-switcher">
      <span>{label}</span>
      <select
        value={localSelectedOrganizationId}
        disabled={disabled || isPending || organizations.length === 0}
        onChange={(event) => {
          const organizationId = event.target.value;
          if (!organizationId) {
            return;
          }

          setLocalSelectedOrganizationId(organizationId);
          startTransition(async () => {
            const response = await fetch("/api/auth/context", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ organizationId }),
            });
            if (!response.ok) {
              return;
            }

            syncedQueryOrganizationRef.current = organizationId;

            if (searchParams.has("org")) {
              const nextSearch = new URLSearchParams(searchParams.toString());
              nextSearch.set("org", organizationId);
              const queryString = nextSearch.toString();
              router.push(queryString.length > 0 ? `${pathname}?${queryString}` : pathname);
              return;
            }

            router.refresh();
          });
        }}
      >
        {organizations.length === 0 ? (
          <option value="">No organizations</option>
        ) : null}
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
      {isPending || isSyncingFromQuery ? <span>Actualizando...</span> : null}
    </label>
  );
}
