#!/usr/bin/env node

/*
 * BSD 3-Clause License
 *
 * Copyright (c) 2015, Nicolas Riesco and others as credited in the AUTHORS file
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors
 * may be used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 */

/**
 * @module jmp
 *
 * @description Module `jmp` provides class `Message` for creating, parsing and
 * replying to messages of the Jupyter protocol.
 *
 * @example
 *
 * // Example of parsing and replying to a message:
 * var jmp = require("jmp");
 *
 * // listen for Jupyter messages
 * this.shellSocket.on("message", (function() {
 *     // parse the request message
 *     var request = new jmp.Message(
 *         arguments,
 *         "sha256",
 *         "f388c63a-9fb9-4ee9-83f0-1bb790ffc7c7"
 *     );
 *
 *     // check the request signature is valid
 *     if (!msg.signatureOK) return;
 *
 *     // do something with the request
 *     var msg_type = request.header.msg_type;
 *     var content = request.content;
 *
 *     // set msg_type and content for response
 *     // ..
 *
 *     // respond
 *     request.respond(this.shellSocket, msg_type, content);
 * }).bind(this));
 *
 */
module.exports = {
    Message: Message,
    Socket: Socket,

    /**
     * ZeroMQ bindings
     */
    zmq: require("zmq"),
};

var DEBUG = global.DEBUG || false;
var DELIMITER = '<IDS|MSG>';

var console = require("console");
var crypto = require("crypto");
var uuid = require("node-uuid");
var zmq = require("zmq");

/**
 * @class
 * @classdesc Implements an IPython message
 *
 * @param {argsArray} [requestArguments]      argsArray of the callback
 *                                            listening on the {@link
 *                                            Kernel#shellSocket Shell socket}
 * @param {String}    [scheme=sha256]         Hashing scheme
 * @param {String}    [key=""]                Hashing key
 */
function Message(requestArguments, scheme, key) {
    this.idents = undefined;
    this.signature = undefined;
    this.header = undefined;
    this.parentHeader = undefined;
    this.metadata = undefined;
    this.content = undefined;
    this.blobs = undefined;

    this.scheme = scheme || "sha256";
    this.key = key || "";

    this.signatureOK = undefined;

    if (requestArguments !== undefined) {
        try {
            this.parse(requestArguments);
        } catch (e) {
            console.error(
                "JMP: MESSAGE: Failed to parse msg", requestArguments, e.stack
            );
        }
    }
}

/**
 * Parse a request
 *
 * @param {argsArray} requestArguments argsArray of the callback listening on
 * the {@link Kernel#shellSocket Shell socket}
 */
Message.prototype.parse = function(requestArguments) {
    var i = 0;
    this.idents = [];
    for (i = 0; i < requestArguments.length; i++) {
        var part = requestArguments[i];
        if (part.toString() === DELIMITER) {
            break;
        }
        this.idents.push(part);
    }
    if (requestArguments.length - i < 5) {
        console.error(
            "JMP: MESSAGE: PARSE: Not enough msg parts", requestArguments
        );
        return;
    }
    if (requestArguments[i].toString() !== DELIMITER) {
        console.error("JMP: MESSAGE: PARSE: Invalid msg", requestArguments);
        return;
    }

    if (this.key === '') {
        // no key, messages aren't signed
        this.signatureOK = true;
    } else {
        this.signature = requestArguments[i + 1].toString();
        var hmac = crypto.createHmac(this.scheme, this.key);
        hmac.update(requestArguments[i + 2]);
        hmac.update(requestArguments[i + 3]);
        hmac.update(requestArguments[i + 4]);
        hmac.update(requestArguments[i + 5]);
        this.signatureOK = (this.signature === hmac.digest("hex"));
    }

    if (!this.signatureOK) {
        console.error(
            "JMP: MESSAGE: PARSE: Incorrect message signature:", this.signature
        );
        return;
    }

    function toJSON(value) {
        return JSON.parse(value.toString());
    }

    this.header = toJSON(requestArguments[i + 2]);
    this.parentHeader = toJSON(requestArguments[i + 3]);
    this.metadata = toJSON(requestArguments[i + 4]);
    this.content = toJSON(requestArguments[i + 5]);
    this.blobs = Array.prototype.slice.apply(requestArguments, [i + 6]);

    if (DEBUG) console.log("JMP: MESSAGE: PARSE:", this);
};

/**
 * Send a response
 *
 * @param {module:zmq~Socket} socket Socket over which the response is sent
 * @param {String} messageType       IPython/Jupyter message type
 * @param {Object} responseContent   IPython/Jupyter response content
 * @param {String} [protocolVersion] IPython/Jupyter protocol version
 */
Message.prototype.respond = function(
    socket, messageType, responseContent, protocolVersion
) {
    var idents = this.idents;

    var header = {
        msg_id: uuid.v4(),
        username: this.header.username,
        session: this.header.session,
        msg_type: messageType,
    };
    if (this.header && this.header.version) {
        header.version = this.header.version;
    }
    if (protocolVersion) {
        header.version = protocolVersion;
    }
    header = JSON.stringify(header);

    var parentHeader = JSON.stringify(this.header);

    var metadata = JSON.stringify({});

    var content = JSON.stringify(responseContent);

    var signature = '';
    if (this.key !== '') {
        var hmac = crypto.createHmac(this.scheme, this.key);
        hmac.update(header);
        hmac.update(parentHeader);
        hmac.update(metadata);
        hmac.update(content);
        signature = hmac.digest("hex");
    }

    var response = idents.concat([ // idents
        DELIMITER, // delimiter
        signature, // HMAC signature
        header, // header
        parentHeader, // parent header
        metadata, // metadata
        content, // content
    ]);

    if (DEBUG) console.log("JMP: MESSAGE: RESPOND:", response);

    socket.send(response);
};

/**
 * @class
 * @classdesc ZMQ socket that parses the Jupyter Messaging Protocol
 *
 * @param {String|Number} socketType ZMQ socket type
 * @param {String} [scheme="sha256"] Hashing scheme
 * @param {String} [key=""] Hashing key
 */
function Socket(socketType, scheme, key) {
    zmq.Socket.call(this, socketType);
    this._jmp = {
        scheme: scheme,
        key: key,
        _listeners: [],
    };
}

Socket.prototype = Object.create(zmq.Socket.prototype);
Socket.prototype.constructor = Socket;

/**
 * Add listener to the end of the listeners array for the specified event
 *
 * @param {String} event
 * @param {Function} listener
 * @returns {module:jmp~Socket} this To allow chaining
 */
Socket.prototype.on = function(event, listener) {
    var p = Object.getPrototypeOf(Socket.prototype);

    if (event !== "message") {
        return p.on.apply(this, arguments);
    }

    var _listener = {
        unwrapped: listener,
        wrapped: (function() {
            if (DEBUG) console.log("JMP: SOCKET: ON: MESSAGE:", this);
            listener(
                new Message(arguments, this._jmp.scheme, this._jmp.key)
            );
        }).bind(this),
    };
    this._jmp._listeners.push(_listener);
    return p.on.call(this, event, _listener.wrapped);
};

/**
 * Add listener to the end of the listeners array for the specified event
 *
 * @param {String} event
 * @param {Function} listener
 * @returns {module:jmp~Socket} this To allow chaining
 */
Socket.prototype.addListener = Socket.prototype.on;

/**
 * Add a one-time listener to the end of the listeners array for the specified
 * event
 *
 * @param {String} event
 * @param {Function} listener
 * @returns {module:jmp~Socket} this To allow chaining
 */
Socket.prototype.once = function(event, listener) {
    var p = Object.getPrototypeOf(Socket.prototype);

    if (event !== "message") {
        return p.once.apply(this, arguments);
    }

    return p.once.call(this, event, (function() {
        if (DEBUG) console.log("JMP: SOCKET: ONCE: MESSAGE:", this);
        listener(new Message(arguments, this._jmp.scheme, this._jmp.key));
    }).bind(this));
};

/**
 * Remove listener from the listeners array for the specified event
 *
 * @param {String} event
 * @param {Function} listener
 * @returns {module:jmp~Socket} this To allow chaining
 */
Socket.prototype.removeListener = function(event, listener) {
    var p = Object.getPrototypeOf(Socket.prototype);

    if (event !== "message") {
        return p.removeListener.apply(this, arguments);
    }

    var length = this._jmp._listeners.length;
    for (var i = 0; i < length; i++) {
        var _listener = this._jmp._listeners[i];
        if (_listener.unwrapped === listener) {
            this._jmp._listeners.splice(i, 1);
            return p.removeListener.call(this, event, _listener.wrapped);
        }
    }

    return p.removeListener.apply(this, arguments);
};

/**
 * Remove all listeners, or those for the specified event
 *
 * @param {String} [event]
 * @returns {module:jmp~Socket} this To allow chaining
 */
Socket.prototype.removeAllListeners = function(event) {
    var p = Object.getPrototypeOf(Socket.prototype);

    if (arguments.length === 0 || event === "message") {
        this._jmp._listeners.length = 0;
    }

    return p.removeListener.apply(this, arguments);
};
