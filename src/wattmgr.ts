import logger from './logger';
import * as mqtt from './mqttclient';
import * as ENV from './ENV';
import Output from './output';

let availablePower: number = 0;
let outputs: Output[] = [];
const outputPower = () => outputs.reduce((t, o) => (t += o.currPower), 0);
let maxOutputPower: number = 0;

const log = logger.child({ module: 'wattmgr' });
let isRunning = true;

mqtt.client.on('connect', function () {
  mqtt.addHandler(ENV.MQTT_TOPIC_AVAILABLE_POWER, function (message): boolean {
    let n = parseFloat(message);
    if (n !== NaN) {
      availablePower = n;
      log.debug(`avail ${availablePower}`);
    }

    powerChanged();
    return true;
  });
});

export function start() {
  log.info('Starting WattManager');
  isRunning = true;
  loop();
}

export function stop() {
  log.info('Stopping WattManager');
  isRunning = false;
}

export function addOutput(o: Output) {
  outputs = [...outputs, o].sort((a, b) => (a.priority < b.priority ? -1 : 1));
  maxOutputPower += o.maxPower;
  o.on('on', () => mqtt.client.publish(`${ENV.MQTT_CLIENT_ID}/output/${o.id}`, 'on'));
  o.on('off', () => mqtt.client.publish(`${ENV.MQTT_CLIENT_ID}/output/${o.id}`, 'off'));
  o.on('disable', () => mqtt.client.publish(`${ENV.MQTT_CLIENT_ID}/output/${o.id}/disable`, 'on'));
  o.on('enable', () => mqtt.client.publish(`${ENV.MQTT_CLIENT_ID}/output/${o.id}/disable`, 'off'));
  o.on('dc', (dc: number) =>
    mqtt.client.publish(`${ENV.MQTT_CLIENT_ID}/output/${o.id}/dc`, dc.toString())
  );

  mqtt.addHandler(`${ENV.MQTT_CLIENT_ID}/output/${o.id}/set`, (msg) =>
    o.processCmd('toggle', msg.toLowerCase())
  );

  mqtt.addHandler(`${ENV.MQTT_CLIENT_ID}/output/${o.id}/disable/set`, (msg) =>
    o.processCmd('disable', msg.toLowerCase())
  );
}

function powerChanged() {
  log.debug(`Power changed`);

  if (availablePower == 0) return;

  let op = outputPower();
  let i = 0;
  log.debug(`Optimizing power output op=${op} avail=${availablePower}:`);
  op = op + availablePower;
  while (i < outputs.length) {
    let o = outputs[i];
    op = op - o.setPower(op);
    log.debug(`  o=${o.id} ena=${o.isEnabled} pwr=${o.getPower()} remains=${op}`);
    i++;
  }
}

function loop() {
  if (isRunning) setTimeout(loop, 5000);
}
