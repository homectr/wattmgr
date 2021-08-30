import logger from './logger';
import * as mqtt from './mqttclient';
import * as ENV from './ENV';
import Output from './output';

let outputs: Output[] = [];
const outputPower = () => outputs.reduce((t, o) => (t += o.currPower), 0.0);
let maxOutputPower: number = 0.0;

const log = logger.child({ module: 'wattmgr' });
let isRunning = true;

mqtt.client.on('connect', function () {
  const topic = ENV.config.mqtt?.powerTopic ?? `${ENV.config.mqtt?.clientid ?? ''}/power`;
  log.info(`Subscribing to power_available topic=${topic}`);
  mqtt.addHandler(topic, function (message): boolean {
    let n = parseFloat(message);
    if (n !== NaN) {
      log.debug(`Received available power = ${n.toFixed(2)}`);
      handleAvailablePower(n);
    }
    return true;
  });
});

export function start() {
  log.info('Starting WattManager');
  isRunning = true;
  outputs.forEach((o) => {
    o.enable();
    o.close();
  });
  loop();
}

export function stop() {
  log.info('Stopping WattManager');
  outputs.forEach((o) => {
    o.close();
  });

  // wait for outputs to close
  setTimeout(() => {
    mqtt.client.end();
    isRunning = false;
  }, 1000);
}

export function addOutput(o: Output) {
  outputs = [...outputs, o].sort((a, b) => (a.priority < b.priority ? -1 : 1));
  maxOutputPower += o.maxPower;
  const otopic = `${ENV.config.mqtt?.clientid}/output/${o.id}`;
  o.on('open', () => mqtt.client.publish(`${otopic}`, 'on', { qos: 1 }));
  o.on('close', () => mqtt.client.publish(`${otopic}`, 'off', { qos: 1 }));
  o.on('disable', () => mqtt.client.publish(`${otopic}/enabled`, 'off', { qos: 1 }));
  o.on('enable', () => mqtt.client.publish(`${otopic}/enabled`, 'on', { qos: 1 }));
  o.on('dc', (dc: number) => mqtt.client.publish(`${otopic}/dc`, dc.toString(), { qos: 1 }));

  log.info(`Subscribing to ${otopic}/set and ${otopic}/enabled/set`);
  mqtt.addHandler(`${otopic}/set`, (msg) => o.processCmd('toggle', msg.toLowerCase()));
  mqtt.addHandler(`${otopic}/enabled/set`, (msg) => o.processCmd('enabled', msg.toLowerCase()));
}

let lastReport = 0;
const reportInterval = 1000 * 50 * 1;

let lastOptimize = 0;

function handleAvailablePower(availablePower: number) {
  log.debug(`Power changed ${availablePower.toFixed(2)}`);
  const otopic = `${ENV.config.mqtt?.clientid}/output`;
  const optimizeInterval = ENV.config.optimize.interval * 1000;

  if (Date.now() - lastOptimize < optimizeInterval || availablePower == 0) {
    log.debug(
      `Not optimizing wait=${optimizeInterval - (Date.now() - lastOptimize)} pwr=${availablePower}`
    );
    return;
  }
  lastOptimize = Date.now();

  let op = outputPower();
  let i = 0;
  log.debug(`Optimizing power output op=${op} avail=${availablePower}:`);
  op = op + availablePower;
  while (i < outputs.length) {
    let o = outputs[i];
    op = op - o.setPower(op);
    log.debug(
      `>  o=${o.id} ena=${o.isEnabled} pwr=${o.getPower().toFixed(2)} dce=${
        o.dcEnabled
      } remains=${op.toFixed(2)}`
    );
    i++;
  }

  op = outputPower();
  mqtt.client.publish(otopic, op.toFixed(2));
  if (Date.now() - lastReport > reportInterval) {
    log.info(`Available power=${availablePower.toFixed(2)} kW, outputs=${op.toFixed(2)} kW`);
    lastReport = Date.now();
  }
}

let lastAlive = 0;
const aliveInterval = 1000 * 60 * 15;

function loop() {
  if (Date.now() - lastAlive > aliveInterval) {
    log.info('Wattmgr alive');
    lastAlive = Date.now();
  }

  // longer timeout results in longer wait before service restart
  if (isRunning) setTimeout(loop, 5000);
}
