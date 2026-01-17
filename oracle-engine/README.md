# 🧙‍♂️ DJINN ORACLE SERVICE (Private Microservice)

**Status:** INDEPENDENT REPOSITORY (Planned)
**Language:** TypeScript (Node.js) / Python
**Access:** G1 Treasury Private Key Only

## Architecture
This service runs on a secure private server. It has **NO** public interface.

### Modules:
1.  **The Watchman (Listener):** Listens to `MarketCreated` events on Solana.
2.  **The Wizard (AI Logic):**
    *   Ingests `pmxt` (Polymarket Data).
    *   Ingests Search API (Google/Twitter).
    *   Decides: `Verify` or `Invalidate`.
3.  **The Executioner (Tx Sender):**
    *   Signs `invalidate_market` transactions.
    *   Signs `resolve_market` transactions.
    *   Signs `sweep_dust` transactions.

## Security
*   **Env Variables:** `G1_PRIVATE_KEY` lives here. NEVER in the frontend.
*   **Firewall:** No incoming HTTP requests. Only outgoing.

## Setup
1.  `npm install`
2.  `cp .env.example .env`
3.  `npm start`
