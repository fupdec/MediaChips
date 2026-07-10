/// <reference types="vite/client" />
/// <reference path="../shared/electron/window.d.ts" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '*.md?raw' {
  const content: string
  export default content
}

declare module 'path-browserify' {
  const path: {
    join: (...parts: string[]) => string
    extname: (filePath: string) => string
    dirname: (filePath: string) => string
    basename: (filePath: string) => string
    [key: string]: unknown
  }
  export default path
}

declare module 'vue-chartjs' {
  import type { DefineComponent } from 'vue'
  export const Line: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export const Bar: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
}

declare module 'chart.js' {
  export class Chart {
    static register(...items: unknown[]): void
  }
  export const Title: unknown
  export const Tooltip: unknown
  export const Legend: unknown
  export const LineElement: unknown
  export const LinearScale: unknown
  export const CategoryScale: unknown
  export const PointElement: unknown
}
