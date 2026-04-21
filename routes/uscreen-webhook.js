// routes/uscreen-webhook.js
// ─────────────────────────────────────────────────────────
// Receives Uscreen "subscription_assigned" webhooks and
// relays qualifying events to Meta's Conversions API as
// Subscribe events.
//
// Only forwards events for paid BRAVE+ subscriptions
// (filtered by offer ID). Free trials, admin-assigned
// access, and non-BRAVE+ offers are ignored.
//
// Uscreen webhook payload for "subscription_assigned":
// {
//   user_id, user_name, user_email,
//   subscription_id (offer ID), subscription_title,
//   transaction_id, event
// }
// ─────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();

const { sendSubscribeEvent } = require("../services/meta-capi");
const { logToXano } = require("../services/xano");
const { getCustomerName } = require("../services/uscreen");

// ── Paid BRAVE+ offer IDs ────────────────────────────────
// Only these Uscreen offers should be forwarded to Meta.
// Add new offer IDs here as new plans are created.
const PAID_OFFER_IDS = new Set([
  "223749", // Annual subscription
  "190342", // Monthly subscription
]);

// Map offer IDs to human-readable subscription types
const OFFER_TYPE_MAP = {
  223749: "annual",
  190342: "monthly",
};

router.post("/", (req, res) => {
  // Respond immediately — process async
  res.status(200).send("OK");

  const payload = req.body;
  const event = payload?.event;

  console.log(`[Uscreen Webhook] Received event: ${event}`);

  // Only handle subscription_assigned events
  if (event !== "subscription_assigned") {
    console.log(`[Uscreen Webhook] Ignoring event type: ${event}`);
    return;
  }

  handleSubscriptionAssigned(payload).catch((err) =>
    console.error(`[Uscreen Webhook] Unhandled error:`, err),
  );
});

async function handleSubscriptionAssigned(payload) {
  const {
    user_email: email,
    user_id: userId,
    subscription_id: offerId,
    subscription_title: offerTitle,
    transaction_id: transactionId,
  } = payload;

  const offerIdStr = String(offerId);

  // ── Filter: only paid BRAVE+ offers ────────────────────
  if (!PAID_OFFER_IDS.has(offerIdStr)) {
    console.log(
      `[Uscreen Webhook] Offer ${offerIdStr} ("${offerTitle}") is not a tracked BRAVE+ offer — skipping`,
    );
    return;
  }

  if (!email) {
    console.error(
      `[Uscreen Webhook] No email in payload — cannot send to Meta`,
    );
    await logToXano({
      customerEmail: "unknown",
      action: "meta_capi_subscribe",
      status: "failed",
      errorMessage: "No user_email in Uscreen payload",
      uscreenOfferId: offerIdStr,
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const subscriptionType = OFFER_TYPE_MAP[offerIdStr] || "unknown";

  // Fetch customer name from Uscreen API for better Meta matching.
  // This is non-blocking — if it fails, we still send the event with email only.
  const { firstName, lastName } = await getCustomerName(userId);

  // Use a composite event ID for deduplication:
  // If Meta receives the same event_id within 48 hours, it deduplicates.
  const eventId = `uscreen_${offerIdStr}_${transactionId || Date.now()}`;
  const eventTime = Math.floor(Date.now() / 1000);

  console.log(
    `[Uscreen Webhook] Processing ${subscriptionType} subscription for ${normalizedEmail} (offer: ${offerIdStr}, event_id: ${eventId})`,
  );

  try {
    const result = await sendSubscribeEvent({
      email: normalizedEmail,
      firstName,
      lastName,
      eventId,
      eventTime,
      subscriptionType,
      // Optionally include test event code during setup
      testEventCode: process.env.META_TEST_EVENT_CODE || null,
    });

    console.log(
      `[Uscreen Webhook] Meta CAPI accepted event for ${normalizedEmail}`,
    );

    await logToXano({
      customerEmail: normalizedEmail,
      action: "meta_capi_subscribe",
      status: "success",
      uscreenOfferId: offerIdStr,
      subscriptionType,
      metaEventsReceived: result.eventsReceived,
      eventId,
    });
  } catch (err) {
    console.error(
      `[Uscreen Webhook] Meta CAPI failed for ${normalizedEmail}:`,
      err.message,
    );

    await logToXano({
      customerEmail: normalizedEmail,
      action: "meta_capi_subscribe",
      status: "failed",
      errorMessage: err.message,
      uscreenOfferId: offerIdStr,
      subscriptionType,
      eventId,
    });
  }
}

module.exports = router;
