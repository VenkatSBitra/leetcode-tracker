import * as vscode from 'vscode';
import { LeetCodeService } from './LeetCodeService';

// --- Custom Tree Item Classes (Define these first) ---

export class InfoTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command, // Optional command
    ) {
        super(label, collapsibleState);
        this.command = command;
    }
    contextValue = 'infoItem';
}

export class ActionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: string = 'account',
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}`;
        if (command) {
            this.command = command;
        }
        this.iconPath = new vscode.ThemeIcon(type); // Example: 'account', 'zap', 'play', etc.
    }     
    contextValue = 'actionItem';
}

export class CategoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly problemCount?: string,
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}${problemCount !== undefined ? ` (${problemCount.split(' ')[0]})` : ''}`;
        this.description = problemCount !== undefined ? `${problemCount}` : '';
    }
    contextValue = 'categoryItem';
}

export class ProblemTreeItem extends vscode.TreeItem {
    constructor(
        public readonly questionTitle: string, // Problem title
        public readonly questionId: string, // Problem ID
        public readonly difficulty: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly titleSlug: string,
        public readonly status?: string, // e.g., "ac", "notac"
        private readonly extensionUri?: vscode.Uri // For custom SVG icons
    ) {
        super(`[${questionId}] ${questionTitle}`, collapsibleState);
        this.label = `[${questionId}] ${questionTitle}`;
        this.tooltip = `[${this.questionId}] ${this.questionTitle} - ${this.difficulty}`;
        this.description = this.difficulty;

        let iconColor: vscode.ThemeColor | undefined = undefined;
        if (this.difficulty === 'Easy') {
            iconColor = new vscode.ThemeColor('charts.green');
        } else if (this.difficulty === 'Medium') {
            iconColor = new vscode.ThemeColor('charts.yellow');
        } else if (this.difficulty === 'Hard') {
            iconColor = new vscode.ThemeColor('charts.red');
        }

        // Icon logic (as previously defined)
        if (status === 'ac') {
            this.iconPath = new vscode.ThemeIcon('check', iconColor || new vscode.ThemeColor('charts.green'));
        } else if (status === 'notac') { // Assuming 'notac' is a possible status string
            this.iconPath = new vscode.ThemeIcon('error', iconColor || new vscode.ThemeColor('charts.red'));
        } else if (this.extensionUri && difficulty === 'CustomSVGExample') { // Example for using a custom SVG
             this.iconPath = {
                 light: vscode.Uri.joinPath(this.extensionUri, 'images', 'custom-problem-light.svg'),
                 dark: vscode.Uri.joinPath(this.extensionUri, 'images', 'custom-problem-dark.svg')
             };
        } else {
            switch (difficulty?.toLowerCase()) {
                case 'easy':
                    this.iconPath = new vscode.ThemeIcon('lightbulb', iconColor);
                    break;
                case 'medium':
                    this.iconPath = new vscode.ThemeIcon('lightbulb-autofix', iconColor);
                    break;
                case 'hard':
                    this.iconPath = new vscode.ThemeIcon('flame', iconColor);
                    break;
                default:
                    this.iconPath = new vscode.ThemeIcon('question');
            }
        }

        this.command = {
            command: 'leetcode-tracker.showProblemDescription',
            title: 'Show Problem Description',
            arguments: [this.titleSlug, this.questionId]
        };
    }
    contextValue = 'problemItem';
}


// --- Define TreeElement as a union of your item types ---
// ***** THIS IS THE IMPORTANT LINE *****
export type TreeElement = ProblemTreeItem | CategoryTreeItem | ActionTreeItem | InfoTreeItem;
// ***** ENSURE IT IS PRESENT AND CORRECT *****


export class LeetCodeTreeDataProvider implements vscode.TreeDataProvider<TreeElement> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeElement | undefined> = new vscode.EventEmitter<TreeElement | undefined>();
    readonly onDidChangeTreeData: vscode.Event<TreeElement | undefined> = this._onDidChangeTreeData.event;

    private problems: ProblemTreeItem[] = [];
    private easyProblems: ProblemTreeItem[] = [];
    private mediumProblems: ProblemTreeItem[] = [];
    private hardProblems: ProblemTreeItem[] = [];
    private isLoggedIn: boolean = false;
    private leetCodeService: LeetCodeService;
    private extensionUri: vscode.Uri;
    
    private tags: string[] = [];
    private tagProblems: Record<string, ProblemTreeItem[]> = {};

    private companies: Record<string, string> = {};
    private companyProblems: Record<string, ProblemTreeItem[]> = {};

    constructor(
        leetCodeService: LeetCodeService,
        extensionUri: vscode.Uri,
    ) {
        this.leetCodeService = leetCodeService;
        this.extensionUri = extensionUri;
        this.isLoggedIn = this.leetCodeService.areCookiesSet();
    }

    private async fetchProblemsInternal(forceRefresh: boolean = false): Promise<void> {
        const result = await this.leetCodeService.fetchAllProblems(forceRefresh);
        const fetchedProblems = result ? result[0] : null;
        const completedProblems = result ? result[1] : null;
        if (fetchedProblems && completedProblems) {
            // console.log('Fetched problems:', fetchedProblems);
            this.problems = fetchedProblems.map(problem => {
                return new ProblemTreeItem(
                    problem.title,
                    problem.questionFrontendId,
                    problem.difficulty,
                    vscode.TreeItemCollapsibleState.None,
                    problem.titleSlug,
                    completedProblems[Number.parseInt(problem.questionFrontendId) - 1], // Ensure your problem objects from API have a 'status' field
                    this.extensionUri
                );
            });
            
            this.easyProblems = this.problems.filter(problem => problem.difficulty === 'Easy');
            this.mediumProblems = this.problems.filter(problem => problem.difficulty === 'Medium');
            this.hardProblems = this.problems.filter(problem => problem.difficulty === 'Hard');

            this.tags = [...new Set(fetchedProblems.map(problem => problem.tags).flat())].sort();
            this.tagProblems = fetchedProblems.filter(problem => problem.tags).reduce((acc, { tags }, i) => {
                tags.forEach(tag => (acc[tag] = [...(acc[tag] || []), this.problems[i]]));
                return acc;
            }, {} as Record<string, ProblemTreeItem[]>);

            const companiesQ = fetchedProblems.filter(e => e.companyTags !== undefined).map(problem => {
                const json = JSON.parse(problem.companyTags as string);
                const compTags = [...json['1'], ...json['2'], ...json['3']];
                return compTags.map(tag => {
                    return {
                        'name': tag.name,
                        'slug': tag.slug,
                    };
                });
            }).flat();
            this.companies = companiesQ.reduce((acc, { name, slug }) => {
                acc[name] = slug;
                return acc;
            }, {} as Record<string, string>);
            this.companyProblems = companiesQ.filter(company => company.slug).reduce((acc, { slug }, i) => {
                acc[slug] = [...(acc[slug] || []), this.problems[i]];
                return acc;
            }, {} as Record<string, ProblemTreeItem[]>);
        } else {
            this.problems = [];
            // Optionally notify user if fetching failed despite being logged in
            if (this.isLoggedIn) {
                vscode.window.showWarningMessage('Could not load LeetCode problems.');
            }
        }
    }

    // Implement the required methods for the TreeDataProvider interface
    public async refresh(forceRefresh: boolean = false): Promise<void> {
        this.isLoggedIn = this.leetCodeService.areCookiesSet();
        // console.log(this.isLoggedIn);
        await this.fetchProblemsInternal(forceRefresh);
        if (forceRefresh) {
            this.problems = [];
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TreeElement): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeElement | undefined): Promise<TreeElement[]> {
        if (!element) {
            const rootItems: TreeElement[] = [];

            if (!this.isLoggedIn) {
                rootItems.push(
                    new ActionTreeItem(
                        'Login to LeetCode',
                        vscode.TreeItemCollapsibleState.None,
                        'account',
                        {
                            command: 'leetcode-tracker.login',
                            title: 'Login to LeetCode',
                        }
                    )
                );
            } else {
                rootItems.push(
                    new ActionTreeItem(
                        'Status: Logged In (Click to Logout)',
                        vscode.TreeItemCollapsibleState.None,
                        'account',
                        {
                            command: 'leetcode-tracker.logout',
                            title: 'Logout from LeetCode',
                        }
                    )
                );

                rootItems.push(
                    new ActionTreeItem(
                        'Refresh Problems',
                        vscode.TreeItemCollapsibleState.None,
                        'extensions-sync-enabled',
                        {
                            command: 'leetcode-tracker.refresh',
                            title: 'Refresh Problems',
                        }
                    )
                );

                rootItems.push(
                    new ActionTreeItem(
                        'Clear Solved Problems',
                        vscode.TreeItemCollapsibleState.None,
                        'notebook-delete-cell',
                        {
                            command: 'leetcode-tracker.clearSolved',
                            title: 'Clear Solved Problems',
                        }
                    )
                );

                rootItems.push(new CategoryTreeItem(
                    "All Problems",
                    vscode.TreeItemCollapsibleState.Collapsed,
                    `${this.problems.length} problems`
                ));

                rootItems.push(new CategoryTreeItem(
                    "Difficulty",
                    vscode.TreeItemCollapsibleState.Collapsed,
                    `3 difficulties`
                ));

                // Add categories for each tag with a super category called "Tags"
                rootItems.push(new CategoryTreeItem(
                    "Tags",
                    vscode.TreeItemCollapsibleState.Collapsed,
                    `${this.tags.length} tags`
                ));

                // Add categories for each company with a super category called "Companies"
                rootItems.push(new CategoryTreeItem(
                    "Companies",
                    vscode.TreeItemCollapsibleState.Collapsed,
                    `${Object.keys(this.companies).length} companies`
                ));
            }

            return rootItems;
        }

        if (this.isLoggedIn) {
            if (element instanceof CategoryTreeItem) {
                if (element.label === "All Problems") {
                    if (this.problems.length === 0) {
                        return [new InfoTreeItem(this.isLoggedIn ? "No problems loaded. Try refreshing." : "Login to load problems.", vscode.TreeItemCollapsibleState.None)];
                    }
                    return this.problems;
                }

                if (element.label === "Difficulty") {
                    return [
                        new CategoryTreeItem("Easy", vscode.TreeItemCollapsibleState.Collapsed, `${this.easyProblems.length} problems`),
                        new CategoryTreeItem("Medium", vscode.TreeItemCollapsibleState.Collapsed, `${this.mediumProblems.length} problems`),
                        new CategoryTreeItem("Hard", vscode.TreeItemCollapsibleState.Collapsed, `${this.hardProblems.length} problems`)
                    ];
                }

                // Handle difficulty categories
                if (element.label === "Easy") {
                    return this.easyProblems;
                }
                if (element.label === "Medium") {
                    return this.mediumProblems;
                }
                if (element.label === "Hard") {
                    return this.hardProblems;
                }

                if (element.label === "Tags") {
                    return this.tags.map(tag => new CategoryTreeItem(tag, vscode.TreeItemCollapsibleState.Collapsed, `${this.tagProblems[tag]?.length || 0} problems`));
                }

                // Handle tag categories
                if (element.label in this.tagProblems) {
                    const tagProblems = this.tagProblems[element.label];
                    if (tagProblems.length === 0) {
                        return [new InfoTreeItem("No problems found for this tag.", vscode.TreeItemCollapsibleState.None)];
                    }
                    return tagProblems;
                }

                if (element.label === "Companies") {
                    return Object.keys(this.companies).sort().map(companyName => {
                        return new CategoryTreeItem(companyName, vscode.TreeItemCollapsibleState.Collapsed, `${companyName} problems`);
                    });
                }

                // Handle company categories
                if (element.label in this.companyProblems) {
                    const companyProblems = this.companyProblems[element.label];
                    if (companyProblems.length === 0) {
                        return [new InfoTreeItem("No problems found for this company.", vscode.TreeItemCollapsibleState.None)];
                    }
                    return companyProblems;
                }
            }
        }

        return [];
    }
}