/**
 * CERBERUS ORACLE - Web Scraper Service
 * Servicio para extraer contenido de URLs
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { LayerResult } from '../core/types.js';

// ============================================================================
// URL VALIDATION
// ============================================================================

export async function validateUrl(url: string): Promise<LayerResult> {
    try {
        // Verificar formato de URL
        const urlObj = new URL(url);

        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            return {
                passed: false,
                score: 0,
                details: 'Invalid protocol. Must be HTTP or HTTPS.',
            };
        }

        // Verificar que la URL sea accesible
        const response = await axios.head(url, {
            timeout: 10000,
            maxRedirects: 5,
            validateStatus: (status) => status < 500,
        });

        if (response.status >= 400) {
            return {
                passed: false,
                score: 20,
                details: `URL returned status ${response.status}`,
            };
        }

        return {
            passed: true,
            score: 100,
            details: `URL accessible (status ${response.status})`,
            metadata: {
                finalUrl: response.request?.res?.responseUrl || url,
                contentType: response.headers['content-type'],
            },
        };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ENOTFOUND') {
                return {
                    passed: false,
                    score: 0,
                    details: 'Domain not found',
                };
            }
            if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                return {
                    passed: false,
                    score: 10,
                    details: 'Connection timeout',
                };
            }
        }

        return {
            passed: false,
            score: 0,
            details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

export interface ExtractedContent {
    title: string;
    description: string;
    bodyText: string;
    publishedDate?: string;
    author?: string;
    siteName?: string;
    images: string[];
    links: string[];
}

export async function extractContent(url: string): Promise<ExtractedContent | null> {
    try {
        const response = await axios.get(url, {
            timeout: 15000,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; CerberusOracle/1.0; +https://cerberus.djinn.io)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
        });

        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            return null;
        }

        const $ = cheerio.load(response.data);

        // Extraer metadata
        const title =
            $('meta[property="og:title"]').attr('content') ||
            $('meta[name="twitter:title"]').attr('content') ||
            $('title').text() ||
            '';

        const description =
            $('meta[property="og:description"]').attr('content') ||
            $('meta[name="description"]').attr('content') ||
            $('meta[name="twitter:description"]').attr('content') ||
            '';

        const publishedDate =
            $('meta[property="article:published_time"]').attr('content') ||
            $('meta[name="publish-date"]').attr('content') ||
            $('time[datetime]').first().attr('datetime') ||
            undefined;

        const author =
            $('meta[name="author"]').attr('content') ||
            $('meta[property="article:author"]').attr('content') ||
            $('[rel="author"]').first().text() ||
            undefined;

        const siteName =
            $('meta[property="og:site_name"]').attr('content') ||
            new URL(url).hostname;

        // Extraer texto del body
        // Remover scripts, styles, nav, footer, etc.
        $('script, style, nav, footer, header, aside, .advertisement, .ad, #comments').remove();

        const bodyText = $('article, main, .content, .post-content, .entry-content, body')
            .first()
            .text()
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 10000);

        // Extraer imágenes principales
        const images: string[] = [];
        $('meta[property="og:image"], img[src]').each((_, el) => {
            const src = $(el).attr('content') || $(el).attr('src');
            if (src && images.length < 5) {
                images.push(src);
            }
        });

        // Extraer links relevantes
        const links: string[] = [];
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('http') && links.length < 10) {
                links.push(href);
            }
        });

        return {
            title: title.trim(),
            description: description.trim(),
            bodyText,
            publishedDate,
            author: author?.trim(),
            siteName,
            images,
            links,
        };
    } catch (error) {
        console.error('[Scraper] Content extraction error:', error);
        return null;
    }
}

// ============================================================================
// DOMAIN ANALYSIS
// ============================================================================

export interface DomainAnalysis {
    domain: string;
    isKnownNewsSource: boolean;
    isBlacklisted: boolean;
    isSocialMedia: boolean;
    trustScore: number;
}

const KNOWN_NEWS_DOMAINS = [
    'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'cnn.com',
    'bloomberg.com', 'wsj.com', 'nytimes.com', 'theguardian.com',
    'washingtonpost.com', 'forbes.com', 'ft.com', 'economist.com',
    'coindesk.com', 'cointelegraph.com', 'theblock.co', 'decrypt.co',
    'espn.com', 'sports.yahoo.com', 'skysports.com',
];

const SOCIAL_MEDIA_DOMAINS = [
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
    'reddit.com', 'tiktok.com', 'youtube.com', 'linkedin.com',
];

const BLACKLISTED_DOMAINS = [
    'theonion.com', 'babylonbee.com', 'clickhole.com',
    'fakenews.com', 'newsthump.com', 'waterfordwhispersnews.com',
];

export function analyzeDomain(url: string): DomainAnalysis {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');

        const isKnownNewsSource = KNOWN_NEWS_DOMAINS.some(d =>
            domain === d || domain.endsWith('.' + d)
        );

        const isSocialMedia = SOCIAL_MEDIA_DOMAINS.some(d =>
            domain === d || domain.endsWith('.' + d)
        );

        const isBlacklisted = BLACKLISTED_DOMAINS.some(d =>
            domain === d || domain.endsWith('.' + d)
        );

        // Calcular trust score
        let trustScore = 50; // Base

        if (isKnownNewsSource) trustScore = 90;
        else if (isSocialMedia) trustScore = 40;
        else if (isBlacklisted) trustScore = 0;

        // Ajustes adicionales
        if (domain.includes('gov')) trustScore = Math.max(trustScore, 85);
        if (domain.includes('edu')) trustScore = Math.max(trustScore, 80);

        return {
            domain,
            isKnownNewsSource,
            isBlacklisted,
            isSocialMedia,
            trustScore,
        };
    } catch {
        return {
            domain: 'unknown',
            isKnownNewsSource: false,
            isBlacklisted: false,
            isSocialMedia: false,
            trustScore: 0,
        };
    }
}

// ============================================================================
// BATCH CONTENT FETCHING
// ============================================================================

export async function fetchMultipleUrls(
    urls: string[],
    maxConcurrent: number = 5
): Promise<Map<string, ExtractedContent | null>> {
    const results = new Map<string, ExtractedContent | null>();

    // Procesar en lotes
    for (let i = 0; i < urls.length; i += maxConcurrent) {
        const batch = urls.slice(i, i + maxConcurrent);
        const promises = batch.map(async (url) => {
            const content = await extractContent(url);
            return { url, content };
        });

        const batchResults = await Promise.allSettled(promises);

        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.set(result.value.url, result.value.content);
            }
        }
    }

    return results;
}
