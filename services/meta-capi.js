// services/meta-capi.js
// ─────────────────────────────────────────────────────────
// Sends conversion events to Meta's Conversions API.
//
// Meta requires PII (email, phone, name) to be SHA-256
// hashed before sending. Email must also be lowercased
// and trimmed before hashing.
//
// Endpoint: POST https://graph.facebook.com/v21.0/{PIXEL_ID}/events
// ─────────────────────────────────────────────────────────

const crypto = require("crypto");

const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const API_VERSION = "v21.0";
const ENDPOINT = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;

// ── SHA-256 hash ─────────────────────────────────────────
// Meta requires all PII fields to be hashed with SHA-256.
// Input must be lowercased and trimmed before hashing.
function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value.toLowerCase().trim())
    .digest("hex");
}

// ── Send a Purchase event to Meta CAPI ───────────────────
// Returns { success, eventsReceived, messages } or throws.
async function sendPurchaseEvent({
  email,
  firstName = null,
  lastName = null,
  eventId,
  eventTime,
  subscriptionType,
  value = null,
  currency = "USD",
  testEventCode = null,
}) {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    throw new Error(
      "META_PIXEL_ID and META_ACCESS_TOKEN environment variables are required",
    );
  }

  const hashedEmail = sha256(email);

  const eventData = {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: eventId,
    // "other" is the correct action_source for server-side events
    // that don't originate from a browser pixel or app SDK.
    // "app" requires additional fields (advertiser_tracking_enabled, extinfo)
    // that we don't have since we're relaying from Uscreen webhooks.
    action_source: "other",
    user_data: {
      em: hashedEmail,
    },
    custom_data: {
      subscription_type: subscriptionType,
      currency,
    },
  };

  // Add hashed first/last name if available — improves EMQ score
  if (firstName) {
    eventData.user_data.fn = sha256(firstName);
  }
  if (lastName) {
    eventData.user_data.ln = sha256(lastName);
  }

  if (value !== null && value !== undefined) {
    eventData.custom_data.value = value;
  }

  // Send as JSON body with access_token in the URL query string.
  // This avoids form-encoding issues with the data array.
  const url = `${ENDPOINT}?access_token=${ACCESS_TOKEN}`;

  const body = {
    data: [eventData],
  };

  if (testEventCode) {
    body.test_event_code = testEventCode;
  }

  // Log the full payload for debugging during setup
  console.log(
    `[Meta CAPI] Sending to ${ENDPOINT}`,
    JSON.stringify(body, null, 2),
  );

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    // Log the full error response from Meta for debugging
    console.error(`[Meta CAPI] Error response:`, JSON.stringify(json, null, 2));
    const errorMsg = json.error?.message || JSON.stringify(json);
    throw new Error(`Meta CAPI ${res.status}: ${errorMsg}`);
  }

  console.log(`[Meta CAPI] Success — events_received: ${json.events_received}`);

  return {
    success: true,
    eventsReceived: json.events_received,
    messages: json.messages || [],
  };
}

module.exports = { sendPurchaseEvent, sha256 };
