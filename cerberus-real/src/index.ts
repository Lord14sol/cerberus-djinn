// ============================================
// CERBERUS ORACLE - MAIN ENTRY POINT
// 3-Layer AI Verification System
// ============================================

import 'dotenv/config';
import { startServer } from './server.js';
import { CerberusConfig, DEFAULT_CONFIG } from './types.js';

// Configuration from environment
const config: Partial<CerberusConfig> = {
    djinnApiUrl: process.env.DJINN_API_URL || DEFAULT_CONFIG.djinnApiUrl,
    pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '180000'), // 3 minutes
    llmProvider: (process.env.LLM_PROVIDER as any) || 'mock',
    webhookUrl: process.env.WEBHOOK_URL,
    webhookSecret: process.env.WEBHOOK_SECRET,
    thresholds: {
        layer1MinNews: parseInt(process.env.LAYER1_MIN_NEWS || '1'),
        layer2MinConfidence: parseInt(process.env.LAYER2_MIN_CONFIDENCE || '70'),
        layer3MinTrust: parseInt(process.env.LAYER3_MIN_TRUST || '70'),
    }
};

console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   ██████╗███████╗██████╗ ██████╗ ███████╗██████╗ ██╗   ██╗███████╗  ║
║  ██╔════╝██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝  ║
║  ██║     █████╗  ██████╔╝██████╔╝█████╗  ██████╔╝██║   ██║███████╗  ║
║  ██║     ██╔══╝  ██╔══██╗██╔══██╗██╔══╝  ██╔══██╗██║   ██║╚════██║  ║
║  ╚██████╗███████╗██║  ██║██████╔╝███████╗██║  ██║╚██████╔╝███████║  ║
║   ╚═════╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝  ║
║                                                                      ║
║                    🐕 ORACLE - Market Verification System 🐕         ║
║                                                                      ║
║  Three-Headed Guardian of Prediction Markets                         ║
║  ────────────────────────────────────────────────────────────────    ║
║                                                                      ║
║  Layer 1: Information Gatherer    🔍 Collects data from sources     ║
║  Layer 2: Verification Confirmer  🔬 Validates resolvability        ║
║  Layer 3: Final Source Validator  ✅ Awards checkmark & description ║
║                                                                      ║
║  Polling Interval: ${(config.pollingIntervalMs! / 1000 / 60).toFixed(0)} minutes                                       ║
║  LLM Provider: ${config.llmProvider}                                            ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
`);

// Start the server
startServer(config).catch(error => {
    console.error('Failed to start Cerberus:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[CERBERUS] Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[CERBERUS] Terminating...');
    process.exit(0);
});
