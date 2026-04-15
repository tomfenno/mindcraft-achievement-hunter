import { GPT } from './src/models/gpt.js';

// 1. Initialize your GPT class
const llm = new GPT("gpt-4o-mini", null, { temperature: 0.2 });

async function runTest() {
    console.log("Starting Self-Refine Loop Test...\n");

    // 2. Define the conversation history and system message
    const turns = [{ role: 'user', content: 'Write a haiku about a robotic dog.' }];
    const systemMessage = "You are a creative assistant.";

    // 3. Define the Refinement Prompts (The Critic and the Fixer)
    const refinementPrompts = {
        // The Critic: Checks if it's a valid haiku (5-7-5 syllables)
        critique: (answer) => `Critique this haiku. Count the syllables in each line. If it is exactly 5-7-5, reply with ONLY the word 'pass'. If it is wrong, explain the syllable errors. Haiku: \n${answer}`,
        
        // The Fixer: Fixes the haiku based on the critique
        refine: (feedback, previousAnswer) => `The previous haiku failed. Here is the feedback: ${feedback}\nHere was the failed haiku: ${previousAnswer}\nRewrite it so it strictly follows the 5-7-5 syllable structure.`
    };

    try {
        // 4. Run your loop
        console.log("Sending initial request...");
        const finalResult = await llm.sendRefinedRequest(turns, systemMessage, refinementPrompts, 3); // May need to increase to beyond 3
        
        console.log("\n==================================");
        console.log("TEST COMPLETE. FINAL REFINED OUTPUT:");
        console.log("==================================");
        console.log(finalResult);

    } catch (error) {
        console.error("Test failed with error:", error);
    }
}

runTest();