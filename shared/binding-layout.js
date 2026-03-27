export function getBindingBodyBudget(viewerSettings = {}) {
    const baseCharsPerPage = 1700;
    const fontSize = Math.max(10, Math.min(18, Number(viewerSettings?.fontSize ?? 12)));
    const lineHeight = Math.max(1.2, Math.min(2.2, Number(viewerSettings?.lineHeight ?? 1.6)));
    const scale = (12 / fontSize) * (1.6 / lineHeight);
    const conservativeOverhead = 60;
    return Math.max(420, Math.round(baseCharsPerPage * scale) - conservativeOverhead);
}

export function normalizeBindingText(text) {
    const normalized = String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/\uFEFF/g, '');

    const lines = normalized
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''));

    while (lines.length && !lines[0].trim()) {
        lines.shift();
    }

    while (lines.length && !lines[lines.length - 1].trim()) {
        lines.pop();
    }

    const compacted = [];
    let blankRun = 0;

    for (const line of lines) {
        if (!line.trim()) {
            blankRun += 1;
            if (blankRun <= 1) compacted.push('');
            continue;
        }

        blankRun = 0;
        compacted.push(line);
    }

    return compacted.join('\n').trim();
}

export const DEFAULT_BINDING_OPTIONS = {
    includeCover: true,
    includeUserText: false,
    includeAuthorNote: false,
    authorNoteText: '',
};

export function normalizeBindingOptions(options = {}) {
    return {
        includeCover: Boolean(options.includeCover ?? DEFAULT_BINDING_OPTIONS.includeCover),
        includeUserText: false,
        includeAuthorNote: Boolean(options.includeAuthorNote ?? DEFAULT_BINDING_OPTIONS.includeAuthorNote),
        authorNoteText: String(options.authorNoteText ?? DEFAULT_BINDING_OPTIONS.authorNoteText ?? '').trim(),
    };
}

export function estimateBindingTextCost(text, role) {
    const normalized = normalizeBindingText(text);
    if (!normalized) return role === 'assistant' ? 24 : 20;
    const linePenalty = (normalized.match(/\n/g) || []).length * 5;
    const rolePenalty = 0;
    const blockPenalty = role === 'assistant' ? 4 : 2;
    return normalized.length + linePenalty + rolePenalty + blockPenalty;
}

export function calculateBindingPointCost(pageCount, bindingPointCostPerPage = 1) {
    const pages = Math.max(0, Math.trunc(Number(pageCount) || 0));
    const perPage = Math.max(0, Math.trunc(Number(bindingPointCostPerPage) || 0));
    return pages * perPage;
}

export function splitBindingText(text, budget) {
    const normalized = normalizeBindingText(text);
    if (!normalized) return [''];
    if (normalized.length <= budget) return [normalized];

    const chunks = [];
    let remaining = normalized;

    while (remaining.length > budget) {
        const windowStart = Math.max(0, budget - 160);
        const windowText = remaining.slice(windowStart, budget + 1);
        const boundaryCandidates = [
            windowText.lastIndexOf('\n'),
            windowText.lastIndexOf('。'),
            windowText.lastIndexOf('.'),
            windowText.lastIndexOf('!'),
            windowText.lastIndexOf('?'),
            windowText.lastIndexOf(' '),
        ].filter((index) => index >= 0);

        let cutIndex = budget;
        if (boundaryCandidates.length) {
            cutIndex = windowStart + Math.max(...boundaryCandidates) + 1;
        }

        if (cutIndex <= 0 || cutIndex >= remaining.length) {
            cutIndex = budget;
        }

        const chunk = remaining.slice(0, cutIndex).trim();
        if (chunk) chunks.push(chunk);
        remaining = remaining.slice(cutIndex).trimStart();
    }

    if (remaining) chunks.push(remaining);
    return chunks.filter(Boolean);
}

function buildBindingBodyPages(messages = [], viewerSettings = {}) {
    const bodyBudget = getBindingBodyBudget(viewerSettings);
    const pages = [];
    let currentBlocks = [];
    let currentCost = 0;
    const pending = [];

    for (const message of messages) {
        const normalized = normalizeBindingText(message?.content || '');
        if (!normalized) continue;
        pending.push({
            messageId: message.id,
            role: message.role === 'user' ? 'user' : 'assistant',
            content: normalized,
            chunkIndex: 0,
        });
    }

    const flushPage = () => {
        if (!currentBlocks.length) return;
        pages.push({
            number: pages.length + 1,
            kind: 'body',
            blocks: currentBlocks,
        });
        currentBlocks = [];
        currentCost = 0;
    };

    while (pending.length) {
        const item = pending.shift();
        const chunkCost = estimateBindingTextCost(item.content, item.role);
        const remainingBudget = bodyBudget - currentCost;

        if (currentBlocks.length && chunkCost > remainingBudget) {
            const splitBudget = Math.max(160, remainingBudget - 40);
            const chunks = splitBindingText(item.content, splitBudget);

            if (chunks.length > 1) {
                pending.unshift(
                    ...chunks.map((content, index) => ({
                        ...item,
                        content,
                        chunkIndex: item.chunkIndex + index,
                    }))
                );
                continue;
            }

            flushPage();
            pending.unshift(item);
            continue;
        }

        if (!currentBlocks.length && chunkCost > bodyBudget) {
            const splitBudget = Math.max(160, bodyBudget - 40);
            const chunks = splitBindingText(item.content, splitBudget);

            if (chunks.length > 1) {
                pending.unshift(
                    ...chunks.map((content, index) => ({
                        ...item,
                        content,
                        chunkIndex: item.chunkIndex + index,
                    }))
                );
                continue;
            }
        }

        if (currentBlocks.length && currentCost + chunkCost > bodyBudget) {
            flushPage();
            pending.unshift(item);
            continue;
        }

        currentBlocks.push({
            id: `${item.messageId}-${item.chunkIndex}`,
            role: item.role,
            content: item.content,
            chunkIndex: item.chunkIndex,
        });
        currentCost += chunkCost;
    }

    flushPage();
    return pages;
}

function buildBindingFrontMatterPages(pages, options, bodyStartPage) {
    const frontMatter = [];
    let nextPageNumber = 1;
    const bodyEndPage = pages.length ? bodyStartPage + pages.length - 1 : bodyStartPage;

    if (options.includeCover) {
        frontMatter.push({
            number: nextPageNumber,
            kind: 'cover',
            blocks: [],
        });
        nextPageNumber += 1;
    }

    if (options.includeAuthorNote) {
        frontMatter.push({
            number: nextPageNumber,
            kind: 'author_note',
            blocks: [
                {
                    id: 'author-note-1',
                    role: 'assistant',
                    content: options.authorNoteText || '작가의 말이 없습니다.',
                },
            ],
        });
        nextPageNumber += 1;
    }

    return frontMatter;
}

export function buildBindingPages(payload) {
    const options = normalizeBindingOptions(payload?.options);
    const sourceMessages = (payload?.messages || []).filter((message) => message?.role !== 'user');
    const bodyPages = buildBindingBodyPages(sourceMessages, payload?.viewerSettings);
    const bodyStartPage = 1 + (options.includeCover ? 1 : 0) + (options.includeAuthorNote ? 1 : 0);
    const frontMatterPages = buildBindingFrontMatterPages(bodyPages, options, bodyStartPage);
    const pages = [...frontMatterPages];

    bodyPages.forEach((page, index) => {
        pages.push({
            ...page,
            number: bodyStartPage + index,
            kind: 'body',
        });
    });

    return pages;
}

export function estimateBindingPageCount(payload) {
    return buildBindingPages(payload).length;
}
