// Crypto polyfill must load before any wallet code: CSPRNG from the OS via expo-crypto.
import { getRandomValues } from 'expo-crypto'
const g = globalThis as unknown as { crypto?: { getRandomValues?: unknown } }
g.crypto = g.crypto ?? {}
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = getRandomValues

import { registerRootComponent } from 'expo'
import App from './App'

registerRootComponent(App)
