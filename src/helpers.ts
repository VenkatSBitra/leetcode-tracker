/**
 * Helper functions for the LeetCode Tracker VSCode extension
 */
import * as path from 'path';

/**
 * Generates styled HTML content for displaying LeetCode problems in a WebView
 * @param title The title of the LeetCode problem
 * @param content The content/description of the LeetCode problem
 * @returns Formatted HTML string for WebView display
 */
export function generateProblemHTML(title: string, content: string, titleSlug: string): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(title)}</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                    line-height: 1.6;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    max-width: 900px;
                    margin: 0 auto;
                }
                h1 {
                    color: var(--vscode-activityBarBadge-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                pre {
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 12px;
                    border-radius: 5px;
                    overflow-x: auto;
                    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
                }
                code {
                    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 2px 4px;
                    border-radius: 3px;
                }
                .problem-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 10px;
                }
                .problem-stats {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                img {
                    max-width: 100%;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 16px 0;
                }
                th, td {
                    border: 1px solid var(--vscode-panel-border);
                    padding: 8px 12px;
                }
                th {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                }
                .example {
                    background-color: var(--vscode-editor-lineHighlightBackground);
                    padding: 12px;
                    border-radius: 5px;
                    margin: 16px 0;
                }
                a {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }
                a:hover {
                    text-decoration: underline;
                }
                .footer-links {
                    margin-top: 30px;
                    padding-top: 15px;
                    border-top: 1px solid var(--vscode-panel-border);
                    display: flex;
                    gap: 20px;
                }
            </style>
        </head>
        <body>
            <div class="problem-header">
                <h1><a href="https://leetcode.com/problems/${titleSlug}/" target="_blank">${escapeHtml(title)}</a></h1>
            </div>
            <div class="problem-content">
                ${content}
            </div>
            <div class="footer-links">
                <a href="https://leetcode.com/problems/${titleSlug}/editorial/" target="_blank">View Editorial</a>
                <a href="https://leetcode.com/problems/${titleSlug}/solutions/" target="_blank">View Solutions</a>
            </div>
        </body>
        </html>
    `;
}

/**
 * Escapes HTML special characters to prevent XSS
 * @param text Input text to escape
 * @returns Escaped text safe for HTML insertion
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export interface ParsedLcProblemInfo {
    questionId: string;
    titleSlug: string;
    langSlug: string;
    fullSlugPart: string; // The 'questionId.title-slug' part
}

export function parseLcProblemFileName(fileName: string): ParsedLcProblemInfo | null {
    const baseName = path.basename(fileName); // e.g., "1.two-sum.lc.cpp"
    const parts = baseName.split('.'); // ["1", "two-sum", "lc", "cpp"]

    if (parts.length < 4 || parts[parts.length - 2] !== 'lc') {
        // Must have at least qid.slug.lc.lang and the "lc" marker
        return null;
    }

    const questionId = parts[0];
    const langSlug = parts[parts.length - 1];
    const titleSlugParts = parts.slice(1, -2); // Parts between questionId and "lc"

    if (!questionId || titleSlugParts.length === 0 || !langSlug) {
        return null;
    }
    const titleSlug = titleSlugParts.join('.');
    const fullSlugPart = `${questionId}.${titleSlug}`;

    return { questionId, titleSlug, langSlug, fullSlugPart };
}