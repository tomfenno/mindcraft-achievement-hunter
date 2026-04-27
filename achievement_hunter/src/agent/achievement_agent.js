/**
 * AchievementAgent - extends the base Mindcraft Agent to drive the
 * Structured Prompting Loop (SPL). Waits for a player objective, then runs
 * structured_loop() to completion before accepting the next objective.
 */

import './commands.js';

import {readFileSync} from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

import {Agent} from '../../../src/agent/agent.js';
import settings from '../../../settings.js';
import {loadCheckpoint} from '../pipeline/checkpoint.js';
import {LlmClient} from '../pipeline/llm_client.js';
import {structured_loop} from '../pipeline/structured_loop/loop.js';

import {init_ah_modes} from './ah_modes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Matches the restart message in src/agent/library/skills.js; suppressed so
// the SPL manages its own inventory reads.
const RESTART_MSG = 'Safely restarting to update inventory.';

export class AchievementAgent extends Agent {
  async _setupEventHandlers(save_data, init_message) {
    this._init_spl_models();

    // Suppress the default greeting during base setup.
    const orig_open_chat = this.openChat.bind(this);
    this.openChat = async () => {};
    try {
      await super._setupEventHandlers(save_data, null);
    } finally {
      this.openChat = orig_open_chat;
    }

    init_ah_modes(this);
    this._silence_chat_listeners();

    const saved_checkpoint = loadCheckpoint();
    if (saved_checkpoint) {
      this._waiting_for_objective = false;
      console.log(
          '[SPL] Checkpoint found - resuming:', saved_checkpoint.objective,
          '(saved at', saved_checkpoint.saved_at + ')');
      this.openChat(`Resuming previous task: "${saved_checkpoint.objective}"`);
      this._launch_spl(saved_checkpoint.objective, saved_checkpoint.graph);
      return;
    }

    if (
      settings.task && settings.task.type === 'advancement' &&
      typeof settings.task.goal === 'string' && settings.task.goal.trim()
    ) {
      this._waiting_for_objective = false;
      console.log('[SPL] Starting benchmark objective:', settings.task.goal);
      this._launch_spl(settings.task.goal);
      return;
    }

    this._waiting_for_objective = true;
    this.openChat('Achievement Hunter ready! Send me an objective to begin.');
  }

  /**
   * Overrides the base tick to skip self-prompter updates. The SPL owns
   * execution, but advancement benchmarks still need periodic completion
   * checks because there may be long stretches without chat traffic.
   */
  async update(delta) {
    await this.bot.modes.update();
    if (this.task?.data?.type === 'advancement') {
      await this.checkTaskDone();
    }
  }

  async handleMessage(source, message, max_responses = null) {
    if (this._waiting_for_objective && source !== 'system' &&
        source !== this.name && !message.startsWith('!')) {
      this._waiting_for_objective = false;
      console.log('[SPL] Received objective from', source, ':', message);
      this._launch_spl(message);
      return true;
    }

    if (!this._waiting_for_objective) {
      console.log(
          '[SPL] Message suppressed while SPL is running:', source, '-',
          message.slice(0, 80));
      return true;
    }

    return super.handleMessage(source, message, max_responses);
  }

  cleanKill(msg = 'Killing agent process...', code = 1) {
    if (msg === RESTART_MSG) return;
    super.cleanKill(msg, code);
  }

  _init_spl_models() {
    const profile = JSON.parse(
        readFileSync(path.join(__dirname, '../profile.json'), 'utf8'));
    const fallback = profile.model || 'gpt-4o-mini';
    this._spl_models = {
      ptd: new LlmClient(profile.ptd_model || fallback),
      ptd_feedback: new LlmClient(
          profile.ptd_feedback_model || profile.ptd_model || fallback),
      ptd_refinement: new LlmClient(
          profile.ptd_refinement_model || profile.ptd_model || fallback),
    };
  }

  _launch_spl(objective, graph = null) {
    structured_loop(this._spl_models, this, objective, graph)
        .then(() => {
          this._waiting_for_objective = true;
          this.openChat('Task complete! Send me a new objective.');
        })
        .catch(err => {
          console.error('[SPL] Structured loop crashed:', err);
          this._waiting_for_objective = true;
          this.openChat('SPL crashed. Send a new objective to retry.');
        });
  }

  _silence_chat_listeners() {
    this.bot.removeAllListeners('chat');
    this.bot.removeAllListeners('whisper');
  }
}
