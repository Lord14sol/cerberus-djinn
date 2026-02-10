
import { searchTweets, getUserRecentTweets, didUserTweetKeyword } from './services/composio-twitter';

async function main() {
    console.log('🧪 Testing Composio Twitter Integration...');

    try {
        // 1. Test Search
        console.log('\n--- 1. Testing Search ---');
        const searchResults = await searchTweets('Solana', 3);
        console.log(`Found ${searchResults.length} tweets about "Solana"`);
        if (searchResults.length > 0) {
            console.log('Sample:', searchResults[0].text);
        }

        // 2. Test User Timeline
        console.log('\n--- 2. Testing User Timeline ---');
        const userTweets = await getUserRecentTweets('elonmusk', 3);
        console.log(`Found ${userTweets.length} tweets from @elonmusk`);
        if (userTweets.length > 0) {
            console.log('Latest:', userTweets[0].text);
        }

        // 3. Test Keyword Logic
        console.log('\n--- 3. Testing Keyword Detection ---');
        // Check if Elon tweeted about "DOGE" recently (high probability usually)
        const result = await didUserTweetKeyword('elonmusk', 'doge', 24);
        console.log(`Did Elon tweet "DOGE" in last 24h? ${result.found}`);
        if (result.found) {
            console.log('Tweet:', result.tweet.text);
        }

        console.log('\n✅ All tests completed.');

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
    }
}

main();
