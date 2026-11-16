require('./register-ts.cjs');
const { Discovery } = require('../src/main/discovery/ssdp.ts');
const discovery = new Discovery();
console.log(JSON.stringify({ interfaces: discovery.state.interfaces }, null, 2));
const requested = process.argv[2];
const address = requested || discovery.state.selectedAddress;
if (!address) { console.error('Нет физического LAN-интерфейса. Укажите IPv4 явно.'); discovery.dispose(); process.exitCode = 1; }
else {
  const timeout = setTimeout(() => { console.error('Диагностика: общий тайм-аут 45 секунд'); discovery.dispose(); process.exitCode = 1; }, 45000);
  discovery.on('state', state => {
    if (state.scanning) return;
    clearTimeout(timeout);
    console.log(JSON.stringify(state, null, 2));
    discovery.dispose();
    if (state.error) process.exitCode = 1;
  });
  void discovery.scan(address);
}
