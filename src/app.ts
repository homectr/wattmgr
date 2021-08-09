#!/usr/bin/env node

import 'dotenv/config';

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

function loop() {
  if (isRunning) setTimeout(loop, 10000);
}

config.outputs?.forEach((o) => wm.addOutput(new Output(o)));

start();
