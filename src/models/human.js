/* For creating example states for the Achievement Hunter project */
import readline from 'readline';

export class Human {
  static prefix = 'human';

  constructor(model_name, url, params) {
    this.rl = readline.createInterface(
        {input: process.stdin, output: process.stdout});
  }

  async sendRequest(turns, systemMessage) {
    const last = turns[turns.length - 1];
    if (last) console.log(`\n[${last.role}]: ${last.content}`);
    const response = await this._prompt('Your response: ');
    return response;
  }

  async sendVisionRequest(turns, systemMessage, imageBuffer) {
    return this.sendRequest(turns, systemMessage);
  }

  async embed(text) {
    throw new Error('Embeddings are not supported by Human model.');
  }

  _prompt(question) {
    return new Promise(resolve => {
      this.rl.question(question, answer => {
        resolve(answer);
      });
    });
  }
}
