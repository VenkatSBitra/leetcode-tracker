import axios from 'axios';

export interface LeetCodeProblem {
    questionId: string;
    questionFrontendId: string;
    title: string;
    titleSlug: string;
    difficulty: string;
    status: string | null;
    isPaidOnly: boolean;
    tags: string[];
    companyTags?: string; // Optional, if available
}

export interface TestRunPayload {
    question_id: string;
    lang: string;
    typed_code: string;
    data_input: string; // Custom test input
}

export interface TestRunResponse {
    interpret_id?: string;       // If polling is needed
    interpret_expected_id?: string; // Sometimes there's a separate ID for expected output for samples
    error?: string;
    // Direct results if no polling (less common for full test runs)
    status_code?: number;
    status_runtime?: string;
    status_memory?: string;
    code_output?: string[]; // stdout
    expected_code_output?: string[]; // expected stdout for samples
    std_output_list?: string[]; // another name for stdout
    compile_error?: string;
    runtime_error?: string;
    // ... other fields based on LeetCode's actual API response
}

export interface SubmitRunResponse {
    submission_id: string;
    status: string;
    // ... other relevant fields
}

export interface InterpretationDetails { // For polling
    state: string; // "PENDING", "STARTED", "SUCCESS", "FAILURE", "RUNTIME_ERROR", "COMPILE_ERROR"
    status_msg?: string;
    status_runtime?: string;
    runtime_percentile?: number;
    memory?: number;
    memory_percentile?: number;
    run_success?: boolean; // true if the code ran successfully
    total_testcases?: number; // Total number of test cases
    total_correct?: number; // Number of test cases that passed
    // stdout, stderr, input, expected output, etc.
    last_testcase?: string; // Input for which it ran, especially for default samples
    code_output?: string;
    expected_output?: string;
    compile_error?: string;
    runtime_error?: string;
    compare_result?: string; // "SUCCESS", "FAILURE", etc.
    correct_answer?: boolean; // true if the output matches the expected output
    code_answer?: string; // The actual output of the code
    expected_code_answer?: string; // The expected output
    // ... other relevant fields
}



export class LeetCode {
    private baseUrl: string = 'https://leetcode.com/graphql';

    /**
     * Login to LeetCode using cookie
     * @param headers Headers containing the cookie
     * @returns Promise with boolean indicating if login was successful
     */
    public async login(headers: Record<string, string>): Promise<boolean> {

        try {
            // Make a simple request to check if the cookie is valid
            const response = await axios.post(this.baseUrl, {
                query: `query { userStatus { username } }`
            }, {
                headers: headers
            });
            
            // If we get a username back, the cookie is valid
            const isValid = !!response.data?.data?.userStatus?.username;
            
            return isValid;
        } catch (error) {
            // On error, consider login failed
            console.error('Login verification failed:', error);
            return false;
        }
    }

    /**
     * Fetch all LeetCode problems
     * @param headers Headers containing the cookie
     * @returns Promise with array of LeetCode problems
     */
    public async getAllProblems(headers: Record<string, string>): Promise<LeetCodeProblem[]> {
        const query = `
            query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
                problemsetQuestionList: questionList(
                    categorySlug: $categorySlug
                    limit: $limit
                    skip: $skip
                    filters: $filters
                ) {
                    total: totalNum
                    questions: data {
                        questionId
                        questionFrontendId
                        title
                        titleSlug
                        difficulty
                        status
                        isPaidOnly
                        topicTags {
                            name
                            slug
                        }
                        companyTagStats
                    }
                }
            }
        `;

        const variables = {
            categorySlug: "",
            limit: 5000,
            skip: 0,
            filters: {}
        };

        try {
            const response = await axios.post(this.baseUrl, {
                query,
                variables
            }, {
                headers: headers
            });

            // console.log('Response:', response.data);

            const problems = response.data.data.problemsetQuestionList.questions.map((q: any): LeetCodeProblem => ({
                questionId: q.questionId,
                questionFrontendId: q.questionFrontendId,
                title: q.title,
                titleSlug: q.titleSlug,
                difficulty: q.difficulty,
                status: q.status,
                isPaidOnly: q.isPaidOnly,
                tags: q.topicTags.map((tag: any) => tag.name),
                companyTags: q.companyTagStats
            }));

            return problems;
        } catch (error) {
            console.error('Error fetching LeetCode problems:', error);
            throw error;
        }
    }

    public async getUsername(headers: Record<string, string>): Promise<string | null> {
        try {
            const response = await axios.post(this.baseUrl, {
                query: `query { userStatus { username } }`
            }, {
                headers: headers
            });

            return response.data.data.userStatus.username;
        } catch (error) {
            console.error('Error fetching username:', error);
            return null;
        }
    }

    public async getProblemDetails(titleSlug: string, headers: Record<string, string>): Promise<any> {
        const query = `
            query questionData($titleSlug: String!) {
                question(titleSlug: $titleSlug) {
                    title
                    content
                    codeDefinition
                    sampleTestCase
                    exampleTestcases
                    topicTags {
                        name
                        slug
                    }
                }
            }
        `;

        const variables = {
            titleSlug: titleSlug
        };

        try {
            const response = await axios.post(this.baseUrl, {
                query,
                variables
            }, {
                headers: headers
            });

            return response.data.data.question;
        } catch (error) {
            console.error('Error fetching problem details:', error);
            throw error;
        }
    }

    /**
     * Executes code against sample test cases or custom input.
     * @param questionId Internal numeric ID.
     * @param langSlug Language slug.
     * @param typedCode The code.
     * @param dataInput Custom test input. Send empty string or null for default samples.
     * @param titleSlug Problem's title slug (for Referer).
     * @returns A promise resolving to the test run response.
     */
    public async testSolution(
        questionId: string,
        langSlug: string,
        typedCode: string,
        dataInput: string, // Empty string for default test cases often works
        titleSlug: string,
        defaultTestcase: string = '',
        headers: Record<string, string>
    ): Promise<TestRunResponse> {
        // Using direct REST API endpoint instead of GraphQL
        const interpretUrl = `https://leetcode.com/problems/${titleSlug}/interpret_solution/`;

        const payload = {
            question_id: questionId,
            lang: langSlug,
            typed_code: typedCode,
            data_input: dataInput // Custom test input
        };
        
        if (dataInput && dataInput.trim().length > 0) {
            payload.data_input = dataInput;
        } else {
            payload.data_input = defaultTestcase;
        }

        try {
            const response = await axios.post(interpretUrl, payload, {
                headers: {
                    ...headers,
                    'Referer': `https://leetcode.com/problems/${titleSlug}/`,
                    'Content-Type': 'application/json'
                },
                withCredentials: true,
            });

            if (response.data) {
                return response.data as TestRunResponse;
            }

            return { error: 'Failed to run test: Empty response data.' };

        } catch (error: any) {
            console.error('Error running test solution:', error.response ? error.response.data : error.message);
            return { error: `Failed to run test solution: ${error.message}` };
        }
    }

    /**
     * Submits a solution to LeetCode.
     * @param questionId The question ID.
     * @param langSlug The language slug.
     * @param typedCode The code to submit.
     * @param titleSlug The title slug of the problem.
     * @returns A promise resolving to the submission response.
     */
    public async submitSolution(
        questionId: string,
        langSlug: string,
        typedCode: string,
        titleSlug: string,
        headers: Record<string, string>
    ): Promise<SubmitRunResponse | { error?: string }> {
        const submitUrl = `https://leetcode.com/problems/${titleSlug}/submit/`;

        const payload = {
            question_id: questionId,
            lang: langSlug,
            typed_code: typedCode
        };

        try {
            const response = await axios.post(submitUrl, payload, {
                headers: {
                    ...headers,
                    'Referer': `https://leetcode.com/problems/${titleSlug}/`,
                    'Content-Type': 'application/json'
                },
                withCredentials: true
            });

            if (response.data) {
                return response.data as SubmitRunResponse;
            }

            return { error: 'Failed to submit solution: Empty response data.' };

        } catch (error: any) {
            console.error('Error submitting solution:', error.response ? error.response.data : error.message);
            return { error: `Failed to submit solution: ${error.message}` };
        }
    }

    /**
     * Checks the status of a test interpretation/run.
     * @param interpretId The ID of the test interpretation.
     * @returns A promise resolving to the interpretation details.
     */
    public async checkInterpretationStatus(interpretId: string, headers: Record<string, string>): Promise<InterpretationDetails | { error?: string }> {
        // The URL might be /interpretations/detail/<id>/check/ or reuse /submissions/detail/<id>/check/
        // This needs to be verified.
        const checkUrl = `https://leetcode.com/submissions/detail/${interpretId}/check/`; // Assuming reuse for example

        try {
            const response = await axios.get(checkUrl, {
                headers: { ...headers, 'Referer': `https://leetcode.com/` }, // Generic referer or problem page
                withCredentials: true,
            });

            if (response.data) {
                return response.data as InterpretationDetails;
            }
            return { error: 'Failed to parse interpretation status: Empty response data.' };

        } catch (error: any) {
            console.error(`Error checking interpretation status for ID ${interpretId}:`, error.response ? error.response.data : error.message);
            return { error: `Failed to check interpretation status: ${error.message}` };
        }
    }
}