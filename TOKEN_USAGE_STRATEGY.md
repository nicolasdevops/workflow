# Token Usage & Efficiency Strategy

To prevent "loop_detected" errors and optimize resource usage, I will adhere to the following protocols:

## 1. Operational Efficiency
*   **Batch Operations:** Group file reads, writes, and shell commands into single turns where possible.
*   **Single Source of Truth:** Identify and maintain only one copy of configuration or code (e.g., consolidating `index.html`).
*   **Avoid Redundant Checks:** Do not re-read files unless I have reason to believe they changed externally.
*   **Precise Targeting:** Use specific file paths rather than broad glob searches when the location is known.

## 2. Response Management
*   **Concise Output:** Keep textual responses to the user brief and action-oriented.
*   **No "Thinking Out Loud" in Chat:** Keep internal reasoning in the "Thought" blocks, not the final response.
*   **Stop on Success:** Once a task is verified complete, stop. Do not ask for "anything else?" repeatedly.

## 3. Error Prevention
*   **Loop Detection:** If a tool call fails twice, stop and re-evaluate the strategy instead of retrying blindly.
*   **State Awareness:** Maintain a clear internal state of what has been done to avoid repeating steps in subsequent turns.

## 4. Current Implementation (Immediate Actions)
*   **Consolidated `index.html`:** Removed root `index.html` to rely solely on `public/index.html`.
*   **Server Cleanup:** Removed file-watching logic from `server.js`.
