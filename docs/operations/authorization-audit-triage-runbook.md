# Authorization and Audit Triage Runbook

Date: 2026-04-05  
Owner: Security / Platform Operations

## Trigger conditions

Start triage when one or more occur:

- Repeated denied-access events for the same actor or organization
- Sudden increase in `security.authorization.denied`
- Scope mismatch warnings from analytics reconciliation

## Triage flow

1. Pull denied signals:

```bash
GET /api/audit/triage?days=7&threshold=5
```

2. Pull filtered events:

```bash
GET /api/audit/events?eventKey=security.authorization.denied&limit=200
```

3. Identify:
   - actor id and role
   - target entity and org scope
   - repeated endpoint or workflow path

4. Decide severity:
   - Low: user confusion / expected denial
   - Medium: repeated policy mismatch
   - High: potential privilege escalation attempt

5. Mitigation actions:
   - Confirm role assignment and org mapping
   - Revoke active sessions if suspicious
   - Force password reset for affected users
   - Escalate to engineering if policy bug is suspected

## Escalation contacts

- Facilitator operations lead
- Platform engineering owner
- Security reviewer (if high severity)

## Evidence to capture

- Query timestamps and parameters
- Actor IDs and organization IDs involved
- Event samples
- Final disposition and owner
