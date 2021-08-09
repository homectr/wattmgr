import EventEmitter from 'events';
import logger from './logger';

const log = logger.child({ module: 'output' });

export default class Output extends EventEmitter {
  id: string;
  priority: number;
  maxPower: number;
  currPower: number; // current output power - can be 0-maxPower
  dcIsLinear: boolean; // is duty cycle linear
  dcFn: [number, number][]; // duty-cycle function points [dc,power][]
  pwrDC: number; // pwm duty cycle
  isOpen: boolean;
  dcEnabled: boolean; // management by duty cycle is enabled?
  isEnabled: boolean; // is output enabled?
  statsUpdatedAt: number; // when were stats udpdated

  constructor(props: {
    id: string;
    priority: number;
    power: number;
    dcEnabled?: boolean;
    dcFn?: [number, number][];
  }) {
    super();
    const { id, priority, power: maxPower, dcEnabled, dcFn } = props;

    this.id = id;
    this.priority = priority;
    this.maxPower = maxPower;
    this.currPower = 0.0;
    this.pwrDC = 0;
    this.isOpen = false;
    this.dcEnabled = (dcEnabled ?? false) || dcFn !== null;
    this.isEnabled = true;
    this.dcFn = dcFn ?? [];
    this.dcIsLinear = dcFn == null && this.dcEnabled;

    this.statsUpdatedAt = 0;
  }

  public open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.currPower = this.maxPower;
    this.pwrDC = 100;
    this.emit('on');
    this.emit('dc', 100);
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.currPower = 0.0;
    this.pwrDC = 0;
    this.emit('dc', 0);
    this.emit('off');
  }

  public disable() {
    if (!this.isEnabled) return;
    this.isEnabled = false;
    this.close();
    this.emit('disable');
  }

  public enable() {
    if (this.isEnabled) return;
    this.isEnabled = true;
    this.emit('enable');
  }

  public getPwmPointByDc(dc: number): [number, number] {
    if (this.dcFn == null) throw 'No PWM points defined';

    let pp = this.dcFn[0];
    let i = 0;

    while (i < this.dcFn.length && dc < this.dcFn[i][0]) i++;

    if (i < this.dcFn.length) pp = this.dcFn[i];
    else pp = this.dcFn[this.dcFn.length - 1];

    return pp;
  }

  public getPwmPointByPower(pwr: number): [number, number] {
    if (this.dcFn == null) throw 'No PWM points defined';
    let pp = this.dcFn[0];
    let i = 0;

    while (i < this.dcFn.length) {
      if (pwr > this.dcFn[i][1]) {
        pp = this.dcFn[i];
        i++;
      } else break;
    }

    if (i > this.dcFn.length) pp = this.dcFn[this.dcFn.length - 1];

    log.debug(`PWR2PP pwr=${pwr} pp=${pp}`);

    return pp;
  }

  public getPower() {
    return this.currPower;
  }

  public setPower(pwr: number): number {
    if (!this.isEnabled) return 0;

    if (pwr <= 0 || (!this.dcEnabled && pwr < this.maxPower)) {
      this.close();
      return 0;
    }

    if (pwr >= this.maxPower) {
      this.open();
      return this.maxPower;
    }

    if (this.dcIsLinear) {
      this.pwrDC = Math.round((pwr * 100) / this.maxPower);
      this.currPower = Math.round(pwr);
      log.debug(`PWR->PP dc=${this.pwrDC} pwr=${this.currPower}`);
    } else {
      let dc = 0;
      [dc, pwr] = this.getPwmPointByPower(pwr);
      this.pwrDC = dc;
      log.debug(`PWR->PP dc=${this.pwrDC} pwr=${pwr}`);
    }

    this.currPower = Math.round(pwr);

    this.emit('dc', this.pwrDC);

    return this.currPower;
  }

  public setDC(dc: number): number {
    if (!this.isEnabled) return 0;

    if (dc <= 0) {
      this.close();
      return 0;
    } else if (dc >= 100 || !this.dcEnabled) {
      this.open();
      return 100;
    }

    if (this.dcIsLinear) {
      this.currPower = Math.round((this.maxPower * dc) / 100);
      log.debug(`DC->PP dc=${dc} pwr=${this.currPower}`);
    } else {
      let p = 0;
      [dc, p] = this.getPwmPointByDc(dc);
      this.currPower = p;
      log.debug(`DC->PP dc=${dc} pwr=${p}`);
    }

    this.pwrDC = dc;
    this.emit('dc', this.pwrDC);

    return dc;
  }

  public getDC() {
    return this.pwrDC;
  }

  public processCmd(cmd: string, value: string): boolean {
    log.debug(`CMD o=${this.id} cmd=${cmd} val=${value}`);
    let h = false;
    if (cmd == 'toggle') {
      if (value == 'on') {
        this.open();
        h = true;
      }
      if (value == 'off') {
        this.close();
        h = true;
      }
    }
    if (cmd == 'enabled') {
      if (value == 'false') {
        this.disable();
        h = true;
      }
      if (value == 'true') {
        this.enable();
        h = true;
      }
    }
    return h;
  }
}
