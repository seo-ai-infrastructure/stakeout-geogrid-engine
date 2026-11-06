/** Set false during an operational outage; existing reports and balances remain accessible. */
export const platformEnabled = () => process.env.PLATFORM_ENABLED?.trim().toLowerCase() !== "false";

export const unavailableMessage = "New scans and credit purchases are temporarily paused while we complete service setup. Existing reports and credit balances remain available.";
