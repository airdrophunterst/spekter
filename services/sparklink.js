const settings = require("../config/config");
const { sleep } = require("../utils");

class SparkSv {
  constructor({ makeRequest, log, userData }) {
    this.userData = userData;
    this.makeRequest = makeRequest;
    this.log = log;
  }

  async #getUserData() {
    return this.makeRequest(`${settings.BASE_URL}/getUserData`, "post", {
      inviter: settings.REF_ID || "Agent_599117",
    });
  }

  async #getSparkLink() {
    return this.makeRequest(`${settings.BASE_URL}/getSparkLink`, "post", {});
  }

  async handleRefreshUserData() {
    const resUser = await this.#getUserData();
    if (!resUser.success) return this.userData;
    this.userData = resUser.data?.userData;
    return resUser.data?.userData;
  }

  async handleClaimSparkLink() {
    const lvClaim = [1, 5, 10, 15, 20, 30, 40, 50];
    const resGet = await this.#getSparkLink();
    const { sparkLink } = resGet.data;

    let linksAvaliable = [];
    sparkLink?.links?.forEach((agent) => {
      const claimableLevels = lvClaim.filter((level) => agent.stageLv > level && level > agent.claimedStageLv);
      if (claimableLevels.length > 0) {
        linksAvaliable.push(agent);
      }
    });
    if (!linksAvaliable || linksAvaliable.length === 0) return this.log(`No reward ref avaliable to claim`, "warning");
    const resClaim = await this.makeRequest(`${settings.BASE_URL}/claimAllSparkLinkStageQuest`, "post", {});
    if (!resClaim.success) {
      this.log(`Claimed ref ${ref.uid} falied | ${JSON.stringify(resClaim)}`, "warning");
    } else {
      this.log(`Claimed ref ${ref.uid}`, "success");
    }
  }
}

module.exports = SparkSv;
