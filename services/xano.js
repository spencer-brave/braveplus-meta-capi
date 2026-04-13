// services/xano.js
// ─────────────────────────────────────────────────────────
// Audit logging to Xano for Meta CAPI relay events.
// Never throws in a way that breaks the main webhook flow.
// ─────────────────────────────────────────────────────────

async function logToXano(
  {
    customerEmail,
    action, // "meta_capi_subscribe"
    trigger = "uscreen_webhook",
    status, // "success" | "failed" | "skipped"
    errorMessage = null,
    uscreenOfferId = null,
    subscriptionType = null,
    metaEventsReceived = null,
    eventId = null,
  },
  attempt = 1,
) {
  const url = process.env.XANO_AUDIT_ENDPOINT;

  if (!url) {
    console.error("XANO_AUDIT_ENDPOINT is not set — skipping audit log");
    return;
  }

  const body = {
    customer_email: customerEmail,
    action,
    trigger,
    status,
    error_message: errorMessage,
    uscreen_offer_id: uscreenOfferId,
    subscription_type: subscriptionType,
    meta_events_received: metaEventsReceived,
    event_id: eventId,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const responseText = await res.text();

      if (res.status >= 500 && attempt === 1) {
        console.warn(`Xano responded ${res.status} — retrying in 3s...`);
        await new Promise((r) => setTimeout(r, 3000));
        return logToXano(
          {
            customerEmail,
            action,
            trigger,
            status,
            errorMessage,
            uscreenOfferId,
            subscriptionType,
            metaEventsReceived,
            eventId,
          },
          2,
        );
      }

      console.error(
        `Xano audit log failed (attempt ${attempt}) ${res.status}: ${responseText}`,
      );
    }
  } catch (err) {
    console.error("Xano audit log failed:", err.message);
  }
}

module.exports = { logToXano };
