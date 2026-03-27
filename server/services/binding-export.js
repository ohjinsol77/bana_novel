import { buildBindingPages, calculateBindingPointCost, normalizeBindingOptions } from '../../shared/binding-layout.js';
import { getBindingPointCostPerPage } from '../db.js';
import { formatKoreanNovelBindingText } from './korean-novel-formatter.js';

const DEFAULT_BINDING_EXPORT_VIEWER_SETTINGS = {
    fontSize: 11,
    lineHeight: 1.55,
};

function sanitizeBindingMessages(messageRows = []) {
    const normalizedMessages = [];
    const messageReports = [];

    for (const message of messageRows) {
        const formatted = formatKoreanNovelBindingText(message?.content || '');

        normalizedMessages.push({
            ...message,
            content: formatted.text,
        });
        messageReports.push({
            messageId: message.id,
            role: message.role === 'user' ? 'user' : 'assistant',
            ...formatted.report,
        });
    }

    const warnings = messageReports.flatMap((report) =>
        (report.warnings || []).map((warning) => `메시지 ${report.messageId}: ${warning}`)
    );

    return {
        messages: normalizedMessages,
        messageReports,
        warnings,
    };
}

export function buildBindingExportContext({
    story,
    messageRows,
    viewerSettings,
    options,
    currentBalance = 0,
}) {
    const normalizedOptions = normalizeBindingOptions(options);
    const sanitized = sanitizeBindingMessages(messageRows);
    const bindingViewerSettings = {
        ...DEFAULT_BINDING_EXPORT_VIEWER_SETTINGS,
    };
    const bindingPointCostPerPage = getBindingPointCostPerPage();
    const pages = buildBindingPages({
        title: story?.title || '',
        background: story?.background || '',
        environment: story?.environment || '',
        messages: sanitized.messages,
        viewerSettings: bindingViewerSettings,
        options: normalizedOptions,
    });
    const cost = calculateBindingPointCost(pages.length, bindingPointCostPerPage);

    return {
        story,
        viewerSettings: bindingViewerSettings,
        messageRows: sanitized.messages,
        pages,
        pageCount: pages.length,
        cost,
        currentBalance,
        bindingPointCostPerPage,
        renderChecks: {
            warnings: sanitized.warnings,
            messageReports: sanitized.messageReports,
            normalizedMessageCount: sanitized.messages.length,
        },
    };
}
