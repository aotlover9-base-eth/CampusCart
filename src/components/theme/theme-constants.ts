/**
 * Theme constants shared by the server-rendered script and the client provider.
 *
 * Deliberately has no `'use client'` directive so it can be imported from both
 * sides without pulling the provider into the server bundle.
 */

/** localStorage key holding the user's explicit light/dark choice. */
export const THEME_STORAGE_KEY = 'campuscart-theme'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
