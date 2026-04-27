import {existsSync, readFileSync} from 'fs';
import path from 'path';

export function readAdvancementTaskState(
    agentName, advancementId,
    {
      serverRoot = process.env.TASK_SERVER_ROOT,
      worldPath = process.env.TASK_WORLD_PATH,
    } = {}) {
  if (!agentName || !advancementId || !serverRoot || !worldPath) {
    return {
      success: false,
      reason: 'missing_context',
    };
  }

  const usercachePath = path.join(serverRoot, 'usercache.json');
  if (!existsSync(usercachePath)) {
    return {
      success: false,
      reason: 'missing_usercache',
      usercachePath,
    };
  }

  let usercache = [];
  try {
    usercache = JSON.parse(readFileSync(usercachePath, 'utf8'));
  } catch (error) {
    return {
      success: false,
      reason: 'invalid_usercache',
      error: error.message,
      usercachePath,
    };
  }

  const userEntry = usercache.find(entry => entry?.name === agentName);
  if (!userEntry?.uuid) {
    return {
      success: false,
      reason: 'missing_usercache_entry',
      usercachePath,
    };
  }

  const advancementFilePath =
      path.join(worldPath, 'advancements', `${userEntry.uuid}.json`);
  if (!existsSync(advancementFilePath)) {
    return {
      success: false,
      reason: 'missing_advancement_file',
      advancementFilePath,
      uuid: userEntry.uuid,
    };
  }

  let advancementData = {};
  try {
    advancementData = JSON.parse(readFileSync(advancementFilePath, 'utf8'));
  } catch (error) {
    return {
      success: false,
      reason: 'invalid_advancement_file',
      advancementFilePath,
      error: error.message,
      uuid: userEntry.uuid,
    };
  }

  const advancementState = advancementData[advancementId];
  const done = advancementState?.done === true;
  return {
    success: done,
    reason: done ? 'complete' : 'incomplete',
    advancementFilePath,
    uuid: userEntry.uuid,
  };
}

export class AdvancementTaskValidator {
  constructor(data, agent) {
    this.data = data;
    this.agent = agent;
  }

  validate() {
    const result = readAdvancementTaskState(
        this.agent.name, this.data.advancement_id);
    return {
      valid: result.success,
      score: result.success ? 1 : 0,
    };
  }
}
