import convoManager from '../../src/agent/conversation.js';
import {getBiomeName, getBlockAtPosition, getCraftableItems, getFirstBlockAboveHead, getInventoryCounts, getNearbyEntities, getNearbyPlayerNames, getNearestBlocks,} from '../../src/agent/library/world.js';

/**
 * Returns the full bot state as a plain JS object — the data behind !state.
 *
 * Example:
 *   import { get_state } from './src/state.js';
 *   const state = get_state(agent);
 *   // { position, status, inventory, wearing, craftable_items, nearby_blocks,
 *   //   relative_blocks, nearby_entities }
 */
export function get_state(agent) {
  const bot = agent.bot;

  const pos = bot.entity.position;
  const position = {
    x: Number(pos.x.toFixed(2)),
    y: Number(pos.y.toFixed(2)),
    z: Number(pos.z.toFixed(2)),
  };

  let weather = 'clear';
  if (bot.thunderState > 0)
    weather = 'thunderstorm';
  else if (bot.rainState > 0)
    weather = 'rain';

  let time_of_day = 'night';
  if (bot.time.timeOfDay < 6000)
    time_of_day = 'morning';
  else if (bot.time.timeOfDay < 12000)
    time_of_day = 'afternoon';

  const status = {
    health: `${Math.round(bot.health)}/20`,
    hunger: `${Math.round(bot.food)}/20`,
    biome: getBiomeName(bot),
    weather,
    time_of_day,
    current_action: agent.isIdle() ? 'idle' : agent.actions.currentActionLabel,
  };

  const raw_counts = getInventoryCounts(bot);
  const inventory = {};
  for (const [item, count] of Object.entries(raw_counts)) {
    if (count > 0) inventory[item] = count;
  }

  const wearing = [];
  const helmet = bot.inventory.slots[5];
  const chestplate = bot.inventory.slots[6];
  const leggings = bot.inventory.slots[7];
  const boots = bot.inventory.slots[8];
  if (helmet) wearing.push(helmet.name);
  if (chestplate) wearing.push(chestplate.name);
  if (leggings) wearing.push(leggings.name);
  if (boots) wearing.push(boots.name);

  const craftable_items = getCraftableItems(bot);

  const block_set = new Set();
  for (const block of getNearestBlocks(bot)) {
    block_set.add(block.name);
  }
  const nearby_blocks = Array.from(block_set);

  const above_head_raw = getFirstBlockAboveHead(bot, null, 32);
  const relative_blocks = {
    below: getBlockAtPosition(bot, 0, -1, 0).name,
    legs: getBlockAtPosition(bot, 0, 0, 0).name,
    head: getBlockAtPosition(bot, 0, 1, 0).name,
    above_head_solid: (above_head_raw === null || above_head_raw === 'none') ?
        null :
        above_head_raw,
  };

  let players = getNearbyPlayerNames(bot);
  const bot_players =
      convoManager.getInGameAgents().filter(b => b !== agent.name);
  players = players.filter(p => !bot_players.includes(p));

  const mobs = {};
  for (const entity of getNearbyEntities(bot)) {
    if (entity.type === 'player' || entity.name === 'item') continue;
    mobs[entity.name] = (mobs[entity.name] || 0) + 1;
  }

  return {
    position,
    status,
    inventory,
    wearing,
    craftable_items,
    nearby_blocks,
    relative_blocks,
    nearby_entities: {human_players: players, mobs, bot_players},
  };
}

/**
 * Returns the bot's inventory and worn equipment as a plain JS object —
 * the data behind !inventoryState.
 *
 * Example:
 *   import { get_inventory_state } from './src/state.js';
 *   const inv = get_inventory_state(agent);
 *   // { inventory: { oak_log: 3, ... } } or { inventory: 'Nothing' }
 */
export function get_inventory_state(agent) {
  const bot = agent.bot;
  const raw_counts = getInventoryCounts(bot);
  const inventory = {};
  for (const [item, count] of Object.entries(raw_counts)) {
    if (count > 0) inventory[item] = count;
  }

  const helmet = bot.inventory.slots[5];
  const chestplate = bot.inventory.slots[6];
  const leggings = bot.inventory.slots[7];
  const boots = bot.inventory.slots[8];

  for (const item of [helmet, chestplate, leggings, boots]) {
    if (item) inventory[item.name] = (inventory[item.name] || 0) + 1;
  }

  return {
    inventory: Object.keys(inventory).length > 0 ? inventory : 'Nothing',
  };
}
