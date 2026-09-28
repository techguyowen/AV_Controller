/**
 * tests/ptz.test.js
 * PTZ regression tests: VISCA-over-IP header format, pan/tilt stop bytes,
 * connected-flag transitions, health-check wiring, inquiry headers, and preset mapping.
 *
 * Run: npm test  (node --test tests/)
 */
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { PTZOpticsManager, PTZCamera } = require('../modules/ptzoptics');

const live = [];
function track(cam) { live.push(cam); return cam; }
afterEach(() => { while (live.length) live.pop().stop(); });

function makeCam() {
  return track(new PTZCamera({ id: 'cam1', name: 'Test Cam', ip: '127.0.0.1' }));
}

/** Capture the next UDP packet bytes instead of sending them. */
function captureSend(cam, err = null) {
  let seen = null;
  cam._socket.send = (packet, offset, length, port, ip, cb) => {
    seen = { packet: Buffer.from(packet.subarray(offset, offset + length)), port, ip };
    if (cb) cb(err);
  };
  return () => seen;
}

describe('VISCA-over-IP packet format', () => {
  it('command header is 01 00 + big-endian length + big-endian sequence', async () => {
    const cam = makeCam();
    const seen = captureSend(cam);
    await cam.sendVisca([0x81, 0x01, 0x06, 0x01, 0x0c, 0x0a, 0x03, 0x01, 0xff]);
    const pkt = seen().packet;
    assert.equal(pkt[0], 0x01);
    assert.equal(pkt[1], 0x00);
    assert.equal(pkt.readUInt16BE(2), 9); // 9-byte VISCA payload
    assert.equal(pkt.readUInt32BE(4), 1); // first sequence number
    assert.deepEqual([...pkt.subarray(8)], [0x81, 0x01, 0x06, 0x01, 0x0c, 0x0a, 0x03, 0x01, 0xff]);
    assert.equal(seen().port, 1259);
    assert.equal(seen().ip, '127.0.0.1');
  });

  it('inquiry header uses payload type 01 10', async () => {
    const cam = makeCam();
    const seen = captureSend(cam);
    await cam.sendVisca([0x81, 0x09, 0x04, 0x00, 0xff]); // CAM_PowerInquiry
    const pkt = seen().packet;
    assert.equal(pkt[0], 0x01);
    assert.equal(pkt[1], 0x10); // Inquiry payload type
    assert.equal(pkt.readUInt16BE(2), 5);
  });

  it('sequence number increments per packet', async () => {
    const cam = makeCam();
    const seen = captureSend(cam);
    await cam.sendVisca([0x81, 0x01, 0x04, 0x07, 0x00, 0xff]);
    const first = seen().packet.readUInt32BE(4);
    await cam.sendVisca([0x81, 0x01, 0x04, 0x07, 0x00, 0xff]);
    assert.equal(seen().packet.readUInt32BE(4), first + 1);
  });
});

describe('panTilt()', () => {
  it("stop sends zeroed speed bytes: 81 01 06 01 00 00 03 03 FF", async () => {
    const cam = makeCam();
    const seen = captureSend(cam);
    const res = await cam.panTilt('stop');
    assert.deepEqual([...seen().packet.subarray(8)], [0x81, 0x01, 0x06, 0x01, 0x00, 0x00, 0x03, 0x03, 0xff]);
    assert.equal(res.direction, 'stop');
    assert.equal(res.speed, 0);
    assert.equal(cam.lastAction, 'idle');
  });

  it('movement uses direction dirs with nonzero speeds', async () => {
    const cam = makeCam();
    const seen = captureSend(cam);
    await cam.panTilt('up', 12);
    const payload = [...seen().packet.subarray(8)];
    assert.deepEqual(payload.slice(0, 4), [0x81, 0x01, 0x06, 0x01]);
    assert.ok(payload[4] >= 1 && payload[4] <= 24);
    assert.ok(payload[5] >= 1 && payload[5] <= 20);
    assert.deepEqual(payload.slice(6), [0x03, 0x01, 0xff]); // up: pDir stop, tDir up
  });
});

describe('preset recall and save', () => {
  it('preset 1 maps to Memory 1 (0x01)', async () => {
    const cam = makeCam();
    const seen = captureSend(cam);
    await cam.recallPreset(1);
    const payload = [...seen().packet.subarray(8)];
    assert.deepEqual(payload, [0x81, 0x01, 0x04, 0x3F, 0x02, 0x01, 0xFF]);
  });
});

describe('connected flag', () => {
  it('becomes true on successful send, false on socket error', async () => {
    const cam = makeCam();
    assert.equal(cam.connected, false);
    captureSend(cam);
    await cam.sendVisca([0x81, 0x01, 0x04, 0x07, 0x00, 0xff]);
    assert.equal(cam.connected, true);

    captureSend(cam, new Error('ECONNREFUSED'));
    await cam.sendVisca([0x81, 0x01, 0x04, 0x07, 0x00, 0xff]);
    assert.equal(cam.connected, false);
  });

  it('three consecutive HTTP CGI failures mark the camera disconnected', () => {
    const cam = makeCam();
    cam.connected = true;
    cam._noteHttpResult(false);
    cam._noteHttpResult(false);
    assert.equal(cam.connected, true); // only 2 failures so far
    cam._noteHttpResult(false);
    assert.equal(cam.connected, false);
    cam._noteHttpResult(true);
    assert.equal(cam._consecutiveFailures, 0);
  });

  it('any inbound datagram marks the camera connected', () => {
    const cam = makeCam();
    assert.equal(cam.connected, false);
    cam._socket.emit('message', Buffer.from([0x90, 0x41, 0xff]));
    assert.equal(cam.connected, true);
  });
});

describe('health check', () => {
  it('starts a 5s ping timer in the constructor and stop() clears it', () => {
    const cam = makeCam();
    assert.ok(cam._healthTimer, 'expected health timer to be running');
    cam.stop();
    assert.equal(cam._healthTimer, null);
  });
});

describe('PTZOpticsManager', () => {
  it('panTilt("stop") resolves success via the manager', async () => {
    const mgr = new PTZOpticsManager({ cam1Ip: '127.0.0.1', cam2Ip: '127.0.0.1' });
    try {
      for (const cam of mgr.cameras.values()) {
        captureSend(cam);
        live.push(cam);
      }
      const res = await mgr.panTilt('cam1', 'stop');
      assert.equal(res.success, true);
      assert.equal(res.direction, 'stop');
    } finally {
      mgr.stop();
    }
  });
});
