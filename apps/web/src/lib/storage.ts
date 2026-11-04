'use client'

export function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function save<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function remove(key: string) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(key)
}
