# Contributing to FlowForge

Thank you for contributing to FlowForge! This guide explains our development workflow, coding standards, and testing requirements.

## Development Workflow

1. **Prerequisites**
   - Node.js 22+ (tested up to Node.js 24)
   - pnpm 12.16+
   - Docker & Docker Compose (optional for local PostgreSQL and Redis)

2. **Branching Model**
   - Main release branch: `master`
   - Feature branches: `feat/<feature-name>`
   - Bugfix branches: `fix/<bug-name>`
   - Refactor/Chore: `chore/<chore-name>`

3. **Local Setup**

   ```bash
   git clone https://github.com/soumikbur/FlowForge.git
   cd FlowForge
   pnpm install
   pnpm db:generate
   ```

4. **Quality Gates & Verification**
   Before submitting a Pull Request, all of the following commands must pass locally:

   ```bash
   pnpm format      # Prettier formatting verification
   pnpm lint        # ESLint analysis
   pnpm typecheck   # TypeScript compiler across all workspaces
   pnpm test        # Full unit and integration test suite (873 tests)
   pnpm build       # Optimized production builds
   ```

5. **Commit Conventions**
   We adhere to Conventional Commits:
   - `feat:` new user-facing functionality
   - `fix:` bug fixes and regressions
   - `docs:` documentation updates
   - `test:` adding or refactoring test suites
   - `refactor:` code restructuring without external behavioral changes
   - `chore:` dependency upgrades, tooling, and build configuration
