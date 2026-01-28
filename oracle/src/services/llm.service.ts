/**
 * CERBERUS ORACLE - LLM Service
 * Servicio unificado para interactuar con múltiples LLMs
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ENV, LLM_PROMPTS, isLLMEnabled } from '../core/config.js';
import {
    LLMValidationResult,
    LLMVote,
    LLMConsensusResult,
    Market,
    EvidenceCollection,
    MarketCategory,
} from '../core/types.js';

// ============================================================================
// LLM CLIENTS
// ============================================================================

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
    if (!anthropicClient && ENV.ANTHROPIC_API_KEY) {
        anthropicClient = new Anthropic({ apiKey: ENV.ANTHROPIC_API_KEY });
    }
    if (!anthropicClient) throw new Error('Anthropic API key not configured');
    return anthropicClient;
}

function getOpenAIClient(): OpenAI {
    if (!openaiClient && ENV.OPENAI_API_KEY) {
        openaiClient = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
    }
    if (!openaiClient) throw new Error('OpenAI API key not configured');
    return openaiClient;
}

// ============================================================================
// VALIDATION LLM CALLS
// ============================================================================

interface ValidationLLMInput {
    title: string;
    description: string;
    sourceUrl: string;
    category: MarketCategory;
    expiresAt: number;
    extractedContent?: string;
}

interface ValidationLLMOutput {
    isValidMarket: boolean;
    isBinaryResolvable: boolean;
    confidenceScore: number;
    suggestedCategory: MarketCategory;
    potentialIssues: string[];
    reasoning: string;
}

export async function validateMarketWithAnthropic(
    input: ValidationLLMInput
): Promise<LLMValidationResult> {
    const client = getAnthropicClient();

    const prompt = `${LLM_PROMPTS.MARKET_VALIDATION}

Market Title: "${input.title}"
Description: "${input.description}"
Source URL: ${input.sourceUrl}
Category: ${input.category}
Expires At: ${new Date(input.expiresAt).toISOString()}
${input.extractedContent ? `\nExtracted Content from URL:\n${input.extractedContent}` : ''}

Respond with a JSON object containing:
{
    "isValidMarket": boolean,
    "isBinaryResolvable": boolean,
    "confidenceScore": number (0-100),
    "suggestedCategory": string,
    "potentialIssues": string[],
    "reasoning": string (max 200 chars)
}`;

    try {
        const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
        });

        const content = response.content[0];
        if (content.type !== 'text') {
            throw new Error('Unexpected response type');
        }

        // Extraer JSON de la respuesta
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const result: ValidationLLMOutput = JSON.parse(jsonMatch[0]);

        return {
            provider: 'anthropic',
            isValidMarket: result.isValidMarket,
            isBinaryResolvable: result.isBinaryResolvable,
            confidenceScore: result.confidenceScore,
            suggestedCategory: result.suggestedCategory as MarketCategory,
            potentialIssues: result.potentialIssues,
            reasoning: result.reasoning,
        };
    } catch (error) {
        console.error('[LLM] Anthropic validation error:', error);
        return {
            provider: 'anthropic',
            isValidMarket: false,
            isBinaryResolvable: false,
            confidenceScore: 0,
            suggestedCategory: 'other',
            potentialIssues: ['LLM analysis failed'],
            reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}

export async function validateMarketWithOpenAI(
    input: ValidationLLMInput
): Promise<LLMValidationResult> {
    const client = getOpenAIClient();

    const prompt = `${LLM_PROMPTS.MARKET_VALIDATION}

Market Title: "${input.title}"
Description: "${input.description}"
Source URL: ${input.sourceUrl}
Category: ${input.category}
Expires At: ${new Date(input.expiresAt).toISOString()}
${input.extractedContent ? `\nExtracted Content from URL:\n${input.extractedContent}` : ''}

Respond with ONLY a JSON object (no markdown):
{
    "isValidMarket": boolean,
    "isBinaryResolvable": boolean,
    "confidenceScore": number (0-100),
    "suggestedCategory": string,
    "potentialIssues": string[],
    "reasoning": string (max 200 chars)
}`;

    try {
        const response = await client.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 1024,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No content in response');
        }

        const result: ValidationLLMOutput = JSON.parse(content);

        return {
            provider: 'openai',
            isValidMarket: result.isValidMarket,
            isBinaryResolvable: result.isBinaryResolvable,
            confidenceScore: result.confidenceScore,
            suggestedCategory: result.suggestedCategory as MarketCategory,
            potentialIssues: result.potentialIssues,
            reasoning: result.reasoning,
        };
    } catch (error) {
        console.error('[LLM] OpenAI validation error:', error);
        return {
            provider: 'openai',
            isValidMarket: false,
            isBinaryResolvable: false,
            confidenceScore: 0,
            suggestedCategory: 'other',
            potentialIssues: ['LLM analysis failed'],
            reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}

// ============================================================================
// RESOLUTION LLM CALLS
// ============================================================================

interface ResolutionLLMInput {
    market: Market;
    evidence: EvidenceCollection;
}

interface ResolutionLLMOutput {
    outcome: 'yes' | 'no' | 'unresolvable';
    confidence: number;
    reasoning: string;
}

export async function resolveMarketWithAnthropic(
    input: ResolutionLLMInput
): Promise<LLMVote> {
    const client = getAnthropicClient();

    const evidenceSummary = formatEvidenceForLLM(input.evidence);

    const prompt = `${LLM_PROMPTS.MARKET_RESOLUTION}

MARKET QUESTION: "${input.market.title}"
DESCRIPTION: "${input.market.description}"
EXPIRY DATE: ${new Date(input.market.expiresAt).toISOString()}

EVIDENCE COLLECTED:
${evidenceSummary}

Based on this evidence, what is the outcome?

Respond with ONLY a JSON object:
{
    "outcome": "yes" | "no" | "unresolvable",
    "confidence": number (0-100),
    "reasoning": string (max 300 chars explaining your verdict)
}`;

    try {
        const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
        });

        const content = response.content[0];
        if (content.type !== 'text') {
            throw new Error('Unexpected response type');
        }

        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const result: ResolutionLLMOutput = JSON.parse(jsonMatch[0]);

        return {
            provider: 'anthropic',
            vote: result.outcome,
            confidence: result.confidence,
            reasoning: result.reasoning,
            timestamp: Date.now(),
        };
    } catch (error) {
        console.error('[LLM] Anthropic resolution error:', error);
        return {
            provider: 'anthropic',
            vote: 'unresolvable',
            confidence: 0,
            reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: Date.now(),
        };
    }
}

export async function resolveMarketWithOpenAI(
    input: ResolutionLLMInput
): Promise<LLMVote> {
    const client = getOpenAIClient();

    const evidenceSummary = formatEvidenceForLLM(input.evidence);

    const prompt = `${LLM_PROMPTS.MARKET_RESOLUTION}

MARKET QUESTION: "${input.market.title}"
DESCRIPTION: "${input.market.description}"
EXPIRY DATE: ${new Date(input.market.expiresAt).toISOString()}

EVIDENCE COLLECTED:
${evidenceSummary}

Based on this evidence, what is the outcome?

Respond with ONLY a JSON object:
{
    "outcome": "yes" | "no" | "unresolvable",
    "confidence": number (0-100),
    "reasoning": string (max 300 chars explaining your verdict)
}`;

    try {
        const response = await client.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 1024,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No content in response');
        }

        const result: ResolutionLLMOutput = JSON.parse(content);

        return {
            provider: 'openai',
            vote: result.outcome,
            confidence: result.confidence,
            reasoning: result.reasoning,
            timestamp: Date.now(),
        };
    } catch (error) {
        console.error('[LLM] OpenAI resolution error:', error);
        return {
            provider: 'openai',
            vote: 'unresolvable',
            confidence: 0,
            reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: Date.now(),
        };
    }
}

// ============================================================================
// CONSENSUS ENGINE
// ============================================================================

export async function getLLMConsensus(
    market: Market,
    evidence: EvidenceCollection
): Promise<LLMConsensusResult> {
    const input = { market, evidence };
    const votes: LLMVote[] = [];

    // Obtener votos de LLMs habilitados en paralelo
    const votePromises: Promise<LLMVote>[] = [];

    if (isLLMEnabled('anthropic') && ENV.ANTHROPIC_API_KEY) {
        votePromises.push(resolveMarketWithAnthropic(input));
    }

    if (isLLMEnabled('openai') && ENV.OPENAI_API_KEY) {
        votePromises.push(resolveMarketWithOpenAI(input));
    }

    const results = await Promise.allSettled(votePromises);

    for (const result of results) {
        if (result.status === 'fulfilled') {
            votes.push(result.value);
        }
    }

    // Calcular consenso
    const yesVotes = votes.filter(v => v.vote === 'yes').length;
    const noVotes = votes.filter(v => v.vote === 'no').length;
    const unresolvableVotes = votes.filter(v => v.vote === 'unresolvable').length;
    const totalVotes = votes.length;

    let finalVerdict: 'yes' | 'no' | 'unresolvable' = 'unresolvable';
    let agreementLevel = 0;

    if (totalVotes === 0) {
        return {
            votes: [],
            finalVerdict: 'unresolvable',
            agreementLevel: 0,
            reasoning: 'No LLM votes available',
        };
    }

    // Mayoría simple para determinar veredicto
    if (yesVotes > noVotes && yesVotes > unresolvableVotes) {
        finalVerdict = 'yes';
        agreementLevel = (yesVotes / totalVotes) * 100;
    } else if (noVotes > yesVotes && noVotes > unresolvableVotes) {
        finalVerdict = 'no';
        agreementLevel = (noVotes / totalVotes) * 100;
    } else {
        finalVerdict = 'unresolvable';
        agreementLevel = (unresolvableVotes / totalVotes) * 100;
    }

    // Construir razonamiento combinado
    const reasoning = votes
        .map(v => `${v.provider}: ${v.vote} (${v.confidence}%)`)
        .join(' | ');

    return {
        votes,
        finalVerdict,
        agreementLevel,
        reasoning,
    };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatEvidenceForLLM(evidence: EvidenceCollection): string {
    const parts: string[] = [];

    if (evidence.sourceUrlContent) {
        parts.push(`SOURCE URL CONTENT:\n${evidence.sourceUrlContent.slice(0, 2000)}`);
    }

    if (evidence.newsArticles.length > 0) {
        parts.push('\nNEWS ARTICLES:');
        for (const article of evidence.newsArticles.slice(0, 5)) {
            parts.push(`- [${article.source}] ${article.title}`);
            parts.push(`  ${article.snippet}`);
            parts.push(`  Published: ${new Date(article.publishedAt).toISOString()}`);
        }
    }

    if (evidence.officialStatements.length > 0) {
        parts.push('\nOFFICIAL STATEMENTS:');
        for (const statement of evidence.officialStatements) {
            parts.push(`- [${statement.name}] ${statement.content.slice(0, 500)}`);
        }
    }

    if (parts.length === 0) {
        return 'NO EVIDENCE FOUND - Consider marking as UNRESOLVABLE';
    }

    return parts.join('\n');
}

export async function extractContentWithLLM(
    rawContent: string,
    marketQuestion: string
): Promise<string> {
    // Usar el LLM más barato/rápido disponible
    if (ENV.ANTHROPIC_API_KEY) {
        try {
            const client = getAnthropicClient();
            const response = await client.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: `${LLM_PROMPTS.CONTENT_EXTRACTION}

Market Question: "${marketQuestion}"

Raw Content:
${rawContent.slice(0, 4000)}

Extract and summarize the key facts relevant to this prediction market.`,
                }],
            });

            const content = response.content[0];
            if (content.type === 'text') {
                return content.text;
            }
        } catch (error) {
            console.error('[LLM] Content extraction error:', error);
        }
    }

    // Fallback: devolver contenido truncado
    return rawContent.slice(0, 1000);
}
