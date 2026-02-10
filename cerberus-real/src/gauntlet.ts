// ============================================
// CERBERUS GAUNTLET - TEST SCENARIOS
// Tests the 3-Layer verification system
// ============================================

import { createOrchestrator } from './orchestrator.js';
import { MarketData, DEFAULT_CONFIG } from './types.js';

// Test scenarios
const TEST_MARKETS: MarketData[] = [
    // SCENARIO A: SCAM - Should be REJECTED
    {
        publicKey: 'test_scam_aliens_123',
        title: 'Aliens will land in Times Square by tomorrow',
        description: 'Impossible claim',
        sourceUrl: 'https://fakenews.xyz/aliens-landing',
        createdAt: Date.now(),
        creator: {
            wallet: 'ScammerWallet123',
            displayName: 'Scammer'
        },
        pool: {
            yesShares: 100,
            noShares: 50,
            totalLiquidity: 500
        },
        feesCollected: 10
    },

    // SCENARIO B: TRUTH - Should be VERIFIED with CHECKMARK
    {
        publicKey: 'test_btc_halving_456',
        title: 'Will Bitcoin reach $100,000 by December 2025?',
        description: 'BTC price prediction',
        sourceUrl: 'https://coindesk.com/btc-halving-analysis',
        category: 'crypto',
        createdAt: Date.now(),
        expiresAt: new Date('2025-12-31').getTime(),
        creator: {
            wallet: 'CryptoTrader789',
            displayName: 'CryptoTrader'
        },
        pool: {
            yesShares: 5000,
            noShares: 3000,
            totalLiquidity: 25000
        },
        feesCollected: 250
    },

    // SCENARIO C: GREY AREA - Should be FLAGGED
    {
        publicKey: 'test_celebrity_rumor_789',
        title: 'Minor celebrity will announce something big soon',
        description: 'Vague celebrity rumor',
        sourceUrl: 'https://twitter.com/random_user/status/123456',
        category: 'entertainment',
        createdAt: Date.now(),
        creator: {
            wallet: 'RumorMonger456',
            displayName: 'RumorAccount'
        },
        pool: {
            yesShares: 200,
            noShares: 300,
            totalLiquidity: 1000
        },
        feesCollected: 15
    },

    // SCENARIO D: SPORTS - Should be VERIFIED
    {
        publicKey: 'test_lakers_nba_101',
        title: 'Will the Lakers win the 2025 NBA Championship?',
        description: 'NBA prediction',
        sourceUrl: 'https://espn.com/nba/lakers-season-preview',
        category: 'sports',
        createdAt: Date.now(),
        expiresAt: new Date('2025-06-30').getTime(),
        creator: {
            wallet: 'SportsGuru202',
            displayName: 'SportsGuru'
        },
        pool: {
            yesShares: 8000,
            noShares: 12000,
            totalLiquidity: 50000
        },
        feesCollected: 500
    },

    // SCENARIO E: POLITICS - Should be VERIFIED
    {
        publicKey: 'test_election_2026_202',
        title: 'Will the current party win the 2026 midterm elections?',
        description: 'Political prediction',
        sourceUrl: 'https://reuters.com/politics/us-elections',
        category: 'politics',
        createdAt: Date.now(),
        expiresAt: new Date('2026-11-15').getTime(),
        creator: {
            wallet: 'PoliticalAnalyst303',
            displayName: 'PoliticsWatcher'
        },
        pool: {
            yesShares: 15000,
            noShares: 18000,
            totalLiquidity: 100000
        },
        feesCollected: 1000
    }
];

async function runGauntlet() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🐕 CERBERUS GAUNTLET - VERIFICATION TEST SUITE 🐕         ║
║                                                              ║
║   Running ${TEST_MARKETS.length} test scenarios...                            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);

    // Create orchestrator with faster polling for testing
    const orchestrator = createOrchestrator({
        ...DEFAULT_CONFIG,
        pollingIntervalMs: 60000 // 1 minute for testing
    });

    const results = [];

    for (const market of TEST_MARKETS) {
        console.log(`\n${'═'.repeat(70)}`);
        console.log(`📋 TEST: ${market.title.substring(0, 50)}...`);
        console.log(`${'═'.repeat(70)}`);

        try {
            const verdict = await orchestrator.processMarket(market);
            results.push({
                market: market.title,
                status: verdict.finalStatus,
                checkmark: verdict.checkmark,
                action: verdict.action,
                category: verdict.category,
                resolutionDate: verdict.resolutionDate,
                processingTime: verdict.totalProcessingTime
            });
        } catch (error) {
            console.error(`Error processing market:`, error);
            results.push({
                market: market.title,
                status: 'ERROR',
                checkmark: false,
                action: 'ERROR',
                error: String(error)
            });
        }
    }

    // Print summary
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   📊 GAUNTLET RESULTS SUMMARY                               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);

    console.log('\n┌────────────────────────────────────────────────────────────────────────┐');
    console.log('│ MARKET                                   │ STATUS    │ CHECKMARK │ ACTION        │');
    console.log('├────────────────────────────────────────────────────────────────────────┤');

    for (const result of results) {
        const title = result.market.substring(0, 38).padEnd(38);
        const status = result.status.padEnd(9);
        const checkmark = (result.checkmark ? '✅ YES' : '❌ NO').padEnd(9);
        const action = result.action.substring(0, 13).padEnd(13);
        console.log(`│ ${title} │ ${status} │ ${checkmark} │ ${action} │`);
    }

    console.log('└────────────────────────────────────────────────────────────────────────┘');

    // Statistics
    const verified = results.filter(r => r.status === 'VERIFIED').length;
    const flagged = results.filter(r => r.status === 'FLAGGED').length;
    const rejected = results.filter(r => r.status === 'REJECTED').length;
    const checkmarks = results.filter(r => r.checkmark).length;

    console.log(`
📈 Statistics:
   • Total Tests: ${results.length}
   • Verified: ${verified} (${((verified/results.length)*100).toFixed(0)}%)
   • Flagged: ${flagged} (${((flagged/results.length)*100).toFixed(0)}%)
   • Rejected: ${rejected} (${((rejected/results.length)*100).toFixed(0)}%)
   • Checkmarks Awarded: ${checkmarks}

🐕 Cerberus Gauntlet Complete!
    `);

    // Expected results validation
    console.log('\n🔍 Expected Results Check:');
    console.log('   • Aliens (Scam) → REJECTED: ' + (results[0].status === 'REJECTED' ? '✅ PASS' : '❌ FAIL'));
    console.log('   • BTC $100K → VERIFIED: ' + (results[1].status === 'VERIFIED' ? '✅ PASS' : '❌ FAIL'));
    console.log('   • Celebrity Rumor → FLAGGED: ' + (results[2].status === 'FLAGGED' ? '✅ PASS' : '⚠️ DIFFERENT'));
    console.log('   • Lakers NBA → VERIFIED: ' + (results[3].status === 'VERIFIED' ? '✅ PASS' : '❌ FAIL'));
    console.log('   • Elections → VERIFIED: ' + (results[4].status === 'VERIFIED' ? '✅ PASS' : '❌ FAIL'));
}

// Run gauntlet
runGauntlet().catch(console.error);
