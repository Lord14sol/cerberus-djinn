// ============================================
// CERBERUS ORACLE - DASHBOARD APP
// Real-time market verification dashboard
// ============================================

// Use relative URL so it works on any host/port
const API_URL = '/api';
let eventSource = null;
let selectedMarketId = null;
let dashboardState = {
    markets: [],
    stats: { totalMarkets: 0, verified: 0, flagged: 0, rejected: 0, pending: 0 }
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🐕 Cerberus Dashboard initializing...');
    connectToServer();
    setupEventListeners();
});

// ============================================
// SERVER CONNECTION (SSE)
// ============================================

function connectToServer() {
    updateStatus('connecting');

    eventSource = new EventSource(`${API_URL}/events`);

    eventSource.onopen = () => {
        console.log('✅ Connected to Cerberus server');
        updateStatus('connected');
    };

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerEvent(data);
        } catch (e) {
            console.error('Error parsing event:', e);
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        updateStatus('error');

        // Reconnect after 5 seconds
        setTimeout(() => {
            if (eventSource) {
                eventSource.close();
            }
            connectToServer();
        }, 5000);
    };
}

function handleServerEvent(event) {
    console.log('📨 Event received:', event.type);

    switch (event.type) {
        case 'init':
        case 'dashboard_update':
            dashboardState = event.data;
            renderDashboard();
            break;

        case 'market_processed':
        case 'market_verified':
        case 'market_flagged':
        case 'market_rejected':
            // Update will come through dashboard_update
            showNotification(event);
            break;
    }

    updateLastUpdate();
}

// ============================================
// UI UPDATES
// ============================================

function updateStatus(status) {
    const badge = document.getElementById('status-badge');
    const text = badge.querySelector('.status-text');

    badge.className = 'status-badge';

    switch (status) {
        case 'connecting':
            text.textContent = 'Connecting...';
            break;
        case 'connected':
            badge.classList.add('connected');
            text.textContent = 'Connected';
            break;
        case 'error':
            badge.classList.add('error');
            text.textContent = 'Disconnected';
            break;
    }
}

function updateLastUpdate() {
    const el = document.getElementById('last-update');
    el.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
}

function renderDashboard() {
    renderStats();
    renderMarkets();

    if (selectedMarketId) {
        const market = dashboardState.markets.find(m => m.publicKey === selectedMarketId);
        if (market) {
            renderDetails(market);
        }
    }
}

function renderStats() {
    const { stats } = dashboardState;
    document.getElementById('stat-total').textContent = stats.totalMarkets;
    document.getElementById('stat-verified').textContent = stats.verified;
    document.getElementById('stat-flagged').textContent = stats.flagged;
    document.getElementById('stat-rejected').textContent = stats.rejected;
    document.getElementById('stat-pending').textContent = stats.pending;
}

function renderMarkets() {
    const container = document.getElementById('markets-list');
    const { markets } = dashboardState;

    if (markets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🔍</span>
                <p>Waiting for markets...</p>
                <small>New markets will appear here automatically</small>
            </div>
        `;
        return;
    }

    container.innerHTML = markets.map(market => renderMarketCard(market)).join('');
}

function renderMarketCard(market) {
    const statusClass = getStatusClass(market.verificationStatus);
    const categoryClass = `category-${market.category || 'other'}`;
    const isSelected = market.publicKey === selectedMarketId;

    return `
        <div class="market-card ${statusClass} ${isSelected ? 'selected' : ''}"
             onclick="selectMarket('${market.publicKey}')">

            ${market.checkmark ? '<div class="checkmark-badge">✓</div>' : ''}

            <div class="market-header">
                <div class="market-title">${escapeHtml(market.title)}</div>
                <span class="market-category ${categoryClass}">
                    ${market.category || 'other'}
                </span>
            </div>

            <div class="market-meta">
                <div class="market-meta-item">
                    👤 ${truncateWallet(market.creator?.wallet || 'Unknown')}
                </div>
                <div class="market-meta-item">
                    💰 ${formatLiquidity(market.pool?.totalLiquidity || 0)}
                </div>
                ${market.resolutionDate ? `
                    <div class="market-meta-item">
                        📅 ${market.resolutionDate}
                    </div>
                ` : ''}
            </div>

            <div class="market-source">
                🔗 <a href="${market.sourceUrl}" target="_blank" onclick="event.stopPropagation()">
                    ${truncateUrl(market.sourceUrl)}
                </a>
            </div>

            <div class="layer-progress">
                <div class="layer-step ${getLayerClass(market.layerProgress?.layer1)}"></div>
                <div class="layer-step ${getLayerClass(market.layerProgress?.layer2)}"></div>
                <div class="layer-step ${getLayerClass(market.layerProgress?.layer3)}"></div>
            </div>
            <div class="layer-labels">
                <span>L1: Gather</span>
                <span>L2: Confirm</span>
                <span>L3: Validate</span>
            </div>
        </div>
    `;
}

function selectMarket(marketId) {
    selectedMarketId = marketId;
    const market = dashboardState.markets.find(m => m.publicKey === marketId);

    // Update selection visual
    document.querySelectorAll('.market-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.currentTarget?.classList.add('selected');

    if (market) {
        renderDetails(market);
    }
}

function renderDetails(market) {
    const container = document.getElementById('details-content');
    const verdict = market.verdict;

    if (!verdict) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">⏳</span>
                <p>Verification in progress...</p>
                <small>Details will appear when complete</small>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <!-- Header -->
        <div class="detail-section">
            <div class="detail-header">
                <div class="detail-checkmark ${verdict.checkmark ? '' : 'none'}">
                    ${verdict.checkmark ? '✓' : '?'}
                </div>
                <div class="detail-info">
                    <h3>${escapeHtml(market.title)}</h3>
                    <span class="detail-status status-${verdict.finalStatus.toLowerCase()}">
                        ${getStatusIcon(verdict.finalStatus)} ${verdict.finalStatus}
                    </span>
                </div>
            </div>
        </div>

        <!-- Key Info -->
        <div class="detail-section">
            <div class="detail-section-title">Key Information</div>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Resolution Date</div>
                    <div class="detail-value">${verdict.resolutionDate || 'Not set'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Category</div>
                    <div class="detail-value">${verdict.category}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Creator</div>
                    <div class="detail-value mono">${truncateWallet(market.creator?.wallet)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Processing Time</div>
                    <div class="detail-value">${verdict.totalProcessingTime}ms</div>
                </div>
            </div>
        </div>

        <!-- Layer Results -->
        <div class="detail-section">
            <div class="detail-section-title">Verification Layers</div>

            <div class="layer-detail">
                <div class="layer-header">
                    <span class="layer-name">🔍 Layer 1: Information Gatherer</span>
                    <span class="layer-status ${verdict.layer1.passed ? 'layer-passed' : 'layer-failed'}">
                        ${verdict.layer1.passed ? 'PASSED' : 'FAILED'}
                    </span>
                </div>
                <div class="layer-summary">${escapeHtml(verdict.layer1.summary)}</div>
            </div>

            <div class="layer-detail">
                <div class="layer-header">
                    <span class="layer-name">🔬 Layer 2: Verification Confirmer</span>
                    <span class="layer-status ${verdict.layer2.passed ? 'layer-passed' : 'layer-failed'}">
                        ${verdict.layer2.passed ? 'PASSED' : 'FAILED'}
                    </span>
                </div>
                <div class="layer-summary">
                    Confidence: ${verdict.layer2.confidenceScore}%<br>
                    ${escapeHtml(verdict.layer2.reasoning)}
                    ${verdict.layer2.riskFlags?.length > 0 ?
                        `<br><br>⚠️ Risk Flags: ${verdict.layer2.riskFlags.join(', ')}` : ''
                    }
                </div>
            </div>

            <div class="layer-detail">
                <div class="layer-header">
                    <span class="layer-name">✅ Layer 3: Final Validator</span>
                    <span class="layer-status ${verdict.layer3.passed ? 'layer-passed' : 'layer-failed'}">
                        ${verdict.layer3.passed ? 'PASSED' : 'FAILED'}
                    </span>
                </div>
                <div class="layer-summary">${escapeHtml(verdict.layer3.reasoning)}</div>
            </div>
        </div>

        <!-- AI Description -->
        ${verdict.aiDescription ? `
            <div class="detail-section">
                <div class="detail-section-title">AI Generated Description</div>
                <div class="ai-description" onclick="showDescription('${market.publicKey}')">
                    <div class="ai-description-preview">
                        ${escapeHtml(verdict.aiDescription.substring(0, 300))}...
                    </div>
                    <div class="ai-description-footer">
                        Click to view full description →
                    </div>
                </div>
            </div>
        ` : ''}

        <!-- Action -->
        <div class="detail-section">
            <div class="detail-section-title">Oracle Action</div>
            <div class="detail-item">
                <div class="detail-label">Recommended Action</div>
                <div class="detail-value">${verdict.action.replace(/_/g, ' ')}</div>
            </div>
        </div>
    `;
}

// ============================================
// MODAL
// ============================================

function showDescription(marketId) {
    const market = dashboardState.markets.find(m => m.publicKey === marketId);
    if (!market?.verdict?.aiDescription) return;

    const modal = document.getElementById('description-modal');
    const body = document.getElementById('modal-body');

    body.textContent = market.verdict.aiDescription;
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('description-modal').classList.remove('active');
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    const modal = document.getElementById('description-modal');
    if (e.target === modal) {
        closeModal();
    }
});

// ============================================
// NOTIFICATIONS
// ============================================

function showNotification(event) {
    // Could add toast notifications here
    console.log(`📢 ${event.type}:`, event.data?.marketTitle || 'Market update');
}

// ============================================
// HELPERS
// ============================================

function getStatusClass(status) {
    if (!status) return '';
    if (status.includes('processing')) return 'processing';
    if (status === 'verified') return 'verified';
    if (status === 'flagged') return 'flagged';
    if (status === 'rejected') return 'rejected';
    return '';
}

function getLayerClass(status) {
    switch (status) {
        case 'passed': return 'passed';
        case 'failed': return 'failed';
        case 'processing': return 'processing';
        default: return '';
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'VERIFIED': return '✅';
        case 'FLAGGED': return '⚠️';
        case 'REJECTED': return '❌';
        default: return '❓';
    }
}

function truncateWallet(wallet) {
    if (!wallet) return 'Unknown';
    if (wallet.length <= 12) return wallet;
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function truncateUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        return parsed.hostname + (parsed.pathname.length > 20 ?
            parsed.pathname.slice(0, 20) + '...' : parsed.pathname);
    } catch {
        return url.slice(0, 40) + '...';
    }
}

function formatLiquidity(amount) {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

// ============================================
// FALLBACK: Polling if SSE fails
// ============================================

async function fetchDashboard() {
    try {
        const response = await fetch(`${API_URL}/dashboard`);
        const data = await response.json();
        dashboardState = data;
        renderDashboard();
    } catch (error) {
        console.error('Failed to fetch dashboard:', error);
    }
}

// Fallback polling every 30 seconds
setInterval(() => {
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
        fetchDashboard();
    }
}, 30000);
