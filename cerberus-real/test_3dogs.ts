import 'dotenv/config';
import { runCerberusValidation } from './src/cerberus_engine.js';
import { MarketData } from './src/types.js';

const mockMarketBase = {
    publicKey: "test_market_id",
    creator: { wallet: "test_wallet" },
    pool: { yesShares: 0, noShares: 0, totalLiquidity: 0 },
    feesCollected: 0,
    createdAt: Date.now()
};

async function testCerberus() {
    console.log("🚀 TESTING CERBERUS 3-DOGS PROTOCOL\n");

    const cases = [
        {
            title: "Will Bitcoin reach 100k tonight?", // Low quality (too short, ambiguous)
            sourceUrl: "https://twitter.com",
            expected: "CANCELLED"
        },
        {
            title: "Will SpaceX Starship launch successfully on December 15, 2025?", // High quality, date in title/content
            sourceUrl: "https://spacex.com/news",
            expected: "LIVE"
        }
    ];

    for (const testCase of cases) {
        console.log(`\n--- Case: ${testCase.title} ---`);
        const market: MarketData = { ...mockMarketBase, ...testCase };

        try {
            const result = await runCerberusValidation(market);
            console.log(`RESULT STATUS: ${result.status}`);
            console.log(`REASON: ${result.reason}`);
            console.log(`QUALITY SCORE: ${result.oracle.resolvabilityScore}`);
            console.log(`DATES FOUND: ${JSON.stringify(result.hunter.foundDates)}`);
        } catch (e: any) {
            console.error("Test failed with error:", e.message);
        }
    }
}

testCerberus();
