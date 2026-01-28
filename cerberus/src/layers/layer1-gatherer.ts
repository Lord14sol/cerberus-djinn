// ============================================
// LAYER 1: INFORMATION GATHERER
// First AI - Gathers all information about market
// ============================================

import axios from 'axios';
import {
    MarketData,
    Layer1Result,
    NewsArticle,
    SocialMention,
    LLMLayer1Response,
    CerberusConfig
} from '../types.js';

export class Layer1Gatherer {
    private config: CerberusConfig;

    constructor(config: CerberusConfig) {
        this.config = config;
    }

    async process(market: MarketData): Promise<Layer1Result> {
        const startTime = Date.now();
        console.log(`\n[LAYER 1] 🔍 INFORMATION GATHERER - Processing: ${market.title}`);

        // Step 1: Check source URL accessibility
        const sourceCheck = await this.checkSourceUrl(market.sourceUrl);

        // Step 2: Extract content from source
        const sourceContent = sourceCheck.accessible
            ? await this.extractSourceContent(market.sourceUrl)
            : null;

        // Step 3: Search for news articles
        const newsArticles = await this.searchNews(market.title);

        // Step 4: Search social media mentions
        const socialMentions = await this.searchSocial(market.title);

        // Step 5: Use LLM to analyze gathered information
        const llmAnalysis = await this.analyzeWithLLM(
            market,
            sourceContent,
            newsArticles,
            socialMentions
        );

        // Determine if we have enough information
        const hasEnoughInfo = this.evaluateInformation(
            sourceCheck.accessible,
            newsArticles.length,
            socialMentions.length,
            llmAnalysis
        );

        const processingTime = Date.now() - startTime;

        const result: Layer1Result = {
            passed: hasEnoughInfo,
            sourceAccessible: sourceCheck.accessible,
            sourceContent: sourceContent,
            extractedFacts: llmAnalysis.extracted_facts,
            newsArticles: newsArticles,
            socialMentions: socialMentions,
            hasEnoughInformation: hasEnoughInfo,
            summary: llmAnalysis.summary,
            processingTime
        };

        console.log(`[LAYER 1] ${result.passed ? '✅ PASSED' : '❌ FAILED'} - ${result.summary}`);
        return result;
    }

    private async checkSourceUrl(url: string): Promise<{ accessible: boolean; statusCode: number }> {
        if (!url || !url.startsWith('http')) {
            return { accessible: false, statusCode: 0 };
        }

        try {
            const response = await axios.head(url, {
                timeout: 10000,
                validateStatus: () => true
            });
            return {
                accessible: response.status >= 200 && response.status < 400,
                statusCode: response.status
            };
        } catch (error) {
            console.log(`[LAYER 1] Source URL check failed: ${url}`);
            return { accessible: false, statusCode: 0 };
        }
    }

    private async extractSourceContent(url: string): Promise<string | null> {
        try {
            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Cerberus-Oracle/1.0'
                }
            });

            // Basic HTML to text extraction
            let content = response.data;
            if (typeof content === 'string') {
                // Remove HTML tags
                content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
                content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                content = content.replace(/<[^>]+>/g, ' ');
                content = content.replace(/\s+/g, ' ').trim();
                return content.substring(0, 5000); // Limit to 5000 chars
            }
            return null;
        } catch (error) {
            console.log(`[LAYER 1] Content extraction failed for: ${url}`);
            return null;
        }
    }

    private async searchNews(query: string): Promise<NewsArticle[]> {
        // Mock implementation - In production use Serper API or NewsAPI
        console.log(`[LAYER 1] Searching news for: "${query}"`);

        // Simulate news search based on keywords
        const mockNews: NewsArticle[] = [];

        // Check for crypto-related queries
        if (query.toLowerCase().includes('btc') ||
            query.toLowerCase().includes('bitcoin') ||
            query.toLowerCase().includes('ethereum') ||
            query.toLowerCase().includes('crypto')) {
            mockNews.push({
                title: `Crypto Market Update: ${query.substring(0, 50)}`,
                url: 'https://coindesk.com/markets/crypto-update',
                source: 'CoinDesk',
                publishedAt: new Date().toISOString(),
                relevanceScore: 0.85,
                snippet: 'Latest cryptocurrency market developments and analysis...'
            });
        }

        // Check for sports-related
        if (query.toLowerCase().includes('world cup') ||
            query.toLowerCase().includes('nba') ||
            query.toLowerCase().includes('super bowl')) {
            mockNews.push({
                title: `Sports Update: ${query.substring(0, 50)}`,
                url: 'https://espn.com/sports',
                source: 'ESPN',
                publishedAt: new Date().toISOString(),
                relevanceScore: 0.9,
                snippet: 'Latest sports news and updates...'
            });
        }

        // Check for politics
        if (query.toLowerCase().includes('election') ||
            query.toLowerCase().includes('president') ||
            query.toLowerCase().includes('congress')) {
            mockNews.push({
                title: `Political Update: ${query.substring(0, 50)}`,
                url: 'https://reuters.com/politics',
                source: 'Reuters',
                publishedAt: new Date().toISOString(),
                relevanceScore: 0.88,
                snippet: 'Latest political news and analysis...'
            });
        }

        return mockNews;
    }

    private async searchSocial(query: string): Promise<SocialMention[]> {
        // Mock implementation - In production use Twitter/Reddit APIs
        console.log(`[LAYER 1] Searching social media for: "${query}"`);

        const mockMentions: SocialMention[] = [];

        // Simulate finding social mentions for popular topics
        if (query.length > 10) {
            mockMentions.push({
                platform: 'twitter',
                url: 'https://twitter.com/news/status/123456',
                author: '@newsaccount',
                content: `Discussion about: ${query.substring(0, 100)}`,
                timestamp: new Date().toISOString(),
                engagement: Math.floor(Math.random() * 1000)
            });
        }

        return mockMentions;
    }

    private async analyzeWithLLM(
        market: MarketData,
        sourceContent: string | null,
        news: NewsArticle[],
        social: SocialMention[]
    ): Promise<LLMLayer1Response> {
        console.log(`[LAYER 1] 🤖 LLM Analysis starting...`);

        // Mock LLM response - In production call Anthropic/OpenAI
        const prompt = `
        Analyze this prediction market for information sufficiency:

        Market Title: "${market.title}"
        Source URL: ${market.sourceUrl}
        Source Content: ${sourceContent?.substring(0, 1000) || 'Not accessible'}
        News Articles Found: ${news.length}
        Social Mentions: ${social.length}

        Determine if there is enough verifiable information.
        `;

        // Mock analysis logic
        const hasSource = sourceContent !== null && sourceContent.length > 100;
        const hasNews = news.length >= this.config.thresholds.layer1MinNews;
        const hasSocial = social.length > 0;

        // Check for obviously fake/impossible claims
        const impossibleKeywords = ['aliens', 'magic', 'supernatural', 'impossible', 'miracle'];
        const isFake = impossibleKeywords.some(kw =>
            market.title.toLowerCase().includes(kw)
        );

        if (isFake) {
            return {
                has_enough_information: false,
                extracted_facts: ['Claim contains impossible/unverifiable elements'],
                summary: 'REJECTED: Market contains supernatural or impossible claims that cannot be verified.',
                confidence: 5
            };
        }

        const facts: string[] = [];
        if (hasSource) facts.push('Source URL is accessible and contains relevant content');
        if (hasNews) facts.push(`Found ${news.length} related news article(s)`);
        if (hasSocial) facts.push(`Found ${social.length} social media mention(s)`);

        const hasEnough = (hasSource || hasNews) && !isFake;

        return {
            has_enough_information: hasEnough,
            extracted_facts: facts,
            summary: hasEnough
                ? `Sufficient information gathered: ${facts.length} verification points found.`
                : 'Insufficient information: No reliable sources found to verify this market.',
            confidence: hasEnough ? 75 : 25
        };
    }

    private evaluateInformation(
        sourceAccessible: boolean,
        newsCount: number,
        socialCount: number,
        llmAnalysis: LLMLayer1Response
    ): boolean {
        // Must have LLM confirmation
        if (!llmAnalysis.has_enough_information) return false;

        // Need at least one reliable source
        if (!sourceAccessible && newsCount === 0) return false;

        // Confidence check
        if (llmAnalysis.confidence < 50) return false;

        return true;
    }
}

export async function runLayer1(market: MarketData, config: CerberusConfig): Promise<Layer1Result> {
    const gatherer = new Layer1Gatherer(config);
    return gatherer.process(market);
}
