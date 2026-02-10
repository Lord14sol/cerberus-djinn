
import { didUserTweetKeyword, checkTweetMetric } from './composio-twitter';

// Types for resolution request
interface TwitterResolutionRequest {
    marketId: string;
    type: 'KEYWORD_MENTION' | 'METRIC_THRESHOLD';
    target: string; // @username or tweet_id
    condition: string; // keyword or threshold value
    deadline: number; // timestamp
}

interface ResolutionResult {
    resolved: boolean;
    outcome?: 'YES' | 'NO';
    reason?: string;
}

/**
 * Main resolver function for Twitter markets.
 * This function is called by the Orchestrator periodically.
 */
export async function resolveTwitterMarket(request: TwitterResolutionRequest): Promise<ResolutionResult> {
    console.log(`[RESOLVER] Checking Twitter Market: ${request.marketId} (${request.type})`);

    try {
        // 1. Check Deadline (Time Expiry)
        // If deadline passed and condition NOT met -> NO
        if (Date.now() > request.deadline) {
            console.log(`[RESOLVER] Market ${request.marketId} expired. Condition not met.`);
            return { resolved: true, outcome: 'NO', reason: 'Deadline exceeded without condition being met.' };
        }

        // 2. Check Condition based on Type
        if (request.type === 'KEYWORD_MENTION') {
            // Target: @username (e.g. @elonmusk)
            // Condition: keyword (e.g. "DOGE")
            const username = request.target;
            const keyword = request.condition;

            const result = await didUserTweetKeyword(username, keyword, 24); // Look back 24h dynamic

            if (result.found) {
                console.log(`[RESOLVER] KEYWORD FOUND! Market ${request.marketId} -> YES`);
                return {
                    resolved: true,
                    outcome: 'YES',
                    reason: `User ${username} tweeted "${keyword}"`
                };
            }
        }
        else if (request.type === 'METRIC_THRESHOLD') {
            // Target: tweet_id
            // Condition: threshold (e.g. 1000)
            // Metric type needs to be inferred or passed. Assuming LIKES for now or generic.
            const tweetId = request.target;
            const threshold = parseInt(request.condition, 10);

            // Allow metric to be part of condition string? e.g. "likes:1000"
            let metric: 'likes' | 'retweets' | 'replies' = 'likes';
            let val = threshold;

            if (request.condition.includes(':')) {
                const parts = request.condition.split(':');
                metric = parts[0] as any;
                val = parseInt(parts[1], 10);
            }

            const result = await checkTweetMetric(tweetId, metric, val);

            if (result.passed) {
                console.log(`[RESOLVER] THRESHOLD MET! Market ${request.marketId} -> YES`);
                return {
                    resolved: true,
                    outcome: 'YES',
                    reason: `Tweet ${tweetId} reached ${val} ${metric}`
                };
            }
        }

        // 3. Condition not met yet, but deadline active -> Wait
        return { resolved: false };

    } catch (error: any) {
        console.error(`[RESOLVER] Error resolving market ${request.marketId}:`, error.message);

        // Handle DELETED TWEET or USER NOT FOUND explicitly
        const errorMsg = (error.message || '').toLowerCase();
        if (errorMsg.includes('not found') || errorMsg.includes('deleted') || errorMsg.includes('suspended')) {
            console.log(`[RESOLVER] Target source DELETED/SUSPENDED. Market ${request.marketId} -> NO`);
            return {
                resolved: true,
                outcome: 'NO',
                reason: 'Source content was deleted or user suspended before resolution.'
            };
        }

        return { resolved: false, reason: 'API Error' };
    }
}
