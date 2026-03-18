(async () => {
  const { File, Blob } = require("buffer");
  if (typeof globalThis.File === "undefined") globalThis.File = File;
  if (typeof globalThis.Blob === "undefined") globalThis.Blob = Blob;
  
  const axios = require("axios").default;
  const { wrapper } = await import("axios-cookiejar-support");
  const tough = require("tough-cookie");
  const WebSocket = require("ws");
  const { JSDOM } = require("jsdom");
  const FormData = require("form-data");
  const fs = require("fs");
  const { NodeHtmlMarkdown } = require("node-html-markdown");
  
  global.siteURL = "https://stackoverflow.com";
  global.chatURL = "https://chat.stackoverflow.com";
  
  global.rooms = {
    17: { fkey: null },
    7: { fkey: null }
  };
  
  global.chatClients = {};
  global.dataFile = JSON.parse(fs.readFileSync("data.json").toString());
  function saveData() {
    fs.writeFileSync("data.json", JSON.stringify(global.dataFile));
  }
  global.saveData = saveData;
  
  const ChatEvents = require("./ChatEvents");
  const commands = require("./commands");
  
  const userId = "YOUR_ACCOUNT_USER_ID";
  const email = "YOUR_ACCOUNT_EMAIL";
  const password = "YOUR_ACCOUNT_PASSWORD";
  
  const cookieJar = new tough.CookieJar();
  const client = wrapper(axios.create({ jar: cookieJar, withCredentials: true }));
  
  function htmldecode(str) {
    const translate_re = /&(nbsp|amp|quot|lt|gt);/g;
    const translate = { nbsp: " ", amp: "&", quot: "\"", lt: "<", gt: ">" };
    return str.replace(translate_re, (match, entity) => translate[entity]).replace(/&#(\d+);/gi, (m, num) => String.fromCharCode(parseInt(num, 10)));
  }
  
  function getCommand(message) {
    let isEval = false;
    let match = message.match(/^(\|\|>?|!!>?)[ \t]*(\S+)/);
    if (!match) return null;
    let caller = match[1].replace(/[ \t]+$/, "");
    if (!["||", "!!", "||>", "!!>"].includes(caller)) return null;
    if (caller == "||>" || caller == "!!>") isEval = true;
    if (message.startsWith("|| eval ") || message.startsWith("!! eval ")) {
      message = message.replace("eval", "");
      match = message.match(/^(\|\|>?|!!>?)[ \t]*(\S+)/);
      isEval = true;
    }
    let command = match[2];
    let remaining = message.slice(match[0].length).trim();
    let args = remaining.length ? remaining.split(" ") : [];
    return { command, args, isEval };
  }
  
  async function getFkeyFromPage(url) {
    const res = await client.get(url);
    const dom = new JSDOM(res.data);
    const input = dom.window.document.querySelector("input[name='fkey']");
    if (!input) throw new Error("fkey not found");
    return input.value;
  }
  
  async function login() {
    const loginUrl = `${global.siteURL}/users/login`;
    const fkey = await getFkeyFromPage(loginUrl);
    const form = new FormData();
    form.append("fkey", fkey);
    form.append("email", email);
    form.append("password", password);
  
    const res = await client.post(loginUrl, form, {
      headers: { ...form.getHeaders(), "User-Agent": "Mozilla/5.0" },
      maxRedirects: 0,
      validateStatus: status => (status >= 200 && status < 400)
    });
    if (res.status === 302) {
      console.log("Logged in");
      return true;
    }
    throw new Error("Login failed");
  }
  
  async function getChatFkey(roomId) {
    const res = await client.get(`${global.chatURL}/rooms/${roomId}`);
    const dom = new JSDOM(res.data);
    const fkeyInput = dom.window.document.querySelector("input#fkey");
    if (!fkeyInput) throw new Error("Chat fkey not found");
    return fkeyInput.value;
  }
  
  async function getWebSocketUrl(roomId, fkey) {
    const params = new URLSearchParams();
    params.append("roomid", roomId);
    params.append("fkey", fkey);
    const res = await client.post(`${global.chatURL}/ws-auth`, params.toString(), {
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    if (!res.data.url) throw new Error("WebSocket URL not found");
    return res.data.url;
  }
  
  async function sendMessage(roomId, text) {
    const fkey = global.rooms[roomId].fkey;
    const params = new URLSearchParams();
    params.append("text", text);
    params.append("fkey", fkey);
    const res = await client.post(`${global.chatURL}/chats/${roomId}/messages/new`, params.toString(), {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        Referer: `${global.chatURL}/rooms/${roomId}`
      }
    });
    if (res.data && res.data.id) {
      console.log(`Message sent in room ${roomId} with id ${res.data.id}`);
    } else {
      console.error(`Message sending failed in room ${roomId}:`, res.data);
    }
  }
  
  let prevMessage = {};
  let messagesSinceWelcome = 8;
  function ChatEvent(roomId, type, event) {
    if (type == ChatEvents.NEW_MESSAGE) {
      let message = event["r" + roomId].e[0];
      if (!message) return;
      if (message.content && message.content.length > 3000) return;
      if (typeof prevMessage[roomId] == "undefined") prevMessage[roomId] = null;
      if (prevMessage[roomId] == message.message_id) return;
      prevMessage[roomId] = message.message_id;
      message.content = NodeHtmlMarkdown.translate(htmldecode(message.content));
      let command = getCommand(message.content);
      if (message.user_id == userId) return;
  
      messagesSinceWelcome++;
      // Welcome new users
      if (!global.dataFile.seen_users.includes(message.user_id) && roomId == 17 && messagesSinceWelcome > 8) {
        messagesSinceWelcome = 0;
        sendMessage(roomId, `@${message.user_name.replace(/ /g, "")} Welcome to the JavaScript chat! If you have a question, just post it, and if anyone's free and interested they'll help. No spamming.`);
        global.dataFile.seen_users.push(message.user_id);
        global.saveData();
      }
  
      // Auto-run some commands
      commands["w3schools"].run([], (out) => sendMessage(roomId, out), message);
      commands["java"].run([], (out) => sendMessage(roomId, out), message);
      commands["stop"].run([], (out) => sendMessage(roomId, out), message);
  
      if (!command) return;
  
      if (command.isEval) {
        commands["eval"].run(`${command.command} ${command.args.join(" ")}`, (out) => sendMessage(roomId, out), message);
        return;
      }
  
      if (!commands[command.command]) {
        Object.values(commands).forEach(cmd => {
          if (cmd.shortcuts.includes(command.command)) command.command = cmd.name;
        });
      }
      if (!commands[command.command]) return sendMessage(roomId, `:${message.message_id} Invalid command! Try \`|| help\` to see a list of commands.`);
  
      commands[command.command].run(command.args, (out) => sendMessage(roomId, out), message);
    }
  }
  
  async function connectWebSocket(wsUrl, roomIds) {
    const ws = new WebSocket(wsUrl + "?l=99999999999", { headers: { Origin: global.chatURL } });
    ws.on("open", () => {
      console.log("WebSocket connected.");
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, 45 * 1000);
    });
    ws.on("message", (data) => {
      try {
        const json = JSON.parse(data);
        Object.keys(json).forEach((roomKey) => {
          const roomInt = parseInt(roomKey.substring(1), 10);
          if (!json[`r${roomInt}`].e) return;
          json[`r${roomInt}`].e.forEach((event) => {
            ChatEvent(roomInt, event.event_type.toString(), json);
          });
        });
      } catch (err) {
        console.error("Message parse error:", err);
      }
    });
    ws.on("close", () => {
      console.log("WebSocket closed. Reconnecting...");
      clearInterval(pingInterval);
      setTimeout(async () => {
        try {
          const roomIds = Object.keys(global.rooms).map(r => parseInt(r));
          let wsUrl = null;
          for (const roomId of roomIds) {
            const chatFkey = await getChatFkey(roomId);
            global.rooms[roomId].fkey = chatFkey;
            const url = await getWebSocketUrl(roomId, chatFkey);
            if (!wsUrl) wsUrl = url;
          }
          await connectWebSocket(wsUrl, roomIds);
        } catch (err) {
          console.error("Reconnect failed:", err);
          setTimeout(() => connectWebSocket(wsUrl), 30 * 1000);
        }
      }, 5000);
    });
    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    });
  }
  
  async function main() {
    await login();
    const roomIds = Object.keys(global.rooms).map(r => parseInt(r));
    const wsGroups = {};
    for (const roomId of roomIds) {
      const chatFkey = await getChatFkey(roomId);
      global.rooms[roomId].fkey = chatFkey;
      const url = await getWebSocketUrl(roomId, chatFkey);
      if (!wsGroups[url]) wsGroups[url] = [];
      wsGroups[url].push(roomId);
    }
    for (const [url, rooms] of Object.entries(wsGroups)) connectWebSocket(url, rooms);
    process.stdin.resume();
  }
  main();
  
  function handleExit(err) {
    if (err === "customerror:SIGINT") process.exit();
    else console.log(err);
  }
  process.on("SIGINT", () => handleExit("customerror:SIGINT"));
  process.on("exit", handleExit);
  process.on("unhandledRejection", handleExit);
  process.on("uncaughtException", handleExit);
})();
