/**
 * CERBERUS ORACLE - Core Types
 * Sistema de tipos para el oráculo de verificación de mercados
 */

// ============================================================================
// MARKET TYPES
// ============================================================================

export interface Market {
    id: string;                          // ID único del mercado (publicKey en Solana)
    title: string;                       // Pregunta/título del mercado
    description: string;                 // Descripción detallada
    sourceUrl: string;                   // URL de referencia para verificar
    category: MarketCategory;            // Categoría del mercado
    createdAt: number;                   // Timestamp de creación
    expiresAt: number;                   // Timestamp de expiración
    closedAt?: number;                   // Timestamp cuando se cerró (expiración + 2h)
    resolvedAt?: number;                 // Timestamp de resolución
    status: MarketStatus;                // Estado actual
    poolAmount: number;                  // Cantidad total en el pool (en lamports/tokens)
    feesCollected: number;               // Fees recolectadas
    creatorAddress: string;              // Wallet del creador
}

export type MarketCategory =
    | 'crypto'
    | 'sports'
    | 'politics'
    | 'entertainment'
    | 'science'
    | 'economics'
    | 'other';

export type MarketStatus =
    | 'pending_validation'               // Esperando validación inicial
    | 'validation_in_progress'           // Validando...
    | 'active'                           // Mercado activo y tradeable
    | 'flagged'                          // Marcado para revisión manual
    | 'rejected'                         // Rechazado (no resoluble)
    | 'expired'                          // Expirado, esperando cierre
    | 'closed'                           // Cerrado (2h después de expirar)
    | 'resolution_in_progress'           // Resolviendo...
    | 'resolved_yes'                     // Resuelto: YES ganó
    | 'resolved_no'                      // Resuelto: NO ganó
    | 'unresolvable'                     // No se pudo resolver
    | 'burned';                          // Mercado quemado + refund

// ============================================================================
// VALIDATION TYPES (FASE 1 - Al crear mercado)
// ============================================================================

export interface ValidationRequest {
    marketId: string;
    title: string;
    description: string;
    sourceUrl: string;
    category: MarketCategory;
    expiresAt: number;
}

export interface ValidationResult {
    marketId: string;
    timestamp: number;
    status: 'approved' | 'flagged' | 'rejected';

    // Análisis detallado
    analysis: {
        urlValidation: LayerResult;      // ¿URL válida y accesible?
        contentExtraction: LayerResult;  // ¿Se pudo extraer contenido?
        resolvabilityCheck: ResolvabilityResult;  // ¿Es resoluble YES/NO?
        llmAnalysis: LLMValidationResult;  // Análisis profundo de IA
    };

    // Puntuación final
    score: number;                       // 0-100
    confidence: number;                  // 0-100

    // Razón del veredicto
    reason: string;
    riskFlags: string[];

    // Acción a tomar
    action: ValidationAction;
}

export type ValidationAction =
    | 'approve_market'                   // Aprobar mercado
    | 'flag_for_review'                  // Marcar para revisión manual
    | 'reject_and_burn'                  // Rechazar y quemar
    | 'request_modification';            // Pedir que modifiquen

export interface ResolvabilityResult {
    isResolvable: boolean;               // ¿Se puede resolver YES/NO?
    hasClearOutcome: boolean;            // ¿Tiene resultado claro?
    hasVerifiableDate: boolean;          // ¿Fecha verificable?
    isObjective: boolean;                // ¿Es objetivo, no subjetivo?
    reasoning: string;
}

export interface LLMValidationResult {
    provider: 'openai' | 'anthropic' | 'gemini';
    isValidMarket: boolean;
    isBinaryResolvable: boolean;         // ¿YES/NO resoluble?
    confidenceScore: number;             // 0-100
    suggestedCategory: MarketCategory;
    potentialIssues: string[];
    reasoning: string;
}

// ============================================================================
// RESOLUTION TYPES (FASE 2 - Al resolver mercado)
// ============================================================================

export interface ResolutionRequest {
    marketId: string;
    market: Market;
    forcedResolution?: 'yes' | 'no' | 'unresolvable';  // Override manual
}

export interface ResolutionResult {
    marketId: string;
    timestamp: number;
    outcome: 'yes' | 'no' | 'unresolvable';

    // Evidencia recolectada
    evidence: EvidenceCollection;

    // Consenso de LLMs
    llmConsensus: LLMConsensusResult;

    // Confianza
    confidence: number;                  // 0-100

    // Acción a ejecutar
    action: ResolutionAction;

    // Auditoría
    reasoning: string;
    sources: string[];
}

export type ResolutionAction =
    | 'pay_yes_holders'                  // Pagar a holders de YES
    | 'pay_no_holders'                   // Pagar a holders de NO
    | 'refund_all'                       // Devolver a todos
    | 'flag_for_manual_resolution';      // Resolución manual requerida

export interface EvidenceCollection {
    sourceUrlContent: string | null;     // Contenido de URL original
    newsArticles: NewsArticle[];         // Artículos de noticias encontrados
    socialMediaPosts: SocialPost[];      // Posts relevantes
    officialStatements: OfficialSource[];// Fuentes oficiales
    timestamp: number;
}

export interface NewsArticle {
    title: string;
    url: string;
    source: string;
    publishedAt: number;
    snippet: string;
    relevanceScore: number;
}

export interface SocialPost {
    platform: 'twitter' | 'reddit' | 'other';
    content: string;
    author: string;
    url: string;
    timestamp: number;
    engagement: number;
}

export interface OfficialSource {
    name: string;
    url: string;
    content: string;
    isVerified: boolean;
}

export interface LLMConsensusResult {
    votes: LLMVote[];
    finalVerdict: 'yes' | 'no' | 'unresolvable';
    agreementLevel: number;              // % de acuerdo entre LLMs
    reasoning: string;
}

export interface LLMVote {
    provider: 'openai' | 'anthropic' | 'gemini';
    vote: 'yes' | 'no' | 'unresolvable';
    confidence: number;
    reasoning: string;
    timestamp: number;
}

// ============================================================================
// ADMIN & CONTROL TYPES
// ============================================================================

export interface AdminAction {
    id: string;
    timestamp: number;
    adminAddress: string;
    actionType: AdminActionType;
    marketId: string;
    previousState: any;
    newState: any;
    reason: string;
}

export type AdminActionType =
    | 'manual_approve'
    | 'manual_reject'
    | 'manual_resolve_yes'
    | 'manual_resolve_no'
    | 'manual_unresolvable'
    | 'pause_market'
    | 'resume_market'
    | 'update_expiry'
    | 'flag_suspicious';

export interface OracleConfig {
    // Thresholds
    validationScoreThreshold: number;    // Mínimo para aprobar (default: 70)
    resolutionConfidenceThreshold: number; // Mínimo para resolver (default: 80)
    llmAgreementThreshold: number;       // Mínimo % acuerdo LLMs (default: 66)

    // Timeouts
    closingDelayHours: number;           // Horas después de expirar (default: 2)
    disputeWindowHours: number;          // Ventana de disputa (default: 24)

    // LLM Providers activos
    enabledLLMs: ('openai' | 'anthropic' | 'gemini')[];

    // Fuentes de datos
    trustedNewsSources: string[];
    blacklistedDomains: string[];
    blacklistedKeywords: string[];

    // Admin
    adminAddresses: string[];
    requireMultiSig: boolean;
    multiSigThreshold: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface LayerResult {
    passed: boolean;
    score: number;                       // 0-100
    details: string;
    metadata?: Record<string, any>;
}

export interface OracleEvent {
    id: string;
    timestamp: number;
    type: OracleEventType;
    marketId: string;
    data: any;
}

export type OracleEventType =
    | 'market_submitted'
    | 'validation_started'
    | 'validation_completed'
    | 'market_approved'
    | 'market_rejected'
    | 'market_flagged'
    | 'market_expired'
    | 'market_closed'
    | 'resolution_started'
    | 'resolution_completed'
    | 'market_resolved'
    | 'market_burned'
    | 'admin_action'
    | 'dispute_raised'
    | 'dispute_resolved';

// ============================================================================
// API TYPES
// ============================================================================

export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: number;
}

export interface WebhookPayload {
    event: OracleEventType;
    marketId: string;
    timestamp: number;
    data: any;
    signature: string;                   // Para verificar autenticidad
}
