# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Start Development
```bash
pnpm dev                    # Start both frontend and backend
pnpm --filter backend dev   # Backend only (localhost:4000)
pnpm --filter frontend dev  # Frontend only (localhost:5173)
```

### Database Operations
```bash
pnpm --filter backend db:init            # Initialize Prisma database
pnpm --filter backend refresh-data       # Manual data refresh from Solana
pnpm --filter backend full-cache-refresh # Clear and rebuild cache
pnpm --filter backend cache-stats        # View cache statistics
pnpm --filter backend cache-manager      # Cache management utilities
```

### Build & Deploy
```bash
pnpm build  # Build both frontend and backend
pnpm start  # Start backend in production mode
```

## Architecture Overview

This is a **Solana token analytics platform** with a React frontend and Node.js backend, tracking the token `2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump`.

### Backend (`/backend`)
- **Framework**: Express.js with SQLite + Prisma ORM
- **Blockchain**: Solana Web3.js integration
- **External APIs**: Helius DAS, QuickNode RPC, CoinGecko
- **Key Services**:
  - `solanaService.js` - Core blockchain interactions
  - `calculationService.js` - FIFO cost basis calculations
  - `analysisService.js` - Holder analytics
  - `cacheService.js` - In-memory performance caching

### Frontend (`/frontend`)
- **Framework**: React 18 + Vite, React Router
- **Styling**: Tailwind CSS
- **Charts**: Recharts for data visualization
- **Key Pages**: Dashboard (`/`) and Holder Analysis (`/analysis`)

### Data Flow
1. **Collection**: Fetch holder data via Helius DAS API
2. **Transaction Sync**: Pull transaction history for top holders via QuickNode
3. **Price Enrichment**: Historical prices from CoinGecko for cost basis
4. **Processing**: FIFO accounting for average acquisition prices
5. **Caching**: Multi-layer in-memory caching for performance

## Configuration Files

- **Backend Config**: `backend/src/config/solanaConfig.js` - Solana network and token settings
- **Database Schema**: `backend/prisma/schema.prisma` - Data models for Wallet, Transaction, TokenHolder, HourlyPrice
- **Environment**: `backend/.env.example` shows required environment variables

## Performance Considerations

- **Test Mode**: Currently processes top 320 holders (configurable in solanaConfig.js)
- **Batch Processing**: 5 wallets per batch to avoid RPC rate limits
- **Incremental Sync**: Only fetches new transactions since last sync
- **Caching**: Extensive in-memory caching for frequently accessed data

## Current Token Focus

The system tracks `2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump` with comprehensive holder analysis, transaction tracking, and cost basis calculations using proper FIFO accounting methods.