# `jmp`

`jmp` is an [npm module](https://www.npmjs.com/) for creating, parsing and
replying to messages of the [Jupyter
protocol](http://ipython.org/ipython-doc/stable/development/messaging.html).

Please, consider this repository as an alpha release. The API is likely to
change.

## Install

```sh
npm install jmp
```

## Usage

Example of parsing and replying to a message (taken from
[IJavascript](https://github.com/n-riesco/ijavascript)):

```javascript
var jmp = require("jmp");

// listen for Jupyter messages
this.shellSocket.on("message", (function() {
    // parse the request message
    var request = new jmp.Message(
        arguments,
        "sha256",
        "f388c63a-9fb9-4ee9-83f0-1bb790ffc7c7"
    );

    // check the request signature is valid
    if (!msg.signatureOK) return;

    // do something with the request
    var msg_type = request.header.msg_type;
    var content = request.content;

    // set msg_type and content for response
    // [...]

    // respond
    request.respond(this.shellSocket, msg_type, content);
}).bind(this));
```

# Contributions

First of all, thank you for taking the time to contribute. Please, read
[CONTRIBUTING.md](https://github.com/n-riesco/jmp/blob/master/CONTRIBUTING.md)
and use the [issue tracker](https://github.com/n-riesco/jmp/issues) for any
contributions: support requests, bug reports, enhancement requests, pull
requests, ...
