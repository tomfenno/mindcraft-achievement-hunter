import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class GPT {
    static prefix = 'openai';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url; // store so that we know whether a custom URL has been set

        let config = {};
        if (url)
            config.baseURL = url;

        if (hasKey('OPENAI_ORG_ID'))
            config.organization = getKey('OPENAI_ORG_ID');

        config.apiKey = getKey('OPENAI_API_KEY');

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = strictFormat(turns);
        messages = messages.map(message => {
            message.content += stop_seq;
            return message;
        });
        let model = this.model_name || "gpt-4o-mini";

        let res = null;

        try {
            console.log('Awaiting openai api response from model', model);
            // if a custom URL is set, use chat.completions
            // because custom "OpenAI-compatible" endpoints likely do not have responses endpoint
            if (this.url) {
                let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
                messages = strictFormat(messages);
                const pack = {
                    model: model,
                    messages,
                    stop: stop_seq,
                    ...(this.params || {})
                };
                if (model.includes('o1') || model.includes('o3') || model.includes('5')) {
                    delete pack.stop;
                }
                let completion = await this.openai.chat.completions.create(pack);
                if (completion.choices[0].finish_reason == 'length')
                    throw new Error('Context length exceeded'); 
                console.log('Received.');
                res = completion.choices[0].message.content;
            } 
            // otherwise, use responses
            else {
                let messages = strictFormat(turns);
                messages = messages.map(message => {
                    message.content += stop_seq;
                    return message;
                });
                const response = await this.openai.responses.create({
                    model: model,
                    instructions: systemMessage,
                    input: messages,
                    ...(this.params || {})
                });
                console.log('Received.');
                res = response.output_text;
                let stop_seq_index = res.indexOf(stop_seq);
                res = stop_seq_index !== -1 ? res.slice(0, stop_seq_index) : res;
            }
        }
        catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else if (err.message.includes('image_url')) {
                console.log(err);
                res = 'Vision is only supported by certain models.';
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: "user",
            content: [
                { type: "input_text", text: systemMessage },
                {
                    type: "input_image",
                    image_url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                }
            ]
        });
        
        return this.sendRequest(imageMessages, systemMessage);
    }

    async embed(text) {
        if (text.length > 8191)
            text = text.slice(0, 8191);
        const embedding = await this.openai.embeddings.create({
            model: this.model_name || "text-embedding-3-small",
            input: text,
            encoding_format: "float",
        });
        return embedding.data[0].embedding;
    }

    // /**
    //  * Implements the Self-Refine LLM algorithm
    //  * @param {Array} turns - The conversation history
    //  * @param {string} systemMessage - The core instructions
    //  * @param {Object} refinementPrompts - { critique: (r) => string, refine: (f, r) => string }
    //  * @param {number} n - Max refinement rounds
    //  */
    // async sendRefinedRequest(turns, systemMessage, refinementPrompts, n = 3) {
    //     // 1. Initial Generation
    //     let r = await this.sendRequest(turns, systemMessage);
        
    //     for (let i = 0; i < n; i++) {
    //         // 2. Feedback/Critique Phase
    //         const feedbackPrompt = refinementPrompts.critique(r);
    //         const feedbackTurns = [...turns, { role: 'assistant', content: r }, { role: 'user', content: feedbackPrompt }];
            
    //         let feedback = await this.sendRequest(feedbackTurns, systemMessage);

    //         // Check if refinement is sufficient
    //         if (feedback.toLowerCase().includes("acceptable") || feedback.toLowerCase().includes("no changes")) {
    //             console.log(`Refinement complete after ${i} rounds.`);
    //             return r;
    //         }

    //         // 3. Refinement Phase
    //         const refinePrompt = refinementPrompts.refine(feedback, r);
    //         const refineTurns = [...feedbackTurns, { role: 'assistant', content: feedback }, { role: 'user', content: refinePrompt }];
            
    //         r = await this.sendRequest(refineTurns, systemMessage);
    //     }
        
    //     return r;
    // }

    /**
     * Implements the Self-Refine LLM algorithm with Transcript Logging
     */
    async sendRefinedRequest(turns, systemMessage, refinementPrompts, n = 3) {
        let transcript = []; // Array to hold the logs
        
        console.log("Generating initial response...");
        let r = await this.sendRequest(turns, systemMessage);
        transcript.push({ stage: 'Initial Generation', content: r });
        
        for (let i = 0; i < n; i++) {
            console.log(`Starting Critique Round ${i + 1}...`);
            
            // 1. Critique Phase
            const feedbackPrompt = refinementPrompts.critique(r);
            const feedbackTurns = [...turns, { role: 'assistant', content: r }, { role: 'user', content: feedbackPrompt }];
            let feedback = await this.sendRequest(feedbackTurns, systemMessage);
            
            transcript.push({ stage: `Critique Round ${i + 1}`, content: feedback });

            // Check for pass condition. DogNamedMud's validator outputs {"verdict": "pass"}
            if (feedback.toLowerCase().includes('"verdict":"pass"') || feedback.toLowerCase().includes('"verdict": "pass"')) {
                console.log(`Refinement passed after ${i} rounds.`);
                return { finalResult: r, transcript: transcript, totalRounds: i };
            }

            console.log(`Errors found. Starting Refinement Round ${i + 1}...`);
            
            // 2. Refinement Phase
            const refinePrompt = refinementPrompts.refine(feedback, r);
            const refineTurns = [...feedbackTurns, { role: 'assistant', content: feedback }, { role: 'user', content: refinePrompt }];
            r = await this.sendRequest(refineTurns, systemMessage);
            
            transcript.push({ stage: `Refined Output Round ${i + 1}`, content: r });
        }
        
        console.log("Max refinement rounds reached.");
        return { finalResult: r, transcript: transcript, totalRounds: n };
    }
}

const sendAudioRequest = async (text, model, voice, url) => {
    const payload = {
        model: model,
        voice: voice,
        input: text
    }

    let config = {};

    if (url)
        config.baseURL = url;

    if (hasKey('OPENAI_ORG_ID'))
        config.organization = getKey('OPENAI_ORG_ID');

    config.apiKey = getKey('OPENAI_API_KEY');

    const openai = new OpenAIApi(config);

    const mp3 = await openai.audio.speech.create(payload);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64 = buffer.toString("base64");
    return base64;
}

export const TTSConfig = {
    sendAudioRequest: sendAudioRequest,
    baseUrl: 'https://api.openai.com/v1',
}

