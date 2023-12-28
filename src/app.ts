#!/usr/bin/env node

import logger from './logger';
import * as wm from './wattmgr';
import Output from './output';

import { config } from './ENV';

const log = logger.child({ module: 'app' });
let isRunning = true;

function stop() {
  log.info('Stopping app');
  isRunning = false;
  wm.stop();
  process.exitCode = 0;
  log.info('App stopped');
}

function start() {
  log.info('Starting app');
  isRunning = true;
  loop();
  wm.start();
}

process.once('SIGINT', function (code) {
  log.debug('SIGINT received... APP');
  stop();
});

process.once('SIGTERM', function (code) {
  log.debug('SIGTERM received... APP');
  stop();
});

let lastAlive = 0;
const aliveInterval = 1000 * 60 * 30;
function loop() {
  if (Date.now() - lastAlive > aliveInterval) {
    log.info('App alive');
    console.log('Watt Manager app alive');
    lastAlive = Date.now();
  }

  // longer timeout results in longer wait before service restart
  if (isRunning) setTimeout(loop, 5000);
}

log.info('Creating outputs');
config.outputs?.forEach((o) => {
  log.info(
    `>  id=${o.id} prio=${o.priority} power=${o.power}`
  );
  wm.addOutput(new Output(o));
});

start();
