# JMP

`jmp` is an [npm module](https://www.npmjs.com/) for creating, parsing and
replying to messages of the [Jupyter Messaging
Protocol](http://ipython.org/ipython-doc/stable/development/messaging.html) over
[ZMQ sockets](http://zeromq.org/bindings:node-js).


## Anouncements

- Version v1.0.0 is a backwards-compatible change in the API. Now,
  `Message#respond` returns the response message, so that users can access
  properties like the response header.

- Version v0.7.0 depends on `zeromq`. `zmq-prebuilt` has been renamed `zeromq`
  and is now maintained by the zeromq organisation.

- Version v0.6.0 depends on `zmq-prebuilt` to help with testing.
  See [issue #18](https://github.com/n-riesco/jmp/issues/18).

- Version v0.5.0 is backwards-incompatible. The attribute
  `Message#blobs` has been renamed to `Message#buffers`.
  See [issue #14](https://github.com/n-riesco/jmp/issues/14).

- Version v0.4.0 is backwards-incompatible. The attribute
  `Message#signatureOK` has been removed.
  See [issue #10](https://github.com/n-riesco/jmp/issues/10).

- Version v0.2.0 is backwards-incompatible. The attribute `Message#parentHeader`
  has been renamed to
  [`Message#parent_header`](http://n-riesco.github.io/jmp/module-jmp-Message.html#parent_header).
  See [issue #7](https://github.com/n-riesco/jmp/issues/7).

- Version v0.1.0 is backwards-incompatible. `npm` packages depending on the
  initial release of JMP need to update their dependency field:

```
"jmp": "<0.1.0",
```

## Install

The latest stable release is published on
[`npm`](https://www.npmjs.com/package/jmp) and can be installed by running:

```sh
npm install jmp
```

The master branch in the [github repository](https://github.com/n-riesco/jmp)
provides the latest development version and can be installed by:

```sh
git clone https://github.com/n-riesco/jmp.git
npm install ./jmp
```

Branch `v0.0` provides the latest version of JMP, backwards-compatible with the
first release. It can be installed from `npm`:

```sh
npm install "jmp@<0.1.0"
```

or github:

```sh
git clone -b v0.0 https://github.com/n-riesco/jmp.git
npm install ./jmp
```

## Usage

### Import modules

JMP depends on [ZMQ](http://zeromq.org/bindings:node-js) and for convenience JMP
exports the module `zmq`:

```js
var crypto = require("crypto");
var uuid = require("uuid/v4");

var jmp = require("jmp");
var zmq = jmp.zmq;
```

### Create JMP sockets

```js
var scheme = "sha256";
var key = crypto.randomBytes(256).toString('base64');

var serverSocket = new jmp.Socket("router", scheme, key);
var clientSocket = new jmp.Socket("dealer", scheme, key);

var address = "tcp://127.0.0.1:8888";

serverSocket.bindSync(address);
clientSocket.connect(address);
```

### Create a JMP message from scratch

```js
var request = new jmp.Message();

request.idents = [];
request.header = {
    "msg_id": uuid(),
    "username": "user",
    "session": uuid(),
    "msg_type": "kernel_info_request",
    "version": "5.0",
};
request.parent_header = {};
request.metadata = {};
request.content = {};
```

### Send a message over a JMP socket

```js
clientSocket.send(request);
```

### Listen on a JMP socket and respond to a message

```js
serverSocket.on("message", onRequest);

function onRequest(msg) {
    var responseMessageType = "kernel_info_reply";

    var responseContent = {
        "protocol_version": "0.0.0",
        "implementation": "kernel",
        "implementation_version": "0.0.0",
        "language_info": {
            "name": "test",
            "version": "0.0.0",
            "mimetype": "text/plain",
            "file_extension": "test",
        },
        "banner": "Test",
        "help_links": [{
            "text": "JMP",
            "url": "https://github.com/n-riesco/nel",
        }],
    };

    var responseMetadata = {};

    msg.respond(
        serverSocket, responseMessageType, responseContent, reponseMetadata
    );
}
```

### Remove listeners and close sockets

```js
serverSocket.removeListener("message", getRequest);
serverSocket.close()
clientSocket.close()
```

# Documentation

Documentation generated using [JSDoc](http://usejsdoc.org/) can be found
[here](http://n-riesco.github.io/jmp/).

# Contributions

First of all, thank you for taking the time to contribute. Please, read
[CONTRIBUTING.md](https://github.com/n-riesco/jmp/blob/master/CONTRIBUTING.md)
and use the [issue tracker](https://github.com/n-riesco/jmp/issues) for any
contributions: support requests, bug reports, enhancement requests, pull
requests, ...
