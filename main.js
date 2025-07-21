const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, getRandomNumber, saveToken, isTokenExpired, saveJson } = require("./utils");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { checkBaseUrl } = require("./checkAPI");

class ClientAPI {
  constructor(queryId, accountIndex, proxy, baseURL, tokens) {
    this.headers = {
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "Content-Type": "application/json",
      origin: "https://app.spekteragency.io",
      referer: "https://app.spekteragency.io/",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };
    this.baseURL = baseURL;
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.tokens = tokens;
    this.token = null;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  #set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    try {
      const telegramauth = this.queryId;
      const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
      this.session_name = userData.id;
      this.#get_user_agent();
    } catch (error) {
      this.log(`Can't create user agent, try get new query_id: ${error.message}`, "error");
      return;
    }
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
    let ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Local IP]";
    let logMessage = "";
    if (settings.USE_PROXY) {
      ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    }
    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  async makeRequest(
    url,
    method,
    data = {},
    options = {
      retries: 1,
      isAuth: false,
      extraHeaders: {},
    }
  ) {
    const { retries, isAuth, extraHeaders } = options;

    const headers = {
      ...this.headers,
      host: "us-central1-spekter-agency.cloudfunctions.net",
      ...extraHeaders,
    };

    if (!isAuth) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    let proxyAgent = null;
    if (settings.USE_PROXY) {
      proxyAgent = new HttpsProxyAgent(this.proxy);
    }
    let currRetries = 0,
      success = false;
    do {
      try {
        const response = await axios({
          method,
          url: `${url}`,
          data,
          headers,
          timeout: 30000,

          ...(proxyAgent ? { httpsAgent: proxyAgent } : {}),
        });
        success = true;
        if (response?.data?.result) {
          if (response?.data?.result?.errorCode) {
            if (response?.data?.result?.errorCode !== 0) return { status: response.status, success: false, data: response.data.result };
            return { status: response.status, success: true, data: response.data.result.data.data };
          }
          return { status: response.status, success: true, data: response.data.result.data || response.data.result };
        }
        return { success: true, data: response.data, status: response.status };
      } catch (error) {
        if (error.message.includes("stream has been aborted")) {
          return { success: false, status: error.status, data: null, error: error.response.data.error || error.response.data.message || error.message };
        }
        if (error.status == 401) {
          const token = await this.getValidToken(true);
          if (!token) {
            process.exit(1);
          }
          this.token = token;
          if (retries > 0)
            return await this.makeRequest(url, method, data, {
              ...options,
              retries: 0,
            });
          else return { success: false, status: error.status, error: error.response.data.error || error.response.data.message || error.message };
        }
        if (error.status == 400) {
          this.log(`Invalid request for ${url}, maybe have new update from server | contact: https://t.me/airdrophuntersieutoc to get new update!`, "error");
          return { success: false, status: error.status, error: error.response.data.error || error.response.data.message || error.message };
        }
        this.log(`Yêu cầu thất bại: ${url} | ${error.message} | đang thử lại...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        if (currRetries == retries) return { status: error.status, success: false, error: error.message };
      }
      currRetries++;
    } while (currRetries <= retries && !success);
  }

  async auth() {
    return this.makeRequest(
      `${this.baseURL}/telegramAuth`,
      "post",
      {
        data: {
          initData: this.queryId,
        },
      },
      { isAuth: true }
    );
  }

  async verifyToken(token) {
    const res = await this.makeRequest(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=AIzaSyAvfTd0fcRoSBwPw22kcBM2JqvG7Y147DY`,
      "post",
      {
        token: token,
        returnSecureToken: true,
      },
      {
        isAuth: true,
        extraHeaders: {
          host: "www.googleapis.com",
          "x-client-version": "Chrome/JsCore/8.10.1/FirebaseCore-web",
        },
      }
    );
    if (res?.data && res.data.idToken) {
      await this.getAccinfo(res.data.idToken);
    }

    return res;
  }

  async getAccinfo(token) {
    return this.makeRequest(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=AIzaSyAvfTd0fcRoSBwPw22kcBM2JqvG7Y147DY`,
      "post",
      {
        idToken: token,
      },
      {
        isAuth: true,
        extraHeaders: {
          host: "www.googleapis.com",
          "x-client-version": "Chrome/JsCore/8.10.1/FirebaseCore-web",
        },
      }
    );
  }

  async getUserInfo() {
    return this.makeRequest(`${this.baseURL}/getUserData`, "post", {
      data: {
        inviter: settings.REF_ID || "Agent_179391",
      },
    });
  }

  async claimStageReward(stageId) {
    return this.makeRequest(`${this.baseURL}/claimStageReward`, "post", {
      data: {
        stageId: stageId,
      },
    });
  }

  async claimSpark() {
    return this.makeRequest(`${this.baseURL}/harvestSparkCore`, "post", {
      data: null,
    });
  }

  async startStage(stageId) {
    return this.makeRequest(`${this.baseURL}/startStage`, "post", {
      data: {
        stageId: stageId,
      },
    });
  }

  async endStage(payload) {
    return this.makeRequest(`${this.baseURL}/endStage`, "post", payload);
  }

  async getValidToken(isNew = false) {
    const existingToken = this.token;
    const isExp = isTokenExpired(existingToken);
    if (existingToken && !isNew && !isExp) {
      this.log("Using valid token", "success");
      return existingToken;
    } else {
      this.log("No found token or experied, trying get new token...", "warning");
      const newToken = await this.auth();
      if (newToken.success && newToken.data?.token) {
        const res = await this.verifyToken(newToken.data?.token);
        if (res.data.idToken) {
          this.token = res.data.idToken;
          await saveJson(this.session_name, res.data.idToken, "tokens.json");
          return res.data.idToken;
        }
      }
      this.log("Can't get new token...", "warning");
      return null;
    }
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

  canClaimSparkCore(lastClaim) {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastClaim;
    const hours24 = 24 * 60 * 60 * 1000;

    return timeDiff >= hours24;
  }

  getRemainingTimeForSparkCore(lastClaim) {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastClaim;
    const hours24 = 24 * 60 * 60 * 1000;
    const remainingTime = hours24 - timeDiff;
    if (remainingTime <= 0) {
      return { hours: 0, minutes: 0 };
    }
    const remainingHours = Math.floor(remainingTime / (60 * 60 * 1000));
    const remainingMinutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
    return { hours: remainingHours, minutes: remainingMinutes };
  }

  async handleGame(stageLevel, retries = 2) {
    let played = false;
    while (retries > 0) {
      retries--;
      const res = await this.startStage(String(stageLevel));
      if (!res.success) {
        this.log(`Can't start stage ${stageLevel} | ${JSON.stringify(res)}`, "warning");
        continue;
      }
      const { stageUid, stageId, lootItemInfo, userState } = res.data;
      if (!stageUid || !lootItemInfo) {
        this.log(`Can't start stage`, "warning");
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
        data: {
          stageUid: stageUid,
          lootedItemInfo: lootedItemInfo,
          stageState: 3,
          playTime: playTime,
          killCount: killCount,
          abilityGold: 0,
        },
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
    }

    return settings.AUTO_LOOP;
  }

  convertMilliseconds(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return { minutes, seconds };
  }

  async runAccount() {
    const accountIndex = this.accountIndex;
    const initData = this.queryId;
    const queryData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
    this.session_name = queryData.id;
    this.token = this.tokens[this.session_name];

    if (settings.USE_PROXY) {
      try {
        this.proxyIP = await this.checkProxyIP();
      } catch (error) {
        this.log(`Cannot check proxy IP: ${error.message}`, "warning");
        return;
      }
      const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
      console.log(`=========Tài khoản ${accountIndex + 1} | ${this.proxyIP} | Bắt đầu sau ${timesleep} giây...`.green);
      await sleep(timesleep);
    }

    let token = await this.getValidToken();
    if (!token) return;
    this.token = token;
    let userData = { success: false },
      retries = 0;
    do {
      userData = await this.getUserInfo();
      if (userData?.success) break;
      retries++;
    } while (retries < 2);

    // process.exit(0);
    if (userData.success) {
      let { stages, sparkLink, sparkCore, userInfo, currency } = userData.data;
      let energy = currency.energyInfo.energy;
      let currentStage = stages.stageLv;
      const lastClaim = sparkCore.lastClaim;

      this.log(
        `Username: ${userInfo.name} | Lv stage: ${stages.stageLv} | Gold: ${currency.gold} | Diamond: ${currency.diamond} | Spark:${currency.sparks} | Energy: ${currency.energyInfo.energy}`,
        "custom"
      );
      if (!lastClaim || this.canClaimSparkCore(lastClaim)) {
        const harvestResult = await this.claimSpark();
        if (harvestResult.success) {
          this.log(`Claim spart score success!`, "success");
        } else {
          this.log(`Claim spart score failed! | ${JSON.stringify(harvestResult)}`, "warning");
        }
      } else {
        const { hours, minutes } = this.getRemainingTimeForSparkCore(lastClaim);
        this.log(`Next claim sparkcore at: ${hours} hours ${minutes} minutes`, "warning");
      }
      await sleep(1);

      if (settings.AUTO_LOOP && currentStage >= settings.LOOP_STAGE) {
        this.log(`You are looping stage ${settings.LOOP_STAGE}...`);
        while (energy > 5) {
          energy -= 5;
          const res = await this.handleGame(settings.LOOP_STAGE);
          if (!res) break;
          this.token = await this.getValidToken();
        }
      }

      if (currentStage >= settings.MAX_STAGE) {
        //ktra các stage chưa claim
        const stageAvaliable = Object.values(stages.infos).filter((s) => s.rewardState < 3);
        if (stageAvaliable.length == 0) {
          while (energy > 5) {
            energy -= 5;
            const res = await this.handleGame(settings.MAX_STAGE);
            if (!res) break;
            this.token = await this.getValidToken();
          }
        } else {
          for (const stage of stageAvaliable) {
            if (energy > 5) {
              energy -= 5;
              const res = await this.handleGame(stage.stageId);
              this.token = await this.getValidToken();
              if (!res) break;
            } else {
              this.log(`Not enough energy!`, "warning");
            }
          }
        }
      }
      while (currentStage < settings.MAX_STAGE && energy > 5) {
        if (energy > 5) {
          energy -= 5;
          const res = await this.handleGame(currentStage);
          this.token = await this.getValidToken();
          currentStage++;
          if (!res) break;
        } else {
          this.log(`Not enough energy!`, "warning");
        }
      }
      await sleep(2);
    } else {
      return this.log("Can't get use info...skipping", "error");
    }
  }
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy, hasIDAPI, tokens } = workerData;
  const to = new ClientAPI(queryId, accountIndex, proxy, hasIDAPI, tokens);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function main() {
  console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)".yellow);
  const queryIds = loadData("data.txt");
  const proxies = loadData("proxy.txt");
  const tokens = require("./tokens.json");

  if (queryIds.length == 0 || (queryIds.length > proxies.length && settings.USE_PROXY)) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${queryIds.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  if (!settings.USE_PROXY) {
    console.log(`You are running bot without proxies!!!`.yellow);
  }
  let maxThreads = settings.USE_PROXY ? settings.MAX_THEADS : settings.MAX_THEADS_NO_PROXY;

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`Không thể tìm thấy ID API, thử lại sau!`.red);
  console.log(`${message}`.yellow);
  // process.exit();
  queryIds.map((val, i) => new ClientAPI(val, i, proxies[i], hasIDAPI, tokens).createUserAgent());

  await sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            hasIDAPI,
            queryId: queryIds[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex],
            tokens: tokens,
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message === "taskComplete") {
                worker.terminate();
              }
              if (settings.ENABLE_DEBUG) {
                console.log(message);
              }
              resolve();
            });
            worker.on("error", (error) => {
              console.log(`Lỗi worker cho tài khoản ${currentIndex}: ${error.message}`);
              worker.terminate();
              resolve();
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
                errors.push(`Worker cho tài khoản ${currentIndex} thoát với mã: ${code}`);
              }
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    await sleep(3);
    console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)".yellow);
    console.log(`=============Hoàn thành tất cả tài khoản | Chờ ${settings.TIME_SLEEP} phút=============`.magenta);
    await sleep(settings.TIME_SLEEP * 60);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
