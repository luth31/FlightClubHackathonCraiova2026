# Best Practices for Structuring a React + Vite Project

When building modern React applications with **Vite**, the most scalable approach is a **Feature-Based (Domain-Driven)** architecture.

Unlike traditional file-type grouping (`/components`, `/hooks`, `/pages`), feature-based co-location keeps related UI, API calls, hooks, types, and **tests** together. This prevents sprawling directory trees as your application scales.

## 1. Directory Structure

### Recommended Vite Project Structure

```
my-vite-app/
├── e2e/                        # Root-level E2E tests (Playwright or Cypress)
│   ├── auth.spec.ts
│   └── dashboard.spec.ts
│
├── public/                     # Static assets served directly (favicon, robots.txt)
│
├── src/
│   ├── app/                    # Application setup & providers
│   │   ├── providers/          # App-wide providers (QueryClient, Auth, Theme)
│   │   ├── router.tsx          # React Router / routing configuration
│   │   └── main.tsx            # Vite entry point
│   │
│   ├── assets/                 # Processed static assets (SVGs, imagery, fonts)
│   │
│   ├── components/             # Domain-agnostic reusable UI components (Design System)
│   │   ├── ui/                 # Atomic elements (Button, Input, Modal, Card)
│   │   │   ├── Button.tsx
│   │   │   └── Button.test.tsx # Colocated component test
│   │   └── feedback/           # Toast, Spinner, Skeleton, ErrorBoundary
│   │
│   ├── config/                 # App configuration & environment parsing
│   │   └── env.ts
│   │
│   ├── features/               # Self-contained business domains
│   │   ├── auth/               # 'auth' feature module
│   │   │   ├── api/            # Feature API queries/mutations
│   │   │   │   ├── login.ts
│   │   │   │   └── login.test.ts
│   │   │   ├── components/     # Feature-specific UI components
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   └── LoginForm.test.tsx
│   │   │   ├── hooks/          # Custom hooks specific to auth
│   │   │   │   ├── useAuth.ts
│   │   │   │   └── useAuth.test.ts
│   │   │   ├── types/          # Feature-specific TypeScript types
│   │   │   │   └── index.ts
│   │   │   └── index.ts        # Feature public API (Barrel export)
│   │   │
│   │   └── dashboard/          # 'dashboard' feature module
│   │       ├── api/
│   │       ├── components/
│   │       └── index.ts
│   │
│   ├── hooks/                  # Global utility hooks (useDebounce, useMediaQuery)
│   │
│   ├── pages/                  # Route-level wrapper components
│   │   ├── LoginPage.tsx
│   │   └── DashboardPage.tsx
│   │
│   ├── services/               # API clients & external integrations (Axios/Fetch)
│   │   └── api-client.ts
│   │
│   ├── types/                  # Global shared TypeScript definitions
│   │   └── index.ts
│   │
│   └── utils/                  # Pure utility helper functions (formatters, validators)
│       ├── format-currency.ts
│       └── format-currency.test.ts # Utility test
│
├── .env                        # Environment variables
├── .env.example
├── index.html                  # Vite root HTML template
├── package.json
├── playwright.config.ts        # E2E test runner config (if using Playwright)
├── tsconfig.json               # TypeScript config
├── tsconfig.node.json          # TypeScript config for Vite/Node configs
├── vite.config.ts              # Vite configuration
└── vitest.config.ts            # Unit/Component test configuration

```

## 2. Testing Architecture Guidelines

For unit and component testing in React + Vite projects, **colocation** is the recommended strategy.

### Where Tests Live

1. **Unit & Component Tests (`src/`)**:
   * Keep unit tests and component tests in the exact same directory as the source file.
   * Example: `Button.tsx` and `Button.test.tsx` side-by-side.
   * Benefits: High visibility, easy maintenance, automated cleanup when deleting features, and clean relative imports.
2. **End-to-End (E2E) Tests (`/e2e`)**:
   * E2E tests verify complete user flows across multiple pages and services.
   * Place them at the root of the project inside an `e2e/` or `tests/` directory (e.g., using Playwright or Cypress).

### Testing Matrix Summary

| Test Type | Scope | Recommended Tool | Location | File Extension |
| :--- | :--- | :--- | :--- | :--- |
| **Unit Tests** | Pure functions, helpers, custom hooks | Vitest | Colocated inside `src/` | `*.test.ts` |
| **Component Tests** | Isolated React UI components | Vitest + React Testing Library | Colocated inside `src/` | `*.test.tsx` |
| **E2E Tests** | Full user journeys & flows | Playwright / Cypress | Root directory (`/e2e`) | `*.spec.ts` |

---

## 3. Setting Up Path Aliasing (`@/`) in Vite

Path aliases eliminate deeply nested relative paths (e.g., `../../../../components/Button`).

### Step 1: Configure `vite.config.ts`

Install `@types/node` if using TypeScript:

```bash
npm install -D @types/node
```

Update your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Step 2: Configure `tsconfig.json`

Add `baseUrl` and `paths` so TypeScript recognizes the alias:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Path Aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

Now you can import modules cleanly across your app:

```typescript
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth';
```

---

## 4. Key Architectural Patterns

### 1. Feature Public API (Barrels)

Expose internal feature members via `src/features/<feature-name>/index.ts` to enforce modular boundaries:

```typescript
// src/features/auth/index.ts
export { LoginForm } from './components/LoginForm';
export { useAuth } from './hooks/useAuth';
export type { User } from './types';
```

> **Rule:** Never import deeply into a feature from outside (e.g., avoid `@/features/auth/components/LoginForm`). Always import from the module root (`@/features/auth`).

### 2. Environment Variables in Vite

Vite exposes environment variables on `import.meta.env`. Store variables starting with `VITE_` in your `.env` file:

```env
VITE_API_URL=https://api.example.com
```

Type-safe environment helper (`src/config/env.ts`):

```typescript
export const env = {
  API_URL: import.meta.env.VITE_API_URL as string,
  IS_DEV: import.meta.env.DEV,
} as const;
```

### 3. Thin Route Pages

Pages inside `src/pages/` should serve strictly as route handlers that pull in feature modules and layout components:

```tsx
// src/pages/LoginPage.tsx
import { LoginForm } from '@/features/auth';

export const LoginPage = () => {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <LoginForm />
    </main>
  );
};
```

---

## 5. Component Layering Quick Reference

| Layer | Path | Purpose | Example |
| :--- | :--- | :--- | :--- |
| **Shared UI** | `src/components/ui/` | Purely visual, zero domain/business logic | `<Button>`, `<Modal>` |
| **Feature UI** | `src/features/*/components/` | Domain-aware, handles user actions/data | `<LoginForm>`, `<CartSummary>` |
| **Page Layer** | `src/pages/` | Maps URLs and layouts to feature components | `<DashboardPage>` |
