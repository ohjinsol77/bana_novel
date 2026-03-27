const DOUBLE_QUOTES_PATTERN = /[“”„‟＂]/g;
const SINGLE_QUOTES_PATTERN = /[‘’‚‛＇]/g;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/g;
const DIALOGUE_TAG_PATTERN = /(말했|물었|대답했|외쳤|중얼거렸|속삭였|덧붙였|받아쳤|응수했|되물었|소리쳤|불렀|내뱉었|투덜거렸|짚었|웃었|미소를 지었|고개를 끄덕였|고개를 저었|시선을 돌렸|눈을|손을|입술을|미간을)/;

function trimTrailingSpaces(lines) {
    return lines.map((line) => line.replace(/[ \t]+$/g, ''));
}

function countDoubleQuotes(text) {
    return (String(text || '').match(/"/g) || []).length;
}

function hasOpenDoubleQuote(text) {
    return countDoubleQuotes(text) % 2 === 1;
}

function startsWithQuote(text) {
    return /^["']/.test(String(text || '').trim());
}

function endsWithTerminal(text) {
    return /[.!?…"']$/.test(String(text || '').trim());
}

function endsWithQuote(text) {
    return /"$/.test(String(text || '').trim());
}

function sentenceEndingCount(text) {
    return (String(text || '').match(/[.!?…]/g) || []).length;
}

function looksLikeShortNarrationLine(text) {
    const trimmed = String(text || '').trim();
    return Boolean(
        trimmed
        && !startsWithQuote(trimmed)
        && trimmed.length <= 90
        && sentenceEndingCount(trimmed) <= 1
    );
}

function looksLikeDialogueTagLine(text) {
    const trimmed = String(text || '').trim();
    return Boolean(
        trimmed
        && !startsWithQuote(trimmed)
        && trimmed.length <= 120
        && DIALOGUE_TAG_PATTERN.test(trimmed)
    );
}

function joinFragments(left, right) {
    const prev = String(left || '').replace(/[ \t]+$/g, '');
    const next = String(right || '').replace(/^[ \t]+/g, '');

    if (!prev) return next;
    if (!next) return prev;
    if (next === '"') return `${prev}"`;
    if (/["'([{<]$/.test(prev)) return `${prev}${next}`;
    if (/^[,.;:!?…)"'\]}]/.test(next)) return `${prev}${next}`;
    return `${prev} ${next}`;
}

function shouldMergeLine(previous, current, hadBlankLine) {
    const prev = String(previous || '').trim();
    const next = String(current || '').trim();
    if (!prev || !next) return false;

    if (next === '"') return true;
    if (hasOpenDoubleQuote(prev)) return true;
    if (hadBlankLine) return false;
    if (!endsWithTerminal(prev)) return true;
    if (endsWithQuote(prev) && (looksLikeDialogueTagLine(next) || looksLikeShortNarrationLine(next))) return true;
    if (startsWithQuote(next) && (looksLikeDialogueTagLine(prev) || looksLikeShortNarrationLine(prev))) return true;
    if (/^[,.;:!?…)"'\]}]/.test(next)) return true;

    return false;
}

function normalizeParagraphSpacing(text) {
    const input = String(text || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s+([,.;:!?…])/g, '$1')
        .trim();

    let result = '';
    let inDoubleQuote = false;

    const trimResultRight = () => {
        result = result.replace(/ +$/g, '');
    };

    const nextVisibleChar = (source, start) => {
        for (let index = start; index < source.length; index += 1) {
            if (!/\s/.test(source[index])) return source[index];
        }
        return '';
    };

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];

        if (char === '"') {
            if (inDoubleQuote) {
                trimResultRight();
                result += '"';
                inDoubleQuote = false;
            } else {
                const prevChar = result.slice(-1);
                if (prevChar && !/[\s([{\n]/.test(prevChar)) {
                    result += ' ';
                }
                result += '"';
                inDoubleQuote = true;
            }
            continue;
        }

        if (/\s/.test(char)) {
            const prevChar = result.slice(-1);
            const nextChar = nextVisibleChar(input, index + 1);

            if (!nextChar) continue;
            if (!prevChar || prevChar === ' ') continue;
            if (prevChar === '"' && inDoubleQuote) continue;
            if (nextChar === '"' && inDoubleQuote) continue;
            if (/[,.!?…:;)\]}]/.test(nextChar)) continue;

            result += ' ';
            continue;
        }

        const prevChar = result.slice(-1);
        if (prevChar === '"' && !inDoubleQuote && /[A-Za-z0-9가-힣(]/.test(char)) {
            result += ' ';
        }
        if (prevChar === ' ' && /[,.!?…:;)\]}]/.test(char)) {
            result = result.slice(0, -1);
        }

        result += char;
    }

    return result
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function buildParagraphs(lines) {
    const paragraphs = [];
    let mergedLineBreaks = 0;
    let attachedStandaloneQuotes = 0;
    let skippedBlankLines = 0;
    let hadBlankLine = false;

    for (const rawLine of lines) {
        const line = String(rawLine || '').trim();

        if (!line) {
            if (paragraphs.length && hasOpenDoubleQuote(paragraphs[paragraphs.length - 1])) {
                skippedBlankLines += 1;
                continue;
            }
            hadBlankLine = true;
            continue;
        }

        if (!paragraphs.length) {
            paragraphs.push(line);
            hadBlankLine = false;
            continue;
        }

        const previous = paragraphs[paragraphs.length - 1];
        if (shouldMergeLine(previous, line, hadBlankLine)) {
            paragraphs[paragraphs.length - 1] = joinFragments(previous, line);
            mergedLineBreaks += 1;
            if (line === '"') attachedStandaloneQuotes += 1;
        } else {
            paragraphs.push(line);
        }

        hadBlankLine = false;
    }

    return {
        paragraphs,
        mergedLineBreaks,
        attachedStandaloneQuotes,
        skippedBlankLines,
    };
}

export function formatKoreanNovelBindingText(text) {
    const source = String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(DOUBLE_QUOTES_PATTERN, '"')
        .replace(SINGLE_QUOTES_PATTERN, "'")
        .replace(/\u00a0/g, ' ')
        .replace(ZERO_WIDTH_PATTERN, '');

    const rawLines = trimTrailingSpaces(source.split('\n'));
    while (rawLines.length && !rawLines[0].trim()) rawLines.shift();
    while (rawLines.length && !rawLines[rawLines.length - 1].trim()) rawLines.pop();

    const originalParagraphCount = rawLines.filter((line) => line.trim()).length;
    const { paragraphs, mergedLineBreaks, attachedStandaloneQuotes, skippedBlankLines } = buildParagraphs(rawLines);
    const formattedParagraphs = paragraphs.map(normalizeParagraphSpacing).filter(Boolean);
    const formattedText = formattedParagraphs.join('\n\n');

    const warnings = [];
    if (countDoubleQuotes(formattedText) % 2 === 1) {
        warnings.push('쌍따옴표 개수가 홀수입니다. 대사가 닫히지 않았을 수 있습니다.');
    }

    return {
        text: formattedText,
        report: {
            originalParagraphCount,
            formattedParagraphCount: formattedParagraphs.length,
            mergedLineBreaks,
            attachedStandaloneQuotes,
            skippedBlankLines,
            warnings,
        },
    };
}
