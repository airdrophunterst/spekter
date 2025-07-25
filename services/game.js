const settings = require("../config/config");
const { sleep, getRandomNumber } = require("../utils");

class GameSv {
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

  async startStage(stageId) {
    return this.makeRequest(`${settings.BASE_URL}/startStage`, "post", {
      stageId: stageId,
    });
  }

  async endStage(payload) {
    return this.makeRequest(`${settings.BASE_URL}/endStage`, "post", payload);
  }

  convertMilliseconds(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return { minutes, seconds };
  }

  getStageWaitTime(stageId) {
    const stage = parseInt(stageId);
    const MAX_PLAY_TIME = 2280;

    if (stage === 1) return Math.min(Math.floor(Math.random() * 30 + 150), MAX_PLAY_TIME);
    else if (stage === 2) return Math.min(Math.floor(Math.random() * 30 + 170), MAX_PLAY_TIME);
    else if (stage === 3) return Math.min(Math.floor(Math.random() * 30 + 190), MAX_PLAY_TIME);
    else if (stage === 4) return Math.min(Math.floor(Math.random() * 30 + 250), MAX_PLAY_TIME);
    else if (stage === 5) return Math.min(Math.floor(Math.random() * 30 + 300), MAX_PLAY_TIME);
    else if (stage <= 50) {
      const baseTime = 300 + (stage - 5) * 60;
      return Math.min(Math.floor(Math.random() * 60 + baseTime), MAX_PLAY_TIME);
    }
    return 60;
  }

  async handlePlayGame(stageLevel, retries = 2) {
    const timeSleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
    this.log(`Delay ${timeSleep} seconds to start stage ${stageLevel}...`);
    await sleep(timeSleep);

    let played = false;
    while (retries > 0) {
      retries--;
      const res = await this.startStage(String(stageLevel));
      if (!res.success) {
        this.log(`Can't start stage ${stageLevel} | ${JSON.stringify(res)}`, "warning");
        if (settings.AUTO_LOOP) return false;
        continue;
      }
      const { stageUid, stageId, lootItemInfo, userState } = res.data;
      if (!stageUid || !lootItemInfo) {
        this.log(`Can't start stage`, "warning");
        if (settings.AUTO_LOOP) return false;
        continue;
      }

      const waitTimeInSeconds = this.getStageWaitTime(stageId);
      const playTime = waitTimeInSeconds * 1000;
      if (playTime < 60000 || playTime > 2280 * 1000) {
        this.log(`Invalid playTime for Stage ${stageId}: ${playTime}ms (${waitTimeInSeconds}s)`, "warning");
        continue;
      }
      const secondWait = Math.floor(waitTimeInSeconds);
      const { minutes, seconds } = this.convertMilliseconds(playTime);
      this.log(`[${new Date().toLocaleString()}] Waiting ${minutes} minutes ${seconds} seconds to complete game at stage ${stageLevel}...`);
      await sleep(secondWait);

      const baseKillCount = Math.floor(playTime / 200);
      let killCount;

      if (stageId <= 20) {
        const referenceKillCounts = {
          1: 819,
          2: 889,
          3: 1126,
          4: 1402,
          5: 1622,
          6: 2081,
          7: 2120,
          8: 2639,
          9: 3076,
          10: 3225,
          11: 3627,
          12: 3699,
          13: 4265,
          14: 4357,
          15: 4708,
          16: 4908,
          17: 5209,
          18: 5544,
          19: 6014,
          20: 6240,
        };
        killCount = Math.min(Math.floor(baseKillCount + (referenceKillCounts[stageId] || baseKillCount) * (0.8 + Math.random() * 0.4)), referenceKillCounts[stageId] || baseKillCount * 1.5);
      } else {
        const baseStage20KillCount = 6240;
        const incrementPerStage = (baseStage20KillCount - 819) / 19;
        killCount = Math.min(Math.floor(baseKillCount + (baseStage20KillCount + (stageId - 20) * incrementPerStage) * (0.8 + Math.random() * 0.4)), baseKillCount * 1.5);
      }

      const lootedItemInfo = {
        lootedItems: lootItemInfo.lootItems,
        gold: lootItemInfo.gold,
      };

      const payloadEnd = {
        stageUid: stageUid,
        lootedItemInfo: lootedItemInfo,
        stageState: 3,
        playTime: playTime,
        killCount: killCount,
        abilityGold: 0,
      };

      if (!played) {
        const resEnd = await this.endStage(payloadEnd);
        if (!resEnd.success) {
          this.log(`Can't end stage ${stageLevel} | ${JSON.stringify(resEnd)}`, "warning");
          return false;
        }
        const { rewardInfo } = resEnd.data;
        this.log(`End stage ${stageLevel} success`, "success");
        played = true;
      }

      if (!settings.AUTO_LOOP) {
        const resClaim = await this.claimStageReward(stageLevel);
        if (resClaim.success) {
          this.log(`Claim stage ${stageLevel} success`, "success");
          return true;
        } else {
          this.log(`Claim stage ${stageLevel} failed | Reward: ${JSON.stringify(resClaim)}`, "warning");
          return true;
        }
      }
      return settings.AUTO_LOOP ?? false;
    }
    return settings.AUTO_LOOP ?? false;
  }
}

module.exports = GameSv;
