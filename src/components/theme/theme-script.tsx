import { THEME_STORAGE_KEY } from './theme-constants'

/**
 * Blocking inline script that sets the theme before first paint.
 *
 * A server component on purpose. React 19 warns that a `<script>` rendered from
 * a client component is never executed, and this file must run — otherwise a
 * dark-mode device flashes white on every load.
 *
 * Kept dependency-free and synchronous so it finishes before the browser paints.
 */
export function ThemeScript() {
  const script = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(s==='light'||s==='dark')?s:(m?'dark':'light');var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t;}catch(e){}})()`

  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />
}
