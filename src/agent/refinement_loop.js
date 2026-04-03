export class AgenticPlanner {
    constructor(agent) {
        this.agent = agent;
        this.active = true;
        this.state = 'IDLE'; // States: IDLE, PLANNING, EXECUTING, REFINING
        this.currentTargetNode = null;
        this.lastCommand = null;
        this.retryCount = 0;
        this.MAX_RETRIES = 3; // Crucial to prevent infinite failure loops
    }

    isActive() {
        return this.active;
    }

    // Called on every tick by agent.js
    async update(delta) {
        if (!this.active || this.state !== 'IDLE') return;

        // If the bot is physically idle, start the planning phase
        if (this.agent.isIdle()) {
            this.state = 'PLANNING';
            await this.planNextAction();
        }
    }

    async planNextAction() {
        console.log("Refinement Loop: Planning next action via SCSE...");
        
        // 1. Gather State (Inventory, nearby blocks from Vision/Memory)
        const inventoryState = this.getInventoryState();
        const dagState = this.agent.memory_bank.getDAGState();

        // 2. Query SCSE LLM
        // (You will need to implement promptSCSE in prompter.js)
        const targetNode = await this.agent.prompter.promptSCSE(dagState, inventoryState);
        this.currentTargetNode = targetNode;

        // 3. Query Execution LLM to translate Node -> Command
        const command = await this.agent.prompter.promptExecution(targetNode);
        this.lastCommand = command;

        // 4. Execute the command
        this.state = 'EXECUTING';
        this.agent.handleMessage('system', command); 
        // Note: agent.js will catch the result and call evaluateActionResult()
    }

    // This is the hook we added to agent.js in the previous step
    async evaluateActionResult(command, result) {
        if (this.state !== 'EXECUTING') return;

        // Determine if result is a success or failure (pseudo-logic)
        const isSuccess = !result.toLowerCase().includes("error") && !result.toLowerCase().includes("failed");

        if (isSuccess) {
            console.log("Action Succeeded. Updating DAG.");
            this.agent.memory_bank.markNodeComplete(this.currentTargetNode);
            this.retryCount = 0;
            this.state = 'IDLE'; // Ready for next node
        } else {
            console.log(`Action Failed: ${result}. Initiating Refinement.`);
            this.state = 'REFINING';
            await this.refineAction(result);
        }
    }

    async refineAction(errorMessage) {
        this.retryCount++;
        if (this.retryCount > this.MAX_RETRIES) {
            console.warn("Max retries hit. Escalating failure to QSP/DAG.");
            // Logic to mark node as temporarily unachievable and repick a new node
            this.agent.memory_bank.markNodeBlocked(this.currentTargetNode);
            this.retryCount = 0;
            this.state = 'IDLE';
            return;
        }

        // 1. Query Refiner LLM
        const currentState = this.getInventoryState();
        const refinedCommand = await this.agent.prompter.promptRefiner(
            this.lastCommand, 
            errorMessage, 
            currentState
        );

        // 2. Retry with new command
        this.lastCommand = refinedCommand;
        this.state = 'EXECUTING';
        this.agent.handleMessage('system', refinedCommand);
    }

    getInventoryState() {
        if (!this.agent.bot.inventory) return "[]";
        const items = this.agent.bot.inventory.items();
        return JSON.stringify(items.map(i => ({name: i.name, count: i.count})));
    }
}