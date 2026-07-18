import { customAlphabet } from 'nanoid'

// URL-safe, no ambiguous chars; short enough to read in logs.
const alphabet = '0123456789abcdefghijkmnpqrstuvwxyz'
const gen = customAlphabet(alphabet, 12)

export const newId = (prefix: string): string => `${prefix}_${gen()}`
