import { runCerberusProtocol } from './cerberus.js';
import { MarketData } from './types.js';

async function runGauntlet() {
    console.log("🦅 INITIATING CERBERUS GAUNTLET SIMULATION...\n");

    // SCENARIO A: THE TOTAL SCAM
    // Logic: Source check fails (broken link), News fails, LLM fails.
    const scenarioA: MarketData = {
        publicKey: "SCAM_MARKET_123",
        title: "Aliens land in Times Square",
        sourceUrl: "broken_link_404" // Mock will fail 'includes http' check or we rely on logic
    };

    // SCENARIO B: THE CLEAR TRUTH
    const scenarioB: MarketData = {
        publicKey: "REAL_MARKET_999",
        title: "BTC Halving completed sucessfully",
        sourceUrl: "https://coindesk.com/btc-halving"
    };

    // SCENARIO C: THE GREY AREA
    const scenarioC: MarketData = {
        publicKey: "RUMOR_MARKET_555",
        title: "Minor celebrity spotted in Ibiza via Rumor",
        sourceUrl: "https://twitter.com/random_user/status/123"
    };

    // EXECUTE
    console.log("--- TEST 1: SCENARIO A (THE SCAM) ---");
    const resultA = await runCerberusProtocol(scenarioA);
    console.log("RESULT A:", JSON.stringify(resultA, null, 2));
    console.log("\n");

    console.log("--- TEST 2: SCENARIO B (THE TRUTH) ---");
    const resultB = await runCerberusProtocol(scenarioB);
    console.log("RESULT B:", JSON.stringify(resultB, null, 2));
    console.log("\n");

    console.log("--- TEST 3: SCENARIO C (THE GREY AREA) ---");
    const resultC = await runCerberusProtocol(scenarioC);
    console.log("RESULT C:", JSON.stringify(resultC, null, 2));
    console.log("\n-------------------------------------------");
}

runGauntlet();
