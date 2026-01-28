#!/usr/bin/env tsx
/**
 * CERBERUS ORACLE - CLI Resolution Tool
 * Resolve markets from command line
 *
 * Usage:
 *   npx tsx src/cli/resolve.ts --market-id <ID>
 *   npx tsx src/cli/resolve.ts --title "Did X happen?" --url "https://example.com"
 */

import { resolveMarket } from '../resolvers/market.resolver.js';
import { initDatabase, getMarketById } from '../db/database.js';
import { Market } from '../core/types.js';

interface CLIArgs {
    marketId?: string;
    title?: string;
    url?: string;
    force?: 'yes' | 'no' | 'unresolvable';
}

function parseArgs(): CLIArgs {
    const args = process.argv.slice(2);
    const result: Partial<CLIArgs> = {};

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        const value = args[i + 1];

        switch (key) {
            case 'market-id':
                result.marketId = value;
                break;
            case 'title':
                result.title = value;
                break;
            case 'url':
                result.url = value;
                break;
            case 'force':
                result.force = value as any;
                break;
        }
    }

    if (!result.marketId && (!result.title || !result.url)) {
        console.error('Usage:');
        console.error('  resolve --market-id <ID>');
        console.error('  resolve --title <TITLE> --url <URL> [--force yes|no|unresolvable]');
        process.exit(1);
    }

    return result as CLIArgs;
}

async function main(): Promise<void> {
    console.log('\n🔱 CERBERUS ORACLE - Market Resolver 🔱\n');

    initDatabase();
    const args = parseArgs();

    let market: Market;

    if (args.marketId) {
        const existing = getMarketById(args.marketId);
        if (!existing) {
            console.error(`Market not found: ${args.marketId}`);
            process.exit(1);
        }
        market = existing;
    } else {
        // Crear mercado temporal para resolución
        market = {
            id: `cli_${Date.now()}`,
            title: args.title!,
            description: '',
            sourceUrl: args.url!,
            category: 'other',
            createdAt: Date.now() - 30 * 24 * 3600 * 1000,
            expiresAt: Date.now() - 24 * 3600 * 1000, // Expirado ayer
            status: 'expired',
            poolAmount: 0,
            feesCollected: 0,
            creatorAddress: 'cli_user',
        };
    }

    console.log('Market:');
    console.log(`  ID: ${market.id}`);
    console.log(`  Title: ${market.title}`);
    console.log(`  URL: ${market.sourceUrl}`);
    console.log(`  Status: ${market.status}`);

    if (args.force) {
        console.log(`  Forced Resolution: ${args.force.toUpperCase()}`);
    }

    console.log('\nCollecting evidence and analyzing (this may take a moment)...\n');

    const result = await resolveMarket({
        marketId: market.id,
        market,
        forcedResolution: args.force,
    });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('RESOLUTION RESULT');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Outcome: ${result.outcome.toUpperCase()}`);
    console.log(`  Confidence: ${result.confidence}%`);
    console.log(`  Action: ${result.action}`);
    console.log(`  Reasoning: ${result.reasoning}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // LLM Consensus
    console.log('LLM Consensus:');
    console.log(`  Agreement: ${result.llmConsensus.agreementLevel.toFixed(0)}%`);
    console.log(`  Final Verdict: ${result.llmConsensus.finalVerdict}`);
    if (result.llmConsensus.votes.length > 0) {
        console.log('  Votes:');
        for (const vote of result.llmConsensus.votes) {
            console.log(`    - ${vote.provider}: ${vote.vote} (${vote.confidence}%)`);
        }
    }

    // Evidence
    console.log('\nEvidence Collected:');
    console.log(`  Source Content: ${result.evidence.sourceUrlContent ? 'Yes' : 'No'}`);
    console.log(`  News Articles: ${result.evidence.newsArticles.length}`);
    console.log(`  Official Sources: ${result.evidence.officialStatements.length}`);

    if (result.sources.length > 0) {
        console.log('\nSources:');
        for (const source of result.sources.slice(0, 5)) {
            console.log(`  - ${source}`);
        }
    }

    console.log('\n🔱 Done 🔱\n');
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
