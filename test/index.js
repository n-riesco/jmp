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

DEBUG = false;

var assert = require("assert");
var console = require("console");
var crypto = require("crypto");
var uuid = require("node-uuid");

var jmp = require("jmp");
jmp.Message.prototype.sendTo = jmpMessageSendTo;
var zmq = jmp.zmq;

/**
 * @typedef Context
 *
 * @property                     context
 * @property {String}            context.scheme       Hashing scheme
 * @property {String}            context.key          Hashing key
 * @property {module:jmp~Socket} context.serverSocket Server socket
 * @property {module:jmp~Socket} context.clientSocket Client socket
 *
 */

testNext({}, [
    createContext,
    testCommunication,
    destroyContext,
]);

/**
 * @callback Test
 * @param {Context}       context
 * @param {(Test|Test[])} [tests]
 * @description Run a test using context and call the next test in tests
 */

/**
 * @type Test
 * @description This function is called by each test to ensure all tests are run
 */
function testNext(context, tests) {
    if (!tests) {
        return;
    }

    if (!Array.isArray(tests)) {
        tests(context);
        return;
    }

    var test = tests.shift();
    if (test) {
        test(context, tests);
    }
}

/**
 * @type Test
 * @description Create context for running all the text
 *
 */
function createContext(context, tests) {
    context.scheme = "sha256";
    context.key = crypto.randomBytes(256).toString('base64');

    context.serverSocket = new jmp.Socket(
        "router", context.scheme, context.key
    );

    context.clientSocket = new jmp.Socket(
        "dealer", context.scheme, context.key
    );

    // Assign identity to client socket (only for testing purposes)
    context.clientSocket.setsockopt(
        zmq.ZMQ_IDENTITY,
        new Buffer(uuid.v4(), "ascii")
    );

    // Bind to a random local port
    for (var attempts = 0;; attempts++) {
        var randomPort = Math.floor(1024 + Math.random() * (65536 - 1024));
        var address = "tcp://127.0.0.1:" + randomPort;
        
        try {
            context.serverSocket.bindSync(address);
            context.clientSocket.connect(address);
            break;
        } catch (e) {
            console.error(e.stack);
        }

        if (attempts >= 100) {
            throw new Error("can't bind to any local ports");
        }
    }

    testNext(context, tests);
}

/**
 * @type Test
 * @description Destroy context
 *
 */
function destroyContext(context, tests) {
    context.serverSocket.close();
    context.clientSocket.close();

    testNext(context, tests);
}

/**
 * @type Test
 * @description Tests communication between a client and a server JMP sockets
 */
function testCommunication(context, tests) {
    var requestMsgType = "kernel_info_request";
    var responseMsgType = "kernel_info_reply";

    var request = new jmp.Message();
    request.scheme = context.scheme;
    request.key = context.key;
    request.idents = [];
    request.header = {
        "msg_id": uuid.v4(),
        "username": "user",
        "session": uuid.v4(),
        "msg_type": requestMsgType,
        "version": "5.0",
    };
    request.parentHeader = {};
    request.metadata = {};
    request.content = {};

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

    context.serverSocket.on("message", getRequest);
    context.clientSocket.on("message", getResponse);

    startTest();

    function startTest() {
        request.sendTo(context.clientSocket);
    }

    function respondToRequest(message) {
        message.respond(context.serverSocket, responseMsgType, responseContent);
    }

    function endTest() {
        context.serverSocket.removeListener("message", getRequest);
        context.clientSocket.removeListener("message", getResponse);

        testNext(context, tests);
    }

    function getRequest(message) {
        assert(
            message.signatureOK,
            makeErrorMessage("request.signatureOK", message.signatureOK, true)
        );
        assert.equal(
            message.idents[0],
            context.clientSocket.getsockopt(zmq.ZMQ_IDENTITY),
            makeErrorMessage(
                "request.idents",
                message.idents[0].toString(),
                context.clientSocket.getsockopt(zmq.ZMQ_IDENTITY).toString()
            )
        );
        assert.deepEqual(
            message.header, request.header,
            makeErrorMessage("request.header", message.header, request.header)
        );
        assert.deepEqual(
            message.parentHeader, request.parentHeader,
            makeErrorMessage(
                "request.parentHeader",
                message.parentHeader, request.parentHeader
            )
        );
        assert.deepEqual(
            message.metadata, request.metadata,
            makeErrorMessage(
                "request.metadata", message.metadata, request.metadata
            )
        );
        assert.deepEqual(
            message.content, request.content,
            makeErrorMessage(
                "request.content", message.content, request.content
            )
        );

        respondToRequest(message);
    }

    function getResponse(message) {
        assert(
            message.signatureOK,
            makeErrorMessage("response.signatureOK", message.signatureOK, true)
        );
        assert.equal(
            message.idents.length,
            0,
            makeErrorMessage("response.idents.length", message.idents.length, 0)
        );
        assert.deepEqual(
            message.header.msg_type, responseMsgType,
            makeErrorMessage(
                "response.header.msg_type",
                message.header.msg_type,
                responseMsgType
            )
        );
        assert.deepEqual(
            message.parentHeader, request.header,
            makeErrorMessage(
                "response.parentHeader", message.parentHeader, request.header
            )
        );
        assert.deepEqual(
            message.content, responseContent,
            makeErrorMessage(
                "response.content", message.content, responseContent
            )
        );

        endTest();
    }

    function makeErrorMessage(message, obtained, expected) {
        return [
            "testCommunication",
            message,
            "Obtained", obtained,
            "Expected", expected,
        ].join(": ");
    }
}

function jmpMessageSendTo(socket) {
    var idents = this.idents;

    var header = JSON.stringify(this.header);
    var parentHeader = JSON.stringify(this.parentHeader);
    var metadata = JSON.stringify(this.metadata);
    var content = JSON.stringify(this.content);

    var signature = '';
    if (this.key !== '') {
        var hmac = crypto.createHmac(this.scheme, this.key);
        hmac.update(header);
        hmac.update(parentHeader);
        hmac.update(metadata);
        hmac.update(content);
        signature = hmac.digest("hex");
    }

    var message = idents.concat([ // idents
        "<IDS|MSG>", // delimiter
        signature, // HMAC signature
        header, // header
        parentHeader, // parent header
        metadata, // metadata
        content, // content
    ]);

    if (DEBUG) console.log("JMP: MESSAGE: SEND:", message);

    socket.send(message);
}
