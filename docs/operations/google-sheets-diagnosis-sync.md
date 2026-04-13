# Google Sheets Sync for Diagnosis Results

Date: 2026-04-13  
Owner: Platform Operations

## 1. What this integration does

When an NGO submits the diagnóstico survey, the platform can POST the submission to a Google Apps Script webhook.
The webhook appends one row in Google Sheets per survey response.

## 2. Required app environment variables

Set these in Coolify:

```env
GOOGLE_SHEETS_SYNC_ENABLED=true
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
GOOGLE_SHEETS_WEBHOOK_SECRET=<strong-random-secret>
GOOGLE_SHEETS_SYNC_TIMEOUT_MS=5000
```

## 3. Apps Script setup

1. Create a Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Replace the script with:

```javascript
function doPost(e) {
  var secret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  var incomingSecret = (e && e.parameter && e.parameter.secret) || "";
  if (!incomingSecret && e && e.postData && e.postData.type === "application/json") {
    // Header values are not directly available in Apps Script Web App requests,
    // so we support secret in querystring for optional fallback:
    // /exec?secret=...
  }
  if (!secret || incomingSecret !== secret) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "forbidden" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var body = JSON.parse(e.postData.contents);
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  var sheetName = PropertiesService.getScriptProperties().getProperty("SHEET_NAME") || "diagnosis_submissions";
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
  if (!sheet) {
    sheet = SpreadsheetApp.openById(spreadsheetId).insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "emitted_at",
      "submitted_at",
      "response_id",
      "organization_id",
      "organization_name",
      "submitted_by_id",
      "submitted_by_name",
      "definition_version",
      "classification",
      "key_barrier",
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "answers_json"
    ]);
  }

  var scores = (body.interpretation && body.interpretation.digitalScores) || {};
  sheet.appendRow([
    body.emittedAt || "",
    body.submittedAt || "",
    body.responseId || "",
    body.organization ? body.organization.id : "",
    body.organization ? body.organization.name : "",
    body.submittedBy ? body.submittedBy.id : "",
    body.submittedBy ? body.submittedBy.name : "",
    body.definitionVersion || "",
    body.interpretation ? body.interpretation.classification : "",
    body.interpretation ? body.interpretation.keyBarrier : "",
    scores.D1 || "",
    scores.D2 || "",
    scores.D3 || "",
    scores.D4 || "",
    scores.D5 || "",
    scores.D6 || "",
    JSON.stringify(body.answers || {})
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. Set Apps Script properties:
   - `WEBHOOK_SECRET` = same value as `GOOGLE_SHEETS_WEBHOOK_SECRET`.
   - `SPREADSHEET_ID` = target Google Sheet ID.
   - `SHEET_NAME` = `diagnosis_submissions` (or your preferred name).
5. Deploy as Web App.
6. Copy deployment URL to `GOOGLE_SHEETS_WEBHOOK_URL`.

## 4. Payload fields sent by the platform

- Response metadata (`responseId`, `submittedAt`, `definitionVersion`)
- Organization info (`id`, `name`)
- Submitter info (`id`, `name`)
- Interpretation summary (`classification`, digital scores, key barrier)
- Full answer map (`answers`)

## 5. Failure behavior

If Google Sheets sync fails, the survey submission is still saved in the platform.
Sync errors are logged server-side for later troubleshooting.
