# 🐕 CERBERUS ORACLE

**Three-Headed Guardian of Prediction Markets**

Cerberus is a 3-Layer AI Verification System for prediction markets. It automatically verifies new markets, assigns resolution dates, generates AI descriptions, and awards checkmarks to verified markets.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CERBERUS ORACLE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │   LAYER 1   │ → │   LAYER 2   │ → │   LAYER 3   │          │
│  │  GATHERER   │   │  CONFIRMER  │   │  VALIDATOR  │          │
│  │     🔍      │   │     🔬      │   │     ✅      │          │
│  └─────────────┘   └─────────────┘   └─────────────┘          │
│                                                                 │
│  • Collects info    • Confirms L1     • Final validation       │
│  • Searches news    • Checks resolve  • Awards checkmark       │
│  • Extracts facts   • Risk analysis   • Generates description  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📊 DASHBOARD (Real-time SSE)  │  🔄 Polling: Every 3 minutes  │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### 3-Layer AI Verification
1. **Layer 1 - Information Gatherer** 🔍
   - Validates source URL accessibility
   - Extracts content from sources
   - Searches for related news articles
   - Finds social media mentions
   - Uses LLM to analyze information sufficiency

2. **Layer 2 - Verification Confirmer** 🔬
   - Confirms Layer 1 findings
   - Checks if market is resolvable (YES/NO outcome)
   - Validates objectivity (rejects subjective questions)
   - Identifies resolution date
   - Calculates confidence score
   - Flags risk factors

3. **Layer 3 - Final Source Validator** ✅
   - Validates source trustworthiness
   - Confirms event reality
   - Generates AI description
   - Assigns resolution date
   - Determines category
   - **Awards checkmark if all passes** (rosado/cafe style)

### Market Outcomes
- **VERIFIED** ✅ → Checkmark + trading enabled
- **FLAGGED** ⚠️ → Manual review required
- **REJECTED** ❌ → Refund initiated (except fees)

### Fee Structure
- Creation Fee: **$2 USD** (non-refundable)
- Trading Fee: **1%** (non-refundable)
- Pool shares: **Refundable** if market rejected

## Quick Start

```bash
# Install dependencies
cd cerberus
npm install

# Copy environment config
cp .env.example .env

# Run the test suite
npm run gauntlet

# Start the server
npm start

# Or run in development mode with hot reload
npm run dev
```

## Dashboard UI

The dashboard provides real-time visualization of market verification:

```bash
# Start the API server
cd cerberus && npm start

# In another terminal, serve the UI
cd citadel-ui && npx vite
```

Open http://localhost:5173 to view the dashboard.

### Dashboard Features
- Real-time market queue with SSE updates
- 3-layer progress visualization
- Checkmark badges (rosado/cafe gradient)
- AI-generated descriptions
- Statistics panel
- Market details with full verification results

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/dashboard` | GET | Full dashboard state |
| `/api/markets` | GET | All markets with stats |
| `/api/markets/:id` | GET | Specific market verdict |
| `/api/markets/:id/verify` | POST | Manually trigger verification |
| `/api/markets/:id/description` | GET | AI description |
| `/api/verdicts` | GET | All verification verdicts |
| `/api/stats` | GET | System statistics |
| `/api/events` | GET | SSE stream for real-time updates |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | API server port |
| `DJINN_API_URL` | http://localhost:3000/api | Djinn-pmarket API |
| `POLLING_INTERVAL_MS` | 180000 | Polling interval (3 min) |
| `LLM_PROVIDER` | mock | LLM provider (mock/anthropic/openai) |
| `LAYER1_MIN_NEWS` | 1 | Min news articles for L1 |
| `LAYER2_MIN_CONFIDENCE` | 70 | Min confidence % for L2 |
| `LAYER3_MIN_TRUST` | 70 | Min trust score for L3 |

## Project Structure

```
cerberus/
├── src/
│   ├── types.ts           # Type definitions
│   ├── index.ts           # Main entry point
│   ├── server.ts          # Express API server
│   ├── orchestrator.ts    # Main verification orchestrator
│   ├── gauntlet.ts        # Test suite
│   ├── layers/
│   │   ├── layer1-gatherer.ts    # Information collection
│   │   ├── layer2-confirmer.ts   # Verification confirmation
│   │   ├── layer3-validator.ts   # Final validation
│   │   └── index.ts
│   └── services/
│       ├── djinn-client.ts       # Djinn-pmarket integration
│       └── index.ts
├── package.json
├── tsconfig.json
└── .env.example

citadel-ui/
├── index.html             # Dashboard HTML
├── styles.css             # Dashboard styles
├── app.js                 # Dashboard JavaScript
└── package.json
```

## Checkmark Design

Markets that pass all 3 layers receive a special checkmark:

```css
/* Rosado con Cafe gradient */
background: linear-gradient(135deg, #e91e63 0%, #795548 100%);
```

This badge appears in the top-right corner of verified market cards.

## Security

- **Private Key**: `ORACLE_PRIVATE_KEY` stored in environment only
- **No incoming HTTP**: Outbound-only communication
- **Webhook signatures**: HMAC verification for callbacks
- **Blacklisted domains**: Known fake news sites blocked

## Integration with Djinn-pmarket

Cerberus polls Djinn-pmarket every 3 minutes for new markets:

```typescript
// Automatic polling
orchestrator.start();

// Manual verification
orchestrator.verifyMarket(marketId);
```

Results are sent back via webhook:
- `market_verified` → Enable trading
- `market_flagged` → Queue for manual review
- `market_rejected` → Initiate refund

---

🐕 **Cerberus** - Guardian of Truth in Prediction Markets
