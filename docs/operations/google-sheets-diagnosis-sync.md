# Google Sheets Sync for Diagnosis Results

Date: 2026-04-13  
Owner: Platform Operations

## 1. What this integration does

When an NGO submits the diagnóstico survey, the platform can POST the submission to a Google Apps Script webhook.
The webhook appends one row in Google Sheets per survey response, with the Likert answers split into paired number/text columns and the full payload preserved in `response_json`.

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
var HEADERS = [
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
  "D1_text",
  "D2",
  "D2_text",
  "D3",
  "D3_text",
  "D4",
  "D4_text",
  "D5",
  "D5_text",
  "D6",
  "D6_text",
  "A1",
  "A1_text",
  "A2",
  "A2_text",
  "A3",
  "A3_text",
  "A4",
  "A4_text",
  "A5",
  "A5_text",
  "A6",
  "A6_text",
  "A7",
  "A7_text",
  "A8",
  "A8_text",
  "A9",
  "A9_text",
  "A10",
  "A10_text",
  "B1",
  "B1_text",
  "B2",
  "B2_text",
  "B3",
  "B3_text",
  "B4",
  "B4_text",
  "B5",
  "B5_text",
  "B6",
  "B6_text",
  "B7",
  "B7_text",
  "B8",
  "B8_text",
  "B9",
  "B9_text",
  "B10",
  "B10_text",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "response_json"
];

function toCellValue(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(" | ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

var LIKERT_LABELS = {
  A: {
    "1": "No sabemos como hacerlo",
    "2": "Sabemos un poco, pero no lo suficiente para hacerlo bien",
    "3": "En general sabemos como hacerlo",
    "4": "Sabemos hacerlo bien",
    "5": "Sabemos hacerlo muy bien y podriamos ensenar a otros",
    no_information: "No se / No tengo informacion suficiente",
  },
  B: {
    "1": "No se hace / no existe",
    "2": "Se hace en pocos lugares o de forma irregular",
    "3": "Se hace en varios lugares, pero de forma desigual",
    "4": "Se hace de forma consistente y generalmente bien",
    "5": "Se hace consistentemente, se revisa y se mejora con el tiempo",
    no_information: "No se / No tengo informacion suficiente",
  },
};

var SELECT_LABELS = {
  C1: {
    no_plan_or_outdated_3y: "No existe o esta desactualizado hace mas de 3 anos",
    updated_2_to_3y: "Existe, pero fue actualizado hace entre 2 y 3 anos",
    updated_12_to_24m: "Existe y fue actualizado hace entre 12 y 24 meses",
    updated_last_12m: "Existe y fue actualizado en los ultimos 12 meses",
    no_information: "No se / No tengo informacion suficiente",
  },
  C2: {
    strategic_plan_documented: "Plan estrategico escrito",
    mission_vision_values: "Mision, vision y valores claramente formulados",
    strategic_priorities_defined: "Prioridades u objetivos estrategicos definidos",
    strategic_indicators_targets: "Indicadores estrategicos con metas",
    dashboard_or_tracking_format: "Algun tablero, cuadro o formato de seguimiento",
    strategic_actions_list: "Lista de iniciativas o acciones estrategicas",
    strategic_review_calendar: "Calendario de revision estrategica",
    strategy_owner_assigned: "Persona o equipo responsable de coordinar la estrategia",
    none_of_above: "Ninguna de las anteriores",
    no_information: "No se / No tengo informacion suficiente",
  },
};

function getLikertLabel(scaleKey, value) {
  var labels = LIKERT_LABELS[scaleKey];
  if (!labels || value === null || typeof value === "undefined" || value === "") {
    return "";
  }

  var normalizedValue = typeof value === "number" ? String(value) : String(value).trim();
  return Object.prototype.hasOwnProperty.call(labels, normalizedValue) ? labels[normalizedValue] : "";
}

function translateSelectValue(questionKey, value) {
  var labels = SELECT_LABELS[questionKey];
  if (!labels || typeof value !== "string") {
    return value;
  }

  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : value;
}

function formatSelectAnswerCell(questionKey, value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  if (questionKey === "C1") {
    return toCellValue(translateSelectValue(questionKey, value));
  }

  if (questionKey === "C2") {
    var selectedValues = null;

    if (Array.isArray(value)) {
      selectedValues = value;
    } else if (typeof value === "object" && value && Array.isArray(value.selectedOptions)) {
      selectedValues = value.selectedOptions;
    } else if (typeof value === "string") {
      var trimmed = value.trim();
      if (!trimmed) {
        return "";
      }

      try {
        var parsed = JSON.parse(trimmed);
        if (parsed && Array.isArray(parsed.selectedOptions)) {
          selectedValues = parsed.selectedOptions;
        }
      } catch (error) {
        // Ignore JSON parse errors and fall back to the raw string below.
      }

      if (!selectedValues && trimmed.indexOf(" | ") !== -1) {
        selectedValues = trimmed.split(/\s*\|\s*/);
      }

      if (!selectedValues) {
        selectedValues = [trimmed];
      }
    }

    if (selectedValues) {
      return selectedValues
        .map(function (entry) {
          return translateSelectValue(questionKey, entry);
        })
        .join(" | ");
    }
  }

  return toCellValue(value);
}

function formatLikertAnswerCells(scaleKey, numericValue, rawValue) {
  var numberCell = typeof numericValue === "number" ? numericValue : "";
  var textCell = "";

  if (typeof numericValue === "number") {
    textCell = getLikertLabel(scaleKey, numericValue);
  } else if (typeof rawValue === "string" && rawValue.trim()) {
    textCell = getLikertLabel(scaleKey, rawValue) || rawValue;
  }

  return [numberCell, textCell];
}

function buildRow(body) {
  var answers = body.answers || {};
  var row = [
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
  ];

  row = row.concat(formatLikertAnswerCells("B", answers.D1, answers.D1));
  row = row.concat(formatLikertAnswerCells("B", answers.D2, answers.D2));
  row = row.concat(formatLikertAnswerCells("B", answers.D3, answers.D3));
  row = row.concat(formatLikertAnswerCells("B", answers.D4, answers.D4));
  row = row.concat(formatLikertAnswerCells("B", answers.D5, answers.D5));
  row = row.concat(formatLikertAnswerCells("B", answers.D6, answers.D6));

  row = row.concat(formatLikertAnswerCells("A", answers.A1, answers.A1));
  row = row.concat(formatLikertAnswerCells("A", answers.A2, answers.A2));
  row = row.concat(formatLikertAnswerCells("A", answers.A3, answers.A3));
  row = row.concat(formatLikertAnswerCells("A", answers.A4, answers.A4));
  row = row.concat(formatLikertAnswerCells("A", answers.A5, answers.A5));
  row = row.concat(formatLikertAnswerCells("A", answers.A6, answers.A6));
  row = row.concat(formatLikertAnswerCells("A", answers.A7, answers.A7));
  row = row.concat(formatLikertAnswerCells("A", answers.A8, answers.A8));
  row = row.concat(formatLikertAnswerCells("A", answers.A9, answers.A9));
  row = row.concat(formatLikertAnswerCells("A", answers.A10, answers.A10));

  row = row.concat(formatLikertAnswerCells("B", answers.B1, answers.B1));
  row = row.concat(formatLikertAnswerCells("B", answers.B2, answers.B2));
  row = row.concat(formatLikertAnswerCells("B", answers.B3, answers.B3));
  row = row.concat(formatLikertAnswerCells("B", answers.B4, answers.B4));
  row = row.concat(formatLikertAnswerCells("B", answers.B5, answers.B5));
  row = row.concat(formatLikertAnswerCells("B", answers.B6, answers.B6));
  row = row.concat(formatLikertAnswerCells("B", answers.B7, answers.B7));
  row = row.concat(formatLikertAnswerCells("B", answers.B8, answers.B8));
  row = row.concat(formatLikertAnswerCells("B", answers.B9, answers.B9));
  row = row.concat(formatLikertAnswerCells("B", answers.B10, answers.B10));

  row = row.concat([
    formatSelectAnswerCell("C1", answers.C1),
    formatSelectAnswerCell("C2", answers.C2),
    toCellValue(answers.C3),
    toCellValue(answers.C4),
    toCellValue(answers.C5),
    JSON.stringify(body),
  ]);

  return row;
}

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
  var sheetName = PropertiesService.getScriptProperties().getProperty("SHEET_NAME") || "diagnosis_analysis";
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }

  var responseId = body.responseId || "";
  var responseIdColumn = HEADERS.indexOf("response_id") + 1;
  if (responseId && responseIdColumn > 0 && sheet.getLastRow() > 1) {
    var existingResponseIds = sheet.getRange(2, responseIdColumn, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < existingResponseIds.length; i++) {
      if (existingResponseIds[i][0] === responseId) {
        return ContentService.createTextOutput(JSON.stringify({ ok: true, skipped: true, reason: "duplicate_response" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  sheet.appendRow(buildRow(body));

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. Set Apps Script properties:
   - `WEBHOOK_SECRET` = same value as `GOOGLE_SHEETS_WEBHOOK_SECRET`.
   - `SPREADSHEET_ID` = target Google Sheet ID.
   - `SHEET_NAME` = `diagnosis_analysis` (recommended for the paired export).
5. Deploy as Web App.
6. Copy deployment URL to `GOOGLE_SHEETS_WEBHOOK_URL`.

New submissions will now write paired number/text columns for `A1` through `A10`, `B1` through `B10`, and `D1` through `D6`, while keeping `C1` through `C5` in their current single-column form. The full webhook payload is still preserved in `response_json`. C1 and C2 are translated to Spanish labels inside the webhook, which makes the sheet output resilient even if the app sends internal option keys. For the cleanest test, point `SHEET_NAME` to a new tab named `diagnosis_analysis`.

## 4. Backfilling historical responses from SQLite

If you already have diagnosis responses stored in the local SQLite database, you can move them into Sheets with a one-time backfill.

1. Update the Apps Script snippet above so it skips duplicate `response_id` values.
2. Run the backfill command from the `app` directory:

```bash
npm run backfill:diagnosis
```

3. If you want to preview the rows first, run:

```bash
npm run backfill:diagnosis -- --dry-run
```

4. The script reads every submitted `DiagnosisSurveyResponse` row from SQLite, rebuilds the Google Sheets payload, and sends it through the same webhook.
5. The backfill uses the historical `submitted_at` timestamp from the database, while `emitted_at` is set to the time the row is exported.

Because the Apps Script now deduplicates by `response_id`, you can rerun the backfill safely if it is interrupted.

## 5. Payload fields sent by the platform

- Response metadata (`responseId`, `submittedAt`, `definitionVersion`)
- Organization info (`id`, `name`)
- Submitter info (`id`, `name`)
- Interpretation summary (`classification`, digital scores, key barrier)
- Likert answers are exported as both numeric values and Spanish text labels for `A1` through `A10`, `B1` through `B10`, and `D1` through `D6`
- Select answers in `C1` and `C2` are exported using the Spanish option labels from the survey definition, while `C3` through `C5` stay as free text

## 6. Failure behavior

If Google Sheets sync fails, the survey submission is still saved in the platform.
Sync errors are logged server-side for later troubleshooting.
