const settings = require("../config/config");
const { sleep } = require("../utils");

class BuySv {
  constructor({ makeRequest, log, userData }) {
    this.userData = userData;
    this.makeRequest = makeRequest;
    this.log = log;
    this.totalDimond = 0;
  }

  async handleOpenChess() {
    return this.log(`This feature in full version: https://amautomarket.com/products/spekter-agency-full-chuc-nang`, "warning");
  }

  async handleOpenRune() {
    return this.log(`This feature in full version: https://amautomarket.com/products/spekter-agency-full-chuc-nang`, "warning");
  }

  async handleBuyCard() {
    return this.log(`This feature in full version: https://amautomarket.com/products/spekter-agency-full-chuc-nang`, "warning");
  }
}

module.exports = BuySv;
