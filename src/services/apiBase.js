// src/services/apiBase.js
// Resolves correct API base URLs for both local dev (Vite proxy) and production (Vercel).
//
// LOCAL DEV:  Vite proxies /earn-api → https://earn.li.fi  and  /lifi-api → https://li.quest
//             This avoids CORS issues during development.
//
// PRODUCTION: Vite proxy does not exist on Vercel, so we call the real URLs directly.
//             CORS is not an issue from a browser when calling li.fi — they allow it.

const isDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.gitpod.dev') ||
    window.location.hostname.endsWith('.local'))

/**
 * Base URL for LI.FI Earn Data API
 * Earn API docs: https://docs.li.fi/earn/guides/api-integration
 * Real URL: https://earn.li.fi
 */
export function getEarnApiBase() {
  return isDev ? '/earn-api' : 'https://earn.li.fi'
}

/**
 * Base URL for LI.FI Composer / Quote / Status API
 * Composer API docs: https://docs.li.fi/composer/guides/api-integration
 * Real URL: https://li.quest
 */
export function getLifiApiBase() {
  return isDev ? '/lifi-api' : 'https://li.quest'
}