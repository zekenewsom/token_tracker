# Token Tracker

A full-stack Solana token and wallet analytics dashboard.

## Monorepo Structure
- `frontend/`: React + Vite dashboard
- `backend/`: Node.js/Express API, SQLite, Solana integration

## Getting Started

1. Install dependencies (requires [pnpm](https://pnpm.io/)):
   ```sh
   pnpm install
   ```
2. Start development servers:
   ```sh
   pnpm -r dev
   ```
3. Build for production:
   ```sh
   pnpm build
   ```

## Environment Variables
- See `backend/.env.example` for backend config.

---

## Project Scripts
- `pnpm -r dev` – run both frontend and backend in dev mode
- `pnpm build` – build both frontend and backend
- `pnpm start` – start backend only
