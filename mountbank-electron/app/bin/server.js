const mountebank = require('mountebank'),
  api = require('../../node_modules/mountebank/src/cli/api.js'),
  cli = require('../../node_modules/mountebank/src/cli/cli.js'),
  fs = require('fs-extra');

function processExists (pid) {
  try {
    // "As a special case, signal 0 can be used to test existence of process"
    // https://nodejs.org/api/process.html#process_process_kill_pid_signal
    process.kill(pid, 0);
    return true;
  }
  catch (e) {
    return false;
  }
}

function serverAt (options) {
  async function start () {
    // Set in case npm dependencies do anything with this
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'production';
    }

    const server = await mountebank.create(options);

    function shutdown () {
      server.close(() => {
        try {
          if (fs.existsSync(options.pidfile)) {
            fs.unlinkSync(options.pidfile);
          }
        }
        finally {
          process.exit(); // eslint-disable-line no-process-exit
        }
      });
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    if (options.configfile) {
      await api.loadConfig(options, server);
    }

    // Useful for build plugins that need to wait for mb to be fully initialized
    // They can wait for the pidfile to be written
    fs.writeFileSync(options.pidfile, process.pid.toString());
  }

  function stop () {
    if (!fs.existsSync(options.pidfile)) {
      return Promise.resolve(true);
    }

    const pid = fs.readFileSync(options.pidfile);
    if (!processExists(pid)) {
      fs.unlinkSync(options.pidfile);
      return Promise.resolve(true);
    }

    return new Promise(resolve => {
      const startTime = new Date(),
        timeout = 1000,
        waitForClose = () => {
          const elapsedTime = new Date() - startTime;
          if (!fs.existsSync(options.pidfile)) {
            resolve();
          }
          else if (elapsedTime > timeout) {
            try {
              // For Windows, which doesn't register signal handlers
              fs.unlinkSync(options.pidfile);
            }
            catch (err) { /* ignore */ }
            finally {
              resolve();
            }
          }
          else {
            setTimeout(waitForClose, 100);
          }
        };

      process.kill(pid);
      waitForClose();
    });
  }

  async function restart () {
    await stop();
    await start();
  }

  return {
    start: start,
    stop: stop,
    restart: restart
  };
}
//
// try {
//   const server = serverAt(cli.args);
//
//   switch (cli.command) {
//     case 'start':
//       server.start();
//       break;
//     case 'stop':
//       server.stop();
//       break;
//     case 'restart':
//       server.restart();
//       break;
//     case 'save':
//       api.save(cli.args);
//       break;
//     case 'replay':
//       api.replay(cli.args);
//       break;
//     case 'help':
//       cli.help();
//       break;
//     default:
//       cli.error(`Invalid command '${cli.command}'.`);
//       break;
//   }
// }
// catch (err) {
//   cli.error(err.message);
// }

const server = serverAt({
  port: 5527,
  ipWhitelist: [],
  pidfile: "mb.pid"
});
server.restart()
