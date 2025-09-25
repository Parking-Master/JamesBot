const axios = require("axios").default;
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const WebSocket = require("ws");
const { JSDOM } = require("jsdom");
const FormData = require("form-data");
const fs = require("fs");

__dirname = `/Users/XXX/JamesBot`;

global.chatFkey = null;
global.dataFile = JSON.parse(fs.readFileSync(`${__dirname}/data.json`).toString());

const ChatEvents = require("./ChatEvents");
const commands = require("./commands");

function htmldecode(str) {
  const translate_re = /&(nbsp|amp|quot|lt|gt);/g;
  const translate = {
    nbsp: ' ',
    amp: '&',
    quot: '"',
    lt: '<',
    gt: '>',
  };
  return str.replace(translate_re, (match, entity) => translate[entity]).replace(/&#(\d+);/gi, (match, numStr) => {
    const num = parseInt(numStr, 10);
    return String.fromCharCode(num);
  });
}

function getCommand(message) {
  let isEval = false;
  let match = message.match(/^(\|\|>?|!!>?)[ \t]*(\S+)/);
  if (!match) return null;

  let caller = match[1].replace(/[ \t]+$/, "");
  if (caller != "||" && caller != "!!" && caller != "||>" && caller != "!!>") return null;

  if (caller == "||>" || caller == "!!>") {
    isEval = true;
  }

  if (message.startsWith("|| eval ") || message.startsWith("!! eval ") || message.startsWith("||eval ") || message.startsWith("!!eval ")) {
    message = message.replace("eval", "");
    match = message.match(/^(\|\|>?|!!>?)[ \t]*(\S+)/);
    isEval = true;
  }

  let command = match[2];

  let remaining = message.slice(match[0].length).trim();
  let args = remaining.length ? remaining.split(" ") : [];

  return {
    command,
    args,
    isEval
  };
}

function ChatEvent(type, event) {
  if (type == ChatEvents.NEW_MESSAGE) {
    let message = event["r" + global.roomId].e[0];
    if (message.content && message.content.length > 300) return;

    message.content = htmldecode(message.content);

    let command = getCommand(message.content);
    if (message.user_id == userId) return;

    if (!global.dataFile.seen_users.includes(message.user_id)) {
      sendMessage(`@${message.user_name.replace(/ /g, "")} Welcome to the JavaScript chat! Please review the [room rules](https://javascriptroom.github.io/rules/). If you have a question, just post it, and if anyone's free and interested they'll help. If you want to report an abusive user or a problem in this room, visit our [meta](https://github.com/JavaScriptRoom/culture/).`);
      global.dataFile.seen_users.push(message.user_id);
    }

    commands["w3schools"].run([], sendMessage, message);
    commands["java"].run([], sendMessage, message);
    commands["stop"].run([], sendMessage, message);

    if (!command) return;

    if (command.isEval) {
      commands["eval"].run(`${command.command} ${command.args.join(" ")}`, function(output) {
        sendMessage(output);
      }, message);
      return;
    }

    if (!commands[command.command]) {
      Object.values(commands).forEach(cmd => {
        if (cmd.shortcuts.includes(command.command)) command.command = cmd.name;
      });
    }

    if (!commands[command.command]) return sendMessage(`:${message.message_id} Invalid command! Try \`help\` for a list of available commands...`);

    commands[command.command].run(command.args, function(output) {
      sendMessage(output);
    }, message);
  }
}

global.siteURL = "https://stackoverflow.com";
global.chatURL = "https://chat.stackoverflow.com";
global.roomId = 17; // This can be set to any room number.

const userId = "YOUR_ACCOUNT_USER_ID";
const email = "YOUR_ACCOUNT_EMAIL";
const password = "YOUR_ACCOUNT_PASSWORD";

const cookieJar = new tough.CookieJar();
const client = wrapper(axios.create({ jar: cookieJar, withCredentials: true }));

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

  try {
    const res = await client.post(loginUrl, form, {
      headers: {
        ...form.getHeaders(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      maxRedirects: 0,
      validateStatus: status => (status >= 200 && status < 400),
    });

    if (res.status === 302 || res.status === 303) {
      const loc = res.headers.location;
      if (loc === "/" || loc === global.siteURL || loc === global.siteURL + "/") {
        console.log("Logged in");
        return true;
      }
    } else if (res.status === 200) {
      console.error("Login likely failed: Received 200 OK but no redirect.");
    } else {
      console.error(`Unexpected status code received during login: ${res.status}`);
    }
  } catch (err) {
    console.error("Error during login request:", err.message);
  }

  throw new Error("Login failed.");
}

async function getChatFkey() {
  const res = await client.get(`${global.chatURL}/rooms/${global.roomId}`);
  const dom = new JSDOM(res.data);
  const fkeyInput = dom.window.document.querySelector("input#fkey");
  if (!fkeyInput) throw new Error("Chat fkey not found");
  return fkeyInput.value;
}

async function getWebSocketUrl(fkey) {
  const params = new URLSearchParams();
  params.append("roomid", global.roomId);
  params.append("fkey", fkey);

  const res = await client.post(`${global.chatURL}/ws-auth`, params.toString(), {
    headers: { "content-type": "application/x-www-form-urlencoded" }
  });
  if (!res.data.url) throw new Error("WebSocket URL not found");
  return res.data.url;
}

async function connectWebSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl + "?l=99999999999", {
      headers: {
        Origin: global.chatURL,
      },
    });

    ws.on("open", () => {
      resolve(ws);
    });

    function onMessage(data) {
      const json = JSON.parse(data);
      Object.keys(json).forEach((room) => {
        const roomInt = parseInt(room.substring(1), 10);
        if (!json[`r${roomInt}`].e) {
            return;
        }
        if (roomInt != global.roomId) {
            return;
        }
        json[`r${roomInt}`].e.forEach((event) => {
          ChatEvent(event.event_type.toString(), json);
        });
      });
    }

    ws.on("message", onMessage);
    ws.on("error", reject);
    ws.on("close", () => {
      console.log("WebSocket closed");
    });
  });
}

async function sendMessage(text) {
  let fkey = global.chatFkey;
  const params = new URLSearchParams();
  params.append("text", text);
  params.append("fkey", fkey);

  const res = await client.post(`${global.chatURL}/chats/${global.roomId}/messages/new`, params.toString(), {
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Referer: `${global.chatURL}/rooms/${global.roomId}`,
    },
  });
  if (res.data && res.data.id) {
    console.log(`Message sent with id ${res.data.id}`);
  } else {
    console.error("Message sending failed:", res.data);
  }
}

async function main() {
  await login();
  const chatFkey = await getChatFkey();
  const wsUrl = await getWebSocketUrl(chatFkey);
  const ws = await connectWebSocket(wsUrl);

  global.chatFkey = chatFkey;

  process.stdin.resume();
}

function handleExit(err) {
  fs.writeFileSync(`${__dirname}/data.json`, JSON.stringify(global.dataFile));

  if (err === "customerror:SIGINT") {
    process.exit();
  } else {
    console.log(err);
  }
}
process.on("SIGINT", () => handleExit("customerror:SIGINT"));
process.on("exit", handleExit);
process.on("unhandledRejection", handleExit);
process.on("uncaughtException", handleExit);

main();