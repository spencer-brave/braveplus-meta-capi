// services/uscreen.js
// ─────────────────────────────────────────────────────────
// Fetches customer data from Uscreen's Publisher API.
// Used to get the customer's full name for Meta CAPI
// user matching (improves EMQ score).
//
// Endpoint: GET https://uscreen.io/publisher_api/v1/customers/{id}
// ─────────────────────────────────────────────────────────

const API_KEY = process.env.USCREEN_API_KEY;
const ENDPOINT = "https://uscreen.io/publisher_api/v1/customers/";

// ── Fetch customer by Uscreen user ID ────────────────────
// Returns { firstName, lastName } or nulls if unavailable.
// Never throws — returns nulls on failure so the main
// webhook flow isn't blocked by a Uscreen API issue.
async function getCustomerName(customerId) {
  if (!API_KEY) {
    console.warn(
      "[Uscreen API] USCREEN_API_KEY is not set — skipping name lookup",
    );
    return { firstName: null, lastName: null };
  }

  try {
    const url = `${ENDPOINT}${customerId}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    if (!res.ok) {
      console.error(
        `[Uscreen API] Failed to fetch customer ${customerId}: ${res.status}`,
      );
      return { firstName: null, lastName: null };
    }

    const data = await res.json();
    const fullName = data.name || null;

    if (!fullName || !fullName.trim()) {
      console.log(`[Uscreen API] No name found for customer ${customerId}`);
      return { firstName: null, lastName: null };
    }

    // Split "Firstname Lastname" into parts.
    // First word = first name, everything else = last name.
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

    console.log(
      `[Uscreen API] Resolved customer ${customerId}: fn=${firstName}, ln=${lastName || "(none)"}`,
    );

    return { firstName, lastName };
  } catch (err) {
    console.error(
      `[Uscreen API] Error fetching customer ${customerId}:`,
      err.message,
    );
    return { firstName: null, lastName: null };
  }
}

module.exports = { getCustomerName };
