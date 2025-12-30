# Frontend Modernization Requirements

## Overview

Modernize and clean up the DuckQuery frontend codebase to improve maintainability, type safety, and code organization.

## Goals

1. **Type Safety**: Migrate main entry file from JavaScript to TypeScript
2. **Code Cleanup**: Remove deprecated code, redundant files, and outdated comments
3. **Architecture Optimization**: Refactor compatibility layers into clean, idiomatic patterns
4. **API Modularization**: Split monolithic API client into focused modules

## Scope

### In Scope

| Area | Files | Action |
|------|-------|--------|
| Entry Migration | `DuckQueryApp.jsx` → `DuckQueryApp.tsx` | Full TypeScript conversion |
| Entry Migration | `main.jsx` → `main.tsx` | TypeScript conversion |
| Hook Cleanup | `useAppShell.ts` | Remove deprecated annotations, modernize API |
| API Splitting | `services/apiClient.js` | Split into typed modules |
| Asset Cleanup | Duplicate logo imports | Consolidate |

### Out of Scope

- Component-level refactoring (handled separately)
- Test file migration (follow-on task)
- Backend changes

## Success Criteria

1. `npm run build` passes with zero TypeScript errors
2. All deprecated/compatibility comments removed
3. `services/` directory contains typed, modular API files
4. No functional regression (manual verification)

## Dependencies

- TypeScript already configured in project
- ESLint TypeScript rules active

## Risks

| Risk | Mitigation |
|------|-----------|
| Runtime regression | Comprehensive browser testing before/after |
| Import path breakage | Update all consumers atomically |
| Type inference issues | Use explicit types where needed |
