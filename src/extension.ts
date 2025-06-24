// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { LeetCodeService } from './leetcode/LeetCodeService';
import { LeetCodeTreeDataProvider } from './leetcode/LeetCodeTreeDataProvider';
import { generateProblemHTML, parseLcProblemFileName } from './helpers';
import { InterpretationDetails } from './leetcode/LeetCode';
import { LeetCodeCodelensProvider } from './leetcode/LeetCodeCodelensProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "leetcode-tracker" is now active!');

	const leetCodeService = new LeetCodeService(context.secrets, context.globalState);
	await leetCodeService.initializeAuthFromStorage();

	const leetCodeTreeDataProvider = new LeetCodeTreeDataProvider(leetCodeService, context.extensionUri);

	const treeView = vscode.window.createTreeView('leetcodeTrackerView', {
		treeDataProvider: leetCodeTreeDataProvider,
	});
	context.subscriptions.push(treeView);

	await leetCodeTreeDataProvider.refresh();

	const documentSelector: vscode.DocumentFilter[] = [
        {
            scheme: 'file',
            pattern: '**/*.lc.*'
        }
    ];

	context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(documentSelector, new LeetCodeCodelensProvider())
    );

	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-tracker.refresh', async () => {
			// When refreshing, you might want to clear cached problems (see next section)
			// For now, just tells the tree to re-evaluate based on current service state.
			await leetCodeTreeDataProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-tracker.refreshEntry', async () => {
			vscode.window.showInformationMessage('Refreshing LeetCode data...');
			// When refreshing, you might want to clear cached problems (see next section)
			// For now, just tells the tree to re-evaluate based on current service state.
			await leetCodeTreeDataProvider.refresh(true);
			vscode.window.showInformationMessage('LeetCode data refreshed!');
			await leetCodeTreeDataProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-tracker.clearSolved', async () => {
			const confirm = await vscode.window.showWarningMessage(
				'Are you sure you want to clear all solved problems?',
				{ modal: true },
				{ title: 'Yes' },
				{ title: 'No' }
			);
			if (confirm?.title === 'Yes') {
				await leetCodeService.clearSolvedProblems();
				vscode.window.showInformationMessage('Cleared all solved problems.');
				await leetCodeTreeDataProvider.refresh();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-tracker.helloWorld', async () => {
			const username = await leetCodeService.fetchUsername();
			vscode.window.showInformationMessage(`Logged in as ${username}!`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-tracker.login', async () => {
			const cookie = await vscode.window.showInputBox({
				prompt: 'Enter your LeetCode session cookie and CSRF token separated by a hash (#)',
				placeHolder: 'LEETCODE_SESSION#csrftoken'
			});
			if (!cookie) {
				vscode.window.showErrorMessage('Cookie is required');
				return;
			}

			const [sessionCookie, csrfToken] = cookie.split('#');
			if (!csrfToken) {
				vscode.window.showErrorMessage('CSRF token is required');
				return;
			}
            
			await leetCodeService.setAuthCookies(sessionCookie, csrfToken);
            await leetCodeService.initializeAuthFromStorage();
            await leetCodeTreeDataProvider.refresh();
			vscode.window.showInformationMessage('Logged in successfully!');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-tracker.logout', async () => {
            if (!leetCodeService.areCookiesSet()) {
				return;
			}
			try {
				await leetCodeService.clearAuthCookies();
				vscode.window.showInformationMessage('Logged out and credentials cleared. Refreshing view.');
				await leetCodeTreeDataProvider.refresh();
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to clear credentials: ${error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-tracker.showProblemDescription', async (titleSlug, questionId) => {
			if (!leetCodeService.areCookiesSet()) {
				return;
			}

            if (!titleSlug) {
				vscode.window.showErrorMessage('Invalid problem selected.');
				return;
			}

			const problemDetails = await leetCodeService.fetchProblemDetails(titleSlug, questionId);
			if (!problemDetails) {
				vscode.window.showErrorMessage('Failed to fetch problem details.');
				return;
			}
			
			// console.log('Problem Details:');
			// console.log(problemDetails);

			const codeDefinitions = JSON.parse(problemDetails.codeDefinition);

			if (codeDefinitions && Array.isArray(codeDefinitions) && codeDefinitions.length > 0) {
                    const languageChoices: vscode.QuickPickItem[] = codeDefinitions.map((def: any) => ({
                        label: def.text, // e.g., "C++"
                        description: `(${def.value})`, // e.g., "(cpp)"
                    }));

                    const selectedLanguage = await vscode.window.showQuickPick(languageChoices, {
                        placeHolder: 'Select a language for the solution file',
                        canPickMany: false
                    });

					const languageDetails = codeDefinitions.find((def: any) => def.value === selectedLanguage?.description?.replace(/\(|\)/g, ''));

                    if (selectedLanguage && selectedLanguage.label && languageDetails?.defaultCode) {
                        const langValue = languageDetails.value;
                        const defaultCode = languageDetails.defaultCode;

                        // Sanitize titleSlug for filename (basic example, might need more robust sanitization)
                        const sanitizedTitleSlug = titleSlug.replace(/[^a-zA-Z0-9-]/g, '_');
                        const fileName = `${questionId}.${sanitizedTitleSlug}.lc.${langValue}`;

                        try {
                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            let fileUri: vscode.Uri;

                            if (workspaceFolders && workspaceFolders.length > 0) {
                                // Create in the first workspace folder
                                const folderUri = workspaceFolders[0].uri;
                                fileUri = vscode.Uri.joinPath(folderUri, fileName);
																
								// Check if the file already exists
								try {
									await vscode.workspace.fs.stat(fileUri);
									// File exists, just open it by default
									const existingDoc = await vscode.workspace.openTextDocument(fileUri);
									await vscode.window.showTextDocument(existingDoc, vscode.ViewColumn.One);
									vscode.window.showInformationMessage(`Opened existing solution file: ${fileName}`);
								} catch (e) {
									// File doesn't exist, create it
									await vscode.workspace.fs.writeFile(fileUri, Buffer.from(defaultCode, 'utf8'));
									const doc = await vscode.workspace.openTextDocument(fileUri);
									await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
									vscode.window.showInformationMessage(`Created new solution file: ${fileName}`);
								}
                            } else {
                                // No workspace folder, create an untitled file
                                // Note: This approach won't use the desired filename directly for an untitled file's "dirty" state.
                                // It's better to inform the user or disable file creation if no workspace.
                                // For now, let's create an untitled document.
                                const untitledDoc = await vscode.workspace.openTextDocument({
                                    content: defaultCode,
                                    language: langValue
                                });
                                await vscode.window.showTextDocument(untitledDoc, vscode.ViewColumn.One);
                                vscode.window.showInformationMessage(`Created an untitled ${langValue} file. Save it manually (e.g., as ${fileName}).`);
                                // To truly set a suggested filename for an untitled file is not straightforward.
                                // The `vscode.workspace.fs.writeFile` approach is better if a workspace is available.
                            }
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to create file ${fileName}: ${error}`);
                            console.error(`File creation error for ${fileName}:`, error);
                        }
                    }
                } else {
                    vscode.window.showInformationMessage('No code definitions found for this problem to create a solution file.');
                }

			const panel = vscode.window.createWebviewPanel(
				'leetcodeProblem',
				`LeetCode Problem: ${problemDetails.title}`,
				vscode.ViewColumn.Beside,
				{}
			);

			// console.log(problemDetails);

			panel.webview.html = generateProblemHTML(`${questionId}. ${problemDetails.title}`, problemDetails.content, titleSlug);
		})
	);

	let testResultsOutputChannel: vscode.OutputChannel | undefined;

	function getTestResultsOutputChannel(): vscode.OutputChannel {
		if (!testResultsOutputChannel) {
			testResultsOutputChannel = vscode.window.createOutputChannel("LeetCode Test Results");
		}
		return testResultsOutputChannel;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-tracker.testSolution', async () => {
            if (!leetCodeService.areCookiesSet()) {
                vscode.window.showErrorMessage('You must be logged in to test solutions.');
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor found.');
				return;
			}

			const document = editor.document;
			const fileName = document.fileName;
			const code = document.getText();
			const languageId = document.languageId;
			const problemInfo = parseLcProblemFileName(fileName);

			if (!problemInfo) {
				vscode.window.showErrorMessage('Invalid file name format. Expected format: questionId.title-slug.lc.lang');
				return;
			}

			const { questionId, titleSlug, langSlug, fullSlugPart } = problemInfo;
            const problems = await leetCodeTreeDataProvider.getProblems();
            const qId = problems.find(p => p.questionFrontendId === questionId)?.questionId;
            if (!qId) {
                vscode.window.showErrorMessage(`Problem with ID ${questionId} not found in the current workspace.`);
                return;
            }

			const dataInput = await vscode.window.showInputBox({
                prompt: "Enter custom test input (leave empty for default sample test cases)",
                placeHolder: "e.g., [1,2,3]\\n4",
                title: `Test Input for ${fullSlugPart}`
            });

			if (dataInput === undefined) {
                vscode.window.showInformationMessage("Test cancelled.");
                return;
            }

			const outputChannel = getTestResultsOutputChannel();
            outputChannel.clear();
            outputChannel.appendLine(`Running test for: ${fullSlugPart} (${langSlug})`);
            if (dataInput.trim() !== "") {
                outputChannel.appendLine("Custom Input:");
                outputChannel.appendLine(dataInput);
            } else {
                outputChannel.appendLine("Using default sample test cases.");
            }
            outputChannel.appendLine("------------------------------------");
            outputChannel.show(true); // Preserve focus on editor

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Testing solution for ${fullSlugPart}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Sending to LeetCode..." });

                const testResponse = await leetCodeService.testSolution(qId, langSlug, code, dataInput, titleSlug);

                if (testResponse.error) {
                    progress.report({ increment: 100, message: "Test failed to start." });
                    vscode.window.showErrorMessage(`Test Failed: ${testResponse.error}`);
                    outputChannel.appendLine(`Error: ${testResponse.error}`);
                    return;
                }

                // If API returns interpret_id, then poll. Otherwise, try to display direct results.
                if (testResponse.interpret_id) {
                    const interpretId = testResponse.interpret_id;
                    progress.report({ message: `Test submitted (ID: ${interpretId}). Checking status...` });
                    outputChannel.appendLine(`Test execution ID: ${interpretId}. Polling for results...`);

                    let attempts = 0;
                    const maxAttempts = 20; // Shorter timeout for tests
                    const pollInterval = 1500; // Poll a bit faster for tests

                    const pollTest = async (): Promise<void> => {
                        if (attempts >= maxAttempts) {
                            vscode.window.showWarningMessage(`Stopped checking status for test ${interpretId} after timeout.`);
                            outputChannel.appendLine("Polling timed out.");
                            return;
                        }
                        attempts++;

                        const statusResult = await leetCodeService.checkInterpretationStatus(interpretId);
                        
                        // --- TYPE GUARD ---
                        // Check if it's an error object first.
                        if ('error' in statusResult && statusResult.error) {
                            vscode.window.showErrorMessage(`Error checking test status ${interpretId}: ${statusResult.error}`);
                            outputChannel.appendLine(`Error polling: ${statusResult.error}`);
                            // Decide if you want to stop polling on error or just log and continue
                            return; // Stop polling on error
                        }

                        // --- Now TypeScript knows statusResult is InterpretationDetails ---
                        // We can also be more explicit if InterpretationDetails always has 'state'
                        if (!('state' in statusResult)) {
                            vscode.window.showErrorMessage(`Error checking test status ${interpretId}: Invalid response structure.`);
                            outputChannel.appendLine(`Error polling: Invalid response structure from checkInterpretationStatus.`);
                            console.error("Invalid statusResult structure:", statusResult);
                            return; // Stop polling
                        }

                        // At this point, statusResult is confirmed to be of type InterpretationDetails (or a structure that has 'state')
                        const interpretationDetails = statusResult as InterpretationDetails; // Cast if needed, or rely on type narrowing

                        outputChannel.appendLine(`Poll attempt ${attempts}: State - ${interpretationDetails.state || 'Unknown'}`);
                        progress.report({ message: `Status: ${interpretationDetails.status_msg || interpretationDetails.state}` });

                        // LeetCode submission states: PENDING, STARTED, SUCCESS, FAILURE, ...
                        if (interpretationDetails.state !== "PENDING" && interpretationDetails.state !== "STARTED") { // Terminal state
                            outputChannel.appendLine("\n--- Test Result ---");
                            outputChannel.appendLine(`Status: ${interpretationDetails.correct_answer ? 'Accepted' : 'Wrong Answer'}`);
                            if(interpretationDetails.status_runtime) {outputChannel.appendLine(`Runtime: ${interpretationDetails.status_runtime}`);}
                            if(interpretationDetails.memory) {outputChannel.appendLine(`Memory: ${interpretationDetails.memory}`);}

                            if(testResponse.test_case) { // Input used by LeetCode
                                outputChannel.appendLine("\nInput (from LeetCode):");
                                outputChannel.appendLine(testResponse.test_case);
                            }

                            if (interpretationDetails.code_answer !== undefined && interpretationDetails.expected_code_answer !== undefined && interpretationDetails.compare_result !== undefined) {
                                const codeAnswer = interpretationDetails.code_answer;
								const expectedCodeAnswer = interpretationDetails.expected_code_answer;
								for (let i = 0; i < interpretationDetails.compare_result.length; i++) {
									const result = interpretationDetails.compare_result[i];
									outputChannel.appendLine(`\nYour Answer (${i + 1}): ${codeAnswer[i]}`);
									outputChannel.appendLine(`Expected Answer (${i + 1}): ${expectedCodeAnswer[i]}`);
									outputChannel.appendLine(`Comparison ${i + 1}: ${result === '1' ? 'Correct' : 'Incorrect'}`);
								}
                            } else if (interpretationDetails.status_msg !== "Accepted" && interpretationDetails.status_msg !== "Finished") {
								outputChannel.appendLine("\nUnexpected Status:");
								outputChannel.appendLine(interpretationDetails.status_msg as string);
							}
                            if(interpretationDetails.compile_error) {
                                outputChannel.appendLine("\nCompile Error:");
                                outputChannel.appendLine(interpretationDetails.compile_error);
                                vscode.window.showErrorMessage("Test failed: Compile Error. See output channel.");
                            }
                            if(interpretationDetails.runtime_error) {
                                outputChannel.appendLine("\nRuntime Error:");
                                outputChannel.appendLine(interpretationDetails.runtime_error);
                                vscode.window.showErrorMessage("Test failed: Runtime Error. See output channel.");
                            }
                            if(interpretationDetails.correct_answer) {
                                vscode.window.showInformationMessage(`Test for ${fullSlugPart}: ${interpretationDetails.status_msg || 'Finished'}`);
                            } else if (interpretationDetails.status_msg !== "Accepted" && interpretationDetails.status_msg !== "Finished") { 
                                vscode.window.showWarningMessage(`Test for ${fullSlugPart}: ${interpretationDetails.status_msg || 'Check output'}`);
                            }

                        } else { // Still pending or intermediate state
                            setTimeout(pollTest, pollInterval);
                        }
                    };
                    setTimeout(pollTest, pollInterval); // Start the first poll
                } else if (testResponse.status_code !== undefined) { // Direct results (less common but possible)
                    progress.report({ increment: 100, message: "Test finished." });
                    outputChannel.appendLine("\n--- Test Result (Direct) ---");
                    outputChannel.appendLine(`Status Code: ${testResponse.status_code}`);
                    if(testResponse.status_runtime) {outputChannel.appendLine(`Runtime: ${testResponse.status_runtime}`);}
                    if(testResponse.status_memory) {outputChannel.appendLine(`Memory: ${testResponse.status_memory}`);}
                    const actualOutput = testResponse.code_output?.join('\n') || testResponse.std_output_list?.join('\n') || "N/A";
                    outputChannel.appendLine(`Your Output:\n${actualOutput}`);
                    if(testResponse.expected_code_output) {
                        outputChannel.appendLine(`Expected Output:\n${testResponse.expected_code_output.join('\n')}`);
                    }
                    if(testResponse.compile_error) {outputChannel.appendLine(`Compile Error:\n${testResponse.compile_error}`);}
                    if(testResponse.runtime_error) {outputChannel.appendLine(`Runtime Error:\n${testResponse.runtime_error}`);}
                    vscode.window.showInformationMessage("Test finished. Check output channel for details.");
                } else {
                    progress.report({ increment: 100, message: "Test response unclear." });
                    vscode.window.showWarningMessage("Test submitted, but response was not in the expected format.");
                    outputChannel.appendLine("Test submitted, but the response format was unexpected.");
                    console.warn("Unexpected test response:", testResponse);
                }
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-tracker.submitSolution', async () => {
            if (!leetCodeService.areCookiesSet()) {
                vscode.window.showErrorMessage('You must be logged in to submit solutions.');
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor found.');
				return;
			}

			const document = editor.document;
			const fileName = document.fileName;
			const code = document.getText();
			const languageId = document.languageId;
			const problemInfo = parseLcProblemFileName(fileName);

			if (!problemInfo) {
				vscode.window.showErrorMessage('Invalid file name format. Expected format: questionId.title-slug.lc.lang');
				return;
			}

			const { questionId, titleSlug, langSlug, fullSlugPart } = problemInfo;
            const problems = await leetCodeTreeDataProvider.getProblems();
            const qId = problems.find(p => p.questionFrontendId === questionId)?.questionId;
            if (!qId) {
                vscode.window.showErrorMessage(`Problem with ID ${questionId} not found in the current workspace.`);
                return;
            }

			const outputChannel = getTestResultsOutputChannel();
            outputChannel.clear();
            outputChannel.show(true); // Preserve focus on editor

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Testing solution for ${fullSlugPart}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Sending to LeetCode..." });

                const testResponse = await leetCodeService.submitSolution(qId, langSlug, code, titleSlug);

                if (testResponse.error) {
                    progress.report({ increment: 100, message: "Test failed to start." });
                    vscode.window.showErrorMessage(`Test Failed: ${testResponse.error}`);
                    outputChannel.appendLine(`Error: ${testResponse.error}`);
                    return;
                }

                // If API returns submission_id, then poll. Otherwise, try to display direct results.
                if (testResponse.submission_id) {
                    const submissionId = testResponse.submission_id;
                    progress.report({ message: `Test submitted (ID: ${submissionId}). Checking status...` });
                    outputChannel.appendLine(`Test execution ID: ${submissionId}. Polling for results...`);

                    let attempts = 0;
                    const maxAttempts = 20; // Shorter timeout for tests
                    const pollInterval = 1500; // Poll a bit faster for tests

                    const pollTest = async (): Promise<void> => {
                        if (attempts >= maxAttempts) {
                            vscode.window.showWarningMessage(`Stopped checking status for test ${submissionId} after timeout.`);
                            outputChannel.appendLine("Polling timed out.");
                            return;
                        }
                        attempts++;

                        const statusResult = await leetCodeService.checkInterpretationStatus(submissionId);

                        // --- TYPE GUARD ---
                        // Check if it's an error object first.
                        if ('error' in statusResult && statusResult.error) {
                            vscode.window.showErrorMessage(`Error checking test status ${submissionId}: ${statusResult.error}`);
                            outputChannel.appendLine(`Error polling: ${statusResult.error}`);
                            // Decide if you want to stop polling on error or just log and continue
                            return; // Stop polling on error
                        }

                        // --- Now TypeScript knows statusResult is InterpretationDetails ---
                        // We can also be more explicit if InterpretationDetails always has 'state'
                        if (!('state' in statusResult)) {
                            vscode.window.showErrorMessage(`Error checking test status ${submissionId}: Invalid response structure.`);
                            outputChannel.appendLine(`Error polling: Invalid response structure from checkInterpretationStatus.`);
                            console.error("Invalid statusResult structure:", statusResult);
                            return; // Stop polling
                        }

                        // At this point, statusResult is confirmed to be of type InterpretationDetails (or a structure that has 'state')
                        const interpretationDetails = statusResult as InterpretationDetails; // Cast if needed, or rely on type narrowing

                        outputChannel.appendLine(`Poll attempt ${attempts}: State - ${interpretationDetails.state || 'Unknown'}`);
                        progress.report({ message: `Status: ${interpretationDetails.status_msg || interpretationDetails.state}` });

                        // LeetCode submission states: PENDING, STARTED, SUCCESS, FAILURE, ...
                        if (interpretationDetails.state !== "PENDING" && interpretationDetails.state !== "STARTED") { // Terminal state
                            outputChannel.appendLine("\n--- Test Result ---");
                            outputChannel.appendLine(`Status: ${interpretationDetails.status_msg}`);
							const totalTestcases = interpretationDetails.total_testcases || 1;
							const passedTestcases = interpretationDetails.total_correct || 0;
							outputChannel.appendLine(`Passed Testcases: ${passedTestcases} / ${totalTestcases}\n`);

                            if(totalTestcases === passedTestcases) {
								outputChannel.appendLine(`Runtime: ${interpretationDetails.status_runtime}`);
								outputChannel.appendLine(`Runtime Percentile: ${interpretationDetails.runtime_percentile}`);
								outputChannel.appendLine(`Memory: ${interpretationDetails.memory}`);
								outputChannel.appendLine(`Memory Percentile: ${interpretationDetails.memory_percentile}`);
							} else {
								outputChannel.appendLine("\nInput (from LeetCode):");
                                outputChannel.appendLine(testResponse.last_testcase);
								outputChannel.appendLine(`Your Output:\n${testResponse.code_output}`);
								outputChannel.appendLine(`Expected Output:\n${testResponse.expected_code_output}`);
							}

                            if (interpretationDetails.status_msg !== "Accepted" && interpretationDetails.status_msg !== "Finished") {
								outputChannel.appendLine("\nUnexpected Status:");
								outputChannel.appendLine(interpretationDetails.status_msg as string);
							}
                            if(interpretationDetails.compile_error) {
                                outputChannel.appendLine("\nCompile Error:");
                                outputChannel.appendLine(interpretationDetails.compile_error);
                                vscode.window.showErrorMessage("Test failed: Compile Error. See output channel.");
                            }
                            if(interpretationDetails.runtime_error) {
                                outputChannel.appendLine("\nRuntime Error:");
                                outputChannel.appendLine(interpretationDetails.runtime_error);
                                vscode.window.showErrorMessage("Test failed: Runtime Error. See output channel.");
                            }
                            if(interpretationDetails.correct_answer) {
                                vscode.window.showInformationMessage(`Test for ${fullSlugPart}: ${interpretationDetails.status_msg || 'Finished'}`);
                            } else if (interpretationDetails.status_msg !== "Accepted" && interpretationDetails.status_msg !== "Finished") { 
                                vscode.window.showWarningMessage(`Test for ${fullSlugPart}: ${interpretationDetails.status_msg || 'Check output'}`);
                            }

							if (totalTestcases === passedTestcases) {
								await leetCodeService.solvedProblem(questionId);
							} else {
								const isSolved = await leetCodeService.isProblemSolved(questionId);
								if (isSolved === null || isSolved === undefined || isSolved === false) {
									await leetCodeService.failedProblem(questionId);
								}
							}

							await leetCodeTreeDataProvider.refresh(); 

                        } else { // Still pending or intermediate state
                            setTimeout(pollTest, pollInterval);
                        }
                    };
                    setTimeout(pollTest, pollInterval); // Start the first poll
                } else if (testResponse.status_code !== undefined) { // Direct results (less common but possible)
                    progress.report({ increment: 100, message: "Test finished." });
                    outputChannel.appendLine("\n--- Test Result (Direct) ---");
                    outputChannel.appendLine(`Status Code: ${testResponse.status_code}`);
                    if(testResponse.status_runtime) {outputChannel.appendLine(`Runtime: ${testResponse.status_runtime}`);}
                    if(testResponse.status_memory) {outputChannel.appendLine(`Memory: ${testResponse.status_memory}`);}
                    const actualOutput = testResponse.code_output?.join('\n') || testResponse.std_output_list?.join('\n') || "N/A";
                    outputChannel.appendLine(`Your Output:\n${actualOutput}`);
                    if(testResponse.expected_code_output) {
                        outputChannel.appendLine(`Expected Output:\n${testResponse.expected_code_output.join('\n')}`);
                    }
                    if(testResponse.compile_error) {outputChannel.appendLine(`Compile Error:\n${testResponse.compile_error}`);}
                    if(testResponse.runtime_error) {outputChannel.appendLine(`Runtime Error:\n${testResponse.runtime_error}`);}
                    vscode.window.showInformationMessage("Test finished. Check output channel for details.");
                } else {
                    progress.report({ increment: 100, message: "Test response unclear." });
                    vscode.window.showWarningMessage("Test submitted, but response was not in the expected format.");
                    outputChannel.appendLine("Test submitted, but the response format was unexpected.");
                    console.warn("Unexpected test response:", testResponse);
                }
			});
		})
	);

    // Define a custom interface extending QuickPickItem
    interface ProblemQuickPickItem extends vscode.QuickPickItem {
        problemId: string;
        questionId: string;
        titleSlug: string;
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('leetcode-tracker.searchProblems', async () => {
            // Open VSCode's Quick Pick to get the search query
            const problems = await leetCodeTreeDataProvider.getProblems();
            const quickPickItems: ProblemQuickPickItem[] = problems.map(problem => ({
                label: `${problem.questionFrontendId}. ${problem.questionTitle}`,
                description: problem.difficulty,
                detail: problem.titleSlug,
                problemId: problem.questionId,
                questionId: problem.questionFrontendId,
                titleSlug: problem.titleSlug,
            }));
            const selected = await vscode.window.showQuickPick(quickPickItems, { placeHolder: 'Select a problem to view' });
            // If the user selects a problem, open its description
            if (selected) {
                await vscode.commands.executeCommand('leetcode-tracker.showProblemDescription', selected.titleSlug, selected.questionId);
            }
        })
    );

}

// This method is called when your extension is deactivated
export function deactivate() {}
