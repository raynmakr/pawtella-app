# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pawtella is an early prototype of a pet app. It has a pet photo feed, a chat with a pet assistant, a pet profile form and a subscription builder for pet supplies driven by plain-language commands. It is built with Expo SDK ~54, expo-router v6, React Native 0.81 and React 19. The New Architecture, typed routes and the React Compiler are turned on in `app.json`.

## Commands

- `npm install`: install dependencies (the repo uses npm and `package-lock.json`).
- `npm start` (or `npx expo start`): start the Metro and Expo dev server.
- `npm run ios`, `npm run android`, `npm run web`: start the dev server and open that platform.
- `npm run lint`: run `expo lint`, which uses ESLint flat config with `eslint-config-expo`.
- `npx tsc --noEmit`: type-check. There is no script for this. Most app code is plain JS, so this only covers the `.ts`/`.tsx` files.

There is no test framework and no CI.

Avoid `npm run reset-project`. It asks questions as it runs, and it moves or deletes `app/`, `components/`, `hooks/`, `constants/` and `scripts/`.

## Architecture

**Routing.** expo-router turns each file in `app/` into a route. The entry point is `expo-router/entry`. `app/_layout.tsx` is a flat `Tabs` layout with the tabs `index` (feed), `chat`, `profile` and `subscriptions`. There is no `(tabs)` group at the root.
- The subscriptions tab is declared with `name="subscriptions"`, but the file is `app/subscription.js`. Fix one or the other before relying on that tab.
- `app/explore.tsx` and `app/modal.tsx` are leftovers from the Expo template and are not registered in the layout.

**Two generations of code live side by side.**
- `app/*.js` holds the live screens. They use plain React Native with inline `StyleSheet` and hard-coded colors, and import from `src/` with relative paths (`../src/...`).
- `src/` holds the app logic:
  - `src/data/` has mock data (`feed.js`, `inventory.js`).
  - `src/state/subscriptionEngine.js` is a factory that wraps a `cart` / `setCart` state pair with `addItem`, `removeItem` and `updateFrequency`. It finds items by case-insensitive substring match against inventory names.
  - `src/ai/intent.js` turns commands into engine calls with rules (a mock parser).
  - `src/ai/intentLLM.js` calls OpenAI to turn text into `{ action, itemName, frequency }` JSON.
  - `src/utils/ai.js` returns a random mock caption.
  - `src/utils/pickImage.js` wraps the `expo-image-picker` camera and gallery.
  - `src/components/` has `FadeIn`, an animated wrapper whose `trigger()` is called from the feed's `onViewableItemsChanged`, and `Input`.
- `screens/` and `src/navigation/RootNavigator.js` are dead code: placeholder screens from an older React Navigation setup. `RootNavigator` imports `SubscriptionsScreen`, which doesn't exist (the file is `SubscriptionScreen.js`). Don't wire them back in.
- `components/`, `hooks/` and `constants/theme.ts` are from the Expo template. They provide `ThemedText`, `ThemedView`, `useThemeColor` / `useColorScheme`, `IconSymbol` (SF Symbols on iOS via `icon-symbol.ios.tsx`, Material Icons elsewhere) and `HapticTab`. Import them with the `@/` alias, which maps to the repo root. Today only the template screens use them. If you add theming, put colors in `constants/theme.ts` and read them through `useThemeColor`.

**The subscription and AI flow** in `app/subscription.js`:
- Inventory is shown in a grid. Tapping an item opens a modal where you pick a frequency, and the item is added to the `cart` state.
- The `engine` is rebuilt from `createSubscriptionEngine(cart, setCart)` on every render.
- The allowed frequency strings are exactly `"Every Week"`, `"Every 2 Weeks"`, `"Every Month"` and `"Every 2 Months"`. They are duplicated in the screen, the intent parser and both LLM prompts, so keep them in sync.
- Known bug: `runAIInstruction` and `runAICommand` are defined at module level but use `engine`, which only exists inside the component.
- The screen also has a temporary "Test OpenAI" button.

**OpenAI keys.**
- The client-side calls (`src/ai/intentLLM.js` and `app/subscription.js`) create the OpenAI SDK client with `EXPO_PUBLIC_OPENAI_API_KEY`. That key is bundled into the app.
- `api/interpret.js` is a server handler in the style of a Vercel function. It does the same parsing with the server-only key `OPENAI_API_KEY`, but nothing calls it yet. It is the intended way to move the key off the device.
- Both paths use the model `gpt-4o-mini`.

## Repository quirks

- `pawtella-app/` (a nested folder) is an untouched copy of the original `create-expo-app` template, with `app/(tabs)/...`. Work in the root. Ignore the nested copy unless you're asked to change it.
- `.github/copilot-instructions.md` describes that template layout (`app/(tabs)/`, `ThemedView` everywhere). It is out of date for the root `app/`.
- `app.json` sets the iOS camera permission text (`NSCameraUsageDescription`). Add matching permission config for any new native capability.
- When you upgrade Expo, keep `react-native`, `expo-router`, `react-native-reanimated` and `react-native-worklets` on the versions that SDK pins (`npx expo install --fix`).
