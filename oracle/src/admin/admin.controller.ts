/**
 * CERBERUS ORACLE - Admin Controller
 * Sistema de control administrativo para override manual y gestión
 */

import {
    Market,
    MarketStatus,
    AdminAction,
    AdminActionType,
    ValidationResult,
    ResolutionResult,
    OracleConfig,
} from '../core/types.js';
import { getConfig, isAdminAddress } from '../core/config.js';
import { resolveMarket } from '../resolvers/market.resolver.js';
import { validateMarket, quickValidate } from '../validators/market.validator.js';

// ============================================================================
// IN-MEMORY STATE (Replace with database in production)
// ============================================================================

interface OracleState {
    markets: Map<string, Market>;
    validations: Map<string, ValidationResult>;
    resolutions: Map<string, ResolutionResult>;
    adminActions: AdminAction[];
    config: OracleConfig;
    paused: boolean;
}

const state: OracleState = {
    markets: new Map(),
    validations: new Map(),
    resolutions: new Map(),
    adminActions: [],
    config: getConfig(),
    paused: false,
};

// ============================================================================
// MARKET MANAGEMENT
// ============================================================================

export function registerMarket(market: Market): void {
    state.markets.set(market.id, market);
    console.log(`[Admin] Market registered: ${market.id}`);
}

export function getMarket(marketId: string): Market | undefined {
    return state.markets.get(marketId);
}

export function getAllMarkets(): Market[] {
    return Array.from(state.markets.values());
}

export function getMarketsByStatus(status: MarketStatus): Market[] {
    return Array.from(state.markets.values()).filter(m => m.status === status);
}

export function updateMarketStatus(marketId: string, status: MarketStatus): boolean {
    const market = state.markets.get(marketId);
    if (!market) return false;

    market.status = status;
    state.markets.set(marketId, market);
    return true;
}

// ============================================================================
// ADMIN ACTIONS
// ============================================================================

interface AdminActionRequest {
    adminAddress: string;
    marketId: string;
    actionType: AdminActionType;
    reason: string;
    newValue?: any;
}

export async function executeAdminAction(request: AdminActionRequest): Promise<{
    success: boolean;
    message: string;
    action?: AdminAction;
}> {
    // Verificar que sea un admin válido
    if (!isAdminAddress(request.adminAddress)) {
        return {
            success: false,
            message: 'Unauthorized: Address is not an admin',
        };
    }

    // Verificar que el mercado existe
    const market = state.markets.get(request.marketId);
    if (!market) {
        return {
            success: false,
            message: 'Market not found',
        };
    }

    const previousState = { ...market };
    let newState: any = {};

    // Ejecutar la acción según el tipo
    switch (request.actionType) {
        case 'manual_approve':
            market.status = 'active';
            newState.status = 'active';
            break;

        case 'manual_reject':
            market.status = 'rejected';
            newState.status = 'rejected';
            break;

        case 'manual_resolve_yes':
            market.status = 'resolved_yes';
            market.resolvedAt = Date.now();
            newState = { status: 'resolved_yes', resolvedAt: market.resolvedAt };
            // Crear resolución forzada
            const yesResult = await resolveMarket({
                marketId: market.id,
                market,
                forcedResolution: 'yes',
            });
            state.resolutions.set(market.id, yesResult);
            break;

        case 'manual_resolve_no':
            market.status = 'resolved_no';
            market.resolvedAt = Date.now();
            newState = { status: 'resolved_no', resolvedAt: market.resolvedAt };
            const noResult = await resolveMarket({
                marketId: market.id,
                market,
                forcedResolution: 'no',
            });
            state.resolutions.set(market.id, noResult);
            break;

        case 'manual_unresolvable':
            market.status = 'unresolvable';
            newState.status = 'unresolvable';
            const unresolvableResult = await resolveMarket({
                marketId: market.id,
                market,
                forcedResolution: 'unresolvable',
            });
            state.resolutions.set(market.id, unresolvableResult);
            break;

        case 'pause_market':
            // Guardar estado anterior antes de pausar
            newState = { previousStatus: market.status, paused: true };
            break;

        case 'resume_market':
            newState = { paused: false };
            break;

        case 'update_expiry':
            if (request.newValue && typeof request.newValue === 'number') {
                market.expiresAt = request.newValue;
                newState.expiresAt = request.newValue;
            } else {
                return { success: false, message: 'Invalid expiry value' };
            }
            break;

        case 'flag_suspicious':
            market.status = 'flagged';
            newState.status = 'flagged';
            break;

        default:
            return { success: false, message: 'Unknown action type' };
    }

    // Guardar cambios
    state.markets.set(market.id, market);

    // Registrar la acción
    const action: AdminAction = {
        id: `action_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        adminAddress: request.adminAddress,
        actionType: request.actionType,
        marketId: request.marketId,
        previousState,
        newState,
        reason: request.reason,
    };

    state.adminActions.push(action);

    console.log(`[Admin] Action executed: ${request.actionType} on market ${request.marketId}`);

    return {
        success: true,
        message: `Action ${request.actionType} executed successfully`,
        action,
    };
}

// ============================================================================
// VALIDATION MANAGEMENT
// ============================================================================

export async function triggerValidation(marketId: string): Promise<ValidationResult | null> {
    const market = state.markets.get(marketId);
    if (!market) return null;

    const result = await validateMarket({
        marketId: market.id,
        title: market.title,
        description: market.description,
        sourceUrl: market.sourceUrl,
        category: market.category,
        expiresAt: market.expiresAt,
    });

    state.validations.set(marketId, result);

    // Actualizar estado del mercado según resultado
    switch (result.action) {
        case 'approve_market':
            market.status = 'active';
            break;
        case 'flag_for_review':
            market.status = 'flagged';
            break;
        case 'reject_and_burn':
            market.status = 'rejected';
            break;
    }

    state.markets.set(marketId, market);

    return result;
}

export function getValidation(marketId: string): ValidationResult | undefined {
    return state.validations.get(marketId);
}

// ============================================================================
// RESOLUTION MANAGEMENT
// ============================================================================

export async function triggerResolution(marketId: string): Promise<ResolutionResult | null> {
    const market = state.markets.get(marketId);
    if (!market) return null;

    const result = await resolveMarket({
        marketId: market.id,
        market,
    });

    state.resolutions.set(marketId, result);

    // Actualizar estado del mercado según resultado
    switch (result.outcome) {
        case 'yes':
            market.status = 'resolved_yes';
            market.resolvedAt = Date.now();
            break;
        case 'no':
            market.status = 'resolved_no';
            market.resolvedAt = Date.now();
            break;
        case 'unresolvable':
            if (result.action === 'flag_for_manual_resolution') {
                market.status = 'flagged';
            } else {
                market.status = 'unresolvable';
            }
            break;
    }

    state.markets.set(marketId, market);

    return result;
}

export function getResolution(marketId: string): ResolutionResult | undefined {
    return state.resolutions.get(marketId);
}

// ============================================================================
// AUDIT & LOGGING
// ============================================================================

export function getAdminActions(filters?: {
    marketId?: string;
    actionType?: AdminActionType;
    adminAddress?: string;
    since?: number;
}): AdminAction[] {
    let actions = [...state.adminActions];

    if (filters?.marketId) {
        actions = actions.filter(a => a.marketId === filters.marketId);
    }
    if (filters?.actionType) {
        actions = actions.filter(a => a.actionType === filters.actionType);
    }
    if (filters?.adminAddress) {
        actions = actions.filter(a => a.adminAddress === filters.adminAddress);
    }
    if (filters?.since) {
        actions = actions.filter(a => a.timestamp >= filters.since);
    }

    return actions.sort((a, b) => b.timestamp - a.timestamp);
}

// ============================================================================
// CONFIG MANAGEMENT
// ============================================================================

export function updateConfig(updates: Partial<OracleConfig>): OracleConfig {
    state.config = {
        ...state.config,
        ...updates,
    };
    return state.config;
}

export function getCurrentConfig(): OracleConfig {
    return { ...state.config };
}

export function addTrustedSource(domain: string): void {
    if (!state.config.trustedNewsSources.includes(domain)) {
        state.config.trustedNewsSources.push(domain);
    }
}

export function addBlacklistedDomain(domain: string): void {
    if (!state.config.blacklistedDomains.includes(domain)) {
        state.config.blacklistedDomains.push(domain);
    }
}

export function addBlacklistedKeyword(keyword: string): void {
    if (!state.config.blacklistedKeywords.includes(keyword)) {
        state.config.blacklistedKeywords.push(keyword);
    }
}

export function addAdmin(address: string): void {
    if (!state.config.adminAddresses.includes(address)) {
        state.config.adminAddresses.push(address);
    }
}

export function removeAdmin(address: string): void {
    state.config.adminAddresses = state.config.adminAddresses.filter(a => a !== address);
}

// ============================================================================
// SYSTEM CONTROL
// ============================================================================

export function pauseOracle(): void {
    state.paused = true;
    console.log('[Admin] Oracle PAUSED');
}

export function resumeOracle(): void {
    state.paused = false;
    console.log('[Admin] Oracle RESUMED');
}

export function isOraclePaused(): boolean {
    return state.paused;
}

// ============================================================================
// STATS & DASHBOARD
// ============================================================================

export function getOracleStats(): {
    totalMarkets: number;
    marketsByStatus: Record<string, number>;
    totalValidations: number;
    totalResolutions: number;
    totalAdminActions: number;
    isPaused: boolean;
} {
    const marketsByStatus: Record<string, number> = {};

    for (const market of state.markets.values()) {
        marketsByStatus[market.status] = (marketsByStatus[market.status] || 0) + 1;
    }

    return {
        totalMarkets: state.markets.size,
        marketsByStatus,
        totalValidations: state.validations.size,
        totalResolutions: state.resolutions.size,
        totalAdminActions: state.adminActions.length,
        isPaused: state.paused,
    };
}

// ============================================================================
// PENDING ACTIONS
// ============================================================================

export function getPendingValidations(): Market[] {
    return getMarketsByStatus('pending_validation');
}

export function getPendingResolutions(): Market[] {
    const config = getConfig();
    const now = Date.now();

    return Array.from(state.markets.values()).filter(market => {
        const closingTime = market.expiresAt + config.closingDelayHours * 3600 * 1000;
        return (
            (market.status === 'active' || market.status === 'expired' || market.status === 'closed') &&
            now >= closingTime &&
            !state.resolutions.has(market.id)
        );
    });
}

export function getFlaggedMarkets(): Market[] {
    return getMarketsByStatus('flagged');
}
