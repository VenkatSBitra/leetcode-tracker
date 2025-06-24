import * as vscode from 'vscode';
import { InterpretationDetails, LeetCode, LeetCodeProblem } from './LeetCode';

const LEETCODE_SESSION_KEY = 'leetcodeTracker.sessionCookie';
const CSRF_TOKEN_KEY = 'leetcodeTracker.csrfToken';
const CACHED_PROBLEMS_KEY = 'leetcodeTracker.cachedProblems';
const CACHED_PROBLEMS_TIMESTAMP_KEY = 'leetcodeTracker.cachedProblemsTimestamp';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHED_EXAMPLE_TESTS_KEY = 'leetcodeTracker.cachedExampleTests';
const COMPLETED_PROBLEMS_KEY = 'leetcodeTracker.completedProblems';

export class LeetCodeService {
    private leetCode: LeetCode;
    private csrfToken: string | undefined;
    private sessionCookie: string | undefined;
    private headers: Record<string, string>;

    constructor(
        private secretStorage: vscode.SecretStorage,
        private globalState: vscode.Memento
    ) {
        this.leetCode = new LeetCode();
        this.csrfToken = undefined;
        this.sessionCookie = undefined;
        this.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Csrftoken': '',
            'Cookie': ''
        };
    }

    public async initializeAuthFromStorage(): Promise<void> {
        const sessionCookie = await this.secretStorage.get(LEETCODE_SESSION_KEY);
        const csrfToken = await this.secretStorage.get(CSRF_TOKEN_KEY);

        if (sessionCookie && csrfToken) {
            this.sessionCookie = sessionCookie;
            this.csrfToken = csrfToken;
            this.headers['X-Csrftoken'] = csrfToken;
            this.headers['Cookie'] = `LEETCODE_SESSION=${sessionCookie}; csrftoken=${csrfToken}`;
            // console.log('Session cookie and CSRF token loaded from storage.');
        } else {
            this.sessionCookie = undefined;
            this.csrfToken = undefined;
            // console.log('No session cookie or CSRF token found in storage.');
        }
    }

    private async setAuthCookiesInternal(sessionCookie: string, csrfToken: string, saveToStorage: boolean): Promise<void> {
        this.sessionCookie = sessionCookie;
        this.csrfToken = csrfToken;
        this.headers['X-Csrftoken'] = csrfToken;
        this.headers['Cookie'] = `LEETCODE_SESSION=${sessionCookie}; csrftoken=${csrfToken}`;

        if (saveToStorage) {
            await this.secretStorage.store(LEETCODE_SESSION_KEY, sessionCookie);
            await this.secretStorage.store(CSRF_TOKEN_KEY, csrfToken);
            // console.log('Session cookie and CSRF token saved to storage.');
        }
    }

    public async setAuthCookies(sessionCookie: string, csrfToken: string): Promise<void> {
        await this.setAuthCookiesInternal(sessionCookie, csrfToken, true);
    }

    public async clearAuthCookies(): Promise<void> {
        this.sessionCookie = undefined;
        this.csrfToken = undefined;
        this.headers['X-Csrftoken'] = '';
        this.headers['Cookie'] = '';

        await this.secretStorage.delete(LEETCODE_SESSION_KEY);
        await this.secretStorage.delete(CSRF_TOKEN_KEY);
        // console.log('Session cookie and CSRF token cleared from storage.');
    }

    public areCookiesSet(): boolean {
        return (this.sessionCookie !== undefined) && (this.csrfToken !== undefined);
    }

    public async fetchAllProblems(forceRefresh: boolean = false): Promise<[LeetCodeProblem[], string[]] | null> {
        const cachedProblems = this.globalState.get<any[]>(CACHED_PROBLEMS_KEY);
        const cachedTimestamp = this.globalState.get<number>(CACHED_PROBLEMS_TIMESTAMP_KEY);
        const completedProblems = this.globalState.get<string[]>(COMPLETED_PROBLEMS_KEY);

        if (!forceRefresh && cachedProblems && cachedTimestamp) {
            const now = Date.now();
            if (now - cachedTimestamp < CACHE_DURATION_MS) {
                // console.log('Returning cached problems.');
                if (completedProblems === undefined) {
                    return [cachedProblems, Array(cachedProblems.length).fill('')];
                }
                return [cachedProblems, completedProblems];
            }
        }

        try {
            const problems = await this.leetCode.getAllProblems(this.headers);
            await this.globalState.update(CACHED_PROBLEMS_KEY, problems);
            await this.globalState.update(CACHED_PROBLEMS_TIMESTAMP_KEY, Date.now());
            await this.globalState.update(CACHED_EXAMPLE_TESTS_KEY, Array(problems.length).fill(''));
            if (problems.length === completedProblems?.length) {
                if (completedProblems === undefined) {
                    await this.globalState.update(COMPLETED_PROBLEMS_KEY, Array(problems.length).fill(''));
                    return [problems, Array(problems.length).fill('')];
                } else {
                    await this.globalState.update(COMPLETED_PROBLEMS_KEY, completedProblems);
                    return [problems, completedProblems];
                }
            } else {
                const newCompletedProblems = Array(problems.length).fill('');
                for (let i = 0; i < problems.length; i++) {
                    if (completedProblems && completedProblems[i]) {
                        newCompletedProblems[i] = completedProblems[i];
                    } else {
                        newCompletedProblems[i] = '';
                    }
                }
                await this.globalState.update(COMPLETED_PROBLEMS_KEY, newCompletedProblems);
                return [problems, newCompletedProblems];
            }
        } catch (error) {
            console.error('Error fetching problems:', error);
            return null;
        }
    }

    public async clearSolvedProblems(): Promise<void> {
        try {
            const completedProblems = this.globalState.get<string[]>(COMPLETED_PROBLEMS_KEY);
            if (completedProblems) {
                for (let i = 0; i < completedProblems.length; i++) {
                    completedProblems[i] = '';
                }
                await this.globalState.update(COMPLETED_PROBLEMS_KEY, completedProblems);
            }
        } catch (error) {
            console.error('Error clearing solved problems:', error);
        }
    }

    public async fetchUsername(): Promise<string | null> {
        try {
            // console.log(this.headers);
            const response = await this.leetCode.getUsername(this.headers);
            return response || null;
        } catch (error) {
            console.error('Error fetching username:', error);
            return null;
        }
    }

    public async fetchProblemDetails(titleSlug: string, questionId: string): Promise<any | null> {
        try {
            if (!this.areCookiesSet()) {
                return null;
            }

            const exampleTestcases = this.globalState.get<string[]>(CACHED_EXAMPLE_TESTS_KEY);
    
            const problemDetails = await this.leetCode.getProblemDetails(titleSlug, this.headers);

            if (problemDetails && exampleTestcases) {
                exampleTestcases[Number.parseInt(questionId) - 1] = problemDetails.exampleTestcases;
                // console.log("New example test cases:", exampleTestcases);
                await this.globalState.update(CACHED_EXAMPLE_TESTS_KEY, exampleTestcases);
            }

            return problemDetails || null;
        } catch (error) {
            console.error('Error fetching problem details:', error);
            return null;
        }
    }

    public async failedProblem(question_id: string): Promise<any | null> {
        try {
            if (!this.areCookiesSet()) {
                return null;
            }

            const completedProblems = this.globalState.get<string[]>(COMPLETED_PROBLEMS_KEY);
            if (completedProblems) {
                completedProblems[Number.parseInt(question_id) - 1] = 'notac';
                await this.globalState.update(COMPLETED_PROBLEMS_KEY, completedProblems);
            }

            return completedProblems || null;
        } catch (error) {
            console.error('Error marking problem as failed:', error);
            return null;
        }
    }

    public async solvedProblem(question_id: string): Promise<any | null> {
        try {
            if (!this.areCookiesSet()) {
                return null;
            }

            const completedProblems = this.globalState.get<string[]>(COMPLETED_PROBLEMS_KEY);
            if (completedProblems) {
                completedProblems[Number.parseInt(question_id) - 1] = 'ac';
                await this.globalState.update(COMPLETED_PROBLEMS_KEY, completedProblems);
            }

            return completedProblems || null;
        } catch (error) {
            console.error('Error marking problem as solved:', error);
            return null;
        }
    }

    public async isProblemSolved(question_id: string): Promise<any | null> {
        try {
            if (!this.areCookiesSet()) {
                return null;
            }

            const completedProblems = this.globalState.get<string[]>(COMPLETED_PROBLEMS_KEY);
            return completedProblems ? completedProblems[Number.parseInt(question_id) - 1] === 'ac' : null;
        } catch (error) {
            console.error('Error checking if problem is solved:', error);
            return null;
        }
    }

    public async testSolution(
        questionId: string,
        questionFrontendId: string,
        langSlug: string,
        typedCode: string,
        dataInput: string, // Empty string for default test cases often works
        titleSlug: string
    ): Promise<any | null> {
        try {
            if (!this.areCookiesSet()) {
                return { error: 'Not logged in. Please login first.' };
            }

            const exampleTestcases = this.globalState.get<string[]>(CACHED_EXAMPLE_TESTS_KEY);
            // console.log('Example test cases:', exampleTestcases);

            const exampleTestcase = exampleTestcases ? (exampleTestcases[Number.parseInt(questionFrontendId) - 1] || '') : '';

            // console.log('Testing solution with dataInput:', exampleTestcase);

            const testResult = await this.leetCode.testSolution(
                questionId,
                langSlug,
                typedCode,
                dataInput,
                titleSlug,
                exampleTestcase,
                this.headers
            );

            return testResult || null;
        } catch (error) {
            console.error('Error testing solution:', error);
            return null;
        }
    }

    public async submitSolution(
        questionId: string,
        langSlug: string,
        typedCode: string,
        titleSlug: string
    ): Promise<any | null> {
        try {
            if (!this.areCookiesSet()) {
                return { error: 'Not logged in. Please login first.' };
            }

            const submissionResult = await this.leetCode.submitSolution(
                questionId,
                langSlug,
                typedCode,
                titleSlug,
                this.headers
            );

            return submissionResult || null;
        } catch (error) {
            console.error('Error submitting solution:', error);
            return null;
        }
    }

    public async checkInterpretationStatus(interpretId: string): Promise<InterpretationDetails | { error?: string }> {
        try {
            if (!this.areCookiesSet()) {
                return { error: 'Not logged in. Please login first.' };
            }

            const status = await this.leetCode.checkInterpretationStatus(interpretId, this.headers);
            // console.log('Interpretation status:', status);
            return status || null;
        } catch (error) {
            console.error('Error checking interpretation status:', error);
            return { error: 'Failed to check interpretation status.' };
        }
    }
}

