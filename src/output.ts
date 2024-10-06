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
  pwmIsLinear: boolean; 
  /** duty-cycle function points [dc,power][]*/
  pwmFn: [number, number][]; 
  /** pwm duty cycle */
  pwrPWM: number;
  /** duty-cycle enabled? */
  pwmEnabled: boolean; 
  /** is output enabled? */
  isEnabled: boolean; 
  /** when were stats udpdated */
  statsUpdatedAt: number; 

  constructor(props: {
    id: string;
    priority: number;
    power: number;
    pwmEnabled?: boolean;
    pwmFn?: [number, number][];
    statusTopic?: string;
    dcTopic?: string;
  }) {
    super();
    const { id, priority, power: maxPower, pwmEnabled, pwmFn } = props;

    this.id = id;
    this.priority = priority;
    this.maxPower = maxPower;
    this.currPower = 0.0;
    this.pwrPWM = 0;
    this.pwmEnabled = (pwmEnabled ?? false) || pwmFn !== null;
    this.isEnabled = true;
    this.pwmFn = pwmFn ?? [];
    this.pwmIsLinear = pwmFn == null && this.pwmEnabled;

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
    this.pwrPWM = 100;
  }

  public close() {
    this.currPower = 0;
    this.pwrPWM = 0;
    this.emit('pwm', 0);
    this.emit('close');
    log.info(`Output closed o=${this.id} pwm=0`);
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
    this.emit('pwm', this.pwrPWM);
    log.info(`Output enabled o=${this.id} dc=${this.pwrPWM}`);
  }

  public getPwmFnByPwm(dc: number): [number, number] {
    if (this.pwmFn == null) throw 'No duty-cycle function defined';

    let pp = this.pwmFn[0];
    let i = 0;

    while (i < this.pwmFn.length && dc < this.pwmFn[i][0]) i++;

    if (i < this.pwmFn.length) pp = this.pwmFn[i];
    else pp = this.pwmFn[this.pwmFn.length - 1];

    log.debug(`DC2DCFN fn=${pp}`);

    return pp;
  }

  public getPwmFnByPower(pwr: number): [number, number] {
    if (this.pwmFn == null) throw 'No pwm function defined';
    let pp = this.pwmFn[0];
    let i = 0;

    while (i < this.pwmFn.length) {
      if (pwr > this.pwmFn[i][1]) {
        pp = this.pwmFn[i];
        i++;
      } else break;
    }

    if (i > this.pwmFn.length) pp = this.pwmFn[this.pwmFn.length - 1];

    log.debug(`PWR2PWMFN pwr=${pwr} fn=${pp}`);

    return pp;
  }

  public getPower() {
    return this.currPower;
  }

  public setPower(pwr: number): number {
    if (!this.isEnabled || pwr <= 0 || (!this.pwmEnabled && pwr < this.maxPower)) {
      if (this.pwrPWM != 0) log.info(`Output ${this.id}: pwm=${this.pwrPWM}->0`);
      this.close();
      return 0;
    }

    let pwm = 0;

    if (pwr >= this.maxPower) {
      pwr = this.maxPower;
      pwm = 100;
    } else {
      if (this.pwmIsLinear) {
        pwm = Math.round((pwr * 100) / this.maxPower);
        log.debug(`PWR->PP pwm=${pwm} pwr=${pwr}`);
      } else {
        [pwm, pwr] = this.getPwmFnByPower(pwr);
        log.debug(`PWR->PP pwm=${pwm} pwr=${pwr}`);
      }
    }

    if (pwm == 0) this.close();
    else {
      if (this.currPower == 0 && pwr > 0) this.open();

      this.currPower = pwr;
      if (this.pwrPWM != pwm) log.info(`Output ${this.id}: pwm=${this.pwrPWM}->${pwm}`);
      this.pwrPWM = pwm;

      this.emit('pwm', this.pwrPWM);
    }

    return this.currPower;
  }

  public setPWM(pwm: number): number {
    if (!this.isEnabled) return 0;

    let pwr = 0;
    if (pwm <= 0) {
      if (this.pwrPWM != 0) log.info(`Output ${this.id}: dc=${this.pwrPWM}->0`);
      this.close();
      return 0;
    } else if (pwm >= 100 || !this.pwmEnabled) {
      if (this.pwrPWM != 100) log.info(`Output ${this.id}: dc=${this.pwrPWM}->100`);
      this.open100();
      return 100;
    }

    if (this.pwmIsLinear) {
      pwr = (this.maxPower * pwm) / 100;
      log.debug(`PWM->PP dc=${pwm} pwr=${pwr.toFixed(2)}`);
    } else {
      [pwm, pwr] = this.getPwmFnByPwm(pwm);
      log.debug(`PWM->PP dc=${pwm} pwr=${pwr.toFixed(2)}`);
    }

    if (this.pwrPWM != pwm) log.info(`Output ${this.id}: pwm=${this.pwrPWM}->${pwm}`);

    if (pwm == 0) this.close();
    else {
      if (this.currPower == 0) this.open();
      this.pwrPWM = pwm;
      this.currPower = pwr;
    }

    this.emit('pwm', this.pwrPWM);

    return pwm;
  }

  public getPwm() {
    return this.pwrPWM;
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
