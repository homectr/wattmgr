import logger from './logger';
import * as mqtt from './mqttclient';
import * as ENV from './ENV';
import Output from './output';

let outputs: Output[] = [];

/** Get total current output power of all outputs */
const outputPower = () => outputs.reduce((t, o) => (t += o.currPower), 0.0);

/** Total max output power of all outputs */
let maxOutputPower: number = 0.0;

const log = logger.child({ module: 'wattmgr' });
export let isRunning = false;

export function start() {
  log.info('Starting WattManager');

  const topic = `${ENV.config.mqtt?.client_id ?? ''}/input`;
  log.info(`Subscribing to available power topic=${topic}`);
  mqtt.addHandler(topic, function (message): boolean {
    let n = Number(message);
    if (!Number.isNaN(n)) {
      log.debug(`Received available power = ${n.toFixed(2)}`);
      handleAvailablePower(n);
    }
    return true;
  });

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
  mqtt.client.publish(mqtt.LWTtopic, 'OFF', { qos: 1, retain: true });

  // wait for outputs to close
  setTimeout(() => {
    mqtt.client.end();
    isRunning = false;
  }, 1000);
}

export function addOutput(o: Output) {
  outputs = [...outputs, o].sort((a, b) => (a.priority < b.priority ? -1 : 1));
  maxOutputPower += o.maxPower;
  const otopic = `${ENV.config.mqtt?.client_id}/output/${o.id}`;
  o.on('open', () => {
    log.debug(`Output opened o=${o.id}`);
    mqtt.client.publish(`${otopic}`, 'on', { qos: 1 });
  });
  o.on('close', () => {
    log.debug(`Output closed o=${o.id}`);
    mqtt.client.publish(`${otopic}`, 'off', { qos: 1 });
  });
  o.on('disable', () => {
    log.debug(`Output disabled o=${o.id}`);
    mqtt.client.publish(`${otopic}/enabled`, 'off', { qos: 1 });
  });
  o.on('enable', () => {
    log.debug(`Output enabled o=${o.id}`);
    mqtt.client.publish(`${otopic}/enabled`, 'on', { qos: 1 });
  });
  o.on('pwm', (pwm: number) => {
    log.debug(`Output pwm changed o=${o.id} dc=${pwm}`);
    mqtt.client.publish(`${otopic}/pwm`, pwm.toString(), { qos: 1 });
  });

  log.info(`Subscribing to ${otopic}/set and ${otopic}/status/set`);
  mqtt.addHandler(`${otopic}/set`, (msg) => o.processCmd('toggle', msg.toLowerCase()));
  mqtt.addHandler(`${otopic}/status/set`, (msg) => o.processCmd('enabled', msg.toLowerCase()));
}

let lastReport = 0;
const reportInterval = 1000 * 60 * 1;

let lastOptimize = 0;

function handleAvailablePower(availablePower: number) {
  log.debug(`Power changed to ${availablePower.toFixed(2)}`);
  const otopic = `${ENV.config.mqtt?.client_id}/output`;
  const optimizeInterval = ENV.config.optimize.interval * 1000;

  // if we are not optimizing, wait for next interval
  if (Date.now() - lastOptimize < optimizeInterval || availablePower == 0) {
    log.debug(
      `Not optimizing wait=${optimizeInterval - (Date.now() - lastOptimize)} pwr=${availablePower}`
    );
    return;
  }
  lastOptimize = Date.now();

  /** Power to optimize */
  let pto = outputPower();
  // available power is the total power available to all currently open outputs
  pto = pto + availablePower;

  log.debug(`Optimizing power output op=${pto} avail=${availablePower}:`);

  let i = 0;
  while (i < outputs.length) {
    let o = outputs[i];
    // decrease pto by the actual power output of the current output
    pto = pto - o.setPower(pto);
    log.debug(
      `>  o=${o.id} ena=${o.isEnabled} pwr=${o.getPower().toFixed(2)} pwm=${
        o.pwmEnabled
      } remains=${pto.toFixed(2)}`
    );
    i++;
  }

  const totalOutput = outputPower();
  mqtt.client.publish(otopic, totalOutput.toFixed(2));
  if (Date.now() - lastReport > reportInterval) {
    log.info(`Available power=${pto.toFixed(2)} kW, outputs=${totalOutput.toFixed(2)} kW`);
    lastReport = Date.now();
  }
}

let lastAlive = 0;
const aliveInterval = 1000 * 60 * 5;

function loop() {
  if (Date.now() - lastAlive > aliveInterval) {
    lastAlive = Date.now();
    log.info('Wattmgr alive');
    mqtt.client.publish(`${ENV.config.mqtt?.client_id}/alive`, new Date().toISOString(), {
      qos: 1,
      retain: true,
    });
  }

  // longer timeout results in longer wait before service restart
  if (isRunning) setTimeout(loop, 1000);
}
