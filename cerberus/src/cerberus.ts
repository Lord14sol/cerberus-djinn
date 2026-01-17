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
    let status: 'VERIFIED' | 'FLAGGED' | 'FAKE' = 'FLAGGED';
    let action: 'PASS' | 'NOTIFY_CITADEL' | 'KILL' = 'NOTIFY_CITADEL';

    if (score === 3) {
        status = 'VERIFIED';
        action = 'PASS';
    } else if (score === 0) {
        status = 'FAKE';
        action = 'KILL'; // <--- THE KILL SWITCH
    }

    return {
        marketId: market.publicKey,
        timestamp: Date.now(),
        layers: {
            source: { passed: sourcePass, details: "Url Format Valid" },
            external: { passed: externalPass, details: `${newsHits.length} hits found` },
            llm: llmResult
        },
        finalStatus: status,
        action: action
    };
}
