import EventEmitter from 'events';
import logger from './logger';

const log = logger.child({ module: 'output' });

export default class Output extends EventEmitter {
  id: string;
  /** priority - lower is higher */
  priority: number;
  /** max output power */
  maxPower: number;
  /** current output power - can be 0-maxPower */
  currPower: number; 
  /** is duty cycle linear */
  dcIsLinear: boolean; 
  /** duty-cycle function points [dc,power][]*/
  dcFn: [number, number][]; 
  /** pwm duty cycle */
  pwrDC: number;
  /** duty-cycle enabled? */
  dcEnabled: boolean; 
  /** is output enabled? */
  isEnabled: boolean; 
  /** when were stats udpdated */
  statsUpdatedAt: number; 

  constructor(props: {
    id: string;
    priority: number;
    power: number;
    dcEnabled?: boolean;
    dcFn?: [number, number][];
    statusTopic?: string;
    dcTopic?: string;
  }) {
    super();
    const { id, priority, power: maxPower, dcEnabled, dcFn } = props;

    this.id = id;
    this.priority = priority;
    this.maxPower = maxPower;
    this.currPower = 0.0;
    this.pwrDC = 0;
    this.dcEnabled = (dcEnabled ?? false) || dcFn !== null;
    this.isEnabled = true;
    this.dcFn = dcFn ?? [];
    this.dcIsLinear = dcFn == null && this.dcEnabled;

    this.statsUpdatedAt = 0;
    this.enable();
  }

  public open() {
    this.emit('open');
    log.info(`Output opened o=${this.id}`);
  }

  public open100() {
    if (this.currPower == 0) this.open();
    this.currPower = this.maxPower;
    this.pwrDC = 100;
  }

  public close() {
    this.currPower = 0;
    this.pwrDC = 0;
    this.emit('dc', 0);
    this.emit('close');
    log.info(`Output closed o=${this.id} dc=0`);
  }

  public disable() {
    this.isEnabled = false;
    this.emit('disable');
    log.info(`Output disabled o=${this.id}. Closing...`);
    this.close();
  }

  public enable() {
    this.isEnabled = true;
    this.emit('enable');
    this.emit('dc', this.pwrDC);
    log.info(`Output enabled o=${this.id} dc=${this.pwrDC}`);
  }

  public getDcFnByDc(dc: number): [number, number] {
    if (this.dcFn == null) throw 'No duty-cycle function defined';

    let pp = this.dcFn[0];
    let i = 0;

    while (i < this.dcFn.length && dc < this.dcFn[i][0]) i++;

    if (i < this.dcFn.length) pp = this.dcFn[i];
    else pp = this.dcFn[this.dcFn.length - 1];

    log.debug(`DC2DCFN fn=${pp}`);

    return pp;
  }

  public getDcFnByPower(pwr: number): [number, number] {
    if (this.dcFn == null) throw 'No duty-cycle function defined';
    let pp = this.dcFn[0];
    let i = 0;

    while (i < this.dcFn.length) {
      if (pwr > this.dcFn[i][1]) {
        pp = this.dcFn[i];
        i++;
      } else break;
    }

    if (i > this.dcFn.length) pp = this.dcFn[this.dcFn.length - 1];

    log.debug(`PWR2DCFN pwr=${pwr} fn=${pp}`);

    return pp;
  }

  public getPower() {
    return this.currPower;
  }

  public setPower(pwr: number): number {
    if (!this.isEnabled || pwr <= 0 || (!this.dcEnabled && pwr < this.maxPower)) {
      if (this.pwrDC != 0) log.info(`Output ${this.id}: dc=${this.pwrDC}->0`);
      this.close();
      return 0;
    }

    let dc = 0;

    if (pwr >= this.maxPower) {
      pwr = this.maxPower;
      dc = 100;
    } else {
      if (this.dcIsLinear) {
        dc = Math.round((pwr * 100) / this.maxPower);
        log.debug(`PWR->PP dc=${dc} pwr=${pwr}`);
      } else {
        [dc, pwr] = this.getDcFnByPower(pwr);
        log.debug(`PWR->PP dc=${dc} pwr=${pwr}`);
      }
    }

    if (dc == 0) this.close();
    else {
      if (this.currPower == 0 && pwr > 0) this.open();

      this.currPower = pwr;
      if (this.pwrDC != dc) log.info(`Output ${this.id}: dc=${this.pwrDC}->${dc}`);
      this.pwrDC = dc;

      this.emit('dc', this.pwrDC);
    }

    return this.currPower;
  }

  public setDC(dc: number): number {
    if (!this.isEnabled) return 0;

    let pwr = 0;
    if (dc <= 0) {
      if (this.pwrDC != 0) log.info(`Output ${this.id}: dc=${this.pwrDC}->0`);
      this.close();
      return 0;
    } else if (dc >= 100 || !this.dcEnabled) {
      if (this.pwrDC != 100) log.info(`Output ${this.id}: dc=${this.pwrDC}->100`);
      this.open100();
      return 100;
    }

    if (this.dcIsLinear) {
      pwr = (this.maxPower * dc) / 100;
      log.debug(`DC->PP dc=${dc} pwr=${pwr.toFixed(2)}`);
    } else {
      [dc, pwr] = this.getDcFnByDc(dc);
      log.debug(`DC->PP dc=${dc} pwr=${pwr.toFixed(2)}`);
    }

    if (this.pwrDC != dc) log.info(`Output ${this.id}: dc=${this.pwrDC}->${dc}`);

    if (dc == 0) this.close();
    else {
      if (this.currPower == 0) this.open();
      this.pwrDC = dc;
      this.currPower = pwr;
    }

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
        this.open100();
        h = true;
      }
      if (value == 'off') {
        this.close();
        h = true;
      }
    }
    if (cmd == 'enabled') {
      if (value == 'off') {
        this.disable();
        h = true;
      }
      if (value == 'on') {
        this.enable();
        h = true;
      }
    }
    return h;
  }
}
