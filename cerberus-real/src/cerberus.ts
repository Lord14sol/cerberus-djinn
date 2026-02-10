import { MarketData, CerberusVerdict } from './types.js';
import { queryLLM } from './llm_layer.js';

// Layer 1: Source Scraper (Mock)
async function checkSource(url: string): Promise<boolean> {
    // In prod: puppeteer/axios check
    return url.includes('http');
}

// Layer 2: Google News (Mock)
async function searchExternal(keywords: string): Promise<any[]> {
    // In prod: Serper API / NewsAPI
    // Return empty array to simulate "No News" for testing FAKE scenario
    return [];
}

export async function runCerberusProtocol(market: MarketData): Promise<CerberusVerdict> {
    console.log(`[CERBERUS] Analyzing Market: ${market.title} (${market.publicKey})`);

    let score = 0;

    // --- LAYER 1: SOURCE CHECK ---
    const sourcePass = await checkSource(market.sourceUrl);
    if (sourcePass) score++;

    // --- LAYER 2: EXTERNAL CHECK ---
    const newsHits = await searchExternal(market.title);
    const externalPass = newsHits.length > 0;
    if (externalPass) score++;

    // --- LAYER 3: LLM CONSENSUS (JSON STRICT) ---
    const llmResult = await queryLLM(market.title, market.sourceUrl, newsHits);
    if (llmResult.is_verifiable && llmResult.confidence_score > 70) score++;

    // --- JUDGMENT ---
    let status: 'VERIFIED' | 'FLAGGED' | 'REJECTED' = 'FLAGGED';
    let action: 'APPROVE' | 'MANUAL_REVIEW' | 'REFUND_AND_DELETE' = 'MANUAL_REVIEW';

    if (score === 3) {
        status = 'VERIFIED';
        action = 'APPROVE';
    } else if (score === 0) {
        status = 'REJECTED';
        action = 'REFUND_AND_DELETE'; // <--- THE KILL SWITCH
    }

    // Creating a mock version of the detailed result to satisfy the complex CerberusVerdict type
    return {
        marketId: market.publicKey,
        marketTitle: market.title,
        timestamp: Date.now(),
        layer1: { passed: sourcePass, sourceAccessible: sourcePass, sourceContent: "Url Format Valid", extractedFacts: [], newsArticles: [], socialMentions: [], hasEnoughInformation: sourcePass, summary: "Layer 1 check", processingTime: 0 },
        layer2: { passed: externalPass, layer1Confirmed: sourcePass, isResolvable: true, hasClearOutcome: true, isObjective: true, hasVerifiableDate: true, suggestedResolutionDate: null, riskFlags: [], confidenceScore: externalPass ? 90 : 0, reasoning: "External hits found", processingTime: 0 },
        layer3: { passed: llmResult.is_verifiable, sourceIsReal: true, eventIsReal: true, sourceTrustworthy: true, dateIsValid: true, finalVerdict: status === 'VERIFIED' ? 'APPROVED' : status, checkmarkEarned: status === 'VERIFIED', generatedDescription: "AI description", resolutionDate: "", category: market.category || 'other', reasoning: llmResult.reasoning_summary, processingTime: 0 } as any,
        finalStatus: status,
        action: action,
        checkmark: status === 'VERIFIED',
        resolutionDate: null,
        aiDescription: "Market processed by legacy protocol",
        category: market.category || 'other',
        totalProcessingTime: 0,
        verifiedAt: status === 'VERIFIED' ? Date.now() : null
    };
}
