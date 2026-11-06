import type { MediaItem, MediaRef } from '@shared/expressive'

export const refOf = (m: MediaItem): MediaRef => ({ kind: m.kind, source: m.source, id: m.id })
export const sameRef = (a: MediaRef, b: MediaRef): boolean => a.source === b.source && a.id === b.id
