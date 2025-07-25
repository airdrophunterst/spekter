const settings = require("../config/config");
const { sleep } = require("../utils");

class SparkSv {
  constructor({ makeRequest, log }) {
    this.userData = null;
    this.makeRequest = makeRequest;
    this.log = log;
  }

  async #getUserData() {
    return this.makeRequest(`${settings.BASE_URL}/getUserData`, "post", {
      inviter: settings.REF_ID || "Agent_599117",
    });
  }

  async handleRefreshUserData() {
    const resUser = await this.#getUserData();
    if (!resUser.success) throw new Error(`Can't get user data`);
    return resUser.data;
  }

  async handleClaimSparkLink() {
    const lvClaim = [1, 5, 10, 15, 20, 30, 40, 50];
    this.userData = await this.handleRefreshUserData();
    const { sparkLink } = this.userData;
    const linksAvaliable = sparkLink.links.filter((link) => link.claimedStageLv != 0 && link.claimedStageLv < link.stageLv && lvClaim.includes(link.stageLv));
    if (linksAvaliable.length === 0) return this.log(`No reward ref avaliable to claim`, "warning");

    for (const ref of linksAvaliable) {
      await sleep(3);
      const resClaim = await this.makeRequest(`${settings.BASE_URL}/claimSparkLinkStageQuest`, "post", {
        inviteeUid: ref.uid,
      });
      if (!resClaim.success) {
        this.log(`Claimed ref ${ref.uid} falied | ${JSON.stringify(resClaim)}`, "warning");
      } else {
        this.log(`Claimed link ${ref.uid}`, "success");
      }
    }
  }
}

module.exports = SparkSv;
