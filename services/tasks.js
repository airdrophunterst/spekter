const settings = require("../config/config");
const { sleep } = require("../utils");

class TasksSv {
  constructor({ makeRequest, log, userData }) {
    this.userData = userData;
    this.makeRequest = makeRequest;
    this.log = log;
  }

  async handleTasks() {
    return this.log(`This feature in full version: https://amautomarket.com/products/spekter-agency-full-chuc-nang`, "warning");
  }
}

module.exports = TasksSv;
