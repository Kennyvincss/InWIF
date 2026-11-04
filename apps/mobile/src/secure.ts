/**
 * Mobile key storage: recovery phrases live in the OS keychain (iOS Keychain /
 * Android Keystore-backed storage) via expo-secure-store, readable only after
 * biometric or device-passcode authentication, never synced or backed up.
 */
import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'

const SECRET_OPTS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock InWIF',
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
}

export async function biometricsAvailable() {
  const [hw, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
  return hw && enrolled
}

export async function confirmWithBiometrics(reason: string) {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, disableDeviceFallback: false })
  return r.success
}

export const saveSecret = (walletId: string, phrase: string) => SecureStore.setItemAsync(`secret.${walletId}`, phrase, SECRET_OPTS)
export const readSecret = (walletId: string) => SecureStore.getItemAsync(`secret.${walletId}`, SECRET_OPTS)
export const deleteSecret = (walletId: string) => SecureStore.deleteItemAsync(`secret.${walletId}`, SECRET_OPTS)

// Public wallet metadata (names, addresses) — not secret, no auth prompt.
export async function loadMeta<T>(fallback: T): Promise<T> {
  const v = await SecureStore.getItemAsync('meta.v1')
  return v ? (JSON.parse(v) as T) : fallback
}
export const saveMeta = (v: unknown) => SecureStore.setItemAsync('meta.v1', JSON.stringify(v))
