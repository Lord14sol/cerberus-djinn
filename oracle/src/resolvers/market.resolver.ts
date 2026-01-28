/**
 * CERBERUS ORACLE - Market Resolver
 * Fase 2: Resolución de mercados cuando expiran
 *
 * Este módulo:
 * 1. Recolecta evidencia de múltiples fuentes
 * 2. Obtiene consenso de múltiples LLMs
 * 3. Determina el resultado: YES / NO / UNRESOLVABLE
 * 4. Ejecuta la acción correspondiente
 */

import {
    Market,
    ResolutionRequest,
    ResolutionResult,
    ResolutionAction,
    EvidenceCollection,
    LLMConsensusResult,
} from '../core/types.js';
import { getConfig } from '../core/config.js';
import { collectEvidence } from '../services/news.service.js';
import { getLLMConsensus } from '../services/llm.service.js';

// ============================================================================
// MAIN RESOLUTION FUNCTION
// ============================================================================

export async function resolveMarket(request: ResolutionRequest): Promise<ResolutionResult> {
    console.log(`[Resolver] Starting resolution for market: ${request.marketId}`);
    console.log(`[Resolver] Title: "${request.market.title}"`);

    const config = getConfig();

    // Si hay una resolución forzada (override manual), usarla
    if (request.forcedResolution) {
        console.log(`[Resolver] Using forced resolution: ${request.forcedResolution}`);
        return createForcedResolution(request);
    }

    // =========================================================================
    // STEP 1: COLLECT EVIDENCE
    // =========================================================================

    console.log('[Resolver] Step 1: Collecting evidence...');
    const evidence = await collectEvidence(request.market);

    // Verificar si hay suficiente evidencia
    const hasEvidence =
        evidence.sourceUrlContent !== null ||
        evidence.newsArticles.length > 0 ||
        evidence.officialStatements.length > 0;

    if (!hasEvidence) {
        console.log('[Resolver] Insufficient evidence found');
        return {
            marketId: request.marketId,
            timestamp: Date.now(),
            outcome: 'unresolvable',
            evidence,
            llmConsensus: {
                votes: [],
                finalVerdict: 'unresolvable',
                agreementLevel: 100,
                reasoning: 'No evidence found to determine outcome',
            },
            confidence: 0,
            action: 'refund_all',
            reasoning: 'Market is unresolvable due to lack of verifiable evidence',
            sources: [],
        };
    }

    // =========================================================================
    // STEP 2: GET LLM CONSENSUS
    // =========================================================================

    console.log('[Resolver] Step 2: Getting LLM consensus...');
    const llmConsensus = await getLLMConsensus(request.market, evidence);

    // =========================================================================
    // STEP 3: DETERMINE OUTCOME
    // =========================================================================

    console.log('[Resolver] Step 3: Determining outcome...');
    const { outcome, confidence, action } = determineOutcome(llmConsensus, evidence, config);

    // =========================================================================
    // STEP 4: BUILD RESULT
    // =========================================================================

    const sources = [
        ...evidence.newsArticles.map(a => a.url),
        ...evidence.officialStatements.map(s => s.url),
        request.market.sourceUrl,
    ].filter(Boolean);

    console.log(`[Resolver] Final outcome: ${outcome} (confidence: ${confidence}%, action: ${action})`);

    return {
        marketId: request.marketId,
        timestamp: Date.now(),
        outcome,
        evidence,
        llmConsensus,
        confidence,
        action,
        reasoning: buildReasoningText(llmConsensus, evidence),
        sources: [...new Set(sources)], // Eliminar duplicados
    };
}

// ============================================================================
// OUTCOME DETERMINATION
// ============================================================================

interface OutcomeDecision {
    outcome: 'yes' | 'no' | 'unresolvable';
    confidence: number;
    action: ResolutionAction;
}

function determineOutcome(
    consensus: LLMConsensusResult,
    evidence: EvidenceCollection,
    config: ReturnType<typeof getConfig>
): OutcomeDecision {
    // Si no hay votos, marcar como no resoluble
    if (consensus.votes.length === 0) {
        return {
            outcome: 'unresolvable',
            confidence: 0,
            action: 'refund_all',
        };
    }

    // Si el acuerdo es muy bajo, flag para revisión manual
    if (consensus.agreementLevel < config.llmAgreementThreshold) {
        return {
            outcome: 'unresolvable',
            confidence: consensus.agreementLevel,
            action: 'flag_for_manual_resolution',
        };
    }

    // Calcular confianza promedio
    const avgConfidence =
        consensus.votes.reduce((sum, v) => sum + v.confidence, 0) / consensus.votes.length;

    // Si la confianza es muy baja, flag para revisión
    if (avgConfidence < config.resolutionConfidenceThreshold) {
        return {
            outcome: consensus.finalVerdict,
            confidence: avgConfidence,
            action: 'flag_for_manual_resolution',
        };
    }

    // Verificar evidencia de soporte
    const evidenceStrength = calculateEvidenceStrength(evidence);

    // Si hay buena evidencia y consenso alto, resolver
    if (evidenceStrength >= 50 && consensus.agreementLevel >= 66) {
        let action: ResolutionAction;

        switch (consensus.finalVerdict) {
            case 'yes':
                action = 'pay_yes_holders';
                break;
            case 'no':
                action = 'pay_no_holders';
                break;
            default:
                action = 'refund_all';
        }

        return {
            outcome: consensus.finalVerdict,
            confidence: Math.round((avgConfidence + evidenceStrength) / 2),
            action,
        };
    }

    // Por defecto, flag para revisión manual
    return {
        outcome: consensus.finalVerdict,
        confidence: avgConfidence,
        action: 'flag_for_manual_resolution',
    };
}

function calculateEvidenceStrength(evidence: EvidenceCollection): number {
    let score = 0;

    // Puntos por contenido de URL fuente
    if (evidence.sourceUrlContent) {
        score += 20;
    }

    // Puntos por artículos de noticias
    score += Math.min(evidence.newsArticles.length * 10, 30);

    // Puntos por fuentes oficiales
    score += Math.min(evidence.officialStatements.length * 15, 30);

    // Bonus por fuentes verificadas
    const verifiedSources = evidence.officialStatements.filter(s => s.isVerified).length;
    score += verifiedSources * 10;

    return Math.min(score, 100);
}

function buildReasoningText(consensus: LLMConsensusResult, evidence: EvidenceCollection): string {
    const parts: string[] = [];

    parts.push(`LLM Consensus: ${consensus.finalVerdict} (${consensus.agreementLevel.toFixed(0)}% agreement)`);

    if (consensus.votes.length > 0) {
        parts.push(`Votes: ${consensus.votes.map(v => `${v.provider}=${v.vote}`).join(', ')}`);
    }

    parts.push(`Evidence: ${evidence.newsArticles.length} news articles, ${evidence.officialStatements.length} official sources`);

    return parts.join('. ');
}

// ============================================================================
// FORCED RESOLUTION (ADMIN OVERRIDE)
// ============================================================================

function createForcedResolution(request: ResolutionRequest): ResolutionResult {
    const outcome = request.forcedResolution!;

    let action: ResolutionAction;
    switch (outcome) {
        case 'yes':
            action = 'pay_yes_holders';
            break;
        case 'no':
            action = 'pay_no_holders';
            break;
        default:
            action = 'refund_all';
    }

    return {
        marketId: request.marketId,
        timestamp: Date.now(),
        outcome,
        evidence: {
            sourceUrlContent: null,
            newsArticles: [],
            socialMediaPosts: [],
            officialStatements: [],
            timestamp: Date.now(),
        },
        llmConsensus: {
            votes: [],
            finalVerdict: outcome,
            agreementLevel: 100,
            reasoning: 'Manual admin override',
        },
        confidence: 100,
        action,
        reasoning: 'This resolution was manually set by an administrator',
        sources: [],
    };
}

// ============================================================================
// MARKET LIFECYCLE HELPERS
// ============================================================================

export function isMarketReadyForResolution(market: Market): boolean {
    const config = getConfig();
    const closingTime = market.expiresAt + config.closingDelayHours * 3600 * 1000;

    return (
        market.status === 'expired' ||
        market.status === 'closed' ||
        Date.now() >= closingTime
    );
}

export function shouldFlagForDispute(result: ResolutionResult): boolean {
    // Flag si:
    // 1. Confianza menor al 60%
    // 2. No hay consenso claro
    // 3. Poca evidencia

    if (result.confidence < 60) return true;
    if (result.llmConsensus.agreementLevel < 66) return true;
    if (result.sources.length < 2) return true;

    return false;
}

// ============================================================================
// BATCH RESOLUTION
// ============================================================================

export async function resolveMarketsBatch(
    markets: Market[]
): Promise<ResolutionResult[]> {
    const results: ResolutionResult[] = [];

    // Filtrar mercados listos para resolución
    const readyMarkets = markets.filter(isMarketReadyForResolution);

    console.log(`[Resolver] Processing ${readyMarkets.length} markets ready for resolution`);

    // Procesar secuencialmente para evitar rate limits
    for (const market of readyMarkets) {
        try {
            const result = await resolveMarket({
                marketId: market.id,
                market,
            });
            results.push(result);
        } catch (error) {
            console.error(`[Resolver] Error resolving market ${market.id}:`, error);
            // Crear resultado de error
            results.push({
                marketId: market.id,
                timestamp: Date.now(),
                outcome: 'unresolvable',
                evidence: {
                    sourceUrlContent: null,
                    newsArticles: [],
                    socialMediaPosts: [],
                    officialStatements: [],
                    timestamp: Date.now(),
                },
                llmConsensus: {
                    votes: [],
                    finalVerdict: 'unresolvable',
                    agreementLevel: 0,
                    reasoning: `Error during resolution: ${error instanceof Error ? error.message : 'Unknown'}`,
                },
                confidence: 0,
                action: 'flag_for_manual_resolution',
                reasoning: 'Resolution failed due to an error',
                sources: [],
            });
        }
    }

    return results;
}
