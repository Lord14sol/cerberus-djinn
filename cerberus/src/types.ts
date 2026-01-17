export interface CerberusVerdict {
    marketId: string;
    timestamp: number;
    layers: {
        source: LayerResult;
        external: LayerResult;
        llm: LLMVerdict; // Reinforced Layer 3
    };
    finalStatus: 'VERIFIED' | 'FLAGGED' | 'FAKE';
    action: 'PASS' | 'NOTIFY_CITADEL' | 'KILL';
}

export interface LayerResult {
    passed: boolean;
    details: string;
}

// STRICT JSON SCHEMA FOR LLM LAYER
export interface LLMVerdict {
    is_verifiable: boolean;      // true if the event is real
    confidence_score: number;    // 0 to 100 integer
    risk_flags: string[];        // Array of detected issues e.g. ["biased_source"]
    reasoning_summary: string;   // Max 150 chars explaining verdict
}

export interface MarketData {
    publicKey: string;
    title: string;
    sourceUrl: string;
}
