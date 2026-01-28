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
import { DjinnClient, createDjinnClient } from './services/djinn-client.js';

export class CerberusOrchestrator extends EventEmitter {
    private config: CerberusConfig;
    private djinnClient: DjinnClient;
    private pollingInterval: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private processingQueue: Map<string, DashboardMarket> = new Map();
    private verifiedMarkets: Map<string, CerberusVerdict> = new Map();
    private dashboardState: DashboardState;

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

        this.emit('started');
        console.log('[ORCHESTRATOR] Started - Polling for new markets...\n');
    }

    /**
     * Stop the orchestrator
     */
    stop(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
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
     * Process a single market through all 3 layers
     */
    async processMarket(market: MarketData): Promise<CerberusVerdict> {
        const startTime = Date.now();

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🐕 CERBERUS VERIFICATION STARTING`);
        console.log(`Market: ${market.title}`);
        console.log(`ID: ${market.publicKey}`);
        console.log(`Creator: ${market.creator.wallet}`);
        console.log(`Source: ${market.sourceUrl}`);
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
        // LAYER 1: INFORMATION GATHERER
        // ═══════════════════════════════════════════
        dashboardMarket.verificationStatus = 'layer1_processing';
        dashboardMarket.currentLayer = 1;
        dashboardMarket.layerProgress.layer1 = 'processing';
        this.updateDashboard(dashboardMarket);

        const layer1Result = await runLayer1(market, this.config);

        dashboardMarket.layerProgress.layer1 = layer1Result.passed ? 'passed' : 'failed';
        this.updateDashboard(dashboardMarket);

        if (!layer1Result.passed) {
            return this.createRejectedVerdict(market, layer1Result, null, null, startTime);
        }

        // ═══════════════════════════════════════════
        // LAYER 2: VERIFICATION CONFIRMER
        // ═══════════════════════════════════════════
        dashboardMarket.verificationStatus = 'layer2_processing';
        dashboardMarket.currentLayer = 2;
        dashboardMarket.layerProgress.layer2 = 'processing';
        this.updateDashboard(dashboardMarket);

        const layer2Result = await runLayer2(market, layer1Result, this.config);

        dashboardMarket.layerProgress.layer2 = layer2Result.passed ? 'passed' : 'failed';
        this.updateDashboard(dashboardMarket);

        if (!layer2Result.passed) {
            return this.createFlaggedVerdict(market, layer1Result, layer2Result, null, startTime);
        }

        // ═══════════════════════════════════════════
        // LAYER 3: FINAL SOURCE VALIDATOR
        // ═══════════════════════════════════════════
        dashboardMarket.verificationStatus = 'layer3_processing';
        dashboardMarket.currentLayer = 3;
        dashboardMarket.layerProgress.layer3 = 'processing';
        this.updateDashboard(dashboardMarket);

        const layer3Result = await runLayer3(market, layer1Result, layer2Result, this.config);

        dashboardMarket.layerProgress.layer3 = layer3Result.passed ? 'passed' : 'failed';
        this.updateDashboard(dashboardMarket);

        // ═══════════════════════════════════════════
        // CREATE FINAL VERDICT
        // ═══════════════════════════════════════════
        const totalTime = Date.now() - startTime;

        const verdict: CerberusVerdict = {
            marketId: market.publicKey,
            marketTitle: market.title,
            timestamp: Date.now(),
            layer1: layer1Result,
            layer2: layer2Result,
            layer3: layer3Result,
            finalStatus: layer3Result.finalVerdict === 'APPROVED' ? 'VERIFIED'
                : layer3Result.finalVerdict === 'FLAGGED' ? 'FLAGGED'
                : 'REJECTED',
            action: layer3Result.finalVerdict === 'APPROVED' ? 'APPROVE'
                : layer3Result.finalVerdict === 'FLAGGED' ? 'MANUAL_REVIEW'
                : 'REFUND_AND_DELETE',
            checkmark: layer3Result.checkmarkEarned,
            resolutionDate: layer3Result.resolutionDate,
            aiDescription: layer3Result.generatedDescription,
            category: layer3Result.category,
            totalProcessingTime: totalTime,
            verifiedAt: layer3Result.checkmarkEarned ? Date.now() : null
        };

        // Update dashboard market with final results
        dashboardMarket.verificationStatus = verdict.finalStatus === 'VERIFIED' ? 'verified'
            : verdict.finalStatus === 'FLAGGED' ? 'flagged'
            : 'rejected';
        dashboardMarket.verdict = verdict;
        dashboardMarket.checkmark = verdict.checkmark;
        dashboardMarket.resolutionDate = verdict.resolutionDate;
        dashboardMarket.aiDescription = verdict.aiDescription;
        this.updateDashboard(dashboardMarket);

        // Store verdict
        this.verifiedMarkets.set(market.publicKey, verdict);

        // Send result to Djinn
        await this.djinnClient.sendVerificationResult(verdict);

        // If rejected, request refund
        if (verdict.action === 'REFUND_AND_DELETE') {
            await this.djinnClient.requestRefund(market.publicKey, layer3Result.reasoning);
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
}

export function createOrchestrator(config?: Partial<CerberusConfig>): CerberusOrchestrator {
    return new CerberusOrchestrator(config);
}
