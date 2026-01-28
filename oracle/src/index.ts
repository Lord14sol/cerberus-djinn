/**
 * CERBERUS ORACLE
 * AI-Powered Oracle System for Prediction Market Verification
 *
 * This module provides:
 * - Market Validation: Verify if a market is valid and resolvable
 * - Market Resolution: Determine YES/NO outcome using multi-LLM consensus
 * - Admin Control: Manual overrides and configuration management
 * - API Server: REST endpoints for integration with DJinn
 */

// Core exports
export * from './core/types.js';
export * from './core/config.js';

// Validators
export { validateMarket, quickValidate } from './validators/market.validator.js';

// Resolvers
export { resolveMarket, isMarketReadyForResolution } from './resolvers/market.resolver.js';

// Services
export * from './services/llm.service.js';
export * from './services/scraper.service.js';
export * from './services/news.service.js';

// Admin
export * from './admin/admin.controller.js';

// Database
export * from './db/database.js';

// Server
export { startServer } from './server.js';

// ============================================================================
// QUICK START
// ============================================================================

/**
 * Example usage:
 *
 * ```typescript
 * import { validateMarket, resolveMarket, startServer } from 'cerberus-oracle';
 *
 * // Validate a new market
 * const validation = await validateMarket({
 *     marketId: 'market_123',
 *     title: 'Will Bitcoin reach $100k by end of 2024?',
 *     description: 'Price prediction market',
 *     sourceUrl: 'https://coindesk.com/btc-analysis',
 *     category: 'crypto',
 *     expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
 * });
 *
 * console.log(validation.status); // 'approved' | 'flagged' | 'rejected'
 * console.log(validation.action); // 'approve_market' | 'flag_for_review' | 'reject_and_burn'
 *
 * // Resolve an expired market
 * const resolution = await resolveMarket({
 *     marketId: 'market_456',
 *     market: existingMarket,
 * });
 *
 * console.log(resolution.outcome); // 'yes' | 'no' | 'unresolvable'
 * console.log(resolution.confidence); // 0-100
 *
 * // Start the API server
 * startServer(3001);
 * ```
 */

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                      CERBERUS ORACLE                          ║
║         AI-Powered Prediction Market Verification             ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Features:                                                    ║
║  • Multi-layer market validation                              ║
║  • LLM consensus for resolution (Claude + GPT-4)              ║
║  • Automated evidence collection                              ║
║  • Admin override controls                                    ║
║  • REST API for DJinn integration                             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
