const express = require('express');
const BodyParser = require('body-parser');

const rangeParser = require('range-parser');
const mime = require('mime');
const Ip = require('ip');

const SsdpClient = require('node-ssdp').Client;
const MediaRendererClient = require('upnp-mediarenderer-client');
const WebTorrentClient = require('webtorrent');

const config = require('./config');
const serverConf = config.server;


const app = express();
app.use(BodyParser.json({ extended: true, limit: '5mb' }));

const localIp = Ip.address();


// Search for MediaRedender device and instanciate server MediaRender cli
const ssdp = new SsdpClient();
ssdp.on('response', (headers) => {
  app.MediaRenderer = new MediaRendererClient(headers.LOCATION);
});
ssdp.search('urn:schemas-upnp-org:device:MediaRenderer:1');


// Bind Webtorrent client to server
app.client = new WebTorrentClient();


// load torrent endpoint
app.post('/torrent/load', (req) => {
  // retrieve torrent file buffer
  const buffer = new Buffer(req.body.blob, 'base64');

  // destroy previously loaded torrent
  app.client.torrents.forEach((torrent) => torrent.destroy());

  // load torrent
  app.client.add(buffer, (torrent) => {
    // Bind the biggest file in the torrent to the server
    const biggestFile = torrent.files.reduce(
      (a, b) => { return a.length > b.length ? a : b; }
    );
    app.file = biggestFile;

    // define particular option to work with some Samsung TVs
    const options = {
      autoplay: true,
      'transferMode.dlna.org': 'Streaming',
      'contentFeatures.dlna.org': 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=017000 00000000000000000000000000',
    };

    // Load to the MediaRenderer device
    app.MediaRenderer.load(`http://${localIp}:${serverConf.port}/file`, options, (err) => {
      if (err) throw err;
    });
  });
});


/* Emulate an upnp MediaServer endpoint
 * @ TODO replace with a valid implementation of upnp standards
 */
// HEAD endpoint
app.head('/file/', (req, res) => {
  res.set('Content-Type', mime.lookup(app.file.name));
  res.end();
});

// GET endpoint
app.get('/file/', (req, res) => {
  let range = req.headers.range;
  range = range && rangeParser(app.file.length, range)[0];

  res.set('Accept-Ranges', 'bytes');
  res.set('KeepAlive', false);
  res.set('statusCode', 206);
  res.set('Content-Type', mime.lookup(app.file.name));
  res.set('transferMode.dlna.org', 'Streaming');
  res.set(
    'contentFeatures.dlna.org',
    'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=017000 00000000000000000000000000'
  );

  if (!range) {
    res.set('Content-Length', app.file.length);
  } else {
    res.setHeader('Content-Length', range.end - range.start + 1);
    const contentRange = `bytes ${range.start}-${range.end}/${app.file.length}`;
    res.setHeader('Content-Range', contentRange);
  }

  const stream = app.file.createReadStream(range);
  stream.pipe(res);
});


app.listen(serverConf.port);
