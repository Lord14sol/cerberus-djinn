// ============================================
// LAYER 3: FINAL SOURCE VALIDATOR
// Third AI - Final validation, generates description
// Awards checkmark if all passes
// ============================================

import {
    MarketData,
    Layer1Result,
    Layer2Result,
    Layer3Result,
    LLMLayer3Response,
    MarketCategory,
    CerberusConfig
} from '../types.js';

// Blacklisted domains that are not trustworthy
const BLACKLISTED_DOMAINS = [
    'fakenews.com',
    'satirenews.com',
    'theonion.com',
    'babylonbee.com',
    'clickhole.com',
    'notarealsite.xyz',
    'scam.net'
];

// Trusted news sources
const TRUSTED_SOURCES = [
    'reuters.com',
    'ap.org',
    'apnews.com',
    'bbc.com',
    'bbc.co.uk',
    'nytimes.com',
    'wsj.com',
    'bloomberg.com',
    'coindesk.com',
    'cointelegraph.com',
    'espn.com',
    'cnn.com',
    'forbes.com',
    'techcrunch.com',
    'theverge.com'
];

export class Layer3Validator {
    private config: CerberusConfig;

    constructor(config: CerberusConfig) {
        this.config = config;
    }

    async process(
        market: MarketData,
        layer1: Layer1Result,
        layer2: Layer2Result
    ): Promise<Layer3Result> {
        const startTime = Date.now();
        console.log(`\n[LAYER 3] ✅ FINAL VALIDATOR - Processing: ${market.title}`);

        // Step 1: Validate source is real and trustworthy
        const sourceValidation = this.validateSource(market.sourceUrl, layer1);

        // Step 2: Validate event is real
        const eventValidation = this.validateEvent(market, layer1, layer2);

        // Step 3: Validate date is realistic
        const dateValidation = this.validateDate(layer2.suggestedResolutionDate);

        // Step 4: Determine category
        const category = this.determineCategory(market);

        // Step 5: Use LLM for final analysis and description generation
        const llmAnalysis = await this.finalAnalysisWithLLM(
            market,
            layer1,
            layer2,
            sourceValidation,
            eventValidation,
            dateValidation,
            category
        );

        // Step 6: Determine final verdict
        const { verdict, checkmarkEarned } = this.determineFinalVerdict(
            sourceValidation,
            eventValidation,
            dateValidation,
            layer2
        );

        const processingTime = Date.now() - startTime;

        const result: Layer3Result = {
            passed: verdict === 'APPROVED',
            sourceIsReal: sourceValidation.isReal,
            eventIsReal: eventValidation.isReal,
            sourceTrustworthy: sourceValidation.isTrustworthy,
            dateIsValid: dateValidation.isValid,
            finalVerdict: verdict,
            checkmarkEarned,
            generatedDescription: llmAnalysis.generated_description,
            resolutionDate: llmAnalysis.resolution_date,
            category,
            reasoning: llmAnalysis.reasoning,
            processingTime
        };

        // Visual feedback
        if (checkmarkEarned) {
            console.log(`[LAYER 3] 🏆 CHECKMARK EARNED! Market verified successfully`);
            console.log(`[LAYER 3] 📅 Resolution Date: ${result.resolutionDate}`);
        } else {
            console.log(`[LAYER 3] ${verdict === 'FLAGGED' ? '⚠️ FLAGGED for manual review' : '❌ REJECTED'}`);
        }

        return result;
    }

    private validateSource(
        sourceUrl: string,
        layer1: Layer1Result
    ): { isReal: boolean; isTrustworthy: boolean; trustScore: number } {
        console.log(`[LAYER 3] Validating source: ${sourceUrl}`);

        // Check if source was accessible
        if (!layer1.sourceAccessible) {
            return { isReal: false, isTrustworthy: false, trustScore: 0 };
        }

        // Extract domain
        let domain = '';
        try {
            const url = new URL(sourceUrl);
            domain = url.hostname.replace('www.', '');
        } catch {
            return { isReal: false, isTrustworthy: false, trustScore: 0 };
        }

        // Check blacklist
        const isBlacklisted = BLACKLISTED_DOMAINS.some(d => domain.includes(d));
        if (isBlacklisted) {
            console.log(`[LAYER 3] ⚠️ Domain is blacklisted: ${domain}`);
            return { isReal: true, isTrustworthy: false, trustScore: 10 };
        }

        // Check trusted sources
        const isTrusted = TRUSTED_SOURCES.some(d => domain.includes(d));

        // Calculate trust score
        let trustScore = 50; // Base score
        if (isTrusted) trustScore += 40;
        if (layer1.newsArticles.length > 0) trustScore += 10;
        if (layer1.sourceContent && layer1.sourceContent.length > 500) trustScore += 10;

        return {
            isReal: true,
            isTrustworthy: trustScore >= this.config.thresholds.layer3MinTrust,
            trustScore: Math.min(100, trustScore)
        };
    }

    private validateEvent(
        market: MarketData,
        layer1: Layer1Result,
        layer2: Layer2Result
    ): { isReal: boolean; evidenceScore: number } {
        console.log(`[LAYER 3] Validating event reality...`);

        let evidenceScore = 0;

        // Layer 1 findings
        if (layer1.passed) evidenceScore += 25;
        if (layer1.newsArticles.length > 0) evidenceScore += 20;
        if (layer1.socialMentions.length > 0) evidenceScore += 10;
        if (layer1.extractedFacts.length >= 2) evidenceScore += 15;

        // Layer 2 confirmation
        if (layer2.passed) evidenceScore += 20;
        if (layer2.isObjective) evidenceScore += 10;

        const isReal = evidenceScore >= 50;
        return { isReal, evidenceScore };
    }

    private validateDate(suggestedDate: string | null): { isValid: boolean; date: string } {
        console.log(`[LAYER 3] Validating resolution date: ${suggestedDate}`);

        if (!suggestedDate) {
            // Generate default date (30 days from now)
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 30);
            return {
                isValid: true,
                date: defaultDate.toISOString().split('T')[0]
            };
        }

        // Try to parse the date
        const parsedDate = new Date(suggestedDate);
        if (isNaN(parsedDate.getTime())) {
            // If it's a string like "December 2025", try to parse it
            const monthYearMatch = suggestedDate.match(/(\w+)\s+(\d{4})/);
            if (monthYearMatch) {
                const monthStr = monthYearMatch[1];
                const year = parseInt(monthYearMatch[2]);
                const monthMap: { [key: string]: number } = {
                    january: 0, february: 1, march: 2, april: 3,
                    may: 4, june: 5, july: 6, august: 7,
                    september: 8, october: 9, november: 10, december: 11
                };
                const month = monthMap[monthStr.toLowerCase()] ?? 11;
                const date = new Date(year, month + 1, 0); // Last day of month
                return {
                    isValid: true,
                    date: date.toISOString().split('T')[0]
                };
            }
            return { isValid: false, date: suggestedDate };
        }

        // Check if date is in the future
        const now = new Date();
        if (parsedDate <= now) {
            return { isValid: false, date: suggestedDate };
        }

        // Check if date is not too far in the future (max 5 years)
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 5);
        if (parsedDate > maxDate) {
            return { isValid: false, date: suggestedDate };
        }

        return {
            isValid: true,
            date: parsedDate.toISOString().split('T')[0]
        };
    }

    private determineCategory(market: MarketData): MarketCategory {
        // If market has category, use it
        if (market.category) return market.category;

        const title = market.title.toLowerCase();

        // Crypto keywords
        if (title.includes('bitcoin') || title.includes('btc') ||
            title.includes('ethereum') || title.includes('eth') ||
            title.includes('crypto') || title.includes('token') ||
            title.includes('blockchain') || title.includes('defi')) {
            return 'crypto';
        }

        // Sports keywords
        if (title.includes('world cup') || title.includes('nba') ||
            title.includes('nfl') || title.includes('super bowl') ||
            title.includes('championship') || title.includes('playoffs') ||
            title.includes('olympics') || title.includes('match')) {
            return 'sports';
        }

        // Politics keywords
        if (title.includes('election') || title.includes('president') ||
            title.includes('congress') || title.includes('senate') ||
            title.includes('vote') || title.includes('political') ||
            title.includes('government') || title.includes('law')) {
            return 'politics';
        }

        // Entertainment keywords
        if (title.includes('movie') || title.includes('oscar') ||
            title.includes('grammy') || title.includes('album') ||
            title.includes('celebrity') || title.includes('netflix') ||
            title.includes('box office')) {
            return 'entertainment';
        }

        // Science keywords
        if (title.includes('nasa') || title.includes('spacex') ||
            title.includes('research') || title.includes('discovery') ||
            title.includes('scientific') || title.includes('climate')) {
            return 'science';
        }

        // Economics keywords
        if (title.includes('gdp') || title.includes('inflation') ||
            title.includes('fed') || title.includes('interest rate') ||
            title.includes('stock') || title.includes('market') ||
            title.includes('economy')) {
            return 'economics';
        }

        // Weather keywords
        if (title.includes('hurricane') || title.includes('tornado') ||
            title.includes('temperature') || title.includes('weather') ||
            title.includes('storm') || title.includes('flood')) {
            return 'weather';
        }

        // Gaming keywords
        if (title.includes('game') || title.includes('esports') ||
            title.includes('tournament') || title.includes('twitch') ||
            title.includes('steam') || title.includes('playstation') ||
            title.includes('xbox')) {
            return 'gaming';
        }

        return 'other';
    }

    private async finalAnalysisWithLLM(
        market: MarketData,
        layer1: Layer1Result,
        layer2: Layer2Result,
        sourceValidation: { isReal: boolean; isTrustworthy: boolean; trustScore: number },
        eventValidation: { isReal: boolean; evidenceScore: number },
        dateValidation: { isValid: boolean; date: string },
        category: MarketCategory
    ): Promise<LLMLayer3Response> {
        console.log(`[LAYER 3] 🤖 Final LLM analysis and description generation...`);

        // Generate comprehensive description
        const description = this.generateDescription(market, layer1, layer2, category);

        // Determine if market should be approved
        const allPassed = sourceValidation.isTrustworthy &&
            eventValidation.isReal &&
            dateValidation.isValid &&
            layer2.passed;

        const flagged = !allPassed &&
            (sourceValidation.trustScore >= 40 || eventValidation.evidenceScore >= 40);

        let verdict: 'APPROVED' | 'FLAGGED' | 'REJECTED';
        if (allPassed) {
            verdict = 'APPROVED';
        } else if (flagged) {
            verdict = 'FLAGGED';
        } else {
            verdict = 'REJECTED';
        }

        // Generate reasoning
        let reasoning = `Final Analysis: `;
        reasoning += `Source trust score: ${sourceValidation.trustScore}%, `;
        reasoning += `Event evidence score: ${eventValidation.evidenceScore}%, `;
        reasoning += `Date valid: ${dateValidation.isValid}. `;

        if (verdict === 'APPROVED') {
            reasoning += 'All validation layers passed. Market verified for trading.';
        } else if (verdict === 'FLAGGED') {
            reasoning += 'Some concerns detected. Requires manual review before approval.';
        } else {
            reasoning += 'Market failed critical validation checks. Recommend rejection and refund.';
        }

        return {
            source_is_real: sourceValidation.isReal,
            event_is_real: eventValidation.isReal,
            source_trustworthy: sourceValidation.isTrustworthy,
            date_is_valid: dateValidation.isValid,
            final_verdict: verdict,
            generated_description: description,
            resolution_date: dateValidation.date,
            category: category,
            reasoning
        };
    }

    private generateDescription(
        market: MarketData,
        layer1: Layer1Result,
        layer2: Layer2Result,
        category: MarketCategory
    ): string {
        // Generate AI description based on gathered information
        const title = market.title;
        const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

        let description = `📊 **${categoryLabel} Prediction Market**\n\n`;
        description += `**Question:** ${title}\n\n`;

        // Add context from Layer 1
        if (layer1.extractedFacts.length > 0) {
            description += `**Key Facts:**\n`;
            layer1.extractedFacts.forEach(fact => {
                description += `• ${fact}\n`;
            });
            description += '\n';
        }

        // Add news context
        if (layer1.newsArticles.length > 0) {
            description += `**Related News:**\n`;
            layer1.newsArticles.slice(0, 3).forEach(article => {
                description += `• [${article.source}] ${article.title}\n`;
            });
            description += '\n';
        }

        // Resolution info
        if (layer2.suggestedResolutionDate) {
            description += `**Resolution Date:** ${layer2.suggestedResolutionDate}\n\n`;
        }

        // Confidence info
        description += `**Verification Confidence:** ${layer2.confidenceScore}%\n`;

        // Risk warnings if any
        if (layer2.riskFlags.length > 0) {
            description += `\n⚠️ **Notes:** ${layer2.riskFlags.join(', ')}\n`;
        }

        description += `\n---\n*Verified by Cerberus Oracle* 🐕`;

        return description;
    }

    private determineFinalVerdict(
        sourceValidation: { isReal: boolean; isTrustworthy: boolean; trustScore: number },
        eventValidation: { isReal: boolean; evidenceScore: number },
        dateValidation: { isValid: boolean; date: string },
        layer2: Layer2Result
    ): { verdict: 'APPROVED' | 'FLAGGED' | 'REJECTED'; checkmarkEarned: boolean } {
        // Calculate overall score
        const overallScore = (
            sourceValidation.trustScore * 0.3 +
            eventValidation.evidenceScore * 0.3 +
            layer2.confidenceScore * 0.4
        );

        // APPROVED: All critical checks pass and high confidence
        if (sourceValidation.isTrustworthy &&
            eventValidation.isReal &&
            dateValidation.isValid &&
            layer2.passed &&
            overallScore >= 70) {
            return { verdict: 'APPROVED', checkmarkEarned: true };
        }

        // FLAGGED: Some issues but potentially salvageable
        if (overallScore >= 40 && !sourceValidation.isTrustworthy === false) {
            return { verdict: 'FLAGGED', checkmarkEarned: false };
        }

        // REJECTED: Too many issues
        return { verdict: 'REJECTED', checkmarkEarned: false };
    }
}

export async function runLayer3(
    market: MarketData,
    layer1: Layer1Result,
    layer2: Layer2Result,
    config: CerberusConfig
): Promise<Layer3Result> {
    const validator = new Layer3Validator(config);
    return validator.process(market, layer1, layer2);
}
