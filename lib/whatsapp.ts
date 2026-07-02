export async function sendWhatsAppMessage(body: string, templateVariables?: Record<string, string>): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim(); // e.g. whatsapp:+972533883204
  const recipientEnv = process.env.ALERT_RECIPIENT_PHONES?.trim(); // e.g. whatsapp:+972523452554,whatsapp:+972542545568
  const contentSid = process.env.TWILIO_CONTENT_SID?.trim();

  if (!accountSid || !authToken || !fromNumber || !recipientEnv) {
    console.error("WhatsApp Send Error: Missing Twilio configuration in environment variables.", {
      hasAccountSid: !!accountSid,
      hasAuthToken: !!authToken,
      hasFromNumber: !!fromNumber,
      hasRecipients: !!recipientEnv,
    });
    return false;
  }

  console.log("Twilio Debug Info:", {
    accountSid,
    accountSidLength: accountSid.length,
    authTokenLength: authToken.length,
    authTokenFirst4: authToken.substring(0, 4),
    authTokenLast4: authToken.substring(authToken.length - 4),
    fromNumber,
    recipientEnv,
    contentSid,
  });

  // Parse list of recipients (comma-separated, clean spaces)
  const recipients = recipientEnv
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.error("WhatsApp Send Error: No valid recipients found in ALERT_RECIPIENT_PHONES.");
    return false;
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  let allSuccess = true;

  for (const to of recipients) {
    console.log(`Sending WhatsApp message to ${to}...`);

    const params = new URLSearchParams();
    params.append("From", fromNumber);
    params.append("To", to);

    if (contentSid) {
      params.append("ContentSid", contentSid);
      if (templateVariables) {
        params.append("ContentVariables", JSON.stringify(templateVariables));
      }
    } else {
      params.append("Body", body);
    }

    try {
      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`Failed to send WhatsApp to ${to}. Twilio Error:`, data);
        allSuccess = false;
      } else {
        console.log(`WhatsApp message successfully sent to ${to}. SID: ${data.sid}`);
      }
    } catch (err) {
      console.error(`Exception occurred while sending WhatsApp to ${to}:`, err);
      allSuccess = false;
    }
  }

  return allSuccess;
}
