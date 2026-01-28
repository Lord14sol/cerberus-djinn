#!/usr/bin/env tsx
/**
 * CERBERUS ORACLE - CLI Validation Tool
 * Validate markets from command line
 *
 * Usage:
 *   npx tsx src/cli/validate.ts --url "https://example.com" --title "Will X happen?"
 */

import { validateMarket, quickValidate } from '../validators/market.validator.js';
import { initDatabase } from '../db/database.js';

interface CLIArgs {
    url: string;
    title: string;
    description?: string;
    category?: string;
    quick?: boolean;
}

function parseArgs(): CLIArgs {
    const args = process.argv.slice(2);
    const result: Partial<CLIArgs> = {};

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        const value = args[i + 1];

        switch (key) {
            case 'url':
                result.url = value;
                break;
            case 'title':
                result.title = value;
                break;
            case 'description':
                result.description = value;
                break;
            case 'category':
                result.category = value;
                break;
            case 'quick':
                result.quick = value === 'true';
                i--; // No consume next arg
                break;
        }
    }

    if (!result.url || !result.title) {
        console.error('Usage: validate --url <URL> --title <TITLE> [--description <DESC>] [--category <CAT>] [--quick]');
        process.exit(1);
    }

    return result as CLIArgs;
}

async function main(): Promise<void> {
    console.log('\n🔱 CERBERUS ORACLE - Market Validator 🔱\n');

    const args = parseArgs();

    console.log('Input:');
    console.log(`  URL: ${args.url}`);
    console.log(`  Title: ${args.title}`);
    console.log(`  Category: ${args.category || 'other'}`);
    console.log(`  Mode: ${args.quick ? 'Quick (rules only)' : 'Full (with LLM)'}\n`);

    const request = {
        marketId: `cli_${Date.now()}`,
        title: args.title,
        description: args.description || '',
        sourceUrl: args.url,
        category: (args.category || 'other') as any,
        expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
    };

    if (args.quick) {
        const result = quickValidate(request);
        console.log('Quick Validation Result:');
        console.log(`  Valid: ${result.valid}`);
        console.log(`  Issues: ${result.issues.join(', ') || 'None'}`);
    } else {
        initDatabase();
        console.log('Running full validation (this may take a moment)...\n');

        const result = await validateMarket(request);

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('VALIDATION RESULT');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`  Status: ${result.status.toUpperCase()}`);
        console.log(`  Score: ${result.score}/100`);
        console.log(`  Confidence: ${result.confidence}%`);
        console.log(`  Action: ${result.action}`);
        console.log(`  Reason: ${result.reason}`);
        console.log(`  Risk Flags: ${result.riskFlags.join(', ') || 'None'}`);
        console.log('═══════════════════════════════════════════════════════════════\n');

        // Detalles del análisis
        console.log('Analysis Details:');
        console.log(`  URL Validation: ${result.analysis.urlValidation.passed ? '✓' : '✗'} - ${result.analysis.urlValidation.details}`);
        console.log(`  Content Extraction: ${result.analysis.contentExtraction.passed ? '✓' : '✗'} - ${result.analysis.contentExtraction.details}`);
        console.log(`  Resolvability: ${result.analysis.resolvabilityCheck.isResolvable ? '✓' : '✗'} - ${result.analysis.resolvabilityCheck.reasoning}`);
        console.log(`  LLM Analysis: ${result.analysis.llmAnalysis.isValidMarket ? '✓' : '✗'} - ${result.analysis.llmAnalysis.reasoning}`);
    }

    console.log('\n🔱 Done 🔱\n');
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
