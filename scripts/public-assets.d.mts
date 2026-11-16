import type {Plugin} from 'vite'

export function collectPublicAssets(publicDir: string): Array<{fileName: string; source: Buffer}>
export function staticPublicAssets(publicDir: string): Plugin
