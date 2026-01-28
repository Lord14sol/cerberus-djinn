/**
 * CERBERUS ORACLE - News Service
 * Servicio para buscar noticias y evidencia externa
 */

import axios from 'axios';
import { ENV } from '../core/config.js';
import { NewsArticle, EvidenceCollection, Market, OfficialSource } from '../core/types.js';
import { extractContent } from './scraper.service.js';

// ============================================================================
// NEWS SEARCH (SERPER API)
// ============================================================================

interface SerperResult {
    title: string;
    link: string;
    snippet: string;
    date?: string;
    source?: string;
}

interface SerperResponse {
    organic?: SerperResult[];
    news?: SerperResult[];
}

export async function searchNews(query: string, limit: number = 10): Promise<NewsArticle[]> {
    if (!ENV.SERPER_API_KEY) {
        console.warn('[News] Serper API key not configured, using mock data');
        return mockNewsSearch(query);
    }

    try {
        const response = await axios.post<SerperResponse>(
            'https://google.serper.dev/news',
            {
                q: query,
                num: limit,
                gl: 'us',
                hl: 'en',
            },
            {
                headers: {
                    'X-API-KEY': ENV.SERPER_API_KEY,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            }
        );

        const articles: NewsArticle[] = [];

        for (const item of response.data.news || []) {
            articles.push({
                title: item.title,
                url: item.link,
                source: item.source || extractDomain(item.link),
                publishedAt: item.date ? new Date(item.date).getTime() : Date.now(),
                snippet: item.snippet,
                relevanceScore: calculateRelevance(item.title, query),
            });
        }

        return articles.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } catch (error) {
        console.error('[News] Serper search error:', error);
        return [];
    }
}

// ============================================================================
// WEB SEARCH (SERPER API)
// ============================================================================

export async function searchWeb(query: string, limit: number = 10): Promise<NewsArticle[]> {
    if (!ENV.SERPER_API_KEY) {
        console.warn('[News] Serper API key not configured, using mock data');
        return mockNewsSearch(query);
    }

    try {
        const response = await axios.post<SerperResponse>(
            'https://google.serper.dev/search',
            {
                q: query,
                num: limit,
                gl: 'us',
                hl: 'en',
            },
            {
                headers: {
                    'X-API-KEY': ENV.SERPER_API_KEY,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            }
        );

        const articles: NewsArticle[] = [];

        for (const item of response.data.organic || []) {
            articles.push({
                title: item.title,
                url: item.link,
                source: extractDomain(item.link),
                publishedAt: Date.now(),
                snippet: item.snippet,
                relevanceScore: calculateRelevance(item.title, query),
            });
        }

        return articles;
    } catch (error) {
        console.error('[News] Serper web search error:', error);
        return [];
    }
}

// ============================================================================
// EVIDENCE COLLECTION
// ============================================================================

export async function collectEvidence(market: Market): Promise<EvidenceCollection> {
    console.log(`[Evidence] Collecting evidence for market: ${market.id}`);

    const evidence: EvidenceCollection = {
        sourceUrlContent: null,
        newsArticles: [],
        socialMediaPosts: [],
        officialStatements: [],
        timestamp: Date.now(),
    };

    // 1. Extraer contenido de la URL fuente
    try {
        const sourceContent = await extractContent(market.sourceUrl);
        if (sourceContent) {
            evidence.sourceUrlContent = `
Title: ${sourceContent.title}
Description: ${sourceContent.description}
Content: ${sourceContent.bodyText}
Published: ${sourceContent.publishedDate || 'Unknown'}
            `.trim();
        }
    } catch (error) {
        console.error('[Evidence] Failed to extract source URL content:', error);
    }

    // 2. Buscar noticias relacionadas
    const searchQueries = generateSearchQueries(market);

    for (const query of searchQueries) {
        const newsResults = await searchNews(query, 5);
        for (const article of newsResults) {
            // Evitar duplicados
            if (!evidence.newsArticles.find(a => a.url === article.url)) {
                evidence.newsArticles.push(article);
            }
        }
    }

    // Ordenar por relevancia
    evidence.newsArticles.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Limitar a los 10 más relevantes
    evidence.newsArticles = evidence.newsArticles.slice(0, 10);

    // 3. Buscar fuentes oficiales
    evidence.officialStatements = await findOfficialSources(market);

    console.log(`[Evidence] Collected: ${evidence.newsArticles.length} news, ${evidence.officialStatements.length} official sources`);

    return evidence;
}

// ============================================================================
// OFFICIAL SOURCE DETECTION
// ============================================================================

async function findOfficialSources(market: Market): Promise<OfficialSource[]> {
    const sources: OfficialSource[] = [];

    // Determinar qué tipo de fuentes oficiales buscar basado en la categoría
    const officialDomains = getOfficialDomainsForCategory(market.category);

    // Buscar en fuentes oficiales
    const query = `${market.title} site:(${officialDomains.join(' OR ')})`;
    const results = await searchWeb(query, 5);

    for (const result of results) {
        try {
            const content = await extractContent(result.url);
            if (content) {
                sources.push({
                    name: result.source,
                    url: result.url,
                    content: content.bodyText.slice(0, 1000),
                    isVerified: officialDomains.some(d => result.url.includes(d)),
                });
            }
        } catch {
            // Ignorar errores de extracción
        }
    }

    return sources;
}

function getOfficialDomainsForCategory(category: string): string[] {
    const categoryDomains: Record<string, string[]> = {
        crypto: ['bitcoin.org', 'ethereum.org', 'sec.gov', 'cftc.gov', 'coinmarketcap.com'],
        sports: ['espn.com', 'fifa.com', 'nba.com', 'nfl.com', 'mlb.com', 'olympics.com'],
        politics: ['congress.gov', 'whitehouse.gov', 'state.gov', 'gov.uk', 'europa.eu'],
        economics: ['federalreserve.gov', 'treasury.gov', 'imf.org', 'worldbank.org', 'bls.gov'],
        science: ['nasa.gov', 'nih.gov', 'nature.com', 'science.org', 'who.int'],
        entertainment: ['variety.com', 'hollywoodreporter.com', 'billboard.com'],
    };

    return categoryDomains[category] || ['reuters.com', 'apnews.com', 'bbc.com'];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateSearchQueries(market: Market): string[] {
    const queries: string[] = [];

    // Query principal
    queries.push(market.title);

    // Query con fecha
    const expiryDate = new Date(market.expiresAt);
    const dateStr = expiryDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    queries.push(`${market.title} ${dateStr}`);

    // Query simplificada (primeras palabras importantes)
    const keywords = extractKeywords(market.title);
    if (keywords.length > 0) {
        queries.push(keywords.join(' '));
    }

    return queries.slice(0, 3); // Máximo 3 queries
}

function extractKeywords(text: string): string[] {
    const stopWords = new Set([
        'will', 'the', 'a', 'an', 'is', 'are', 'be', 'to', 'of', 'and', 'in', 'on',
        'at', 'by', 'for', 'with', 'about', 'into', 'through', 'during', 'before',
        'after', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'over',
        'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
        'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other',
        'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
        'too', 'very', 'can', 'just', 'should', 'now',
    ]);

    return text
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word))
        .slice(0, 5);
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return 'unknown';
    }
}

function calculateRelevance(title: string, query: string): number {
    const titleLower = title.toLowerCase();
    const queryWords = query.toLowerCase().split(/\s+/);

    let matches = 0;
    for (const word of queryWords) {
        if (word.length > 2 && titleLower.includes(word)) {
            matches++;
        }
    }

    return Math.round((matches / queryWords.length) * 100);
}

// ============================================================================
// MOCK DATA (for development without API keys)
// ============================================================================

function mockNewsSearch(query: string): NewsArticle[] {
    console.log(`[News] MOCK: Searching for "${query}"`);

    // Simular búsqueda basada en palabras clave
    if (query.toLowerCase().includes('btc') || query.toLowerCase().includes('bitcoin')) {
        return [
            {
                title: 'Bitcoin Price Analysis: Market Shows Strong Momentum',
                url: 'https://coindesk.com/mock-btc-article',
                source: 'coindesk.com',
                publishedAt: Date.now() - 3600000,
                snippet: 'Bitcoin continues to show strong market performance as institutional adoption increases.',
                relevanceScore: 85,
            },
        ];
    }

    if (query.toLowerCase().includes('election') || query.toLowerCase().includes('president')) {
        return [
            {
                title: 'Election Results: Latest Updates and Analysis',
                url: 'https://apnews.com/mock-election',
                source: 'apnews.com',
                publishedAt: Date.now() - 7200000,
                snippet: 'Live coverage of the election with results and expert analysis.',
                relevanceScore: 90,
            },
        ];
    }

    // Default: sin resultados
    return [];
}
