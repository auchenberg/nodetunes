'use strict';

var PriorityQueue = require('priorityqueuejs');
var Alac2Pcm = require('alac2pcm')
var stream = require('stream')

function AudioProcessor(rtspServer) {

  this.rtspServer = rtspServer;
  this.state = 'buffering';

  this.internalStream = new stream.PassThrough();

  this.bufferQueue = new PriorityQueue(function(a, b) {
    return b.sequenceNumber - a.sequenceNumber;
  });

}

AudioProcessor.prototype.update = function() {

  if(this.rtspServer.audioCodec) {

    if(this.rtspServer.audioOptions && this.rtspServer.audioCodec.indexOf('AppleLossless') > -1) {
      console.log('AppleLossless detected. Trying to decode ALAC')

      var alacConfig = {
        frameLength: parseInt(this.rtspServer.audioOptions[1], 10),
        compatibleVersion: parseInt(this.rtspServer.audioOptions[2], 10),
        bitDepth: parseInt(this.rtspServer.audioOptions[3], 10),
        pb: parseInt(this.rtspServer.audioOptions[4], 10),
        mb: parseInt(this.rtspServer.audioOptions[5], 10),
        kb: parseInt(this.rtspServer.audioOptions[6], 10),
        channels: parseInt(this.rtspServer.audioOptions[7], 10),
        maxRun: parseInt(this.rtspServer.audioOptions[8], 10),
        maxFrameBytes: parseInt(this.rtspServer.audioOptions[9], 10),
        avgBitRate: parseInt(this.rtspServer.audioOptions[10], 10),
        sampleRate: parseInt(this.rtspServer.audioOptions[11], 10)
      }

      console.log('alacConfig', alacConfig)

      var alac2pcm = new Alac2Pcm(alacConfig)
      this.internalStream.pipe(alac2pcm).pipe(this.rtspServer.outputStream)

    } else {
      this.internalStream.pipe(this.rtspServer.outputStream)
    }

  }
}

AudioProcessor.prototype.process = function(audio, sequenceNumber) {
  var swapBuf = new Buffer(audio.length);

  // endian hack
  for (var i = 0; i < audio.length; i += 2) {
    swapBuf[i] = audio[i + 1];
    swapBuf[i + 1] = audio[i];
  }

  if (this.bufferQueue.length < 4) {
    this.state = 'buffering';
  }

  this.bufferQueue.enq({ buffer: swapBuf, sequenceNumber: sequenceNumber });

  if (this.state == 'active') {
    while (this.bufferQueue.size() >= 4) {
      this.internalStream.write(this.bufferQueue.deq().buffer);
    }
  } else if (this.bufferQueue.size() >= 200) {
    this.state = 'active';
  }
};

module.exports = AudioProcessor;
