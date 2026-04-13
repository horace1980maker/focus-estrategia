DROP TRIGGER IF EXISTS "AuditEvent_prevent_update";
DROP TRIGGER IF EXISTS "AuditEvent_prevent_delete";

-- Keep audit rows immutable while allowing FK-driven nulling of actorId/organizationId
-- when related users/organizations are deleted.
CREATE TRIGGER "AuditEvent_prevent_update"
BEFORE UPDATE ON "AuditEvent"
FOR EACH ROW
WHEN (
  NEW."id" IS NOT OLD."id"
  OR NEW."eventKey" IS NOT OLD."eventKey"
  OR NEW."eventType" IS NOT OLD."eventType"
  OR NEW."actorRole" IS NOT OLD."actorRole"
  OR NEW."targetEntityType" IS NOT OLD."targetEntityType"
  OR NEW."targetEntityId" IS NOT OLD."targetEntityId"
  OR NEW."metadataJson" IS NOT OLD."metadataJson"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR (NEW."actorId" IS NOT OLD."actorId" AND NEW."actorId" IS NOT NULL)
  OR (NEW."organizationId" IS NOT OLD."organizationId" AND NEW."organizationId" IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'AuditEvent rows are immutable');
END;

CREATE TRIGGER "AuditEvent_prevent_delete"
BEFORE DELETE ON "AuditEvent"
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'AuditEvent rows are immutable');
END;
