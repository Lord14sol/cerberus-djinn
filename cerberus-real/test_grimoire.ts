import 'dotenv/config';
import { runCerberusValidation } from './src/cerberus_engine.js';
import { MemoryLayer } from './src/logic/MemoryLayer.js';
import { MarketData } from './src/types.js';

const mockMarketBase = {
    publicKey: "grimoire_test_market",
    creator: { wallet: "test_wallet" },
    pool: { yesShares: 0, noShares: 0, totalLiquidity: 0 },
    feesCollected: 0,
    createdAt: Date.now()
};

async function testGrimoire() {
    console.log("📜 TESTING CERBERUS GRIMOIRE (Persistent Memory)\n");

    // 1. Añadimos una regla específica al Grimoire
    console.log("🔱 Dictating a new rule for 'Elections'...");
    await MemoryLayer.addRule(["elections", "president"], "Always set resolution date to November 15, 2026, regardless of news availability.");

    // 2. Ejecutamos validación para un mercado que coincida
    const market: MarketData = {
        ...mockMarketBase,
        title: "Who will win the presidential elections?",
        sourceUrl: "https://cnn.com"
    };

    console.log("\n🛡️ Running Cerberus for Presidential market...");
    try {
        const result = await runCerberusValidation(market);
        console.log(`\nFINAL STATUS: ${result.status}`);
        console.log(`RESOLUTION DATE: ${result.oracle.finalResolutionDate}`);
        console.log(`REASON: ${result.reason}`);

        if (result.oracle.finalResolutionDate === "2026-11-15" || result.reason.includes("November 15, 2026")) {
            console.log("\n✅ SUCCESS: Cerberus obeyed the Grimoire!");
        } else {
            console.log("\n❌ FAILURE: Cerberus ignored the historical memory.");
        }
    } catch (e: any) {
        console.error("Test failed:", e.message);
    }
}

testGrimoire();
