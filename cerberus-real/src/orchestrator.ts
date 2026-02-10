// ============================================
// CERBERUS ORCHESTRATOR
// Main engine that coordinates 3-layer verification
// Polls every 3 minutes for new markets
// ============================================

import { EventEmitter } from 'events';
import {
    MarketData,
    CerberusVerdict,
    DashboardMarket,
    DashboardState,
    CerberusConfig,
    DEFAULT_CONFIG
} from './types.js';
import { runLayer1 } from './layers/layer1-gatherer.js';
import { runLayer2 } from './layers/layer2-confirmer.js';
import { runLayer3 } from './layers/layer3-validator.js';
import { runCerberusValidation } from './cerberus_engine.js';
import { DjinnClient, createDjinnClient } from './services/djinn-client.js';
import {
    checkTwitterMarket,
    extractTwitterMarketData,
    getPollingIntervalMs,
    TwitterMarketData,
    ResolutionReport,
} from './services/twitter-resolver.js';

export class CerberusOrchestrator extends EventEmitter {
    private config: CerberusConfig;
    private djinnClient: DjinnClient;
    private pollingInterval: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private processingQueue: Map<string, DashboardMarket> = new Map();
    private verifiedMarkets: Map<string, CerberusVerdict> = new Map();
    private dashboardState: DashboardState;

    // Twitter resolution tracking
    private twitterMarkets: Map<string, TwitterMarketData> = new Map();
    private twitterLastCheck: Map<string, number> = new Map();
    private twitterResolutionInterval: NodeJS.Timeout | null = null;

    constructor(config: Partial<CerberusConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.djinnClient = createDjinnClient(this.config);
        this.dashboardState = this.initDashboardState();
    }

    private initDashboardState(): DashboardState {
        return {
            markets: [],
            lastUpdated: Date.now(),
            isPolling: false,
            processingQueue: [],
            stats: {
                totalMarkets: 0,
                verified: 0,
                flagged: 0,
                rejected: 0,
                pending: 0
            }
        };
    }

    /**
     * Start the orchestrator with automatic polling
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.log('[ORCHESTRATOR] Already running');
            return;
        }

        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🐕 CERBERUS ORACLE - MARKET VERIFICATION SYSTEM 🐕        ║
║                                                              ║
║   Three-Headed Guardian of Prediction Markets                ║
║   Layer 1: Information Gatherer                              ║
║   Layer 2: Verification Confirmer                            ║
║   Layer 3: Final Source Validator                            ║
║                                                              ║
║   Polling Interval: ${(this.config.pollingIntervalMs / 1000 / 60).toFixed(1)} minutes                            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
        `);

        this.isRunning = true;
        this.dashboardState.isPolling = true;

        // Initial fetch
        await this.pollForNewMarkets();

        // Start polling interval
        this.pollingInterval = setInterval(
            () => this.pollForNewMarkets(),
            this.config.pollingIntervalMs
        );

        // Start Twitter resolution polling (every 5 min check which markets need checking)
        this.twitterResolutionInterval = setInterval(
            () => this.pollTwitterMarkets(),
            5 * 60 * 1000 // Check every 5 min which twitter markets are due
        );

        this.emit('started');
        console.log('[ORCHESTRATOR] Started - Polling for new markets...');
        console.log('[ORCHESTRATOR] 🐦 Twitter resolution polling active (every 5 min)\n');
    }

    /**
     * Stop the orchestrator
     */
    stop(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        if (this.twitterResolutionInterval) {
            clearInterval(this.twitterResolutionInterval);
            this.twitterResolutionInterval = null;
        }
        this.isRunning = false;
        this.dashboardState.isPolling = false;
        this.emit('stopped');
        console.log('[ORCHESTRATOR] Stopped');
    }

    /**
     * Poll for new markets and process them
     */
    async pollForNewMarkets(): Promise<void> {
        console.log(`\n[ORCHESTRATOR] 🔄 Polling for new markets... (${new Date().toLocaleTimeString()})`);

        try {
            const newMarkets = await this.djinnClient.fetchNewMarkets();

            if (newMarkets.length === 0) {
                console.log('[ORCHESTRATOR] No new markets found');
                return;
            }

            console.log(`[ORCHESTRATOR] Found ${newMarkets.length} new market(s) to verify`);

            // Process each market
            for (const market of newMarkets) {
                await this.processMarket(market);
            }

            this.updateDashboardStats();
            this.emit('poll_complete', this.dashboardState);

        } catch (error) {
            console.error('[ORCHESTRATOR] Error polling for markets:', error);
            this.emit('error', error);
        }
    }

    /**
     * Process a single market through the 3 Dogs Validation Engine
     */
    async processMarket(market: MarketData): Promise<CerberusVerdict> {
        const startTime = Date.now();

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🐕 CERBERUS 3-DOGS VALIDATION STARTING`);
        console.log(`Market: ${market.title}`);
        console.log(`ID: ${market.publicKey}`);
        console.log(`Creator: ${market.creator.wallet}`);
        console.log(`URL: ${market.sourceUrl}`);
        console.log(`${'═'.repeat(60)}`);

        // Create dashboard market entry
        const dashboardMarket: DashboardMarket = {
            ...market,
            verificationStatus: 'pending_verification',
            currentLayer: 0,
            layerProgress: {
                layer1: 'pending',
                layer2: 'pending',
                layer3: 'pending'
            },
            checkmark: false,
            resolutionDate: null,
            aiDescription: null
        };

        this.processingQueue.set(market.publicKey, dashboardMarket);
        this.updateDashboard(dashboardMarket);

        // ═══════════════════════════════════════════
        // THE 3 DOGS ENGINE
        // ═══════════════════════════════════════════
        dashboardMarket.verificationStatus = 'layer1_processing';
        this.updateDashboard(dashboardMarket);

        const validation = await runCerberusValidation(market);

        // Mapping to legacy CerberusVerdict for UI
        const totalTime = Date.now() - startTime;

        const verdict: CerberusVerdict = {
            marketId: market.publicKey,
            marketTitle: market.title,
            timestamp: Date.now(),
            layer1: {
                passed: validation.sentry.urlValid,
                sourceAccessible: validation.sentry.urlValid,
                sourceContent: null,
                extractedFacts: [],
                newsArticles: [],
                socialMentions: [],
                hasEnoughInformation: true,
                summary: "Sentry Check Complete",
                processingTime: 0
            },
            layer2: {
                passed: validation.status !== 'CANCELLED',
                layer1Confirmed: true,
                isResolvable: validation.oracle.isQualityMarket,
                hasClearOutcome: true,
                isObjective: true,
                hasVerifiableDate: validation.oracle.hasDate,
                suggestedResolutionDate: validation.oracle.finalResolutionDate,
                riskFlags: [],
                confidenceScore: validation.oracle.resolvabilityScore,
                reasoning: validation.hunter.reasoning,
                processingTime: 0
            },
            layer3: {
                passed: validation.status === 'LIVE',
                sourceIsReal: true,
                eventIsReal: true,
                sourceTrustworthy: true,
                dateIsValid: validation.oracle.hasDate,
                finalVerdict: validation.status === 'LIVE' ? 'VERIFIED' : (validation.status === 'AWAITING_MANUAL_DATE' ? 'UNRESOLVABLE' : 'REJECTED'),
                checkmarkEarned: validation.status === 'LIVE',
                generatedDescription: validation.reason,
                resolutionDate: validation.oracle.finalResolutionDate || "AWAITING_LORD",
                category: market.category || 'other',
                reasoning: validation.oracle.reason,
                processingTime: 0
            },
            finalStatus: validation.status === 'LIVE' ? 'VERIFIED' : (validation.status === 'AWAITING_MANUAL_DATE' ? 'UNRESOLVABLE' : 'REJECTED'),
            action: validation.status === 'LIVE' ? 'APPROVE' : (validation.status === 'AWAITING_MANUAL_DATE' ? 'MANUAL_REVIEW' : 'REFUND_AND_DELETE'),
            checkmark: validation.status === 'LIVE',
            resolutionDate: validation.oracle.finalResolutionDate,
            aiDescription: validation.reason,
            category: market.category || 'other',
            totalProcessingTime: totalTime,
            verifiedAt: validation.status === 'LIVE' ? Date.now() : null
        };

        // Update dashboard market with final results
        dashboardMarket.verificationStatus = validation.status === 'LIVE' ? 'verified' : (validation.status === 'AWAITING_MANUAL_DATE' ? 'awaiting_manual_date' : 'rejected');
        dashboardMarket.verdict = verdict;
        dashboardMarket.checkmark = verdict.checkmark;
        dashboardMarket.resolutionDate = verdict.resolutionDate;
        dashboardMarket.aiDescription = verdict.aiDescription;
        dashboardMarket.currentLayer = 3;
        dashboardMarket.layerProgress = {
            layer1: validation.sentry.urlValid ? 'passed' : 'failed',
            layer2: validation.status !== 'CANCELLED' ? 'passed' : 'failed',
            layer3: validation.status === 'LIVE' ? 'passed' : (validation.status === 'AWAITING_MANUAL_DATE' ? 'processing' : 'failed')
        };
        dashboardMarket.resolutionDate = verdict.resolutionDate;
        dashboardMarket.aiDescription = verdict.aiDescription;
        this.updateDashboard(dashboardMarket);

        // Store verdict
        this.verifiedMarkets.set(market.publicKey, verdict);

        // Send result to Djinn
        await this.djinnClient.sendVerificationResult(verdict);

        // If rejected, request refund
        if (verdict.action === 'REFUND_AND_DELETE') {
            await this.djinnClient.requestRefund(market.publicKey, verdict.layer3.reasoning);
        }

        // Print final result
        this.printVerdict(verdict);

        this.emit('market_processed', verdict);
        return verdict;
    }

    private createRejectedVerdict(
        market: MarketData,
        layer1: any,
        layer2: any,
        layer3: any,
        startTime: number
    ): CerberusVerdict {
        const verdict: CerberusVerdict = {
            marketId: market.publicKey,
            marketTitle: market.title,
            timestamp: Date.now(),
            layer1,
            layer2: layer2 || {
                passed: false,
                layer1Confirmed: false,
                isResolvable: false,
                hasClearOutcome: false,
                isObjective: false,
                hasVerifiableDate: false,
                suggestedResolutionDate: null,
                riskFlags: ['layer1_failed'],
                confidenceScore: 0,
                reasoning: 'Layer 1 failed - insufficient information',
                processingTime: 0
            },
            layer3: layer3 || {
                passed: false,
                sourceIsReal: false,
                eventIsReal: false,
                sourceTrustworthy: false,
                dateIsValid: false,
                finalVerdict: 'REJECTED',
                checkmarkEarned: false,
                generatedDescription: 'Market rejected due to verification failure',
                resolutionDate: '',
                category: 'other',
                reasoning: 'Verification failed at Layer 1',
                processingTime: 0
            },
            finalStatus: 'REJECTED',
            action: 'REFUND_AND_DELETE',
            checkmark: false,
            resolutionDate: null,
            aiDescription: 'Market rejected - insufficient verifiable information',
            category: 'other',
            totalProcessingTime: Date.now() - startTime,
            verifiedAt: null
        };

        this.verifiedMarkets.set(market.publicKey, verdict);
        this.emit('market_rejected', verdict);
        return verdict;
    }

    private createFlaggedVerdict(
        market: MarketData,
        layer1: any,
        layer2: any,
        layer3: any,
        startTime: number
    ): CerberusVerdict {
        const verdict: CerberusVerdict = {
            marketId: market.publicKey,
            marketTitle: market.title,
            timestamp: Date.now(),
            layer1,
            layer2,
            layer3: layer3 || {
                passed: false,
                sourceIsReal: layer1.sourceAccessible,
                eventIsReal: false,
                sourceTrustworthy: false,
                dateIsValid: !!layer2.suggestedResolutionDate,
                finalVerdict: 'FLAGGED',
                checkmarkEarned: false,
                generatedDescription: 'Market flagged for manual review',
                resolutionDate: layer2.suggestedResolutionDate || '',
                category: market.category || 'other',
                reasoning: 'Layer 2 raised concerns - manual review required',
                processingTime: 0
            },
            finalStatus: 'FLAGGED',
            action: 'MANUAL_REVIEW',
            checkmark: false,
            resolutionDate: layer2.suggestedResolutionDate,
            aiDescription: 'Market flagged for manual review - some verification concerns detected',
            category: market.category || 'other',
            totalProcessingTime: Date.now() - startTime,
            verifiedAt: null
        };

        this.verifiedMarkets.set(market.publicKey, verdict);
        this.emit('market_flagged', verdict);
        return verdict;
    }

    private updateDashboard(market: DashboardMarket): void {
        const index = this.dashboardState.markets.findIndex(
            m => m.publicKey === market.publicKey
        );

        if (index >= 0) {
            this.dashboardState.markets[index] = market;
        } else {
            this.dashboardState.markets.unshift(market);
        }

        this.dashboardState.lastUpdated = Date.now();
        this.dashboardState.processingQueue = Array.from(this.processingQueue.keys());

        this.emit('dashboard_update', this.dashboardState);
    }

    private updateDashboardStats(): void {
        const markets = this.dashboardState.markets;
        this.dashboardState.stats = {
            totalMarkets: markets.length,
            verified: markets.filter(m => m.verificationStatus === 'verified').length,
            flagged: markets.filter(m => m.verificationStatus === 'flagged').length,
            rejected: markets.filter(m => m.verificationStatus === 'rejected').length,
            pending: markets.filter(m =>
                m.verificationStatus === 'pending_verification' ||
                m.verificationStatus.includes('processing')
            ).length
        };
    }

    private printVerdict(verdict: CerberusVerdict): void {
        console.log(`\n${'═'.repeat(60)}`);

        if (verdict.checkmark) {
            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ✅🟤 MARKET VERIFIED - CHECKMARK EARNED! 🟤✅            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
            `);
        } else if (verdict.finalStatus === 'FLAGGED') {
            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ⚠️  MARKET FLAGGED - MANUAL REVIEW REQUIRED  ⚠️          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
            `);
        } else {
            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ❌ MARKET REJECTED - REFUND INITIATED ❌                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
            `);
        }

        console.log(`Market: ${verdict.marketTitle}`);
        console.log(`Status: ${verdict.finalStatus}`);
        console.log(`Action: ${verdict.action}`);
        if (verdict.resolutionDate) {
            console.log(`Resolution Date: ${verdict.resolutionDate}`);
        }
        if (verdict.category) {
            console.log(`Category: ${verdict.category}`);
        }
        console.log(`Processing Time: ${verdict.totalProcessingTime}ms`);
        console.log(`${'═'.repeat(60)}\n`);
    }

    /**
     * Get current dashboard state
     */
    getDashboardState(): DashboardState {
        return this.dashboardState;
    }

    /**
     * Get verdict for a specific market
     */
    getVerdict(marketId: string): CerberusVerdict | undefined {
        return this.verifiedMarkets.get(marketId);
    }

    /**
     * Get all verdicts
     */
    getAllVerdicts(): CerberusVerdict[] {
        return Array.from(this.verifiedMarkets.values());
    }

    /**
     * Get a direct response from the Oracle (LLM)
     */
    async getAIResponse(message: string): Promise<string> {
        console.log(`[ORCHESTRATOR] User interrogation: ${message}`);

        try {
            const { queryLLM } = await import('./llm_layer.js');
            const context = this.dashboardState.markets.slice(0, 5).map(m => ({
                title: m.title,
                status: m.verificationStatus
            }));

            const verdict = await queryLLM(message, "INTERACTION_PROTOCOL", context);
            return verdict.reasoning_summary;
        } catch (error: any) {
            console.error('[ORCHESTRATOR] Error getting AI response:', error.message || error);
            // Si es un error de Gemini, intentamos dar una respuesta más descriptiva
            if (error.status === 403 || error.status === 404) {
                return "The Oracle's connection to the Celestials (Gemini) is forbidden or misaligned. Check the Sacred Key (API Key).";
            }
            return "My cognitive circuits are experiencing interference. Please repeat your inquiry.";
        }
    }

    /**
     * Manually verify a specific market
     */
    async verifyMarket(marketId: string): Promise<CerberusVerdict | null> {
        const market = await this.djinnClient.getMarket(marketId);
        if (!market) {
            console.log(`[ORCHESTRATOR] Market not found: ${marketId}`);
            return null;
        }
        return this.processMarket(market);
    }

    // ═══════════════════════════════════════════
    // TWITTER MARKET RESOLUTION (EARLY RESOLVE)
    // ═══════════════════════════════════════════

    /**
     * Register a verified Twitter market for resolution monitoring
     * Called after DOG 1-3 verify the market as LIVE
     */
    registerTwitterMarket(market: MarketData & {
        target_username?: string;
        target_keyword?: string;
        target_tweet_id?: string;
        twitter_market_type?: string;
        metric_threshold?: number;
    }): void {
        const twitterData = extractTwitterMarketData(market);
        if (!twitterData) return;

        this.twitterMarkets.set(market.publicKey, twitterData);
        console.log(`[ORCHESTRATOR] 🐦 Registered Twitter market for monitoring: "${market.title}"`);
        console.log(`[ORCHESTRATOR]    Type: ${twitterData.twitterMarketType}`);
        console.log(`[ORCHESTRATOR]    Target: @${twitterData.targetUsername || '?'} / keyword: "${twitterData.targetKeyword || '?'}"`);
        console.log(`[ORCHESTRATOR]    Expires: ${new Date(twitterData.expiresAt).toISOString()}`);
    }

    /**
     * Poll all registered Twitter markets, respecting dynamic intervals
     */
    private async pollTwitterMarkets(): Promise<void> {
        if (this.twitterMarkets.size === 0) return;

        const now = Date.now();
        console.log(`\n[ORCHESTRATOR] 🐦 Checking ${this.twitterMarkets.size} Twitter market(s)... (${new Date().toLocaleTimeString()})`);

        for (const [marketId, twitterData] of this.twitterMarkets) {
            const lastCheck = this.twitterLastCheck.get(marketId) || 0;
            const interval = getPollingIntervalMs(twitterData);

            if (now - lastCheck < interval) {
                continue;
            }

            this.twitterLastCheck.set(marketId, now);

            try {
                const report = await checkTwitterMarket(twitterData);

                switch (report.result) {
                    case 'YES':
                    case 'NO':
                        console.log(`[ORCHESTRATOR] 🐦 ✅ Twitter market RESOLVED: ${report.result}`);
                        console.log(`[ORCHESTRATOR]    Evidence: ${report.evidence}`);

                        await this.resolveTwitterMarketOnDjinn(marketId, report);
                        this.twitterMarkets.delete(marketId);
                        this.twitterLastCheck.delete(marketId);
                        break;

                    case 'PENDING': {
                        const hoursLeft = (twitterData.expiresAt - now) / (1000 * 60 * 60);
                        console.log(`[ORCHESTRATOR] 🐦 ⏳ Market pending. ${hoursLeft.toFixed(1)}h left. Next check in ${(interval / 60000).toFixed(0)}min`);
                        break;
                    }

                    case 'UNCERTAIN':
                        console.log(`[ORCHESTRATOR] 🐦 ⚠️ Uncertain: ${report.evidence}`);
                        break;
                }
            } catch (err: any) {
                console.error(`[ORCHESTRATOR] 🐦 Error checking market ${marketId}: ${err.message}`);
            }
        }
    }

    /**
     * Send Twitter resolution result to Djinn frontend
     */
    private async resolveTwitterMarketOnDjinn(
        marketId: string,
        report: ResolutionReport
    ): Promise<void> {
        try {
            const verdict: Partial<CerberusVerdict> = {
                marketId,
                timestamp: Date.now(),
                finalStatus: 'VERIFIED',
                action: 'APPROVE',
                checkmark: true,
                aiDescription: report.evidence,
                totalProcessingTime: 0,
                verifiedAt: Date.now(),
            };

            await this.djinnClient.sendVerificationResult(verdict as CerberusVerdict);

            this.emit('twitter_market_resolved', {
                marketId,
                result: report.result,
                evidence: report.evidence,
                isEarlyResolution: report.isEarlyResolution,
            });

            console.log(`[ORCHESTRATOR] 🐦 Resolution sent to Djinn for market ${marketId}: ${report.result}`);
        } catch (err: any) {
            console.error(`[ORCHESTRATOR] 🐦 Failed to send resolution to Djinn: ${err.message}`);
        }
    }

    /**
     * Get Twitter markets status for dashboard
     */
    getTwitterMarketsStatus(): Array<{
        marketId: string;
        title: string;
        type: string;
        target: string;
        hoursLeft: number;
        lastChecked: string;
        nextCheckIn: string;
    }> {
        const now = Date.now();
        return Array.from(this.twitterMarkets.entries()).map(([id, data]) => {
            const lastCheck = this.twitterLastCheck.get(id) || 0;
            const interval = getPollingIntervalMs(data);
            const nextCheck = lastCheck + interval;

            return {
                marketId: id,
                title: data.title,
                type: data.twitterMarketType,
                target: `@${data.targetUsername || '?'} / "${data.targetKeyword || '?'}"`,
                hoursLeft: Math.max(0, (data.expiresAt - now) / (1000 * 60 * 60)),
                lastChecked: lastCheck ? new Date(lastCheck).toLocaleTimeString() : 'never',
                nextCheckIn: `${Math.max(0, (nextCheck - now) / 60000).toFixed(0)}min`,
            };
        });
    }
}

export function createOrchestrator(config?: Partial<CerberusConfig>): CerberusOrchestrator {
    return new CerberusOrchestrator(config);
}
