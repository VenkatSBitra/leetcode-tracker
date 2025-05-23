import * as vscode from 'vscode';
import * as path from 'path'; // For path.basename

// Assuming you have this parsing function (or similar) defined, possibly in extension.ts or a utils file
// It should be imported or accessible here.
// For this example, let's define it here if it's not already easily importable.
interface ParsedLcProblemInfo {
    questionId: string;
    titleSlug: string;
    langSlug: string;
    fullSlugPart: string; // The 'questionId.title-slug' part
}

function parseLcProblemFileName(fileName: string): ParsedLcProblemInfo | null {
    const baseName = path.basename(fileName); // e.g., "1.two-sum.lc.cpp"
    const parts = baseName.split('.'); // ["1", "two-sum", "lc", "cpp"]

    if (parts.length < 4 || parts[parts.length - 2] !== 'lc') {
        return null;
    }

    const questionId = parts[0];
    const langSlug = parts[parts.length - 1];
    const titleSlugParts = parts.slice(1, -2);

    if (!questionId || titleSlugParts.length === 0 || !langSlug) {
        return null;
    }
    const titleSlug = titleSlugParts.join('.');
    const fullSlugPart = `${questionId}.${titleSlug}`;

    return { questionId, titleSlug, langSlug, fullSlugPart };
}


export class LeetCodeCodelensProvider implements vscode.CodeLensProvider {

    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {
        // If you need to react to configuration changes or other events to refresh codelenses:
        // vscode.workspace.onDidChangeConfiguration((_) => {
        //     this._onDidChangeCodeLenses.fire();
        // });
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const problemInfo = parseLcProblemFileName(document.fileName);

        if (!problemInfo) {
            return []; // Not a valid LeetCode solution file according to our naming convention
        }

        // Place CodeLenses at the top of the document (first line)
        const topOfDocument = new vscode.Range(0, 0, 0, 1); // Small range on the first line
        const codeLenses: vscode.CodeLens[] = [];

        // Create "Test Solution" CodeLens
        const testCommand: vscode.Command = {
            title: "$(play) Test Solution", // Using Codicon
            command: "leetcode-tracker.testSolution",
            tooltip: "Run your code against sample or custom test cases.",
            // Arguments are not needed here if your command pulls from the active editor
        };
        codeLenses.push(new vscode.CodeLens(topOfDocument, testCommand));

        // Create "Submit Solution" CodeLens
        const submitCommand: vscode.Command = {
            title: "$(arrow-up) Submit Solution", // Using Codicon
            command: "leetcode-tracker.submitSolution",
            tooltip: "Submit your solution to LeetCode.",
        };
        // It's good to have a slightly different range for multiple lenses on the same line to avoid overlap issues,
        // though VS Code usually handles it. If they look jumbled, adjust the character position.
        // For simplicity, we can use the same range and VSCode will place them side-by-side.
        codeLenses.push(new vscode.CodeLens(topOfDocument, submitCommand));

        return codeLenses;
    }

    // public resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens | Thenable<vscode.CodeLens> {
    //     // This method is called to fill in the command details if they were not provided by provideCodeLenses.
    //     // Since our commands are simple and don't require lazy loading of titles or arguments based on context,
    //     // we might not need to implement this. If provideCodeLenses returns fully formed CodeLens objects,
    //     // resolveCodeLens might not even be called or needed.
    //     // However, it's good practice to have it if you plan more complex lenses later.
    //     // For now, we're providing the command directly.
    //     return codeLens;
    // }
}