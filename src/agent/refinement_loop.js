export class AgenticPlanner {
    constructor(agent) {
        this.agent = agent;
        this.active = true;
        this.state = 'IDLE'; 
        this.primaryTaskDAG = null;
    }

    isActive() { return this.active; }

    async update(delta) {
        if (!this.active || this.state !== 'IDLE') return;
        if (this.agent.isIdle()) {
            this.state = 'PLANNING';
            await this.planNextAction();
        }
    }

    // Implementation of Algorithm 2: Structured Prompting Loop
    async planNextAction() {
        const inventory = this.getInventoryState();

        // 1. Task Decomposition & Self-Refinement (PTD)
        if (!this.primaryTaskDAG) {
            const initialPtdPrompt = `Generate a JSON DAG for the task: ${this.agent.current_goal}`;
            this.primaryTaskDAG = await this.selfRefineLoop(
                initialPtdPrompt, 
                (r) => `Critique this Minecraft DAG for missing dependencies: ${r}`,
                (f, r) => `Rewrite the DAG JSON based on this critique: ${f}. Original: ${r}`
            );
        }

        // 2. Algorithm 1: State-Conditioned Subgraph
        const activeSubgraph = this.getConditionedSubgraph(this.primaryTaskDAG, inventory);
        
        if (activeSubgraph.nodes.length === 0) {
            this.agent.openChat("Primary task successfully completed.");
            this.active = false;
            return;
        }

        // 3. SCSE with Self-Refinement
        const scsePrompt = `Given this inventory ${JSON.stringify(inventory)}, which node should I do next? ${JSON.stringify(activeSubgraph)}`;
        const targetNode = await this.selfRefineLoop(
            scsePrompt,
            (r) => `Is ${r} actually achievable now? Check dependencies.`,
            (f, r) => `Re-select the best node. Critique: ${f}`
        );

        // 4. Finite Horizon Planning (FHP) -> Action
        const command = await this.agent.handleMessage('system', `Output ONLY a !command for: ${targetNode}`, -1);

        this.state = 'EXECUTING';
        // The command execution happens via the agent's standard message handler
    }

    // This is the core logic from your "Self-Refine LLM" pseudocode
    async selfRefineLoop(pInit, pCritiqueFn, pRefineFn, n = 3) {
        let r = await this.agent.handleMessage('system', pInit, -1);
        
        for (let i = 0; i < n; i++) {
            let feedback = await this.agent.handleMessage('system', pCritiqueFn(r), -1);
            
            // Check if refinement is sufficient
            if (feedback.toLowerCase().includes("acceptable") || feedback.toLowerCase().includes("no changes")) {
                return r;
            }

            r = await this.agent.handleMessage('system', pRefineFn(feedback, r), -1);
        }
        return r;
    }

    getConditionedSubgraph(dag, inventory) {
        // Implementation of your Algorithm 1 logic
        let subgraph = JSON.parse(JSON.stringify(dag));
        const satisfied = new Set(inventory.filter(i => i.count > 0).map(i => i.name));
        
        subgraph.nodes = subgraph.nodes.filter(n => !satisfied.has(n.item_name));
        return subgraph;
    }

    getInventoryState() {
        if (!this.agent.bot.inventory) return [];
        return this.agent.bot.inventory.items().map(i => ({name: i.name, count: i.count}));
    }
}