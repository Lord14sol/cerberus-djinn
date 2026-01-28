/**
 * CERBERUS ORACLE - HTTP Server
 * API REST para conexión con DJinn y otros servicios
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ENV, getConfig, isAdminAddress } from './core/config.js';
import { Market, MarketCategory, ValidationRequest, APIResponse } from './core/types.js';
import { validateMarket, quickValidate } from './validators/market.validator.js';
import { resolveMarket, isMarketReadyForResolution } from './resolvers/market.resolver.js';
import {
    initDatabase,
    getDatabase,
    insertMarket,
    getMarketById,
    getAllMarkets,
    getMarketsByStatus,
    getExpiredMarkets,
    updateMarketStatus,
    insertValidation,
    getValidationByMarketId,
    insertResolution,
    getResolutionByMarketId,
    insertAdminAction,
    logEvent,
    getStats,
} from './db/database.js';
import crypto from 'crypto';

const app = express();

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors());
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[API] ${req.method} ${req.path}`);
    next();
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API] Error:', err);
    res.status(500).json({
        success: false,
        error: err.message,
        timestamp: Date.now(),
    } as APIResponse);
});

// ============================================================================
// HEALTH & STATUS
// ============================================================================

app.get('/health', (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            status: 'ok',
            version: '1.0.0',
            uptime: process.uptime(),
        },
        timestamp: Date.now(),
    } as APIResponse);
});

app.get('/stats', (_req: Request, res: Response) => {
    try {
        const stats = getStats();
        res.json({
            success: true,
            data: stats,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// ============================================================================
// MARKET VALIDATION ENDPOINTS
// ============================================================================

// Quick validation (without LLM, just rules)
app.post('/validate/quick', (req: Request, res: Response) => {
    try {
        const { title, description, sourceUrl, category, expiresAt } = req.body;

        if (!title || !sourceUrl) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: title, sourceUrl',
                timestamp: Date.now(),
            } as APIResponse);
        }

        const result = quickValidate({
            marketId: 'preview',
            title,
            description: description || '',
            sourceUrl,
            category: category || 'other',
            expiresAt: expiresAt || Date.now() + 7 * 24 * 3600 * 1000,
        });

        res.json({
            success: true,
            data: result,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// Full validation (with LLM analysis)
app.post('/validate', async (req: Request, res: Response) => {
    try {
        const { marketId, title, description, sourceUrl, category, expiresAt } = req.body;

        if (!marketId || !title || !sourceUrl) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: marketId, title, sourceUrl',
                timestamp: Date.now(),
            } as APIResponse);
        }

        const validationRequest: ValidationRequest = {
            marketId,
            title,
            description: description || '',
            sourceUrl,
            category: category || 'other',
            expiresAt: expiresAt || Date.now() + 7 * 24 * 3600 * 1000,
        };

        const result = await validateMarket(validationRequest);

        // Guardar en base de datos
        insertValidation(result);
        logEvent('validation_completed', marketId, { status: result.status, score: result.score });

        res.json({
            success: true,
            data: result,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// ============================================================================
// MARKET RESOLUTION ENDPOINTS
// ============================================================================

// Resolve a market
app.post('/resolve/:marketId', async (req: Request, res: Response) => {
    try {
        const { marketId } = req.params;
        const { forcedResolution, adminAddress } = req.body;

        // Si es una resolución forzada, verificar admin
        if (forcedResolution && !isAdminAddress(adminAddress)) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized: Only admins can force resolution',
                timestamp: Date.now(),
            } as APIResponse);
        }

        // Obtener mercado de la base de datos
        const market = getMarketById(marketId);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found',
                timestamp: Date.now(),
            } as APIResponse);
        }

        const result = await resolveMarket({
            marketId,
            market,
            forcedResolution,
        });

        // Guardar en base de datos
        insertResolution(result);
        updateMarketStatus(marketId, `resolved_${result.outcome}` as any);
        logEvent('resolution_completed', marketId, {
            outcome: result.outcome,
            confidence: result.confidence,
        });

        res.json({
            success: true,
            data: result,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// Get resolution for a market
app.get('/resolution/:marketId', (req: Request, res: Response) => {
    try {
        const { marketId } = req.params;
        const resolution = getResolutionByMarketId(marketId);

        if (!resolution) {
            return res.status(404).json({
                success: false,
                error: 'Resolution not found',
                timestamp: Date.now(),
            } as APIResponse);
        }

        res.json({
            success: true,
            data: resolution,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// ============================================================================
// MARKET MANAGEMENT ENDPOINTS
// ============================================================================

// Register a new market
app.post('/markets', (req: Request, res: Response) => {
    try {
        const {
            id, title, description, sourceUrl, category,
            expiresAt, creatorAddress, poolAmount = 0,
        } = req.body;

        if (!id || !title || !sourceUrl || !creatorAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: id, title, sourceUrl, creatorAddress',
                timestamp: Date.now(),
            } as APIResponse);
        }

        const market: Market = {
            id,
            title,
            description: description || '',
            sourceUrl,
            category: category || 'other',
            createdAt: Date.now(),
            expiresAt: expiresAt || Date.now() + 7 * 24 * 3600 * 1000,
            status: 'pending_validation',
            poolAmount,
            feesCollected: 0,
            creatorAddress,
        };

        insertMarket(market);
        logEvent('market_submitted', id, { title, sourceUrl });

        res.status(201).json({
            success: true,
            data: market,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// Get all markets
app.get('/markets', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;
        const status = req.query.status as string;

        let markets: Market[];
        if (status) {
            markets = getMarketsByStatus(status as any);
        } else {
            markets = getAllMarkets(limit, offset);
        }

        res.json({
            success: true,
            data: markets,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// Get single market
app.get('/markets/:marketId', (req: Request, res: Response) => {
    try {
        const { marketId } = req.params;
        const market = getMarketById(marketId);

        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found',
                timestamp: Date.now(),
            } as APIResponse);
        }

        // Incluir validación y resolución si existen
        const validation = getValidationByMarketId(marketId);
        const resolution = getResolutionByMarketId(marketId);

        res.json({
            success: true,
            data: {
                market,
                validation,
                resolution,
            },
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// Get markets pending resolution
app.get('/markets/pending/resolution', (_req: Request, res: Response) => {
    try {
        const config = getConfig();
        const expiredMarkets = getExpiredMarkets();

        // Filtrar los que están listos para resolución
        const pendingResolution = expiredMarkets.filter(market => {
            const closingTime = market.expiresAt + config.closingDelayHours * 3600 * 1000;
            return Date.now() >= closingTime && !getResolutionByMarketId(market.id);
        });

        res.json({
            success: true,
            data: pendingResolution,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

// Admin action
app.post('/admin/action', async (req: Request, res: Response) => {
    try {
        const { adminAddress, marketId, actionType, reason, newValue } = req.body;

        if (!isAdminAddress(adminAddress)) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized: Not an admin address',
                timestamp: Date.now(),
            } as APIResponse);
        }

        const market = getMarketById(marketId);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found',
                timestamp: Date.now(),
            } as APIResponse);
        }

        const previousState = { ...market };

        // Ejecutar acción
        switch (actionType) {
            case 'manual_approve':
                updateMarketStatus(marketId, 'active');
                break;
            case 'manual_reject':
                updateMarketStatus(marketId, 'rejected');
                break;
            case 'manual_resolve_yes':
                updateMarketStatus(marketId, 'resolved_yes');
                break;
            case 'manual_resolve_no':
                updateMarketStatus(marketId, 'resolved_no');
                break;
            case 'flag_suspicious':
                updateMarketStatus(marketId, 'flagged');
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: `Unknown action type: ${actionType}`,
                    timestamp: Date.now(),
                } as APIResponse);
        }

        // Registrar acción
        const action = {
            id: `action_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            timestamp: Date.now(),
            adminAddress,
            actionType,
            marketId,
            previousState,
            newState: { status: market.status },
            reason: reason || '',
        };

        insertAdminAction(action);
        logEvent('admin_action', marketId, action);

        res.json({
            success: true,
            data: action,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// Get flagged markets (for admin review)
app.get('/admin/flagged', (req: Request, res: Response) => {
    try {
        const { adminAddress } = req.query;

        if (!adminAddress || !isAdminAddress(adminAddress as string)) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized',
                timestamp: Date.now(),
            } as APIResponse);
        }

        const flaggedMarkets = getMarketsByStatus('flagged');

        res.json({
            success: true,
            data: flaggedMarkets,
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// ============================================================================
// WEBHOOK ENDPOINTS (para DJinn)
// ============================================================================

// Webhook: New market created on-chain
app.post('/webhook/market-created', async (req: Request, res: Response) => {
    try {
        const { signature } = req.headers;
        const { marketId, title, description, sourceUrl, category, expiresAt, creatorAddress } = req.body;

        // Verificar firma del webhook (simple HMAC)
        const expectedSignature = crypto
            .createHmac('sha256', ENV.WEBHOOK_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (signature !== expectedSignature) {
            console.warn('[Webhook] Invalid signature');
            // En producción, rechazar. En desarrollo, advertir.
            if (ENV.NODE_ENV === 'production') {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid signature',
                    timestamp: Date.now(),
                } as APIResponse);
            }
        }

        // Registrar mercado
        const market: Market = {
            id: marketId,
            title,
            description: description || '',
            sourceUrl,
            category: category || 'other',
            createdAt: Date.now(),
            expiresAt: expiresAt || Date.now() + 7 * 24 * 3600 * 1000,
            status: 'pending_validation',
            poolAmount: 0,
            feesCollected: 0,
            creatorAddress,
        };

        insertMarket(market);
        logEvent('market_submitted', marketId, { source: 'webhook' });

        // Iniciar validación automática
        const validationRequest: ValidationRequest = {
            marketId,
            title,
            description: description || '',
            sourceUrl,
            category: category || 'other',
            expiresAt: market.expiresAt,
        };

        // Ejecutar validación en background
        validateMarket(validationRequest)
            .then(result => {
                insertValidation(result);

                // Actualizar estado del mercado
                if (result.action === 'approve_market') {
                    updateMarketStatus(marketId, 'active');
                } else if (result.action === 'reject_and_burn') {
                    updateMarketStatus(marketId, 'rejected');
                } else {
                    updateMarketStatus(marketId, 'flagged');
                }

                logEvent('validation_completed', marketId, {
                    status: result.status,
                    action: result.action,
                });

                // TODO: Enviar webhook de respuesta a DJinn
            })
            .catch(error => {
                console.error('[Webhook] Validation error:', error);
                updateMarketStatus(marketId, 'flagged');
            });

        res.status(202).json({
            success: true,
            data: {
                message: 'Market received, validation started',
                marketId,
            },
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// Webhook: Market expired
app.post('/webhook/market-expired', async (req: Request, res: Response) => {
    try {
        const { marketId } = req.body;

        const market = getMarketById(marketId);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found',
                timestamp: Date.now(),
            } as APIResponse);
        }

        // Marcar como expirado
        updateMarketStatus(marketId, 'expired');
        logEvent('market_expired', marketId, {});

        res.json({
            success: true,
            data: { message: 'Market marked as expired', marketId },
            timestamp: Date.now(),
        } as APIResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        } as APIResponse);
    }
});

// ============================================================================
// START SERVER
// ============================================================================

export function startServer(port: number = ENV.PORT): void {
    // Inicializar base de datos
    initDatabase();

    app.listen(port, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    CERBERUS ORACLE SERVER                     ║
╠═══════════════════════════════════════════════════════════════╣
║  Status:  ONLINE                                              ║
║  Port:    ${port.toString().padEnd(50)}║
║  Mode:    ${ENV.NODE_ENV.padEnd(50)}║
╚═══════════════════════════════════════════════════════════════╝
        `);
    });
}

// Si se ejecuta directamente
if (process.argv[1]?.includes('server')) {
    startServer();
}

export default app;
