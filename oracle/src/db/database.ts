/**
 * CERBERUS ORACLE - Database Layer
 * Persistencia con SQLite para mercados, validaciones y resoluciones
 */

import Database from 'better-sqlite3';
import { ENV } from '../core/config.js';
import {
    Market,
    MarketStatus,
    MarketCategory,
    ValidationResult,
    ResolutionResult,
    AdminAction,
} from '../core/types.js';
import path from 'path';
import fs from 'fs';

// ============================================================================
// DATABASE SETUP
// ============================================================================

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
    if (db) return db;

    // Asegurar que el directorio existe
    const dbDir = path.dirname(ENV.DATABASE_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(ENV.DATABASE_PATH);

    // Crear tablas
    db.exec(`
        -- Tabla de mercados
        CREATE TABLE IF NOT EXISTS markets (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            source_url TEXT NOT NULL,
            category TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            closed_at INTEGER,
            resolved_at INTEGER,
            status TEXT NOT NULL,
            pool_amount REAL DEFAULT 0,
            fees_collected REAL DEFAULT 0,
            creator_address TEXT NOT NULL
        );

        -- Tabla de validaciones
        CREATE TABLE IF NOT EXISTS validations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            status TEXT NOT NULL,
            score INTEGER NOT NULL,
            confidence INTEGER NOT NULL,
            reason TEXT,
            risk_flags TEXT,
            action TEXT NOT NULL,
            analysis_json TEXT,
            FOREIGN KEY (market_id) REFERENCES markets(id)
        );

        -- Tabla de resoluciones
        CREATE TABLE IF NOT EXISTS resolutions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id TEXT NOT NULL UNIQUE,
            timestamp INTEGER NOT NULL,
            outcome TEXT NOT NULL,
            confidence INTEGER NOT NULL,
            action TEXT NOT NULL,
            reasoning TEXT,
            sources TEXT,
            evidence_json TEXT,
            consensus_json TEXT,
            FOREIGN KEY (market_id) REFERENCES markets(id)
        );

        -- Tabla de acciones administrativas
        CREATE TABLE IF NOT EXISTS admin_actions (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            admin_address TEXT NOT NULL,
            action_type TEXT NOT NULL,
            market_id TEXT NOT NULL,
            previous_state TEXT,
            new_state TEXT,
            reason TEXT,
            FOREIGN KEY (market_id) REFERENCES markets(id)
        );

        -- Tabla de eventos
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            type TEXT NOT NULL,
            market_id TEXT,
            data TEXT
        );

        -- Índices para consultas frecuentes
        CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
        CREATE INDEX IF NOT EXISTS idx_markets_expires_at ON markets(expires_at);
        CREATE INDEX IF NOT EXISTS idx_validations_market_id ON validations(market_id);
        CREATE INDEX IF NOT EXISTS idx_resolutions_market_id ON resolutions(market_id);
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
        CREATE INDEX IF NOT EXISTS idx_events_market_id ON events(market_id);
    `);

    console.log('[DB] Database initialized at:', ENV.DATABASE_PATH);

    return db;
}

export function getDatabase(): Database.Database {
    if (!db) {
        return initDatabase();
    }
    return db;
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
    }
}

// ============================================================================
// MARKET OPERATIONS
// ============================================================================

export function insertMarket(market: Market): void {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO markets (
            id, title, description, source_url, category,
            created_at, expires_at, closed_at, resolved_at,
            status, pool_amount, fees_collected, creator_address
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
    `);

    stmt.run(
        market.id,
        market.title,
        market.description,
        market.sourceUrl,
        market.category,
        market.createdAt,
        market.expiresAt,
        market.closedAt || null,
        market.resolvedAt || null,
        market.status,
        market.poolAmount,
        market.feesCollected,
        market.creatorAddress
    );
}

export function getMarketById(id: string): Market | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as any;

    if (!row) return null;

    return rowToMarket(row);
}

export function getMarketsByStatus(status: MarketStatus): Market[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM markets WHERE status = ?').all(status) as any[];
    return rows.map(rowToMarket);
}

export function getAllMarkets(limit: number = 100, offset: number = 0): Market[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM markets ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset) as any[];
    return rows.map(rowToMarket);
}

export function getExpiredMarkets(): Market[] {
    const db = getDatabase();
    const now = Date.now();
    const rows = db.prepare(`
        SELECT * FROM markets
        WHERE status = 'active' AND expires_at < ?
        ORDER BY expires_at ASC
    `).all(now) as any[];
    return rows.map(rowToMarket);
}

export function updateMarketStatus(id: string, status: MarketStatus): void {
    const db = getDatabase();
    db.prepare('UPDATE markets SET status = ? WHERE id = ?').run(status, id);
}

export function updateMarketResolved(id: string, status: MarketStatus): void {
    const db = getDatabase();
    db.prepare('UPDATE markets SET status = ?, resolved_at = ? WHERE id = ?')
        .run(status, Date.now(), id);
}

function rowToMarket(row: any): Market {
    return {
        id: row.id,
        title: row.title,
        description: row.description || '',
        sourceUrl: row.source_url,
        category: row.category as MarketCategory,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        closedAt: row.closed_at || undefined,
        resolvedAt: row.resolved_at || undefined,
        status: row.status as MarketStatus,
        poolAmount: row.pool_amount,
        feesCollected: row.fees_collected,
        creatorAddress: row.creator_address,
    };
}

// ============================================================================
// VALIDATION OPERATIONS
// ============================================================================

export function insertValidation(result: ValidationResult): void {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO validations (
            market_id, timestamp, status, score, confidence,
            reason, risk_flags, action, analysis_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        result.marketId,
        result.timestamp,
        result.status,
        result.score,
        result.confidence,
        result.reason,
        JSON.stringify(result.riskFlags),
        result.action,
        JSON.stringify(result.analysis)
    );
}

export function getValidationByMarketId(marketId: string): ValidationResult | null {
    const db = getDatabase();
    const row = db.prepare(`
        SELECT * FROM validations
        WHERE market_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
    `).get(marketId) as any;

    if (!row) return null;

    return {
        marketId: row.market_id,
        timestamp: row.timestamp,
        status: row.status,
        score: row.score,
        confidence: row.confidence,
        reason: row.reason,
        riskFlags: JSON.parse(row.risk_flags || '[]'),
        action: row.action,
        analysis: JSON.parse(row.analysis_json || '{}'),
    };
}

// ============================================================================
// RESOLUTION OPERATIONS
// ============================================================================

export function insertResolution(result: ResolutionResult): void {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO resolutions (
            market_id, timestamp, outcome, confidence,
            action, reasoning, sources, evidence_json, consensus_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        result.marketId,
        result.timestamp,
        result.outcome,
        result.confidence,
        result.action,
        result.reasoning,
        JSON.stringify(result.sources),
        JSON.stringify(result.evidence),
        JSON.stringify(result.llmConsensus)
    );
}

export function getResolutionByMarketId(marketId: string): ResolutionResult | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM resolutions WHERE market_id = ?').get(marketId) as any;

    if (!row) return null;

    return {
        marketId: row.market_id,
        timestamp: row.timestamp,
        outcome: row.outcome,
        confidence: row.confidence,
        action: row.action,
        reasoning: row.reasoning,
        sources: JSON.parse(row.sources || '[]'),
        evidence: JSON.parse(row.evidence_json || '{}'),
        llmConsensus: JSON.parse(row.consensus_json || '{}'),
    };
}

// ============================================================================
// ADMIN ACTION OPERATIONS
// ============================================================================

export function insertAdminAction(action: AdminAction): void {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO admin_actions (
            id, timestamp, admin_address, action_type,
            market_id, previous_state, new_state, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        action.id,
        action.timestamp,
        action.adminAddress,
        action.actionType,
        action.marketId,
        JSON.stringify(action.previousState),
        JSON.stringify(action.newState),
        action.reason
    );
}

export function getAdminActionsByMarketId(marketId: string): AdminAction[] {
    const db = getDatabase();
    const rows = db.prepare(`
        SELECT * FROM admin_actions
        WHERE market_id = ?
        ORDER BY timestamp DESC
    `).all(marketId) as any[];

    return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        adminAddress: row.admin_address,
        actionType: row.action_type,
        marketId: row.market_id,
        previousState: JSON.parse(row.previous_state || '{}'),
        newState: JSON.parse(row.new_state || '{}'),
        reason: row.reason,
    }));
}

// ============================================================================
// EVENT LOGGING
// ============================================================================

export function logEvent(type: string, marketId: string | null, data: any): void {
    const db = getDatabase();
    db.prepare(`
        INSERT INTO events (timestamp, type, market_id, data)
        VALUES (?, ?, ?, ?)
    `).run(Date.now(), type, marketId, JSON.stringify(data));
}

export function getEventsByMarketId(marketId: string, limit: number = 50): any[] {
    const db = getDatabase();
    return db.prepare(`
        SELECT * FROM events
        WHERE market_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
    `).all(marketId, limit);
}

export function getRecentEvents(limit: number = 100): any[] {
    const db = getDatabase();
    return db.prepare(`
        SELECT * FROM events
        ORDER BY timestamp DESC
        LIMIT ?
    `).all(limit);
}

// ============================================================================
// STATS
// ============================================================================

export function getStats(): {
    totalMarkets: number;
    activeMarkets: number;
    resolvedMarkets: number;
    flaggedMarkets: number;
    totalValidations: number;
    totalResolutions: number;
} {
    const db = getDatabase();

    const totalMarkets = (db.prepare('SELECT COUNT(*) as count FROM markets').get() as any).count;
    const activeMarkets = (db.prepare("SELECT COUNT(*) as count FROM markets WHERE status = 'active'").get() as any).count;
    const resolvedMarkets = (db.prepare("SELECT COUNT(*) as count FROM markets WHERE status IN ('resolved_yes', 'resolved_no')").get() as any).count;
    const flaggedMarkets = (db.prepare("SELECT COUNT(*) as count FROM markets WHERE status = 'flagged'").get() as any).count;
    const totalValidations = (db.prepare('SELECT COUNT(*) as count FROM validations').get() as any).count;
    const totalResolutions = (db.prepare('SELECT COUNT(*) as count FROM resolutions').get() as any).count;

    return {
        totalMarkets,
        activeMarkets,
        resolvedMarkets,
        flaggedMarkets,
        totalValidations,
        totalResolutions,
    };
}
