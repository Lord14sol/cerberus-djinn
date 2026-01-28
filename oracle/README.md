# CERBERUS ORACLE

Sistema de IA Oráculo para verificación y resolución de mercados de predicción.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CERBERUS AI ORACLE SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FASE 1: VALIDACIÓN (al crear mercado)                                      │
│  ─────────────────────────────────────                                      │
│  URL → [Web Scraper] → [Content Analyzer] → [LLM Validator]                │
│                              ↓                                              │
│              ┌───────────────┼───────────────┐                              │
│              ↓               ↓               ↓                              │
│           APPROVED       FLAGGED         REJECTED                           │
│                                                                             │
│  FASE 2: RESOLUCIÓN (al expirar mercado + 2h)                              │
│  ─────────────────────────────────────────────                              │
│  Market → [Evidence Collector] → [Multi-LLM Consensus]                     │
│                              ↓                                              │
│              ┌───────────────┼───────────────┐                              │
│              ↓               ↓               ↓                              │
│          YES WINS       NO WINS        UNRESOLVABLE                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Estructura del Proyecto

```
oracle/
├── src/
│   ├── core/           # Tipos y configuración
│   │   ├── types.ts    # Interfaces TypeScript
│   │   └── config.ts   # Configuración y prompts
│   │
│   ├── validators/     # Fase 1: Validación de mercados
│   │   └── market.validator.ts
│   │
│   ├── resolvers/      # Fase 2: Resolución de mercados
│   │   └── market.resolver.ts
│   │
│   ├── services/       # Servicios externos
│   │   ├── llm.service.ts      # Anthropic, OpenAI
│   │   ├── scraper.service.ts  # Web scraping
│   │   └── news.service.ts     # Búsqueda de noticias
│   │
│   ├── admin/          # Control administrativo
│   │   └── admin.controller.ts
│   │
│   ├── db/             # Base de datos SQLite
│   │   └── database.ts
│   │
│   ├── cli/            # Herramientas de línea de comandos
│   │   ├── validate.ts
│   │   └── resolve.ts
│   │
│   ├── tests/          # Tests
│   │   └── gauntlet.ts
│   │
│   ├── server.ts       # API HTTP
│   └── index.ts        # Exports principales
│
├── package.json
├── tsconfig.json
└── .env.example
```

## Instalación

```bash
cd oracle
npm install
cp .env.example .env
# Editar .env con tus API keys
```

## Configuración

Edita `.env` con tus claves API:

```env
# LLM APIs (al menos una requerida)
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx

# Búsqueda de noticias
SERPER_API_KEY=xxxxx

# Admin
ADMIN_ADDRESSES=wallet1,wallet2
```

## Uso

### Iniciar el servidor API

```bash
npm run dev    # Desarrollo con hot-reload
npm start      # Producción
```

El servidor estará disponible en `http://localhost:3001`

### Ejecutar tests

```bash
npm test
```

### CLI para validación manual

```bash
# Validación rápida (solo reglas)
npx tsx src/cli/validate.ts --url "https://coindesk.com/btc" --title "Will BTC reach 100k?"

# Validación completa (con LLM)
npx tsx src/cli/validate.ts --url "https://coindesk.com/btc" --title "Will BTC reach 100k?" --category crypto
```

### CLI para resolución manual

```bash
npx tsx src/cli/resolve.ts --title "Did BTC reach 100k?" --url "https://coindesk.com/btc-price"

# Forzar resolución
npx tsx src/cli/resolve.ts --market-id abc123 --force yes
```

## API Endpoints

### Health & Status

```
GET /health         # Estado del servidor
GET /stats          # Estadísticas del oráculo
```

### Validación

```
POST /validate/quick    # Validación rápida (sin LLM)
POST /validate          # Validación completa
```

**Request body:**
```json
{
    "marketId": "market_123",
    "title": "Will Bitcoin reach $100k?",
    "description": "Price prediction",
    "sourceUrl": "https://coindesk.com/btc",
    "category": "crypto",
    "expiresAt": 1735689600000
}
```

### Resolución

```
POST /resolve/:marketId     # Resolver mercado
GET /resolution/:marketId   # Obtener resolución
```

### Mercados

```
GET /markets                        # Listar todos
GET /markets/:marketId              # Obtener uno
GET /markets/pending/resolution     # Pendientes de resolución
POST /markets                       # Registrar nuevo
```

### Admin

```
POST /admin/action          # Ejecutar acción admin
GET /admin/flagged          # Mercados flaggeados
```

### Webhooks (para DJinn)

```
POST /webhook/market-created    # Nuevo mercado on-chain
POST /webhook/market-expired    # Mercado expirado
```

## Flujo de Validación

1. **Layer 1: URL Validation**
   - Verificar que la URL es válida y accesible
   - Analizar el dominio (confiable, social media, blacklisted)

2. **Layer 2: Content Extraction**
   - Extraer contenido de la página web
   - Parsear título, descripción, fecha

3. **Layer 3: Resolvability Check**
   - ¿Es pregunta binaria YES/NO?
   - ¿Tiene fecha clara de resolución?
   - ¿Es objetivo (no subjetivo)?

4. **Layer 4: LLM Analysis**
   - Análisis profundo con Claude/GPT-4
   - Detectar posibles issues
   - Calcular score de confianza

### Resultados posibles:

| Status | Score | Acción |
|--------|-------|--------|
| `approved` | ≥70 | Mercado activo |
| `flagged` | 50-69 | Revisión manual |
| `rejected` | <50 | Quemar mercado + refund |

## Flujo de Resolución

1. **Evidence Collection**
   - Extraer contenido actualizado de URL fuente
   - Buscar noticias relacionadas
   - Identificar fuentes oficiales

2. **LLM Consensus**
   - Consultar múltiples LLMs (Claude + GPT-4)
   - Cada uno vota: YES / NO / UNRESOLVABLE
   - Mayoría simple decide (≥66% acuerdo)

3. **Outcome Determination**
   - Si hay consenso alto → resolver automáticamente
   - Si hay desacuerdo → flag para revisión manual

### Outcomes posibles:

| Outcome | Acción |
|---------|--------|
| `yes` | Pagar a holders de YES |
| `no` | Pagar a holders de NO |
| `unresolvable` | Refund a todos |

## Control Administrativo

Los admins pueden:

- **manual_approve**: Aprobar mercado flaggeado
- **manual_reject**: Rechazar mercado
- **manual_resolve_yes/no**: Resolver manualmente
- **flag_suspicious**: Marcar como sospechoso
- **pause_market**: Pausar trading
- **update_expiry**: Cambiar fecha de expiración

## Integración con DJinn

### Webhook desde DJinn → Oracle

Cuando se crea un mercado on-chain:

```javascript
// DJinn envía:
POST /webhook/market-created
{
    "marketId": "abc123",
    "title": "Will X happen?",
    "sourceUrl": "https://...",
    "creatorAddress": "wallet..."
}
```

El Oracle:
1. Registra el mercado
2. Inicia validación automática
3. Actualiza status a `active`, `flagged`, o `rejected`
4. (Opcional) Envía callback a DJinn

### Polling desde DJinn

```javascript
// Obtener estado de validación
GET /markets/abc123

// Obtener mercados pendientes de resolución
GET /markets/pending/resolution

// Obtener resolución
GET /resolution/abc123
```

## Seguridad

- Las claves privadas nunca se exponen al frontend
- Webhooks verificados con HMAC signature
- Solo admins pueden ejecutar overrides
- Todas las acciones se registran en audit log

## Desarrollo

```bash
# Tests
npm test

# Desarrollo con hot-reload
npm run dev

# Build para producción
npm run build
npm start
```

## Variables de Entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `ANTHROPIC_API_KEY` | API key de Anthropic | Sí* |
| `OPENAI_API_KEY` | API key de OpenAI | Sí* |
| `SERPER_API_KEY` | API key de Serper | No |
| `ADMIN_ADDRESSES` | Wallets de admin | No |
| `PORT` | Puerto del servidor | No (default: 3001) |
| `DATABASE_PATH` | Ruta de SQLite | No |

*Al menos una API key de LLM es requerida
