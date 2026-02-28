/// <reference types="vite/client" />

declare const __BUILD_MODE__: string | undefined

// Allow JSON imports
declare module '*.json' {
  const value: unknown
  export default value
}
