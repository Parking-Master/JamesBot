const ivm = require('isolated-vm');

async function vmRun(userCode) {
  const isolate = new ivm.Isolate({ memoryLimit: 16 });
  const context = await isolate.createContext();
  const jail = context.global;
  await jail.set('global', jail.derefInto());
  let logs = [];
  await jail.set('log', (...args) => {
    logs.push(args.map(arg => String(arg)).join(' '));
  });
  await context.eval(`console = { log: (...args) => log(...args) }`);
  const script = await isolate.compileScript(userCode);
  const result = await script.run(context);
  return { result, logs };
}

function run(code) {
  return new Promise(function(resolve) {
    let start = Date.now();
    vmRun(code).then(output => {
      let time = Date.now() - start;
      resolve({
        result: output.result,
        logs: output.logs,
        time: time
      });
    }).catch(err => {
      let time = Date.now() - start;
      resolve({
        result: err.toString().replace(/<isolated-vm>/g, ""),
        logs: [],
        time: time
      });
    });
  });
}

module.exports = run;