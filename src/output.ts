import EventEmitter from 'events';
import logger from './logger';

const log = logger.child({ module: 'output' });

interface OutputProps {
  id: string;
  priority: number;
  power: number;
  pwm_enabled?: boolean;
  pwm_fn?: [number, number][];
}

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
  /** pwm function points [pwm,power][]*/
  pwmFn: [number, number][];
  /** pwm duty cycle */
  pwmLevel: number;
  /** pwm enabled? */
  pwmEnabled: boolean;
  /** is output open? */
  isOpen: boolean;
  /** is output enabled? */
  isEnabled: boolean;

  constructor(props: OutputProps) {
    super();
    const { id, priority, power: maxPower, pwm_enabled: pwmEnabled, pwm_fn: pwmFn } = props;

    this.id = id;
    this.priority = priority;
    this.maxPower = maxPower;
    this.currPower = 0.0;
    this.pwmLevel = 0;
    this.pwmEnabled = (pwmEnabled ?? false) || pwmFn !== null;
    this.isEnabled = true;
    this.isOpen = false;
    this.pwmFn = pwmFn ?? [];
    this.pwmIsLinear = pwmFn == null && this.pwmEnabled;
    this.enable();
  }

  /**
   * Open output
   */
  public open() {
    if (!this.isOpen) {
      log.info(`Output opened o=${this.id}`);
    }
    this.isOpen = true;
    this.emit('open');
  }

  /**
   * Open output and set it to 100%
   */
  public open100() {
    if (!this.isOpen) {
      this.open();
    }
    this.currPower = this.maxPower;
    this.pwmLevel = 100;
  }

  /**
   * Close output
   */
  public close() {
    if (this.isOpen) {
      log.info(`Output closed o=${this.id} pwm=0`);
    }
    this.isOpen = false;
    this.currPower = 0;
    this.pwmLevel = 0;
    this.emit('pwm', 0);
    this.emit('close');
  }

  /**
   * Disable output
   */
  public disable() {
    if (!this.isEnabled) {
      log.info(`Output disabled o=${this.id}. Closing...`);
    }
    this.isEnabled = false;
    this.emit('disable');
    this.close();
  }

  /**
   * Enable output
   */
  public enable() {
    if (!this.isEnabled) {
      log.info(
        `Output enabled o=${this.id} pwm=${this.pwmEnabled ? 'yes' : 'no'} pwmFn=${
          this.pwmFn.length > 0 ? this.pwmFn.toString() : 'no'
        }`
      );
    }
    this.isEnabled = true;
    this.emit('enable');
    this.emit('pwm', this.pwmLevel);
  }

  /**
   * Get closest pair [pwm,pwr] by providing pwm
   */
  public getPwmFnByPwm(pwm: number): [number, number] {
    if (this.pwmFn == null) throw 'No pwm function defined';

    let pp = this.pwmFn[0];
    let i = 0;

    while (i < this.pwmFn.length && pwm < this.pwmFn[i][0]) i++;

    if (i < this.pwmFn.length) {
      pp = this.pwmFn[i];
    } else {
      pp = this.pwmFn[this.pwmFn.length - 1];
    }

    log.debug(`PwmFnByPwm fn=${pp}`);

    return pp;
  }

  /**
   * Get closest lower [pwm,pwr] pair by providing power
   * @param pwr - available power
   */
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

    log.debug(`PwmFnByPwr pwr=${pwr} fn=${pp}`);

    return pp;
  }

  public getPower() {
    return this.currPower;
  }

  /**
   * Set output power and return actual power set
   * @param availPwr power available
   * @returns power used by output
   */
  public setPower(pwr: number): number {
    let setPwr = pwr;
    // if output is disabled or power is 0 or pwn is not enabled and power is less than maxPower
    if (!this.isEnabled || setPwr <= 0 || (!this.pwmEnabled && setPwr < this.maxPower)) {
      if (this.pwmLevel != 0) log.info(`Output ${this.id}: pwm=${this.pwmLevel}->0`);
      this.close();
      return 0;
    }

    let pwm = 0;

    if (setPwr >= this.maxPower) {
      setPwr = this.maxPower;
      pwm = 100;
    } else {
      if (this.pwmIsLinear) {
        pwm = Math.round((setPwr * 100) / this.maxPower);
        log.debug(`PWR->100% pwm=${pwm} pwr=${setPwr}`);
      } else {
        [pwm, setPwr] = this.getPwmFnByPower(setPwr);
        log.debug(`PWR->FN pwm=${pwm} pwr=${setPwr}`);
      }
    }

    if (pwm == 0) this.close();
    else {
      if (this.currPower == 0 && setPwr > 0) this.open();

      this.currPower = setPwr;
      if (this.pwmLevel != pwm) {
        log.info(`Output ${this.id}: pwm=${this.pwmLevel}->${pwm}`);
      }
      this.pwmLevel = pwm;

      this.emit('pwm', this.pwmLevel);
    }

    return this.currPower;
  }

  /**
   * Set PWM level.
   * This is mainly usefull for PWM outputs with power function defined as it set only valid PWM levels.
   * */
  public setPWM(pwm: number): number {
    if (!this.isEnabled) return 0;

    let pwr = 0;
    if (pwm <= 0) {
      if (this.pwmLevel != 0) {
        log.info(`Output ${this.id}: dc=${this.pwmLevel}->0`);
      }
      this.close();
      return 0;
    } else if (pwm >= 100 || !this.pwmEnabled) {
      if (this.pwmLevel != 100) {
        log.info(`Output ${this.id}: dc=${this.pwmLevel}->100`);
      }
      this.open100();
      return 100;
    }

    if (this.pwmIsLinear) {
      pwr = (this.maxPower * pwm) / 100;
      log.debug(`PWM->100% pwm=${pwm} pwr=${pwr.toFixed(2)}`);
    } else {
      [pwm, pwr] = this.getPwmFnByPwm(pwm);
      log.debug(`PWM->FN pwm=${pwm} pwr=${pwr.toFixed(2)}`);
    }

    if (this.pwmLevel != pwm) log.info(`Output ${this.id}: pwm=${this.pwmLevel}->${pwm}`);

    if (pwm == 0) this.close();
    else {
      if (this.currPower == 0) this.open();
      this.pwmLevel = pwm;
      this.currPower = pwr;
    }

    this.emit('pwm', this.pwmLevel);

    return pwm;
  }

  public getPwm() {
    return this.pwmLevel;
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
