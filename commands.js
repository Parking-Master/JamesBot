const fs = require("fs");
const cheerio = require("cheerio");
const sandboxRun = require("./sandbox");

__dirname = `/Users/XXX/JamesBot`;

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function codify(content) {
  const tab = "    ";
  const spacified = content.replace('\t', tab);
  const lines = spacified.split(/[\r\n]/g);
  if (lines.length === 1) {
    return `\`${lines[0]}\``;
  }
  return lines.map((line) => tab + line).join('\n');
}

async function stats(id) {
  const resp2 = await this.fetch('https://api.stackexchange.com/2.2/sites?pagesize=999999999', { method: 'GET' });
  let sites = JSON.parse(await resp2.text());
  const siteURLRegex = global.siteURL.replace(/http(s)?:\/\/(www\.)?/, '');
  let api_site_param = sites.items.find(site => (site.aliases && site.aliases.map(siteURL => siteURL.replace(/http(s)?:\/\/(www\.)?/, '')).includes(siteURLRegex)) || site.site_url.replace(/http(s)?:\/\/(www\.)?/, '') === siteURLRegex).api_site_parameter;
  const resp = await this.fetch(`https://api.stackexchange.com/2.2/users/${id}?site=${api_site_param.trim()}`);
  const body = await resp.json();
  if (resp.status !== 200 || !body.items) {
    return false;
  }
  return body.items[0];
}

async function chatIDToSiteID(id) {
  const body = await this.fetch(`${global.chatURL}/users/thumbs/${id.toString()}`).then((resp) => resp.json());
  return body.profileUrl.match(/\d+/)[0];
}

async function usernameToId(username, context) {
  const resp = await fetch(`${global.chatURL}/rooms/pingable/${global.roomId}`);
  let body = await resp.json();
  const array = body.filter(a => a[1].toUpperCase() === username.replace('@', '').toUpperCase());
  if (array.length === 0) return undefined;
  return array[0][0];
}

async function google_search(query, site, selector, selectorMatch) {
  const url = `https://lite.duckduckgo.com/html/?q=${encodeURIComponent(query)}${site ? `%20site:${site}` : ''}`;

  const data = await (await fetch(url, {
    headers: {
    "Host": "lite.duckduckgo.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Sec-GPC": "1",
    "Priority": "u=0, i",
    "TE": "trailers"
    },
  })).text();

  const $ = cheerio.load(data);
  const results = [];

  $('.result__body').each((i, el) => {
    const title = $(el).find('.result__title').text().trim();
    const link = $(el).find('.result__a').attr('href');
    const snippet = $(el).find('.result__snippet').text().trim();

    if (title && link) {
      results.push({ title, link, snippet });
    }
  });

  return { title: results[0].title, url: results[0].link };
}

function escape(str) {
  return str.replace(/[-^$\\/.*+?()[\]{}|]/g, '\\$&');
}

function formatArgs(template, args) {
  return template.replace(/\{(\d+)\}/g, (match, index) => {
    const argIndex = parseInt(index, 10) - 1;
    return args[argIndex] !== undefined ? args[argIndex] : match;
  });
}

function addCommand(name, output) {
  global.dataFile.saved_commands.push({ name: name, output: output });

  commands[name] = {
    name: name,
    args: [],
    description: "",
    shortcuts: [name.toLowerCase()],
    examples: [],
    run: async function(args, callback, message) {
      let result = formatArgs(output, args);
      callback(result);
    }
  };
}

function convertTimeStringToMiliseconds(time) {
  const parts = time.split(' ');
  const unit = parts.pop();
  const numeric = Number(parts.pop());
  if (!numeric || !unit || numeric < 0) return false;
  const units = [
    {
      name: 'hours',
      alias: ['h'],
      multiplier: 3.6e6,
    },
    {
      name: 'minutes',
      alias: ['min', 'm'],
      multiplier: 60000,
    },
    {
      name: 'seconds',
      alias: ['sec', 's'],
      multiplier: 1000,
    },
  ];
  const timeObj = units.find(obj => obj.name === unit || obj.alias.includes(unit));
  if (!timeObj) return false;
  return numeric * timeObj.multiplier;
}

function spq(str) {
  return str.match(/(['"].+?['"]|[^'"\s]+)+/g).map(s => s.replace(/^['"]|['"]$/g, ""));
}

function waitForReady(key, amount, callback = success => {}) {
  setTimeout(async () => {
    if (await isReady(key)) {
      return callback(true);
    }
    if (amount > max_attempts) {
      return callback(false);
    }
    waitForReady(key, amount + 1, callback);
    return undefined;
  }, 10000);
}

async function isReady(key) {
  const response = await fetch(`http://talkobamato.me/synth/output//${key}/video_created.txt`, { method: 'HEAD' });
  return response.status !== 404;
}

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

function mdnSearch(term) {
  return google_search(term, 'developer.mozilla.org', undefined, /^https:\/\/developer\.mozilla\.org\/.*$/);
}

let lastW3Sucks = 0;
let lastJavaSucks = 0;
let timers = [];

let commands = {
  "funfact": {
    name: "funfact",
    args: [],
    description: "Sends a fun fact",
    shortcuts: ["funfact", "ff"],
    examples: ["|| funfact"],
    run: async function(args, callback, message) {
      fetch("https://uselessfacts.jsph.pl/random.json?language=en").then((response) => response.json()).then(result => {
        callback(result.text);
      });
    },
  },
  "info": {
    name: "info",
    args: [],
    description: "Gives information about the bot",
    shortcuts: ["info"],
    examples: ["|| info"],
    run: async function(args, callback, message) {
      callback("I'm a bot. I am owned and operated by [@Parking Master](https://stackoverflow.com/users/17202960/parking-master). I am [open source](https://github.com/jbis9051/SO-ChatBot/). I am written in JavaScript.");
    }
  },
  "echo": {
    name: "echo",
    args: [],
    description: "Bot echo's what you say",
    shortcuts: ["echo", "betterecho", "say"],
    examples: ["|| echo hi"],
    run: async function(args, callback, message) {
      callback(args.join(" "));
    }
  },
  "random": {
    name: "random",
    args: ["min", "max"],
    description: "Generates Random number in range of [min,max] (both inclusive)",
    shortcuts: ["random"],
    examples: ["|| random 2 30", "|| random -2 30", "|| random 30 18"],
    run: function(args, callback, message) {
      if (args.length < 2) return callback('**Missing args**');
      if (!/^\d+$/.test((args[0] + args[1]).replace(/-/g, ''))) return callback("**Invalid args. Must be two integers.**");
      const num1 = parseInt(args[0], 10);
      const num2 = parseInt(args[1], 10);
      callback(`:${message.message_id} ${getRandomIntInclusive(Math.min(num1, num2), Math.max(num1, num2)).toString()}`);
    },
  },
  "status": {
    name: "status",
    args: [],
    description: "Used to check if the bot is alive.",
    shortcuts: ["status", "poke", "test"],
    examples: ["|| status"],
    run: async function(args, callback, message) {
      callback("I am currently alive!");
    },
  },
  "choose": {
    name: 'choose',
    description: "Chooses an option from a space delimited string of options. Strips 'or's .",
    examples: ['|| choose heads tails', '|| choose 1 2 3 or 4'],
    shortcuts: ['choose', 'pick', 'choice'],
    args: ['...options'],
    run: async function(args, callback, message) {
      const options = args.filter((arg) => arg !== 'or');
      if (options.length === 0) {
        callback("I can't read your mind. Please provide an arg or two.");
      }
      callback(options[Math.floor(Math.random() * options.length)]);
    },
  },
  "joke": {
    name: 'joke',
    args: [],
    description: 'Sends a joke',
    shortcuts: ['joke'],
    examples: ['|| joke'],
    run: function(args, callback, message) {
      if (Math.random() <= 0.1 && args[0] !== 'bypass') {
        return callback(`${message.user_name}'s code 😜`);
      }
      fetch('https://official-joke-api.appspot.com/jokes/programming/random').then((resp) => resp.json()).then((json) => {
        if (!json) {
          return callback('Error getting Joke');
        }
        const theJoke = json[0];
        callback(theJoke.setup);
        setTimeout(() => {
          callback(theJoke.punchline);
        }, 2500);
      });
    },
  },
  "stat": {
    name: 'stat',
    args: [],
    description: 'Gets info about a user',
    shortcuts: ['stats', 'stat'],
    examples: ['|| stat @Parking Master', '|| stat JBis', '|| stat 7886229'],
    run: async function(args, callback, message) {
      let id;
      if (args.length === 0) {
        id = message.user_id;
      } else if (args.length === 1 && /^\d+$/.test(args[0])) {
        id = parseInt(args[0], 10);
      } else {
        id = await usernameToId(args.join(' '), message);
        if (!id) {
          return callback('Unable to find user. This can happen if they have not been in the room in awhile.');
        }
      }
      const siteid = await chatIDToSiteID(id);
      const userData = await stats(siteid);
      if (!userData) {
        return callback('Unable to find user');
      }
      callback(codify('' + `Username: ${userData.display_name}\n` + `ID: ${userData.account_id}\n` + `Reputation: ${userData.reputation}\n` + `Reputation Change Month: ${userData.reputation_change_month}\n` + `Last Accessed: ${new Date(userData.last_access_date * 1000)}`));
    },
  },
  "w3schools": {
    name: 'w3schools',
    args: [],
    description: '',
    shortcuts: ['w3schools'],
    examples: [],
    run: async function(args, callback, message) {
      if (args[0]) {
        return callback(`@${args[0]} Don't use w3schools.`);
      }
      const match = message.content.match(/https?:\/\/www\.w3schools\.com[^\s]+/g);
      if (!match || Date.now() - lastW3Sucks <= 1200000) return;
      lastW3Sucks = Date.now();
      const noMDNReply = `w3schools is a terrible resource. We suggest using [MDN](https://developer.mozilla.org/).`;
      const w3schoolsURL = match[0].replace('>', '');
      if (w3schoolsURL.includes('howto')) return callback(noMDNReply);
      const body = await fetch(w3schoolsURL).then(response => response.text());
      const $ = cheerio.load(body);
      const title = $('title').text();
      if (title.toLowerCase().includes('example')) return callback(noMDNReply);
      google_search(title, 'developer.mozilla.org', undefined, /^https:\/\/developer\.mozilla\.org\/.*$/).then(data => {
        if (data) {
          callback(`w3schools is a terrible resource. We suggest using MDN. Here's an potentially equivalent page: [${data.title}](${data.url})`);
        } else {
          callback(noMDNReply);
        }
      });
    }
  },
  "applesupport": {
    name: 'Apple Search',
    args: ['query'],
    description: 'Searches for query on Apple Support',
    shortcuts: ['aps', 'apple'],
    examples: ['|| aps forgot Apple ID password'],
    run: async function(args, callback, message) {
      if (args.length < 1) return callback('**Missing args**');
      google_search(args.join(' '), 'support.apple.com', undefined, /^https:\/\/support\.apple\.com\/.*$/).then((data) => {
        if (data) {
          callback(`[${data.title}](${data.url})`);
        } else {
          callback('An error occurred with the request.');
        }
      });
    },
  },
  "stop": {
    name: 'STOP',
    args: [],
    description: '',
    shortcuts: ['stop'],
    examples: [],
    run: async function(args, callback, message) {
      const hammers = {
        STOP: 'HAMMERTIME!',
        STAHP: 'HAMMAHTIME!',
        HALT: 'HAMMERZEIT!',
        STOY: "ZABIVAT' VREMYA!",
        SISTITE: 'MALLEUS TEMPUS!',
      };
      const re = new RegExp(`([\\s.]+|^)(${Object.keys(hammers).map(escape).join('|')})[\\.!?]?$`);
      const sentence = message.content.toUpperCase();
      const res = re.exec(sentence);
      if (res) {
        callback(hammers[res[2]]);
      }
    }
  },
  "learn": {
    name: "learn",
    args: [],
    description: "Teaches a bot a command",
    shortcuts: ["learn"],
    examples: ["|| learn shortcut output", "|| learn tbh to be honest", "|| learn hbd Happy Birthday {1}!", "|| learn vampire_redirect https://lmgtfy.com/?q=[1]"],
    run: async function(args, callback, message) {
      let name = args[0];
      if (!name) return callback('**Missing command name**');
      if (typeof commands[name] != "undefined") return callback('**Command already exists**');
      if (args.length < 1) return callback('**Missing args**');
      let output = args.splice(1).join(" ");
      addCommand(name, output);
      callback(`${name} has been added`);
    }
  },
  "eval": {
    name: "eval",
    args: [],
    description: "Evaluates JS",
    shortcuts: ["eval"],
    examples: ["|| eval console.log('Hello World!');", "||> console.log('Hello World!');", "!!> console.log('Hello World!');"],
    run: async function(code, callback, message) {
      sandboxRun(code).then(output => {
        callback(`:${message.message_id} \`${output.result} Logged: [ ${output.logs.map(log => `"${log}"`).join(" ")} ] Took: ${output.time}ms\``);
      });
    }
  },
  "welcome": {
    name: "welcome",
    args: ["person"],
    description: "",
    shortcuts: ["welcome"],
    examples: ['|| welcome @JBis', '|| welcome JBis', '|| welcome'],
    run: async function(args, callback, message) {
      if (args.length < 1) return callback(`Welcome to the JavaScript chat! Please review the [room rules](https://javascriptroom.github.io/rules/). If you have a question, just post it, and if anyone's free and interested they'll help. If you want to report an abusive user or a problem in this room, visit our [meta](https://github.com/JavaScriptRoom/culture/).`);
      callback(`@${args[0].replace(/ /g, "").replace(/\@/g, "")} Welcome to the JavaScript chat! Please review the [room rules](https://javascriptroom.github.io/rules/). If you have a question, just post it, and if anyone's free and interested they'll help. If you want to report an abusive user or a problem in this room, visit our [meta](https://github.com/JavaScriptRoom/culture/).`);
    }
  },
  "timer": {
    name: 'timer',
    args: [],
    description: 'Creates a timer',
    shortcuts: ['timer', 'remind', 'remindme'],
    examples: ["|| remind 'hello JBis' in 10 minutes", "|| remind 'hello JBis' 10 hours"],
    run: async function(args, callback, message) {
      const raw = args.join(" ");
      const newArgs = spq(raw);
      const content = newArgs[0];
      if (content.includes('@JBis') || content.includes('@JBi')) return callback('Remind yourself, damn it!');
      const mili = convertTimeStringToMiliseconds(args.slice(-2).join(" "));
      if (!mili) return callback("I don't know that time. Use `|| man timer` to see my syntax.");
      timers.push({
        user: message.user_name,
        id: message.user_id,
        room: global.roomId,
        content,
        expires: Date.now() + mili,
        timer: setTimeout(() => callback(`@${message.user_name.replace(/ /g, "")} ${content}`), mili),
      });
      console.log(content, mili, timers)
      callback('Reminder Added.');
    },
  },
  "help": {
    name: 'help',
    args: [],
    description: 'Lists commands',
    shortcuts: ['help'],
    examples: ["|| help"],
    run: async function(args, callback, message) {
      callback(`Command documentation and syntax can be found [here](https://github.com/jbis9051/SO-ChatBot/blob/master/docs/COMMANDS.md)`);
    },
  },
  "man": {
    name: 'man',
    args: ['command'],
    description: 'Displays the man page for a bot command',
    shortcuts: ['man'],
    examples: ['|| man ban'],
    run: async function(args, callback, message) {
      if (args.length < 1) return callback('**Missing args**');
      const command = commands[args[0]];
      if (!command) return callback(`No manual entry for ${args[0]}`);
      let stringToSend = `[\`${command.name}\`](https://github.com/jbis9051/JamesSOBot/blob/master/docs/COMMANDS.md#${command.name}): "${command.description || ''}" `;
      if (command.creator) {
        stringToSend += `Creator: ${command.creator}`;
      } else {
        stringToSend += `Examples: ${(command.examples || []).map((example) => `\`${example}\``).join(' , ')}`;
      }
      callback(stringToSend);
    },
  },
  "calc": {
    name: 'calc',
    args: [],
    description: 'Calculates an expression using Math.js',
    shortcuts: ['calc', 'math', 'calculator', 'c'],
    examples: ['|| calc 5^2', '|| calc 9*2'],
    run: async function(args, callback, message) {
      if (args[0] === 'docs') return client.send('The calc command uses math.js. Checkout the docs [here](https://mathjs.org/docs/index.html)');
      const response = await fetch(`http://api.mathjs.org/v4/?expr=${encodeURIComponent(args.join(' '))}`);
      if (!(response.status === 200 || response.status === 400)) {
        callback('Error with request');
      } else {
        callback(`"${await response.text()}"`);
      }
    },
  },
  "obama": {
    name: 'obama',
    args: [],
    description: 'talktobama wrapper. (Converts text to a video of obama saying that text)',
    shortcuts: ['obama', 'obamaize', 'talkobama'],
    examples: ["|| obama Hey, I'm Obama!"],
    run: async function(args, callback, message) {
      if (args.length === 0) return callback('Obama is silent.');
      const text = args.map((arg) => encodeURIComponent(arg)).join('+');
      const response = await fetch('http://talkobamato.me/synthesize.py', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `input_text=${text}`,
      });
      const key = response.url.match(/speech_key=(.*)/)[1];
      if (await isReady(key)) return callback(`http://talkobamato.me/synth/output/${key}/obama.mp4`);
      waitForReady(key, 1, function(success) {
        if (success) {
          callback(`http://talkobamato.me/synth/output/${key}/obama.mp4`);
        } else {
          callback('Obama Timed Out');
        }
      });
      return undefined;
    },
  },
  "rules": {
    name: 'laws',
    args: [],
    description: 'Lists the laws',
    shortcuts: ['rules', 'laws'],
    examples: ['|| laws'],
    run: async function(args, callback, message) {
      callback('1. A robot may not injure a human being or, through inaction, allow a human being to come to harm.\n' + '2. A robot must obey orders given it by human beings execpt where such orders would conflict with the First Law\n' + '3. A robot must protect its own existence as long as such protection does not conflict with the First or Second Law');
    },
  },
  "adoc": {
    name: 'Android Docs',
    args: ['query'],
    description: 'Searches for query on Android Developer Docs',
    shortcuts: ['adocs', 'adoc', 'androiddocs', 'droiddocs'],
    examples: ['|| adoc bluetooth'],
    run: async function(args, callback, message) {
      if (msg.args.length < 1) return callback('**Missing args**');
      google_search(msg.args.join(' '), 'developer.android.com/reference', undefined, /^https:\/\/developer\.android\.com\/reference\/.*$/).then((data) => {
        if (data) {
          callback(`[${data.title}](${data.url})`);
        } else {
          callback('An error occurred with the request.');
        }
      });
    },
  },
  "define": {
    name: 'define',
    args: ['work'],
    description: 'Defines a word',
    shortcuts: ['define', 'definition'],
    examples: ['|| define hello'],
    run: async function(args, callback, message) {
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en_US/${args.join(' ')}`).then(async resp => {
        const json = await resp.json();
        if (!resp.ok) {
          if (resp.status === 404) {
            callback('Word or phrase not found');
          } else {
            callback('Unknown error occurred');
          }
          return;
        }
        callback(`${json[0].meanings[0].partOfSpeech} - ${json[0].meanings[0].definitions[0].definition}`);
      });
    },
  },
  "google": {
    name: 'Google Search',
    args: ['query'],
    description: 'Searches for query on Google',
    shortcuts: ['google', 'search'],
    examples: ['|| google increase swap on ubuntu'],
    run: async function(args, callback, message) {
      if (args.length < 1) return callback('**Missing args**');
      google_search(args.join(' ')).then((data) => {
        if (data) {
          if (data.url.match(/(stackoverflow|unix\.stackexchange)\.com\/questions/)) {
            callback(data.url);
          } else {
            callback(`[${data.title}](${data.url})`);
          }
        } else {
          callback('An error occurred with the request.');
        }
      });
    },
  },
  "java": {
    name: 'java',
    args: [''],
    description: '',
    shortcuts: ['java'],
    examples: [],
    run: async function(args, callback, message) {
      if (!(message.content.toLowerCase().includes('java') && Date.now() - lastJavaSucks > 600000)) return;
      lastJavaSucks = Date.now();
      callback(`Hey ${message.user_name}...`);
      setTimeout(() => callback(`Did you know...`), 1000);
      setTimeout(() => callback(`__***3 BILLION DEVICES RUN JAVA***__`), 5500);
    }
  },
  "mdn": {
    name: 'mdn',
    args: ['query'],
    description: 'Searches for query on MDN',
    shortcuts: ['mdn', 'rtfm'],
    examples: ['|| mdn array sort'],
    run: async function(args, callback, message) {
      let searchArgs = args.join(' ');
      if (args.length < 1) searchArgs = 'mdn';
      mdnSearch(searchArgs).then(data => {
        if (data) {
          callback(htmldecode(`[${data.title}](${data.url})`));
        } else {
          callback('An error occurred with the request.');
        }
      });
    },
  },
  "wiki": {
    name: 'wiki',
    args: ['query'],
    description: 'Looks query up on Wikipedia',
    shortcuts: ['wiki', 'lookup', 'search'],
    examples: ['|| wiki Alan Turing'],
    run: async function(args, callback, message) {
      if (args.length < 1) return callback('**Missing args**');
      fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&search=${encodeURIComponent(args.join(' '))}`).then(resp => resp.json()).then(resp => {
        if (!resp) return callback('Error Occurred');
        let res = resp[3][0];
        let found = true;
        if (!res) {
          found = false;
          res = random(['No result found', 'The Wikipedia contains no knowledge of such a thing', 'The Gods of Wikipedia did not bless us']);
        }
        callback(res);
      });
    }
  }
};

global.dataFile.saved_commands.forEach(command => {
  commands[command.name] = {
    name: command.name,
    args: [],
    description: "",
    shortcuts: [command.name.toLowerCase()],
    examples: [],
    run: async function(args, callback, message) {
      let output = formatArgs(command.output, args);
      callback(output);
    }
  };
});

module.exports = commands;