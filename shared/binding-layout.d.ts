export interface BindingPageBlock {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    chunkIndex?: number;
}

export interface BindingOptions {
    includeCover?: boolean;
    includeUserText?: boolean;
    includeAuthorNote?: boolean;
    authorNoteText?: string;
}

export const DEFAULT_BINDING_OPTIONS: Required<Pick<BindingOptions, 'includeCover' | 'includeUserText' | 'includeAuthorNote'>> & Pick<BindingOptions, 'authorNoteText'>;

export function normalizeBindingOptions(options?: BindingOptions | null): Required<Pick<BindingOptions, 'includeCover' | 'includeUserText' | 'includeAuthorNote'>> & Pick<BindingOptions, 'authorNoteText'>;

export interface BindingPage {
    number: number;
    kind: 'cover' | 'author_note' | 'body';
    blocks: BindingPageBlock[];
}

export interface BindingViewerSettings {
    fontSize?: number;
    lineHeight?: number;
}

export function getBindingBodyBudget(viewerSettings?: BindingViewerSettings | null): number;
export function normalizeBindingText(text: string): string;
export function estimateBindingTextCost(text: string, role: 'user' | 'assistant'): number;
export function calculateBindingPointCost(pageCount: number, bindingPointCostPerPage?: number): number;
export function splitBindingText(text: string, budget: number): string[];
export function buildBindingPages(payload: {
    title: string;
    background: string;
    environment: string;
    messages: Array<{ id: number; role: 'user' | 'assistant'; content: string }>;
    viewerSettings?: BindingViewerSettings | null;
    options?: BindingOptions | null;
}): BindingPage[];
export function estimateBindingPageCount(payload: {
    title: string;
    background: string;
    environment: string;
    messages: Array<{ id: number; role: 'user' | 'assistant'; content: string }>;
    viewerSettings?: BindingViewerSettings | null;
    options?: BindingOptions | null;
}): number;
