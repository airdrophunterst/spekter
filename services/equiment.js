const settings = require("../config/config");
const { sleep } = require("../utils");

class EquipmentSv {
  constructor({ makeRequest, log, userData }) {
    this.userData = userData;
    this.makeRequest = makeRequest;
    this.log = log;
  }

  async handleOptimizeEquipment() {
    return this.log(`This feature in full version: https://amautomarket.com/products/spekter-agency-full-chuc-nang`, "warning");
  }
}

module.exports = EquipmentSv;
