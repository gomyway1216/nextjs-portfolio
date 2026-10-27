import catalog from '@/data/ogiri/prompts.json';
import type { Prompt } from './types';
// Only the server imports this file. The browser gets its assigned/current prompts, never the catalog.
export const prompts = catalog as Prompt[];
