#!/usr/bin/env node

import logger from './logger';
import * as wm from './wattmgr';
import Output from './output';
import * as mqtt from './mqttclient';
import * as ENV from './ENV';

import { config } from './ENV';

const log = logger.child({ module: 'app' });
let isRunning = true;

log.info('=== Starting Watt Manager app ===');

function stop() {
  log.info('Stopping app');
  isRunning = false;
  wm.stop();
  process.exitCode = 0;
  log.info('App stopped');
}

function start() {
  isRunning = true;
  loop();
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

mqtt.client.on('connect', function () {
  isRunning = true;
  mqtt.client.publish(`${ENV.config.mqtt?.client_id ?? ''}/status`, 'ON', { qos: 1, retain: true });
  log.info('Creating outputs');
  config.outputs?.forEach((o) => {
    wm.addOutput(new Output(o));
  });
  wm.start();
});

start();
