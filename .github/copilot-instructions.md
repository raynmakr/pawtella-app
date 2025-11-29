## Quick orientation

This is an Expo + expo-router React Native app (SDK ~54). The app uses file-based routing under the `app/` folder and a small, shared theming system. Edit screens under `app/` to change routes and UI.

Key entry points and examples:
- App entry: `package.json` -> `main: "expo-router/entry"`
- Root stack and modal registration: `app/_layout.tsx` (uses `Stack` from `expo-router`)
- Tab layout group: `app/(tabs)/_layout.tsx` (defines tabs and `HapticTab`/`IconSymbol` usage)
- Home screen: `app/(tabs)/index.tsx`
- Modal screen: `app/modal.tsx`

Project conventions an AI agent should follow
- Routing: this project uses expo-router file-based routes. Parentheses groupings like `(tabs)` are used to create route clusters. Example: `app/(tabs)/index.tsx` and `app/(tabs)/explore.tsx` are tab screens.
- Theming: prefer reuse of `ThemedView`/`ThemedText` and `useThemeColor`/`use-color-scheme` hook instead of hard-coded colors. Colors live in `constants/theme.ts` and are selected with `useColorScheme()`.
- Path alias: imports use the `@/` alias (see `tsconfig.json` -> `paths: { "@/*": ["./*"] }`). Resolve imports from repository root with `@/`.
- UI patterns: small presentational components live in `components/` (e.g., `themed-*`, `ui/icon-symbol.tsx`, `haptic-tab.tsx`, `parallax-scroll-view.tsx`). Follow existing prop shapes and style objects.

Build / run / dev workflows (explicit)
- Install: `npm install` (repo uses npm)
- Start Metro / Expo dev server: `npx expo start` (or `npm start`)
- Platform shortcuts: `npm run ios`, `npm run android`, `npm run web` (scripts call `expo start` with flags)
- Lint: `npm run lint` (runs `expo lint`)
- Reset project helper: `npm run reset-project` (runs `scripts/reset-project.js`). Note: this script is interactive and will move or delete `app`, `components`, `hooks`, `constants`, and `scripts` into `app-example` if chosen — be cautious.

Notable implementation patterns to mirror
- Theme helpers: `hooks/use-theme-color.ts` returns Colors from `constants/theme.ts`. Themed components call `useThemeColor(...)` to pick light/dark.
- Stack & Tabs: `app/_layout.tsx` wraps the app with a `ThemeProvider` and exposes a `Stack` with `Stack.Screen name="(tabs)"` and a modal `Stack.Screen name="modal"` with `presentation: 'modal'`.
- Small UX patterns: `HapticTab` is used as a `tabBarButton`, `IconSymbol` centralizes icon rendering, `Collapsible` implements simple disclosure behavior.

Repository quirks and gotchas
- There is a duplicated nested `pawtella-app/` directory mirroring the root — prefer editing the top-level `app/` and package.json unless you intentionally work inside the nested copy.
- The project relies on the Expo SDK version pinned in `package.json` (Expo ~54). When upgrading, match compatible `react-native`, `expo-router`, and related packages.

What to do when changing behavior
- When adding routes, follow file-based naming and groupings. For a modal, add `app/new-modal.tsx` and wire it via `Stack.Screen` if needed. For tab screens, add files under `app/(tabs)/`.
- When adding global colors or fonts, update `constants/theme.ts` and use `useThemeColor` in components.

If something is missing
- I scanned README and package.json but there are no tests or CI configs present. If you need tests or CI, mention preferred test frameworks and I can scaffold them.

Files to read for deeper context: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `components/themed-text.tsx`, `components/themed-view.tsx`, `constants/theme.ts`, `hooks/use-theme-color.ts`, `scripts/reset-project.js`.

If this looks good, say what you'd like expanded (CI, tests, more examples) and I'll iterate.
