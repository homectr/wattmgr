import EventEmitter from 'events';
import logger from './logger';

const log = logger.child({ module: 'output' });

const empty_fn = () => {};

export default class Output extends EventEmitter {
  id: string;
  priority: number;
  maxPower: number;
  currPower: number;
  pwmIsLinear: boolean;
  pwmPoints: [number, number][];
  pwmDC: number; // pwm duty cycle
  isOpen: boolean;
  isPwm: boolean;
  isEnabled: boolean;

  constructor(props: {
    id: string;
    priority: number;
    maxPower: number;
    isPwm?: boolean;
    pwmPoints?: [number, number][];
  }) {
    super();
    const { id, priority, maxPower, isPwm, pwmPoints } = props;

    this.id = id;
    this.priority = priority;
    this.maxPower = maxPower;
    this.currPower = 0;
    this.pwmDC = 0;
    this.isOpen = false;
    this.isPwm = (isPwm ?? false) || pwmPoints !== null;
    this.isEnabled = true;
    this.pwmPoints = pwmPoints ?? [];
    this.pwmIsLinear = pwmPoints == null && this.isPwm;
  }

  public open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.currPower = this.maxPower;
    this.pwmDC = 100;
    this.emit('on');
    this.emit('dc', 100);
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.currPower = 0;
    this.pwmDC = 0;
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
    if (this.pwmPoints == null) throw 'No PWM points defined';

    let pp = this.pwmPoints[0];
    let i = 0;

    while (i < this.pwmPoints.length && dc < this.pwmPoints[i][0]) i++;

    if (i < this.pwmPoints.length) pp = this.pwmPoints[i];
    else pp = this.pwmPoints[this.pwmPoints.length - 1];

    return pp;
  }

  public getPwmPointByPower(pwr: number): [number, number] {
    if (this.pwmPoints == null) throw 'No PWM points defined';
    let pp = this.pwmPoints[0];
    let i = 0;

    while (i < this.pwmPoints.length) {
      if (pwr > this.pwmPoints[i][1]) {
        pp = this.pwmPoints[i];
        i++;
      } else break;
    }

    if (i > this.pwmPoints.length) pp = this.pwmPoints[this.pwmPoints.length - 1];

    log.debug(`PWR2PP pwr=${pwr} pp=${pp}`);

    return pp;
  }

  public getPower() {
    return this.currPower;
  }

  public setPower(pwr: number): number {
    if (!this.isEnabled) return 0;

    if (pwr <= 0 || (!this.isPwm && pwr <= this.maxPower)) {
      this.close();
      return 0;
    }

    if (pwr >= this.maxPower) {
      this.open();
      return this.maxPower;
    }

    if (this.pwmIsLinear) {
      this.pwmDC = Math.round((pwr * 100) / this.maxPower);
      this.currPower = Math.round(pwr);
      log.debug(`PWR->PP dc=${this.pwmDC} pwr=${this.currPower}`);
    } else {
      let dc = 0;
      [dc, pwr] = this.getPwmPointByPower(pwr);
      this.pwmDC = dc;
      log.debug(`PWR->PP dc=${this.pwmDC} pwr=${pwr}`);
    }

    this.currPower = Math.round(pwr);

    this.emit('dc', this.pwmDC);

    return this.currPower;
  }

  public setDC(dc: number): number {
    if (!this.isEnabled) return 0;

    if (dc <= 0) {
      this.close();
      return 0;
    } else if (dc >= 100 || !this.isPwm) {
      this.open();
      return 100;
    }

    if (this.pwmIsLinear) {
      this.currPower = Math.round((this.maxPower * dc) / 100);
      log.debug(`DC->PP dc=${dc} pwr=${this.currPower}`);
    } else {
      let p = 0;
      [dc, p] = this.getPwmPointByDc(dc);
      this.currPower = p;
      log.debug(`DC->PP dc=${dc} pwr=${p}`);
    }

    this.pwmDC = dc;
    this.emit('dc', this.pwmDC);

    return dc;
  }

  public getDC() {
    return this.pwmDC;
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
    if (cmd == 'disable') {
      if (value == 'on') {
        this.disable();
        h = true;
      }
      if (value == 'off') {
        this.enable();
        h = true;
      }
    }
    return h;
  }
}
