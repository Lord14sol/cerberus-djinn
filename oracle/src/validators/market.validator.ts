/**
 * CERBERUS ORACLE - Market Validator
 * Fase 1: Validación de mercados al momento de creación
 *
 * Este módulo verifica:
 * 1. La URL es válida y accesible
 * 2. El contenido puede extraerse
 * 3. La pregunta es resoluble (YES/NO)
 * 4. El evento es verificable objetivamente
 */

import {
    ValidationRequest,
    ValidationResult,
    ValidationAction,
    ResolvabilityResult,
    LLMValidationResult,
    LayerResult,
} from '../core/types.js';
import { getConfig, VALIDATION_RULES } from '../core/config.js';
import { validateUrl, extractContent, analyzeDomain } from '../services/scraper.service.js';
import {
    validateMarketWithAnthropic,
    validateMarketWithOpenAI,
    extractContentWithLLM,
} from '../services/llm.service.js';
import { ENV } from '../core/config.js';

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

export async function validateMarket(request: ValidationRequest): Promise<ValidationResult> {
    console.log(`[Validator] Starting validation for market: ${request.marketId}`);
    console.log(`[Validator] Title: "${request.title}"`);

    const config = getConfig();
    const riskFlags: string[] = [];
    let totalScore = 0;

    // =========================================================================
    // LAYER 1: URL VALIDATION
    // =========================================================================

    console.log('[Validator] Layer 1: URL Validation');
    const urlValidation = await validateUrl(request.sourceUrl);

    if (!urlValidation.passed) {
        riskFlags.push('invalid_url');
    }

    // Analizar dominio
    const domainAnalysis = analyzeDomain(request.sourceUrl);

    if (domainAnalysis.isBlacklisted) {
        riskFlags.push('blacklisted_domain');
        urlValidation.passed = false;
        urlValidation.score = 0;
        urlValidation.details = `Domain ${domainAnalysis.domain} is blacklisted`;
    }

    if (domainAnalysis.isSocialMedia) {
        riskFlags.push('social_media_source');
    }

    totalScore += urlValidation.score * 0.15; // 15% del score total

    // =========================================================================
    // LAYER 2: CONTENT EXTRACTION
    // =========================================================================

    console.log('[Validator] Layer 2: Content Extraction');
    let contentExtraction: LayerResult;
    let extractedContent: string | null = null;

    const pageContent = await extractContent(request.sourceUrl);

    if (pageContent && pageContent.bodyText.length > 100) {
        contentExtraction = {
            passed: true,
            score: 100,
            details: `Extracted ${pageContent.bodyText.length} characters`,
            metadata: {
                title: pageContent.title,
                description: pageContent.description,
            },
        };

        // Usar LLM para extraer contenido relevante
        extractedContent = await extractContentWithLLM(
            pageContent.bodyText,
            request.title
        );
    } else {
        contentExtraction = {
            passed: false,
            score: pageContent ? 30 : 0,
            details: pageContent
                ? 'Insufficient content extracted'
                : 'Failed to extract content',
        };
        riskFlags.push('content_extraction_failed');
    }

    totalScore += contentExtraction.score * 0.15; // 15% del score total

    // =========================================================================
    // LAYER 3: RESOLVABILITY CHECK (Rule-based)
    // =========================================================================

    console.log('[Validator] Layer 3: Resolvability Check');
    const resolvabilityCheck = checkResolvability(request);

    if (!resolvabilityCheck.isResolvable) {
        riskFlags.push('not_resolvable');
    }
    if (!resolvabilityCheck.hasClearOutcome) {
        riskFlags.push('unclear_outcome');
    }
    if (!resolvabilityCheck.hasVerifiableDate) {
        riskFlags.push('no_clear_date');
    }
    if (!resolvabilityCheck.isObjective) {
        riskFlags.push('subjective_question');
    }

    const resolvabilityScore =
        (resolvabilityCheck.isResolvable ? 25 : 0) +
        (resolvabilityCheck.hasClearOutcome ? 25 : 0) +
        (resolvabilityCheck.hasVerifiableDate ? 25 : 0) +
        (resolvabilityCheck.isObjective ? 25 : 0);

    totalScore += resolvabilityScore * 0.2; // 20% del score total

    // =========================================================================
    // LAYER 4: LLM ANALYSIS
    // =========================================================================

    console.log('[Validator] Layer 4: LLM Analysis');
    let llmAnalysis: LLMValidationResult;

    const llmInput = {
        title: request.title,
        description: request.description,
        sourceUrl: request.sourceUrl,
        category: request.category,
        expiresAt: request.expiresAt,
        extractedContent: extractedContent || undefined,
    };

    // Intentar con Anthropic primero, luego OpenAI
    if (ENV.ANTHROPIC_API_KEY) {
        llmAnalysis = await validateMarketWithAnthropic(llmInput);
    } else if (ENV.OPENAI_API_KEY) {
        llmAnalysis = await validateMarketWithOpenAI(llmInput);
    } else {
        // Fallback sin LLM
        console.warn('[Validator] No LLM API keys configured, using rule-based only');
        llmAnalysis = {
            provider: 'anthropic',
            isValidMarket: resolvabilityCheck.isResolvable,
            isBinaryResolvable: resolvabilityCheck.hasClearOutcome,
            confidenceScore: resolvabilityScore,
            suggestedCategory: request.category,
            potentialIssues: riskFlags,
            reasoning: 'No LLM available, using rule-based validation',
        };
    }

    // Agregar issues detectados por LLM
    for (const issue of llmAnalysis.potentialIssues) {
        if (!riskFlags.includes(issue)) {
            riskFlags.push(issue);
        }
    }

    totalScore += llmAnalysis.confidenceScore * 0.5; // 50% del score total

    // =========================================================================
    // CALCULATE FINAL VERDICT
    // =========================================================================

    const finalScore = Math.round(totalScore);
    const confidence = llmAnalysis.confidenceScore;

    let status: 'approved' | 'flagged' | 'rejected';
    let action: ValidationAction;
    let reason: string;

    // Reglas de decisión
    if (riskFlags.includes('blacklisted_domain')) {
        status = 'rejected';
        action = 'reject_and_burn';
        reason = 'Source domain is blacklisted';
    } else if (!llmAnalysis.isBinaryResolvable) {
        status = 'rejected';
        action = 'reject_and_burn';
        reason = 'Market question is not resolvable as YES/NO';
    } else if (finalScore >= config.validationScoreThreshold && confidence >= 70) {
        status = 'approved';
        action = 'approve_market';
        reason = 'Market passed all validation checks';
    } else if (finalScore >= 50 || riskFlags.length <= 2) {
        status = 'flagged';
        action = 'flag_for_review';
        reason = `Score ${finalScore}/100 - Manual review required`;
    } else {
        status = 'rejected';
        action = 'reject_and_burn';
        reason = `Score ${finalScore}/100 - Too many risk flags: ${riskFlags.join(', ')}`;
    }

    console.log(`[Validator] Final verdict: ${status} (score: ${finalScore}, action: ${action})`);

    return {
        marketId: request.marketId,
        timestamp: Date.now(),
        status,
        analysis: {
            urlValidation,
            contentExtraction,
            resolvabilityCheck,
            llmAnalysis,
        },
        score: finalScore,
        confidence,
        reason,
        riskFlags,
        action,
    };
}

// ============================================================================
// RESOLVABILITY CHECK (Rule-based)
// ============================================================================

function checkResolvability(request: ValidationRequest): ResolvabilityResult {
    const title = request.title.toLowerCase();
    const description = request.description.toLowerCase();

    // Check 1: ¿Es resoluble como YES/NO?
    const isResolvable = checkIfBinaryQuestion(title);

    // Check 2: ¿Tiene resultado claro?
    const hasClearOutcome = !hasAmbiguousLanguage(title);

    // Check 3: ¿Tiene fecha verificable?
    const hasVerifiableDate = checkHasDate(title, description, request.expiresAt);

    // Check 4: ¿Es objetivo?
    const isObjective = !isSubjectiveQuestion(title);

    const reasoning = buildResolvabilityReasoning({
        isResolvable,
        hasClearOutcome,
        hasVerifiableDate,
        isObjective,
    });

    return {
        isResolvable,
        hasClearOutcome,
        hasVerifiableDate,
        isObjective,
        reasoning,
    };
}

function checkIfBinaryQuestion(title: string): boolean {
    // Patrones que indican preguntas binarias
    const binaryPatterns = [
        /^will\s/i,
        /\?$/,
        /will.*\?/i,
        /^is\s/i,
        /^does\s/i,
        /^can\s/i,
        /^has\s/i,
        /^did\s/i,
    ];

    // Verificar que tenga al menos un patrón binario
    for (const pattern of VALIDATION_RULES.VALID_PATTERNS) {
        if (pattern.test(title)) return true;
    }

    for (const pattern of binaryPatterns) {
        if (pattern.test(title)) return true;
    }

    return false;
}

function hasAmbiguousLanguage(title: string): boolean {
    const ambiguousTerms = [
        'maybe', 'might', 'possibly', 'probably', 'likely',
        'approximately', 'around', 'about', 'roughly',
        'some', 'several', 'many', 'few',
        'better', 'worse', 'best', 'worst', 'most',
    ];

    for (const term of ambiguousTerms) {
        if (title.includes(term)) return true;
    }

    return false;
}

function checkHasDate(title: string, description: string, expiresAt: number): boolean {
    const text = `${title} ${description}`;

    // Verificar que la fecha de expiración sea válida
    const now = Date.now();
    const minExpiry = now + VALIDATION_RULES.MIN_HOURS_TO_EXPIRY * 3600 * 1000;
    const maxExpiry = now + VALIDATION_RULES.MAX_DAYS_TO_EXPIRY * 24 * 3600 * 1000;

    if (expiresAt < minExpiry || expiresAt > maxExpiry) {
        return false;
    }

    // Patrones de fecha
    const datePatterns = [
        /\d{1,2}\/\d{1,2}\/\d{2,4}/,           // MM/DD/YYYY
        /\d{4}-\d{2}-\d{2}/,                    // YYYY-MM-DD
        /january|february|march|april|may|june|july|august|september|october|november|december/i,
        /q[1-4]\s*\d{4}/i,                      // Q1 2024
        /\d{4}/,                                 // Año solo
        /by\s+(the\s+)?end\s+of/i,              // "by the end of"
        /before\s+\w+\s+\d+/i,                  // "before July 1"
        /in\s+\d+\s+(days?|weeks?|months?)/i,   // "in 30 days"
    ];

    for (const pattern of datePatterns) {
        if (pattern.test(text)) return true;
    }

    // Si tiene fecha de expiración válida, cuenta como fecha clara
    return expiresAt > now;
}

function isSubjectiveQuestion(title: string): boolean {
    for (const pattern of VALIDATION_RULES.SUBJECTIVE_PATTERNS) {
        if (pattern.test(title)) return true;
    }

    const subjectiveKeywords = [
        'opinion', 'feel', 'think', 'believe', 'prefer',
        'beautiful', 'ugly', 'good', 'bad', 'nice', 'great',
        'awesome', 'terrible', 'amazing', 'horrible',
    ];

    for (const keyword of subjectiveKeywords) {
        if (title.includes(keyword)) return true;
    }

    return false;
}

function buildResolvabilityReasoning(checks: {
    isResolvable: boolean;
    hasClearOutcome: boolean;
    hasVerifiableDate: boolean;
    isObjective: boolean;
}): string {
    const issues: string[] = [];

    if (!checks.isResolvable) issues.push('not a binary YES/NO question');
    if (!checks.hasClearOutcome) issues.push('ambiguous outcome criteria');
    if (!checks.hasVerifiableDate) issues.push('no clear resolution date');
    if (!checks.isObjective) issues.push('subjective/opinion-based');

    if (issues.length === 0) {
        return 'All resolvability checks passed';
    }

    return `Issues: ${issues.join(', ')}`;
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

export async function validateMarketsBatch(
    requests: ValidationRequest[]
): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Procesar en paralelo con límite de concurrencia
    const batchSize = 5;

    for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(req => validateMarket(req))
        );
        results.push(...batchResults);
    }

    return results;
}

// ============================================================================
// QUICK VALIDATION (sin LLM, solo reglas)
// ============================================================================

export function quickValidate(request: ValidationRequest): {
    valid: boolean;
    issues: string[];
} {
    const issues: string[] = [];

    // Validar título
    if (request.title.length < VALIDATION_RULES.MIN_TITLE_LENGTH) {
        issues.push('Title too short');
    }
    if (request.title.length > VALIDATION_RULES.MAX_TITLE_LENGTH) {
        issues.push('Title too long');
    }

    // Validar descripción
    if (request.description.length < VALIDATION_RULES.MIN_DESCRIPTION_LENGTH) {
        issues.push('Description too short');
    }

    // Validar URL
    try {
        new URL(request.sourceUrl);
    } catch {
        issues.push('Invalid URL format');
    }

    // Validar fecha
    const now = Date.now();
    if (request.expiresAt <= now) {
        issues.push('Expiry date must be in the future');
    }

    // Verificar palabras bloqueadas
    const titleLower = request.title.toLowerCase();
    for (const keyword of getConfig().blacklistedKeywords) {
        if (titleLower.includes(keyword)) {
            issues.push(`Blacklisted keyword: ${keyword}`);
        }
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}
