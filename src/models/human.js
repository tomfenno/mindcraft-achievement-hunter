/* For creating example states for the Achievement Hunter project */
import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'fs';
import path from 'path';
import readline from 'readline';

const LOG_BASE = 'achievement_hunter/logs';

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
    this._log(turns, systemMessage, response);
    return response;
  }

  async sendVisionRequest(turns, systemMessage, imageBuffer) {
    return this.sendRequest(turns, systemMessage);
  }

  async embed(text) {
    throw new Error('Embeddings are not supported by Human model.');
  }

  _log(turns, systemMessage, response) {
    const match = response.match(/!(\w+)/);
    if (!match) return;

    const commandName = match[1].toLowerCase();
    const logDir = path.join(LOG_BASE, commandName);
    mkdirSync(logDir, {recursive: true});

    const existing = existsSync(logDir) ? readdirSync(logDir) : [];
    const nums = existing.map(f => parseInt(f.replace(commandName, '')))
                     .filter(n => !isNaN(n));
    const num = nums.length > 0 ? Math.max(...nums) + 1 : 1;

    const filepath = path.join(logDir, `${commandName}${num}`);
    const entry = {systemMessage, turns, response};
    writeFileSync(filepath, JSON.stringify(entry, null, 2));
    console.log(`Logged to ${filepath}`);
  }

  _prompt(question) {
    return new Promise(resolve => {
      this.rl.question(question, answer => {
        resolve(answer);
      });
    });
  }
}
