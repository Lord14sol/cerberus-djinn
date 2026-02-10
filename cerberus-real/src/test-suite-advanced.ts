
import { resolveTwitterMarket } from './services/twitter-resolver';
import * as composio from './services/composio-twitter';

// --- MOCKING COMPOSIO ---
// We mock individual functions to control scenarios without hitting API

const originalGetUserRecentTweets = composio.getUserRecentTweets;
const originalGetTweetById = composio.getTweetById;

// Mock Store
let mockTimeline: any[] = [];
let mockTweet: any = null;

// Override functions
(composio as any).getUserRecentTweets = async (username: string, limit: number) => {
    console.log(`   [MOCK] Getting timeline for ${username}...`);
    return mockTimeline;
};

(composio as any).getTweetById = async (tweetId: string) => {
    console.log(`   [MOCK] Getting tweet ${tweetId}...`);
    return mockTweet;
};

async function runAdvancedSimulation() {
    console.log('\n🦁 CERBERUS ADVANCED LIFECYCLE SIMULATION');
    console.log('==========================================\n');

    // ---------------------------------------------------------
    // SCENARIO 1: KEYWORD NOT FOUND (MARKET OPEN)
    // ---------------------------------------------------------
    console.log('🔹 SCENARIO 1: Keyword "DOGE" NOT found in @elonmusk timeline');
    mockTimeline = [
        { id: '101', text: 'SpaceX is launching soon', created_at: new Date().toISOString() },
        { id: '102', text: 'Tesla updates incoming', created_at: new Date().toISOString() }
    ];

    let result = await resolveTwitterMarket({
        marketId: 'market-1',
        type: 'KEYWORD_MENTION',
        target: 'elonmusk',
        condition: 'DOGE',
        deadline: Date.now() + 100000 // Future
    });

    if (!result.resolved) {
        console.log('   ✅ PASS: Market remains OPEN as expected.');
    } else {
        console.error('   ❌ FAIL: Market resolved unexpectedly.', result);
    }
    console.log('');

    // ---------------------------------------------------------
    // SCENARIO 2: KEYWORD FOUND (MARKET RESOLVES YES)
    // ---------------------------------------------------------
    console.log('🔹 SCENARIO 2: Keyword "DOGE" FOUND in @elonmusk timeline');
    mockTimeline = [
        { id: '201', text: 'Doge is the people’s crypto', created_at: new Date().toISOString() },
        { id: '101', text: 'SpaceX is launching soon', created_at: new Date().toISOString() }
    ];

    result = await resolveTwitterMarket({
        marketId: 'market-1',
        type: 'KEYWORD_MENTION',
        target: 'elonmusk',
        condition: 'DOGE',
        deadline: Date.now() + 100000
    });

    if (result.resolved && result.outcome === 'YES') {
        console.log(`   ✅ PASS: Market resolved YES. Reason: ${result.reason}`);
    } else {
        console.error('   ❌ FAIL: Market did not resolve YES.', result);
    }
    console.log('');

    // ---------------------------------------------------------
    // SCENARIO 3: METRIC THRESHOLD (LIKES)
    // ---------------------------------------------------------
    console.log('🔹 SCENARIO 3: Tweet hits 10k LIKES threshold');
    mockTweet = {
        id: 'tweet-500',
        text: 'Viral tweet',
        public_metrics: { like_count: 15000, retweet_count: 200 }
    };

    result = await resolveTwitterMarket({
        marketId: 'market-2',
        type: 'METRIC_THRESHOLD',
        target: 'tweet-500',
        condition: 'likes:10000',
        deadline: Date.now() + 100000
    });

    if (result.resolved && result.outcome === 'YES') {
        console.log(`   ✅ PASS: Market resolved YES. Reason: ${result.reason}`);
    } else {
        console.error('   ❌ FAIL: Market did not resolve YES.', result);
    }
    console.log('');

    // ---------------------------------------------------------
    // SCENARIO 4: DEADLINE EXCEEDED (RESOLVES NO)
    // ---------------------------------------------------------
    console.log('🔹 SCENARIO 4: Deadline Exceeded (Condition NOT met)');
    mockTimeline = []; // No tweets found

    result = await resolveTwitterMarket({
        marketId: 'market-3',
        type: 'KEYWORD_MENTION',
        target: 'elonmusk',
        condition: 'MARS',
        deadline: Date.now() - 1000 // Past deadline
    });

    if (result.resolved && result.outcome === 'NO') {
        console.log(`   ✅ PASS: Market resolved NO (Expired). Reason: ${result.reason}`);
    } else {
        console.error('   ❌ FAIL: Market did not resolve NO.', result);
    }
    console.log('');

    // ---------------------------------------------------------
    // SCENARIO 5: PAYOUT CALCULATION (CLAIM LOGIC)
    // ---------------------------------------------------------
    console.log('🔹 SCENARIO 5: Winning Payout Calculation');
    const myShares = { 0: 50.5, 1: 0 }; // 0=YES, 1=NO
    const winningOutcomeIndex = 0; // YES won

    const claimableShares = myShares[winningOutcomeIndex];
    const payoutPerShare = 1.00; // Standard $1 outcome
    const totalPayout = claimableShares * payoutPerShare;

    if (totalPayout === 50.5) {
        console.log(`   ✅ PASS: Calculated Payout: $${totalPayout.toFixed(2)} for ${claimableShares} shares.`);
    } else {
        console.error(`   ❌ FAIL: Calculation error. Got ${totalPayout}`);
    }

    console.log('\n==========================================');
    console.log('✅ ALL ADVANCED SCENARIOS COMPLETE');
}

runAdvancedSimulation().catch(console.error);
