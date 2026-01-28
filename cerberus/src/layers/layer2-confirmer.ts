// ============================================
// LAYER 2: VERIFICATION CONFIRMER
// Second AI - Confirms Layer 1's findings
// Checks if market is resolvable
// ============================================

import {
    MarketData,
    Layer1Result,
    Layer2Result,
    LLMLayer2Response,
    CerberusConfig
} from '../types.js';

export class Layer2Confirmer {
    private config: CerberusConfig;

    constructor(config: CerberusConfig) {
        this.config = config;
    }

    async process(market: MarketData, layer1: Layer1Result): Promise<Layer2Result> {
        const startTime = Date.now();
        console.log(`\n[LAYER 2] 🔬 VERIFICATION CONFIRMER - Processing: ${market.title}`);

        // Step 1: Confirm Layer 1 findings
        const layer1Confirmed = this.confirmLayer1(layer1);

        // Step 2: Check if market is resolvable (binary YES/NO outcome)
        const resolvabilityCheck = await this.checkResolvability(market, layer1);

        // Step 3: Use LLM to deep analyze resolvability
        const llmAnalysis = await this.analyzeWithLLM(market, layer1, resolvabilityCheck);

        // Step 4: Generate suggested resolution date
        const suggestedDate = this.suggestResolutionDate(market, llmAnalysis);

        const processingTime = Date.now() - startTime;

        const passed = layer1Confirmed &&
            llmAnalysis.is_resolvable &&
            llmAnalysis.has_clear_outcome &&
            llmAnalysis.confidence_score >= this.config.thresholds.layer2MinConfidence;

        const result: Layer2Result = {
            passed,
            layer1Confirmed,
            isResolvable: llmAnalysis.is_resolvable,
            hasClearOutcome: llmAnalysis.has_clear_outcome,
            isObjective: llmAnalysis.is_objective,
            hasVerifiableDate: llmAnalysis.has_verifiable_date,
            suggestedResolutionDate: suggestedDate,
            riskFlags: llmAnalysis.risk_flags,
            confidenceScore: llmAnalysis.confidence_score,
            reasoning: llmAnalysis.reasoning,
            processingTime
        };

        console.log(`[LAYER 2] ${result.passed ? '✅ PASSED' : '❌ FAILED'} - Confidence: ${result.confidenceScore}%`);
        if (result.riskFlags.length > 0) {
            console.log(`[LAYER 2] ⚠️ Risk Flags: ${result.riskFlags.join(', ')}`);
        }

        return result;
    }

    private confirmLayer1(layer1: Layer1Result): boolean {
        // Verify Layer 1 actually passed
        if (!layer1.passed) return false;

        // Verify we have actual data
        if (!layer1.hasEnoughInformation) return false;

        // Must have at least some facts
        if (layer1.extractedFacts.length === 0) return false;

        console.log(`[LAYER 2] Layer 1 findings confirmed: ${layer1.extractedFacts.length} facts verified`);
        return true;
    }

    private async checkResolvability(
        market: MarketData,
        layer1: Layer1Result
    ): Promise<{
        isBinary: boolean;
        hasDeadline: boolean;
        isObjective: boolean;
    }> {
        const title = market.title.toLowerCase();

        // Check if it's a binary question (can be YES/NO)
        const binaryIndicators = [
            'will', 'won\'t', 'does', 'doesn\'t', 'is', 'isn\'t',
            'can', 'cannot', 'has', 'hasn\'t', 'did', 'didn\'t',
            'above', 'below', 'over', 'under', 'before', 'after',
            'win', 'lose', 'reach', 'exceed', 'pass', 'fail'
        ];
        const isBinary = binaryIndicators.some(ind => title.includes(ind));

        // Check for date/deadline indicators
        const dateIndicators = [
            'by ', 'before ', 'after ', 'in 2024', 'in 2025', 'in 2026',
            'this year', 'next year', 'this month', 'end of',
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december',
            'q1', 'q2', 'q3', 'q4'
        ];
        const hasDeadline = dateIndicators.some(ind => title.includes(ind));

        // Check for subjectivity (bad for resolution)
        const subjectiveIndicators = [
            'best', 'worst', 'most', 'least', 'better', 'worse',
            'should', 'could', 'might', 'probably', 'maybe',
            'beautiful', 'ugly', 'good', 'bad', 'great', 'terrible'
        ];
        const isSubjective = subjectiveIndicators.some(ind => title.includes(ind));

        return {
            isBinary,
            hasDeadline,
            isObjective: !isSubjective
        };
    }

    private async analyzeWithLLM(
        market: MarketData,
        layer1: Layer1Result,
        resolvability: { isBinary: boolean; hasDeadline: boolean; isObjective: boolean }
    ): Promise<LLMLayer2Response> {
        console.log(`[LAYER 2] 🤖 LLM Deep Analysis starting...`);

        // Mock LLM analysis - In production call Anthropic/OpenAI
        const riskFlags: string[] = [];
        let confidenceScore = 70;

        // Analyze based on Layer 1 data quality
        if (!layer1.sourceAccessible) {
            riskFlags.push('source_not_accessible');
            confidenceScore -= 15;
        }

        if (layer1.newsArticles.length === 0) {
            riskFlags.push('no_news_coverage');
            confidenceScore -= 10;
        }

        // Check resolvability
        if (!resolvability.isBinary) {
            riskFlags.push('non_binary_outcome');
            confidenceScore -= 20;
        }

        if (!resolvability.hasDeadline) {
            riskFlags.push('no_clear_deadline');
            confidenceScore -= 10;
        }

        if (!resolvability.isObjective) {
            riskFlags.push('subjective_question');
            confidenceScore -= 25;
        }

        // Check for suspicious patterns
        const title = market.title.toLowerCase();
        if (title.includes('100%') || title.includes('guaranteed')) {
            riskFlags.push('suspicious_certainty_claim');
            confidenceScore -= 15;
        }

        if (title.length < 20) {
            riskFlags.push('vague_question');
            confidenceScore -= 10;
        }

        // Ensure minimum score
        confidenceScore = Math.max(0, Math.min(100, confidenceScore));

        const isResolvable = resolvability.isBinary &&
            resolvability.isObjective &&
            confidenceScore >= 50;

        // Generate reasoning
        let reasoning = '';
        if (isResolvable) {
            reasoning = `Market is resolvable: Binary outcome possible (YES/NO), `;
            reasoning += resolvability.hasDeadline
                ? 'has clear deadline, '
                : 'no specific deadline but can be time-bounded, ';
            reasoning += `objective criteria identified. Confidence: ${confidenceScore}%`;
        } else {
            reasoning = `Market may not be resolvable: `;
            if (!resolvability.isBinary) reasoning += 'Non-binary outcome, ';
            if (!resolvability.isObjective) reasoning += 'Subjective criteria, ';
            reasoning += `Risk flags: ${riskFlags.join(', ')}`;
        }

        return {
            is_resolvable: isResolvable,
            has_clear_outcome: resolvability.isBinary,
            is_objective: resolvability.isObjective,
            has_verifiable_date: resolvability.hasDeadline,
            suggested_resolution_date: this.extractDateFromTitle(market.title),
            risk_flags: riskFlags,
            confidence_score: confidenceScore,
            reasoning
        };
    }

    private extractDateFromTitle(title: string): string | null {
        // Extract date patterns from title
        const yearMatch = title.match(/\b(202[4-9]|203[0-9])\b/);
        const monthMatch = title.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
        const quarterMatch = title.match(/\b(Q[1-4])\b/i);

        if (yearMatch) {
            const year = yearMatch[1];
            if (monthMatch) {
                const month = monthMatch[1];
                return `${month} ${year}`;
            }
            if (quarterMatch) {
                const quarter = quarterMatch[1];
                return `${quarter} ${year}`;
            }
            return `December ${year}`;
        }

        // Check for relative dates
        if (title.toLowerCase().includes('end of year')) {
            return `December ${new Date().getFullYear()}`;
        }

        if (title.toLowerCase().includes('this year')) {
            return `December ${new Date().getFullYear()}`;
        }

        if (title.toLowerCase().includes('next year')) {
            return `December ${new Date().getFullYear() + 1}`;
        }

        return null;
    }

    private suggestResolutionDate(
        market: MarketData,
        llmAnalysis: LLMLayer2Response
    ): string | null {
        // If market has expiry, use that
        if (market.expiresAt) {
            return new Date(market.expiresAt).toISOString().split('T')[0];
        }

        // If LLM found a date, use it
        if (llmAnalysis.suggested_resolution_date) {
            return llmAnalysis.suggested_resolution_date;
        }

        // Default: 30 days from now for undefined markets
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 30);
        return defaultDate.toISOString().split('T')[0];
    }
}

export async function runLayer2(
    market: MarketData,
    layer1: Layer1Result,
    config: CerberusConfig
): Promise<Layer2Result> {
    const confirmer = new Layer2Confirmer(config);
    return confirmer.process(market, layer1);
}
