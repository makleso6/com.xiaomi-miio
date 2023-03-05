'use strict';

const Homey = require('homey');
const miio = require('miio');
const tinycolor = require('tinycolor2');

class MiWifiDeviceDevice extends Homey.Device {

  async onInit() {}

  async bootSequence() {
    try {
      // VARIABLES GENERIC
      this.deviceFailures = 0;

      // CREATE DEVICE
      this.homey.setTimeout(() => { this.createDevice(); }, this.util.getRandomTimeout(10));

      // LOG DEVICE INFO
      this.homey.setTimeout(() => { this.getDeviceInfo(); }, 120000 + this.util.getRandomTimeout(10));

      // INITIAL REFRESH DEVICE
      this.homey.setTimeout(() => { this.refreshDevice(); }, this.util.getRandomTimeout(600));

      this.setUnavailable(this.homey.__('unreachable')).catch(error => { this.error(error) });
    } catch (error) {
      this.error(error);
    }
  }

  async onDeleted() {
    try {
      this.homey.clearInterval(this.pollingInterval);
      this.homey.clearInterval(this.refreshInterval);
      this.homey.clearTimeout(this.recreateTimeout);
      if (this.miio) { this.miio.destroy(); }
    } catch (error) {
      this.error(error);
    }
  }

  async onUninit() {
    try {
      this.homey.clearInterval(this.pollingInterval);
      this.homey.clearInterval(this.refreshInterval);
      this.homey.clearTimeout(this.recreateTimeout);
      if (this.miio) { this.miio.destroy(); }
    } catch (error) {
      this.error(error);
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes("address") || changedKeys.includes("token") || changedKeys.includes("polling")) {
      this.refreshDevice();
      return Promise.resolve(true);
    }
  }

  // GENERIC CAPABILITY LISTENERS

  /* onoff */
  async onCapabilityOnoff(value, opts) {
    try {
      if (this.miio) {
        return await this.miio.setPower(value);
      } else {
        this.setUnavailable(this.homey.__('unreachable')).catch(error => { this.error(error) });
        this.createDevice();
        return Promise.reject('Device unreachable, please try again ...');
      }
    } catch (error) {
      this.error(error);
      return Promise.reject(error);
    }
  }

  /* dim */
  async onCapabilityDim(value, opts) {
    try {
      if (this.miio) {
        const brightness = value * 100;
        return await this.miio.setBrightness(brightness);
      } else {
        this.setUnavailable(this.homey.__('unreachable')).catch(error => { this.error(error) });
        this.createDevice();
        return Promise.reject('Device unreachable, please try again ...');
      }
    } catch (error) {
      this.error(error);
      return Promise.reject(error);
    }
  };  

  // HELPER FUNCTIONS

  /* updating capabilities */
  async updateCapabilityValue(capability, value) {
    try {
      if (this.hasCapability(capability)) {
        if (value !== this.getCapabilityValue(capability) && value !== null && value !== 'null' && value !== 'undefined' && value !== undefined) {
          await this.setCapabilityValue(capability, value);
        }
      } else {
        if (!this.miio.matches('cap:children')) {
          this.log('adding capability '+ capability +' to '+ this.getData().id +' as the device seems to have values for this capability ...');
          await this.addCapability(capability);
          await this.setCapabilityValue(capability, value);
        }
      }
    } catch (error) {
      this.error('Trying to update or add capability', capability, 'with value', value, 'for device', this.getName(), 'with device id', this.getData().id);
      this.error(error);
    }
  }

  /* create device instance and start polling */
  async createDevice() {
    try {
      this.miio = await miio.device({ address: this.getSetting('address'), token: this.getSetting('token') });
      if (!this.getAvailable()) { this.setAvailable(); }
      this.startCapabilityListeners();
      this.pollDevice();
    } catch (error) {
      this.setUnavailable(this.homey.__('device.unreachable') + error.message).catch(error => { this.error(error) });
      this.deviceFailures++;
      if (this.deviceFailures <= 9) {
        this.recreateTimeout = this.homey.setTimeout(() => { this.createDevice();}, 10000);
      } else {
        this.deviceFailures = 0;
        this.recreateTimeout = this.homey.setTimeout(() => { this.createDevice();}, 600000);
      }
      this.error(error.message);
    }
  }

  /* refresh device instance on regular interval */
  async refreshDevice() {
    try {
      this.homey.clearInterval(this.refreshInterval);
      this.refreshInterval = this.homey.setInterval(() => {
        if (this.miio) { this.miio.destroy(); }
        this.homey.setTimeout(() => { this.createDevice(); }, 2000);
      }, 3600000 + this.util.getRandomTimeout(600));
    } catch (error) {
      this.setUnavailable(this.homey.__('device.unreachable') + error.message).catch(error => { this.error(error) });
      this.deviceFailures++;
      this.createDevice();
      this.error(error.message);
    }
  }

  /* log device info */
  async getDeviceInfo() {
    try {
      this.log("WiFi Device Init: " + this.getName() + ' with ip '+ this.getSetting('address') + " and capabilities " + this.getCapabilities().toString() + " and model " + this.getStoreValue('model') + ' and store values ', this.getStoreKeys().toString());
      if (this.miio) {
        if (this.miio.matches('cap:state')) {
          const states = await this.miio.state();
          for (const state in states) {
            await this.setStoreValue(state, states[state]);
          }
        }
      }
    } catch (error) {
      this.error(error);
    }
  }

  /* poll interval */
  async pollDevice() {
    try {
      this.homey.clearInterval(this.pollingInterval);
      this.homey.setTimeout(() => { this.retrieveDeviceData(); }, this.util.getRandomTimeout(5));
      let interval = this.getSetting('polling') || 60;
      this.pollingInterval = this.homey.setInterval(() => {
        this.retrieveDeviceData();
      }, 1000 * interval);
    } catch (error) {
      this.setUnavailable(this.homey.__('device.unreachable') + error.message).catch(error => { this.error(error) });
      this.deviceFailures++;
      this.createDevice();
      this.error(error);
    }
  }

  /* RETRIEVE DEVICE DATA THROUGH POLLING */
  async retrieveDeviceData() {
    try {

      // CAPABILITIES

      /* onoff */
      if (this.miio.matches('cap:power')) {
        const power = await this.miio.power();
        this.updateCapabilityValue('onoff', power);
      }

      /* measure_power */
      if (this.miio.matches('cap:power-load')) {
        const watt = await this.miio.powerLoad();
        this.updateCapabilityValue('measure_power', watt);
      }

      /* meter_power */
      if (this.miio.matches('cap:power-consumed')) {
        const wh = await this.miio.powerConsumed();
        const kwh = wh / 1000;
        this.updateCapabilityValue('meter_power', kwh);
      }

      /* measure_battery */
      if (this.miio.matches('cap:battery-level')) {
        const battery = await this.miio.batteryLevel();
        this.updateCapabilityValue('measure_battery', this.util.clamp(battery, 0, 100));
      }

      /* measure_temperature */
      if (this.miio.matches('cap:temperature')) {
        const temp = await this.miio.temperature();
        this.updateCapabilityValue('measure_temperature', temp.value);
      }

      /* measure_humidity */
      if (this.miio.matches('cap:relative-humidity')) {
        const rh = await this.miio.relativeHumidity();
        this.updateCapabilityValue('measure_humidity', rh);
      }

      /* measure_pm25 */
      if (this.miio.matches('cap:pm2.5')) {
        const aqi = await this.miio.pm2_5();
        this.updateCapabilityValue('measure_pm25', aqi);
      }

      /* measure_waterlevel */
      if (this.miio.matches('cap:depth')) {
        const value = await this.miio.depth();
        const waterlevel = this.util.clamp(Math.round(depth), 0, 100);
        if (this.getCapabilityValue('measure_waterlevel') !== waterlevel) {
          const previous_waterlevel = await this.getCapabilityValue('measure_waterlevel');
          await this.setCapabilityValue('measure_waterlevel', waterlevel);
          await this.homey.flow.getDeviceTriggerCard('humidifier2Waterlevel').trigger(this, {"waterlevel": waterlevel, "previous_waterlevel": previous_waterlevel }).catch(error => { this.error(error) });
        }
      }

      /* dim */
      if (this.miio.matches('cap:brightness')) {
        const brightness = await this.miio.brightness();
        const dim = brightness / 100;
        this.updateCapabilityValue('dim', dim);
      }

      /* measure_luminance */
      if (this.miio.matches('cap:illuminance')) {
        const luminance = await this.miio.illuminance();
        this.updateCapabilityValue('measure_luminance', luminance.value);
      }

      /* light_temperature */
      // not clear on how to set light_temperature from polling

      /* light_hue & light_saturation for child device */
      if (this.miio.matches('cap:children')) {
        if (this.miio.child('light').matches('cap:colorable')) {
          const color = await this.miio.child('light').color();

          const colorChanged = tinycolor({r: color.values[0], g: color.values[1], b: color.values[2]});
          const hsv = colorChanged.toHsv();
          const hue = Math.round(hsv.h) / 359;
          const saturation = Math.round(hsv.s);

          this.updateCapabilityValue('light_hue', hue);
          this.updateCapabilityValue('light_saturation', saturation);
        }
      }   

      // STORE VALUES

      /* mode */
      if (this.miio.matches('cap:mode')) {
        const mode = await this.miio.mode();
        if (this.getStoreValue('mode') !== mode && mode !== null) { this.setStoreValue('mode', mode); }       
      }

      /* state */
      if (this.miio.matches('cap:state')) {
        const states = await this.miio.state();
        for (const state in states) {
          await this.setStoreValue(state, states[state]);
        }
      }

      /* fanspeed */
      if (this.miio.matches('cap:fan-speed')) {
        const fanspeed = await this.miio.getState('fanSpeed');
        if (this.getStoreValue('fanspeed') !== fanspeed) { await this.setStoreValue('fanspeed', fanspeed); }
      }

      /* roll */
      if (this.miio.matches('cap:roll-angle')) {
        const angle = await this.miio.getState('roll');
        if (this.getStoreValue('angle') !== angle) { await this.setStoreValue('angle', angle); }
      }

      /* adjustable-roll-angle */
      if (this.miio.matches('cap:adjustable-roll-angle')) {
        const roll_angle = await this.miio.getState('roll_angle');
        if (this.getStoreValue('roll_angle') !== Number(roll_angle)) { await this.setStoreValue('roll_angle', Number(roll_angle)); }
      }

      /* switchable-child-lock */
      if (this.miio.matches('cap:switchable-child-lock')) {
        const child_lock = await this.miio.getState('child_lock');
        if (this.getStoreValue('child_lock') !== child_lock) { await this.setStoreValue('child_lock', child_lock); }
      }

      /* eyecare */
      if (this.miio.matches('cap:eyecare')) {
        const eyecare = await this.miio.eyeCare();
        if (this.getStoreValue('eyecare') !== eyecare) { await this.setStoreValue('eyecare', eyecare); }
      }

      // DEVICE TYPE SPECIFIC

      /* vacuum / mi-robot */
      if (this.miio.matches('type:vacuum')) {
        let onoff = false;
        let state = 'stopped';

        if (this.miio.property('state') == 'charging' && this.miio.getState('batteryLevel') !== 100) {
          onoff = false;
          state = 'charging';
        } else if (this.miio.property('state') == 'docking' || this.miio.property('state') == 'full' || this.miio.property('state') == 'returning' || this.miio.property('state') == 'waiting' || this.miio.property('state') == 'charging') {
          onoff = false;
          state = 'docked';
        } else if (this.miio.property('state') == 'cleaning' || this.miio.property('state') == 'zone-cleaning') {
          onoff = true;
          state = 'cleaning';
        } else if (this.miio.property('state') == 'spot-cleaning') {
          onoff = true;
          state = 'spot_cleaning';
        } else {
          onoff = false;
          state = 'stopped';
        }

        if (this.getCapabilityValue('onoff') !== onoff) { await this.setCapabilityValue('onoff', onoff); }
        if (this.getCapabilityValue('vacuumcleaner_state') !== state) {
          await this.setCapabilityValue('vacuumcleaner_state', state);
          await this.homey.flow.getDeviceTriggerCard('statusVacuum').trigger(this, {"status": this.miio.property('state')}).catch(error => { this.error(error) });
        }
      }

      /* multifunction air monitor */
      if (this.getStoreValue('model') === 'cgllc.airmonitor.b1') {
        const data = await this.miio.call('get_air_data', []);
        data.co2 = data.co2e;
        ['temperature', 'humidity', 'pm25', 'tvoc', 'co2'].forEach(capability => {
          this.updateCapabilityValue(`measure_${capability}`, data[capability]);
        });
      }

      /* humidifier measure_power */
      if (this.hasCapability('humidifier2_mode')) {
        const mode = await this.miio.mode();
        let power = 0;
        switch (mode) {
          case 'idle':
            power = 2.4;
            break;
          case 'silent':
            power = 2.7;
            break;
          case 'medium':
            power = 3.4;
            break;
          case 'high':
            power = 4.8;
            break;
        }
        this.updateCapabilityValue('measure_power', power);

      }

      if (!this.getAvailable()) { this.setAvailable(); }

    } catch (error) {
      this.homey.clearInterval(this.pollingInterval);

      if (this.getAvailable()) {
        this.setUnavailable(this.homey.__('device.unreachable') + error.message).catch(error => { this.error(error) });
      }

      this.homey.setTimeout(() => { this.createDevice(); }, 60000);

      this.error(error);
    }
  }

  /* START CAPABILITY LISTENERS */
  async startCapabilityListeners() {

    // debugging
    // this.miio.on('stateChanged', (change) => {
    //   this.log(JSON.stringify(change));
    // });

    /* onoff */
    this.miio.on('powerChanged', onoff => {
      this.updateCapabilityValue('onoff', onoff);
    });

    /* measure_power */
    this.miio.on('powerLoadChanged', watt => {
      this.updateCapabilityValue('measure_power', watt);
    });

    /* meter_power */
    this.miio.on('powerConsumedChanged', wh => {
      const kwh = wh / 1000;
      this.updateCapabilityValue('meter_power', kwh);
    });

    /* measure_battery */
    this.miio.on('batteryLevelChanged', battery => {
      this.updateCapabilityValue('measure_battery', this.util.clamp(battery, 0, 100));
    });

    /* measure_temperature */
    this.miio.on('temperatureChanged', temp => {
      this.updateCapabilityValue('measure_temperature', temp.value);
    });

    /* measure_humidity */
    this.miio.on('relativeHumidityChanged', humidity => {
      this.updateCapabilityValue('measure_humidity', humidity);
    });

    /* measure_pm25 */
    this.miio.on('pm2.5Changed', aqi => {
      this.updateCapabilityValue('measure_pm25', aqi);
    });
    
    /* measure_luminance */
    this.miio.on('illuminanceChanged', illuminance => {
      this.updateCapabilityValue('measure_luminance', illuminance.value);
    });

    /* light_temperature */
    this.miio.on('colorChanged', c => {
      const light_temperature = this.util.normalize(c.values[0], 3000, 5700);
      this.updateCapabilityValue('light_temperature', light_temperature);
    });

    /* light_hue & light_saturation for child device */
    if (this.miio.matches('cap:childeren')) {
      this.miio.child('light').on('colorChanged', c => {
        const colorChanged = tinycolor({r: c.rgb.red, g: c.rgb.green, b: c.rgb.blue});
        const hsv = colorChanged.toHsv();
        const hue = Math.round(hsv.h) / 359;
        const saturation = Math.round(hsv.s);
  
        this.updateCapabilityValue('light_hue', hue);
        this.updateCapabilityValue('light_saturation', saturation);
      });
  
      /* dim */
      this.miio.child('light').on('brightnessChanged', brightness => {
        const dim = brightness / 100;
        this.updateCapabilityValue('dim', dim);
      });
    }

    /* mode */
    this.miio.on('modeChanged', mode => {
      this.handleModeEvent(mode);
    });

  }

  /* HANDLE MODE EVENTS, CAN BE OVERWRITTEN ON DEVICE LEVEL */
  async handleModeEvent(mode) {
    try {
      /* device with mode implemented as capability */
      if (this.hasCapability('airpurifier_mode')) {
        const previous_mode = this.getCapabilityValue('airpurifier_mode');
        if (previous_mode !== mode) {
          this.setCapabilityValue('airpurifier_mode', mode);
          this.homey.flow.getDeviceTriggerCard('triggerModeChanged').trigger(this, {"new_mode": mode, "previous_mode": previous_mode.toString() }).catch(error => { this.error(error) });
        }
      }

      if (this.hasCapability('humidifier_mode')) {
        const previous_mode = this.getCapabilityValue('humidifier_mode');
        if (previous_mode !== mode) {
          this.setCapabilityValue('humidifier_mode', mode);
          this.homey.flow.getDeviceTriggerCard('triggerModeChanged').trigger(this, {"new_mode": mode, "previous_mode": previous_mode.toString() }).catch(error => { this.error(error) });
        }
      }

      if (this.hasCapability('humidifier2_mode')) {
        const previous_mode = this.getCapabilityValue('humidifier2_mode');
        if (previous_mode !== mode) {
          this.setCapabilityValue('humidifier2_mode', mode);
          this.homey.flow.getDeviceTriggerCard('triggerModeChanged').trigger(this, {"new_mode": mode, "previous_mode": previous_mode.toString() }).catch(error => { this.error(error) });
        }
      }
    } catch (error) {
      this.error(error);
    }
  }

}

module.exports = MiWifiDeviceDevice;