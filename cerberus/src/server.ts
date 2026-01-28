// ============================================
// CERBERUS API SERVER
// Express server for Dashboard communication
// ============================================

import express, { Request, Response } from 'express';
import cors from 'cors';
import { CerberusOrchestrator, createOrchestrator } from './orchestrator.js';
import { CerberusConfig, DEFAULT_CONFIG, DashboardState } from './types.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Store for SSE clients
const sseClients: Set<Response> = new Set();

// Orchestrator instance
let orchestrator: CerberusOrchestrator;

// ═══════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════

/**
 * Health check
 */
app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        service: 'cerberus-oracle',
        version: '2.0.0',
        timestamp: Date.now()
    });
});

/**
 * Get dashboard state
 */
app.get('/api/dashboard', (req: Request, res: Response) => {
    const state = orchestrator.getDashboardState();
    res.json(state);
});

/**
 * Get all markets
 */
app.get('/api/markets', (req: Request, res: Response) => {
    const state = orchestrator.getDashboardState();
    res.json({
        success: true,
        markets: state.markets,
        stats: state.stats
    });
});

/**
 * Get specific market verdict
 */
app.get('/api/markets/:marketId', (req: Request, res: Response) => {
    const { marketId } = req.params;
    const verdict = orchestrator.getVerdict(marketId);

    if (!verdict) {
        return res.status(404).json({
            success: false,
            error: 'Market not found or not yet processed'
        });
    }

    res.json({
        success: true,
        verdict
    });
});

/**
 * Manually trigger verification for a market
 */
app.post('/api/markets/:marketId/verify', async (req: Request, res: Response) => {
    const { marketId } = req.params;

    try {
        const verdict = await orchestrator.verifyMarket(marketId);
        if (!verdict) {
            return res.status(404).json({
                success: false,
                error: 'Market not found'
            });
        }

        res.json({
            success: true,
            verdict
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Verification failed'
        });
    }
});

/**
 * Get all verdicts
 */
app.get('/api/verdicts', (req: Request, res: Response) => {
    const verdicts = orchestrator.getAllVerdicts();
    res.json({
        success: true,
        count: verdicts.length,
        verdicts
    });
});

/**
 * Get stats
 */
app.get('/api/stats', (req: Request, res: Response) => {
    const state = orchestrator.getDashboardState();
    res.json({
        success: true,
        stats: state.stats,
        lastUpdated: state.lastUpdated,
        isPolling: state.isPolling
    });
});

/**
 * Generate AI description for a market
 */
app.get('/api/markets/:marketId/description', (req: Request, res: Response) => {
    const { marketId } = req.params;
    const verdict = orchestrator.getVerdict(marketId);

    if (!verdict) {
        return res.status(404).json({
            success: false,
            error: 'Market not found'
        });
    }

    res.json({
        success: true,
        marketId,
        description: verdict.aiDescription,
        category: verdict.category,
        resolutionDate: verdict.resolutionDate
    });
});

/**
 * Server-Sent Events for real-time updates
 */
app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial state
    const state = orchestrator.getDashboardState();
    res.write(`data: ${JSON.stringify({ type: 'init', data: state })}\n\n`);

    sseClients.add(res);

    req.on('close', () => {
        sseClients.delete(res);
    });
});

/**
 * Broadcast event to all SSE clients
 */
function broadcastEvent(type: string, data: any): void {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    sseClients.forEach(client => {
        client.write(`data: ${message}\n\n`);
    });
}

// ═══════════════════════════════════════════
// SERVER INITIALIZATION
// ═══════════════════════════════════════════

export async function startServer(config?: Partial<CerberusConfig>): Promise<void> {
    const port = process.env.PORT || 3001;

    // Create and configure orchestrator
    orchestrator = createOrchestrator({
        ...DEFAULT_CONFIG,
        ...config,
        pollingIntervalMs: config?.pollingIntervalMs || 180000 // 3 minutes
    });

    // Set up event listeners for SSE broadcasting
    orchestrator.on('dashboard_update', (state: DashboardState) => {
        broadcastEvent('dashboard_update', state);
    });

    orchestrator.on('market_processed', (verdict) => {
        broadcastEvent('market_processed', verdict);
    });

    orchestrator.on('market_verified', (verdict) => {
        broadcastEvent('market_verified', verdict);
    });

    orchestrator.on('market_flagged', (verdict) => {
        broadcastEvent('market_flagged', verdict);
    });

    orchestrator.on('market_rejected', (verdict) => {
        broadcastEvent('market_rejected', verdict);
    });

    // Start server
    app.listen(port, () => {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🐕 CERBERUS API SERVER STARTED 🐕                         ║
║                                                              ║
║   Port: ${port}                                               ║
║   Dashboard: http://localhost:${port}/api/dashboard           ║
║   Events: http://localhost:${port}/api/events (SSE)           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
        `);
    });

    // Start orchestrator polling
    await orchestrator.start();
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    startServer();
}

export { app, orchestrator };
