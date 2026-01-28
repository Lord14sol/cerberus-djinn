/**
 * CERBERUS ORACLE - Configuration
 * Configuración central del sistema de oráculo
 */

import { OracleConfig } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_CONFIG: OracleConfig = {
    // Thresholds de puntuación
    validationScoreThreshold: 70,        // Mínimo 70/100 para aprobar mercado
    resolutionConfidenceThreshold: 80,   // Mínimo 80% confianza para resolver
    llmAgreementThreshold: 66,           // Mínimo 2/3 LLMs de acuerdo

    // Timeouts
    closingDelayHours: 2,                // 2 horas después de expirar
    disputeWindowHours: 24,              // 24 horas para disputar

    // LLM Providers
    enabledLLMs: ['anthropic', 'openai'],

    // Fuentes confiables de noticias
    trustedNewsSources: [
        'reuters.com',
        'apnews.com',
        'bbc.com',
        'cnn.com',
        'bloomberg.com',
        'coindesk.com',
        'cointelegraph.com',
        'theblock.co',
        'decrypt.co',
        'espn.com',
        'nytimes.com',
        'wsj.com',
        'theguardian.com',
        'forbes.com',
    ],

    // Dominios bloqueados
    blacklistedDomains: [
        'fakenews.com',
        'satirenews.com',
        'theonion.com',
        'babylonbee.com',
    ],

    // Palabras clave bloqueadas (indican mercados no resolubles)
    blacklistedKeywords: [
        'aliens',
        'supernatural',
        'magic',
        'impossible',
        'miracle',
    ],

    // Admin
    adminAddresses: [],                  // Se configura via env
    requireMultiSig: false,
    multiSigThreshold: 2,
};

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

export const ENV = {
    // Server
    PORT: parseInt(process.env.PORT || '3001'),
    NODE_ENV: process.env.NODE_ENV || 'development',

    // API Keys
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',

    // News APIs
    SERPER_API_KEY: process.env.SERPER_API_KEY || '',
    NEWS_API_KEY: process.env.NEWS_API_KEY || '',

    // Solana
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    ORACLE_PRIVATE_KEY: process.env.ORACLE_PRIVATE_KEY || '',
    PROGRAM_ID: process.env.PROGRAM_ID || '',

    // Database
    DATABASE_PATH: process.env.DATABASE_PATH || './data/oracle.db',

    // Webhooks
    DJINN_WEBHOOK_URL: process.env.DJINN_WEBHOOK_URL || '',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'cerberus-secret',

    // Admin
    ADMIN_ADDRESSES: (process.env.ADMIN_ADDRESSES || '').split(',').filter(Boolean),
};

// ============================================================================
// PROMPTS FOR LLM
// ============================================================================

export const LLM_PROMPTS = {
    // Prompt para validación de mercado
    MARKET_VALIDATION: `You are the Cerberus Oracle, a truth verification AI for prediction markets.

Your task is to analyze if a proposed market is VALID and RESOLVABLE.

A VALID market must:
1. Have a clear YES/NO binary outcome
2. Be objectively verifiable (not subjective opinions)
3. Have a specific, determinable resolution date/condition
4. Be about real, possible events (not fantasy/supernatural)
5. Have reliable sources that can verify the outcome

IMPORTANT: You must be STRICT. If there's ANY ambiguity, flag it.

Analyze the following market proposal and respond in JSON format:`,

    // Prompt para resolución de mercado
    MARKET_RESOLUTION: `You are the Cerberus Oracle, a truth verification AI for prediction markets.

Your task is to determine the OUTCOME of a market based on evidence.

You must determine:
1. Did the event occur as specified? (YES/NO/UNRESOLVABLE)
2. Is there sufficient evidence to make this determination?
3. Do multiple reliable sources confirm this outcome?

Be CONSERVATIVE. If evidence is unclear or conflicting, mark as UNRESOLVABLE.

Based on the evidence provided, determine the outcome in JSON format:`,

    // Prompt para extracción de contenido
    CONTENT_EXTRACTION: `Extract the key facts from this webpage content that are relevant to verifying the following prediction market question.
Focus on:
- Specific dates and events mentioned
- Official statements or announcements
- Verifiable facts that can confirm YES or NO outcomes

Be concise and factual. Output in JSON format with extracted facts.`,
};

// ============================================================================
// VALIDATION RULES
// ============================================================================

export const VALIDATION_RULES = {
    // Mínimo de caracteres en título
    MIN_TITLE_LENGTH: 10,
    MAX_TITLE_LENGTH: 200,

    // Mínimo de caracteres en descripción
    MIN_DESCRIPTION_LENGTH: 20,
    MAX_DESCRIPTION_LENGTH: 1000,

    // Tiempo mínimo hasta expiración (en horas)
    MIN_HOURS_TO_EXPIRY: 1,
    MAX_DAYS_TO_EXPIRY: 365,

    // Patrones que indican mercados problemáticos
    SUBJECTIVE_PATTERNS: [
        /will.*be.*the best/i,
        /is.*better than/i,
        /most.*popular/i,
        /greatest.*ever/i,
        /should.*happen/i,
    ],

    // Patrones que indican mercados válidos
    VALID_PATTERNS: [
        /will.*reach.*\$?\d+/i,           // "Will X reach $Y"
        /will.*win/i,                      // "Will X win Y"
        /will.*happen.*by/i,              // "Will X happen by Y date"
        /will.*be.*announced/i,           // "Will X be announced"
        /will.*pass/i,                     // "Will X pass" (legislation)
        /will.*launch/i,                   // "Will X launch"
    ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getConfig(): OracleConfig {
    return {
        ...DEFAULT_CONFIG,
        adminAddresses: ENV.ADMIN_ADDRESSES.length > 0
            ? ENV.ADMIN_ADDRESSES
            : DEFAULT_CONFIG.adminAddresses,
    };
}

export function isAdminAddress(address: string): boolean {
    const config = getConfig();
    return config.adminAddresses.includes(address);
}

export function isLLMEnabled(provider: 'openai' | 'anthropic' | 'gemini'): boolean {
    const config = getConfig();
    return config.enabledLLMs.includes(provider);
}
