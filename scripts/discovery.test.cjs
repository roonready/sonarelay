require('./register-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { parseDevice } = require('../src/main/discovery/device-parser.ts');
test('XML parser requires reachable AVTransport and extracts real fields', async () => {
  let hasPlay = true;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/xml');
    if (req.url === '/description') res.end(`<root><device><deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType><friendlyName>Test fixture</friendlyName><manufacturer>Lab</manufacturer><modelName>Model A</modelName><UDN>uuid:fixture</UDN><serviceList><service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/control</controlURL><SCPDURL>/scpd</SCPDURL></service></serviceList></device></root>`);
    else res.end(`<scpd><actionList><action><name>SetAVTransportURI</name></action>${hasPlay ? '<action><name>Play</name></action>' : ''}</actionList></scpd>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const headers = { location: `http://127.0.0.1:${server.address().port}/description`, usn: 'uuid:fixture', st: 'urn:schemas-upnp-org:device:MediaRenderer:1' };
    const devices = await parseDevice(headers, '127.0.0.1', '127.0.0.1');
    assert.equal(devices.length, 1);
    assert.equal(devices[0].name, 'Test fixture');
    assert.equal(devices[0].manufacturer, 'Lab');
    assert.equal(devices[0].model, 'Model A');
    assert.equal(devices[0].services[0].controlUrl, `http://127.0.0.1:${server.address().port}/control`);
    hasPlay = false;
    assert.deepEqual(await parseDevice(headers, '127.0.0.1', '127.0.0.1'), []);
    await assert.rejects(parseDevice(headers, '127.0.0.2', '127.0.0.1'), /LOCATION/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
const { parseNeighbors } = require('../src/main/network/neighbors.ts');
test('LAN fallback excludes VPN, multicast, broadcast and own address', () => {
 const arp = `
  192.168.1.31  98-5e-1b-00-36-1c  dynamic
  192.168.1.31  98-5e-1b-00-36-1c  dynamic
  192.168.1.14  aa-bb-cc-dd-ee-01  dynamic
  192.168.1.255 ff-ff-ff-ff-ff-ff static
  10.8.1.2 aa-bb-cc-dd-ee-02 dynamic
  239.255.255.250 01-00-5e-7f-ff-fa static`;
 assert.deepEqual(parseNeighbors(arp, '192.168.1.14', '255.255.255.0'), ['192.168.1.31']);
});
