<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Feature: WhatsApp Stock Alerts
We have integrated a WhatsApp stock alert system that notifies recipients when a product's stock quantity falls to 0.

## Environment Variables Required
The following environment variables must be configured in `.env.local` locally and in the AWS Amplify dashboard for production:
- `TWILIO_ACCOUNT_SID`: The Twilio Account SID.
- `TWILIO_AUTH_TOKEN`: The Twilio Auth Token.
- `TWILIO_PHONE_NUMBER`: The Twilio WhatsApp sender number (prefixed with `whatsapp:`).
- `ALERT_RECIPIENT_PHONES`: Comma-separated list of recipient WhatsApp numbers (each prefixed with `whatsapp:`).
- `TWILIO_CONTENT_SID`: The SID of the approved WhatsApp template in Twilio Content Builder (e.g., `HXfd121e8da2f8e271b11f3fdab1d90b63`).

## Approved WhatsApp Template
The Meta-approved template used for transactional stock alerts is `stock_warning_alert_v2`:
- **Sid**: `HXfd121e8da2f8e271b11f3fdab1d90b63`
- **Body**:
  ```text
  ⚠️ *התרעת מלאי: מוצר אזל מהמלאי!*
  
  * שם מוצר: {{1}}
  * מק"ט (SKU): {{2}}
  * מזהה מוצר: {{3}}
  * תאריך ושעה: {{4}}
  
  התרעה זו נשלחה אוטומטית ממערכת המלאי.
  ```

## Code Entry Points
- `lib/whatsapp.ts`: Utility function `sendWhatsAppMessage(body, templateVariables)` to dispatch messages.
- `app/api/sync/products/route.ts`: Detects products transitioning to zero stock during sync, then triggers the WhatsApp alerts.
- **Testing the integration**: Send a POST to `/api/sync/products` with `{"send_test_whatsapp": true}` to dispatch a test message to all recipients.

