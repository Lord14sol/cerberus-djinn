// ============================================
// DJINN-PMARKET CLIENT
// Integration with Djinn Prediction Market API
// ============================================

import axios, { AxiosInstance } from 'axios';
import {
    MarketData,
    DjinnMarketsResponse,
    CerberusConfig,
    CerberusVerdict,
    WebhookPayload
} from '../types.js';

export class DjinnClient {
    private client: AxiosInstance;
    private config: CerberusConfig;
    private knownMarketIds: Set<string> = new Set();

    constructor(config: CerberusConfig) {
        this.config = config;
        this.client = axios.create({
            baseURL: config.djinnApiUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Cerberus-Oracle/1.0'
            }
        });
    }

    /**
     * Fetch all markets from Djinn-pmarket
     */
    async fetchAllMarkets(): Promise<MarketData[]> {
        try {
            console.log(`[DJINN] Fetching markets from ${this.config.djinnApiUrl}/markets`);

            const response = await this.client.get<DjinnMarketsResponse>('/markets');

            if (response.data.success && response.data.markets) {
                console.log(`[DJINN] Fetched ${response.data.markets.length} markets`);
                return response.data.markets;
            }

            return [];
        } catch (error) {
            console.log(`[DJINN] Error fetching markets: ${error}`);
            // Return mock data for development
            return this.getMockMarkets();
        }
    }

    /**
     * Fetch only new markets (not seen before)
     */
    async fetchNewMarkets(): Promise<MarketData[]> {
        const allMarkets = await this.fetchAllMarkets();

        const newMarkets = allMarkets.filter(market => {
            if (this.knownMarketIds.has(market.publicKey)) {
                return false;
            }
            this.knownMarketIds.add(market.publicKey);
            return true;
        });

        if (newMarkets.length > 0) {
            console.log(`[DJINN] Found ${newMarkets.length} new market(s)`);
        }

        return newMarkets;
    }

    /**
     * Fetch markets created in the last N minutes
     */
    async fetchRecentMarkets(minutes: number = 3): Promise<MarketData[]> {
        const allMarkets = await this.fetchAllMarkets();
        const cutoff = Date.now() - (minutes * 60 * 1000);

        return allMarkets.filter(market => market.createdAt >= cutoff);
    }

    /**
     * Get a specific market by ID
     */
    async getMarket(marketId: string): Promise<MarketData | null> {
        try {
            const response = await this.client.get<{ success: boolean; market: MarketData }>(
                `/markets/${marketId}`
            );

            if (response.data.success && response.data.market) {
                return response.data.market;
            }

            return null;
        } catch (error) {
            console.log(`[DJINN] Error fetching market ${marketId}: ${error}`);
            return null;
        }
    }

    /**
     * Send verification result back to Djinn
     */
    async sendVerificationResult(verdict: CerberusVerdict): Promise<boolean> {
        if (!this.config.webhookUrl) {
            console.log(`[DJINN] No webhook URL configured, skipping notification`);
            return false;
        }

        try {
            const payload: WebhookPayload = {
                event: verdict.finalStatus === 'VERIFIED' ? 'market_verified'
                    : verdict.finalStatus === 'FLAGGED' ? 'market_flagged'
                    : 'market_rejected',
                marketId: verdict.marketId,
                verdict,
                timestamp: Date.now()
            };

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            // Add webhook secret if configured
            if (this.config.webhookSecret) {
                // In production, use HMAC signature
                headers['X-Cerberus-Signature'] = this.generateSignature(payload);
            }

            await axios.post(this.config.webhookUrl, payload, { headers });
            console.log(`[DJINN] Verification result sent for market ${verdict.marketId}`);
            return true;
        } catch (error) {
            console.log(`[DJINN] Error sending verification result: ${error}`);
            return false;
        }
    }

    /**
     * Request refund for rejected market
     */
    async requestRefund(marketId: string, reason: string): Promise<boolean> {
        try {
            const response = await this.client.post(`/markets/${marketId}/refund`, {
                reason,
                requestedBy: 'cerberus-oracle'
            });

            return response.data.success === true;
        } catch (error) {
            console.log(`[DJINN] Error requesting refund for ${marketId}: ${error}`);
            return false;
        }
    }

    /**
     * Update market with verification data
     */
    async updateMarketVerification(
        marketId: string,
        data: {
            verified: boolean;
            checkmark: boolean;
            resolutionDate: string | null;
            aiDescription: string | null;
            category: string;
        }
    ): Promise<boolean> {
        try {
            const response = await this.client.patch(`/markets/${marketId}/verification`, data);
            return response.data.success === true;
        } catch (error) {
            console.log(`[DJINN] Error updating market verification: ${error}`);
            return false;
        }
    }

    /**
     * Generate webhook signature (mock - in production use HMAC-SHA256)
     */
    private generateSignature(payload: WebhookPayload): string {
        // In production: crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
        return `cerberus_${Date.now()}`;
    }

    /**
     * Mock markets for development/testing
     */
    private getMockMarkets(): MarketData[] {
        return [
            {
                publicKey: 'mock_market_1_' + Date.now(),
                title: 'Will Bitcoin reach $100,000 by end of 2025?',
                description: 'Prediction on BTC price target',
                sourceUrl: 'https://coindesk.com/btc-price-analysis',
                category: 'crypto',
                createdAt: Date.now() - 60000,
                expiresAt: new Date('2025-12-31').getTime(),
                creator: {
                    wallet: 'Abc123...xyz',
                    displayName: 'CryptoTrader'
                },
                pool: {
                    yesShares: 1000,
                    noShares: 800,
                    totalLiquidity: 5000
                },
                feesCollected: 50
            },
            {
                publicKey: 'mock_market_2_' + Date.now(),
                title: 'Will the Lakers win the 2025 NBA Championship?',
                description: 'NBA championship prediction',
                sourceUrl: 'https://espn.com/nba/lakers',
                category: 'sports',
                createdAt: Date.now() - 120000,
                expiresAt: new Date('2025-06-30').getTime(),
                creator: {
                    wallet: 'Def456...uvw',
                    displayName: 'SportsGuru'
                },
                pool: {
                    yesShares: 500,
                    noShares: 1200,
                    totalLiquidity: 3000
                },
                feesCollected: 30
            },
            {
                publicKey: 'mock_market_3_' + Date.now(),
                title: 'Aliens will land on Earth by tomorrow',
                description: 'Impossible claim',
                sourceUrl: 'https://fakenews.xyz/aliens',
                createdAt: Date.now() - 30000,
                creator: {
                    wallet: 'Ghi789...rst',
                    displayName: 'Scammer'
                },
                pool: {
                    yesShares: 100,
                    noShares: 50,
                    totalLiquidity: 500
                },
                feesCollected: 10
            },
            {
                publicKey: 'mock_market_4_' + Date.now(),
                title: 'Will SpaceX Starship complete an orbital flight in Q1 2026?',
                description: 'SpaceX milestone prediction',
                sourceUrl: 'https://spacex.com/starship',
                category: 'science',
                createdAt: Date.now() - 90000,
                expiresAt: new Date('2026-03-31').getTime(),
                creator: {
                    wallet: 'Jkl012...opq',
                    displayName: 'SpaceEnthusiast'
                },
                pool: {
                    yesShares: 2000,
                    noShares: 600,
                    totalLiquidity: 8000
                },
                feesCollected: 80
            }
        ];
    }

    /**
     * Reset known markets (for testing)
     */
    resetKnownMarkets(): void {
        this.knownMarketIds.clear();
    }
}

export function createDjinnClient(config: CerberusConfig): DjinnClient {
    return new DjinnClient(config);
}
