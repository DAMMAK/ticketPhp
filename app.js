'use strict';

const apiai = require('apiai');
const config = require('./config');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const uuid = require('uuid');
const mysql = require('mysql');



// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
    throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
    throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.API_AI_CLIENT_ACCESS_TOKEN) {
    throw new Error('missing API_AI_CLIENT_ACCESS_TOKEN');
}
if (!config.FB_APP_SECRET) {
    throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
    throw new Error('missing SERVER_URL');
}

//Facebook Account Details
var firstname = null;
var address = null;
var user_id = null;
var recipientName = null;
var AddressData = new Array();
var ImageDataObj = null;
var post_text = null;
var post_picture = null;
var tokenData=null;

var con = mysql.createConnection({
    host: config.MYSQL_HOST,
    user: config.MYSQL_USERNAME,
    password: config.MYSQL_PASSWORD,
    database: config.MYSQL_DB
});


app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
    verify: verifyRequestSignature
}));

//serve static files in the public directory
app.use(express.static('public'));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: false
}))

// Process application/json
app.use(bodyParser.json())




const apiAiService = apiai(config.API_AI_CLIENT_ACCESS_TOKEN, {
    language: "en",
    requestSource: "fb"
});
const sessionIds = new Map();

// Index route
app.get('/', function(req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function(req, res) {
    console.log("request");
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook/', function(req, res) {
    var data = req.body;
    console.log(JSON.stringify(data));



    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function(pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function(messagingEvent) {
                if (messagingEvent.optin) {
                    receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else if (messagingEvent.read) {
                    receivedMessageRead(messagingEvent);
                } else if (messagingEvent.account_linking) {
                    receivedAccountLink(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        // You must send back a 200, within 20 seconds
        res.sendStatus(200);
    }
});





function receivedMessage(event) {

    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuid.v1());
    }
    //console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
    //console.log(JSON.stringify(message));

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    if (isEcho) {
        handleEcho(messageId, appId, metadata);
        return;
    } else if (quickReply) {
        handleQuickReply(senderID, quickReply, messageId);
        return;
    }


    if (messageText) {
        //send message to api.ai
        sendToApiAi(senderID, messageText);
    } else if (messageAttachments) {
        handleMessageAttachments(messageAttachments, senderID);
        // return messageAttachments;
        ImageDataObj = messageAttachments;
        console.log('OBJ OBJECT from media', ImageDataObj);
    }
}


function handleMessageAttachments(messageAttachments, senderID) {
    //for now just reply
    // sendTextMessage(senderID, "Attachment received. Thank you.");
    // console.log('MY PICTURE FILE IS:', messageAttachments);
    // sendTextMessage(senderID, `${messageAttachments[0].payload.url}`);
    if (post_text !== null) {
        post_picture = messageAttachments[0].payload.url;
        //sendTextMessage(senderID, "Thank you for uploading your attachment!");
        pictureUpload(senderID);
    } else {
        sendTextMessage(senderID, "Sorry you uploaded your Picture Attachment at the wrong time, we can't accept your picture right now");

    }

}

function handleQuickReply(senderID, quickReply, messageId) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
    //send payload to api.ai
    sendToApiAi(senderID, quickReplyPayload);
}

//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
}

function handleApiAiAction(sender, action, responseText, contexts, parameters) {
    switch (action) {
        case "input.welcome":
            getUser(sender);
            break;
        case "new-address":
            kummar(parameters, sender);
            break;

        case "new-ticket":
            sendTypingOn(sender);
            Nieuwkaartje_payload(sender);
            break;
        case "who-living":
            klop_action(parameters, sender);
            break;

        case "waar-true":
            klop_2_payload(sender);
            break;
        case "postcard-text-picture":
            postcard_picture_text(parameters, sender);
            break;
        default:
            //unhandled action, just send back the text
            sendTextMessage(sender, responseText);
    }
}

function handleMessage(message, sender) {
    switch (message.type) {
        case 0: //text
            sendTextMessage(sender, message.speech);
            break;
        case 2: //quick replies
            let replies = [];
            for (var b = 0; b < message.replies.length; b++) {
                let reply = {
                    "content_type": "text",
                    "title": message.replies[b],
                    "payload": message.replies[b]
                }
                replies.push(reply);
            }
            sendQuickReply(sender, message.title, replies);
            break;
        case 3: //image
            sendImageMessage(sender, message.imageUrl);
            break;
        case 4:
            // custom payload
            var messageData = {
                recipient: {
                    id: sender
                },
                message: message.payload.facebook

            };

            callSendAPI(messageData);

            break;
    }
}


function handleCardMessages(messages, sender) {

    let elements = [];
    for (var m = 0; m < messages.length; m++) {
        let message = messages[m];
        let buttons = [];
        for (var b = 0; b < message.buttons.length; b++) {
            let isLink = (message.buttons[b].postback.substring(0, 4) === 'http');
            let button;
            if (isLink) {
                button = {
                    "type": "web_url",
                    "title": message.buttons[b].text,
                    "url": message.buttons[b].postback
                }
            } else {
                button = {
                    "type": "postback",
                    "title": message.buttons[b].text,
                    "payload": message.buttons[b].postback
                }
            }
            buttons.push(button);
        }


        let element = {
            "title": message.title,
            "image_url": message.imageUrl,
            "subtitle": message.subtitle,
            "buttons": buttons
        };
        elements.push(element);
    }
    sendGenericMessage(sender, elements);
}


function handleApiAiResponse(sender, response) {
    let responseText = response.result.fulfillment.speech;
    let responseData = response.result.fulfillment.data;
    let messages = response.result.fulfillment.messages;
    let action = response.result.action;
    let contexts = response.result.contexts;
    let parameters = response.result.parameters;

    sendTypingOff(sender);

    if (isDefined(messages) && (messages.length == 1 && messages[0].type != 0 || messages.length > 1)) {
        let timeoutInterval = 1100;
        let previousType;
        let cardTypes = [];
        let timeout = 0;
        for (var i = 0; i < messages.length; i++) {

            if (previousType == 1 && (messages[i].type != 1 || i == messages.length - 1)) {

                timeout = (i - 1) * timeoutInterval;
                setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
                cardTypes = [];
                timeout = i * timeoutInterval;
                setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
            } else if (messages[i].type == 1 && i == messages.length - 1) {
                cardTypes.push(messages[i]);
                timeout = (i - 1) * timeoutInterval;
                setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
                cardTypes = [];
            } else if (messages[i].type == 1) {
                cardTypes.push(messages[i]);
            } else {
                timeout = i * timeoutInterval;
                setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
            }

            previousType = messages[i].type;

        }
    } else if (responseText == '' && !isDefined(action)) {
        //api ai could not evaluate input.
        console.log('Unknown query' + response.result.resolvedQuery);
        sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?");
    } else if (isDefined(action)) {
        handleApiAiAction(sender, action, responseText, contexts, parameters);
    } else if (isDefined(responseData) && isDefined(responseData.facebook)) {
        try {
            console.log('Response as formatted message' + responseData.facebook);
            sendTextMessage(sender, responseData.facebook);
        } catch (err) {
            sendTextMessage(sender, err.message);
        }
    } else if (isDefined(responseText)) {

        sendTextMessage(sender, responseText);
    }
}

function sendToApiAi(sender, text) {

    sendTypingOn(sender);
    let apiaiRequest = apiAiService.textRequest(text, {
        sessionId: sessionIds.get(sender)
    });

    apiaiRequest.on('response', (response) => {
        if (isDefined(response.result)) {
            handleApiAiResponse(sender, response);
        }
    });

    apiaiRequest.on('error', (error) => console.error(error));
    apiaiRequest.end();
}




function sendTextMessage(recipientId, text) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text
        }
    }
    callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId, imageUrl) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: imageUrl
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: config.SERVER_URL + "/assets/instagram_logo.gif"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "audio",
                payload: {
                    url: config.SERVER_URL + "/assets/sample.mp3"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example videoName: "/assets/allofus480.mov"
 */
function sendVideoMessage(recipientId, videoName) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "video",
                payload: {
                    url: config.SERVER_URL + videoName
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example fileName: fileName"/assets/test.txt"
 */
function sendFileMessage(recipientId, fileName) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "file",
                payload: {
                    url: config.SERVER_URL + fileName
                }
            }
        }
    };

    callSendAPI(messageData);
}



/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId, text, buttons) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: text,
                    buttons: buttons
                }
            }
        }
    };

    callSendAPI(messageData);
}


function sendGenericMessage(recipientId, elements) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: elements
                }
            }
        }
    };

    callSendAPI(messageData);
}


function sendReceiptMessage(recipientId, recipient_name, currency, payment_method,
    timestamp, elements, address, summary, adjustments) {
    // Generate a random receipt ID as the API requires a unique ID
    var receiptId = "order" + Math.floor(Math.random() * 1000);

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "receipt",
                    recipient_name: recipient_name,
                    order_number: receiptId,
                    currency: currency,
                    payment_method: payment_method,
                    timestamp: timestamp,
                    elements: elements,
                    address: address,
                    summary: summary,
                    adjustments: adjustments
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId, text, replies, metadata) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text,
            metadata: isDefined(metadata) ? metadata : '',
            quick_replies: replies
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {


    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {


    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons: [{
                        type: "account_link",
                        url: config.SERVER_URL + "/authorize"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}


function greetUserText(userId) {
    //first read user firstname
    request({
        uri: 'https://graph.facebook.com/v2.7/' + userId,
        qs: {
            access_token: config.FB_PAGE_TOKEN
        }

    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {

            var user = JSON.parse(body);

            if (user.first_name) {
                console.log("FB user: %s %s, %s",
                    user.first_name, user.last_name, user.gender);

                sendTextMessage(userId, "Welcome " + user.first_name + '!');
            } else {
                console.log("Cannot get data for fb user with id",
                    userId);
            }
        } else {
            console.error(response.error);
        }

    });
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {
            access_token: config.FB_PAGE_TOKEN
        },
        method: 'POST',
        json: messageData

    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                    messageId, recipientId);
            } else {
                console.log("Successfully called Send API for recipient %s",
                    recipientId);
            }
        } else {
            console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
        }
    });
}



/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback 
    // button for Structured Messages. 
    var payload = event.postback.payload;

    switch (payload) {

        case "GET_STARTED":
            sendTypingOn(senderID);
            getUser(senderID);
            break;

        case "Akkoord":
            sendTypingOn(senderID);
            Akkoord_payload(senderID);
            break;

        case "Niet akkoord":
            sendTypingOn(senderID);
            Nietakkoord_payload(senderID);
            break;
        case "Nieuw kaartje":
            sendTypingOn(senderID);
            Nieuwkaartje_payload(senderID);
            break;

        case "Nope":
            Nope_theEnd(senderID);
            break;

        case "Bestaand adres":
            Bestaandadres_payload(senderID);
            break;
        case AddressData[0].address:
            console.log("ACTION ----->", "THE ACTION COMING FROM ADRRESS 1");
            processAdressPayload(AddressData[0].address, AddressData[0].recipientName, senderID);
            break;
        case AddressData[1].address:
            console.log("ACTION ----->", "THE ACTION COMING FROM ADRRESS 2");
            processAdressPayload(AddressData[1].address, AddressData[1].recipientName, senderID);
            break;
        case AddressData[2].address:
            console.log("ACTION ----->", "THE ACTION COMING FROM ADRRESS 3");
            processAdressPayload(AddressData[2].address, AddressData[2].recipientName, senderID);

            break;
        case "Betalen":
        BetalenPayload(senderID);
        break;
        default:
            //unindentified payload
            sendTextMessage(senderID, "I'm not sure what you want. Can you be more specific?");
            break;

    }

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

}


/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;

    console.log("Received message read event for watermark %d and sequence " +
        "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

    console.log("Received account link event with for user %d with status %s " +
        "and auth code %s ", senderID, status, authCode);
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;

    if (messageIDs) {
        messageIDs.forEach(function(messageID) {
            console.log("Received delivery confirmation for message ID: %s",
                messageID);
        });
    }

    console.log("All message before %d were delivered.", watermark);
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfAuth = event.timestamp;

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the 
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger' 
    // plugin.
    var passThroughParam = event.optin.ref;

    console.log("Received authentication for user %d and page %d with pass " +
        "through param '%s' at %d", senderID, recipientID, passThroughParam,
        timeOfAuth);

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, "Authentication successful");
}

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        throw new Error('Couldn\'t validate the signature.');
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
            .update(buf)
            .digest('hex');

        if (signatureHash != expectedHash) {
            throw new Error("Couldn't validate the request signature.");
        }
    }
}

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

// CUSTOM FUNCTIONS GOES HERE

function getUser(userId) {
    //first read user firstname
    var user = null;
    request({
        uri: 'https://graph.facebook.com/v2.7/' + userId,
        qs: {
            access_token: config.FB_PAGE_TOKEN
        }

    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {

            user = JSON.parse(body);

            if (user.first_name) {
                console.log("FB user: %s %s, %s",
                    user.first_name, user.last_name, user.gender);

                firstname = user.first_name;
                user_id = user.id;
                let display_message = 'Welkom bij hallokaartje! Ik ben Jos, jouw kaartjes assistent. Voordat we je kunnen helpen zijn we verplicht je te vragen akkoord te gaan met onze voorwaarden.';
                let button = [{
                        "type": "postback",
                        "title": "Akkoord",
                        "payload": "Akkoord"
                    },
                    {
                        "type": "postback",
                        "title": "Niet akkoord",
                        "payload": "Niet akkoord"
                    },
                    {
                        "type": "web_url",
                        "url": " http://hallokaartje.nl/voorwaarden",
                        "title": "Lees voorwaarden",
                        "webview_height_ratio": "full"
                    }
                ];

                sendButtonMessage(userId, display_message, button);

            } else {
                console.log("Cannot get data for fb user with id",
                    userId);
            }
        } else {
            console.error(response.error);
        }

    });
    return user;
}

function Akkoord_payload(userId) {
    //first read user firstname
    var user = null;
    request({
        uri: 'https://graph.facebook.com/v2.7/' + userId,
        qs: {
            access_token: config.FB_PAGE_TOKEN
        }

    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {

            user = JSON.parse(body);

            if (user.first_name) {
                console.log("FB user FROM ADMIN:",
                    user);


                let display_message = 'Hallo  ' + user.first_name + '!, Ik ben Jos, jouw kaartjes assistent. Hoe kan ik je helpen?';
                // let button = [{
                //         "type": "postback",
                //         "title": "Nieuw kaartje",
                //         "payload": "Nieuw kaartje"
                //     },
                //     {
                //         "type": "postback",
                //         "title": "Adres toevoegen",
                //         "payload": "Adres toevoegen"
                //     }
                // ];
                // sendButtonMessage(userId, display_message, button);

                let replies = [{
                        "content_type": "text",
                        "title": "Nieuw kaartje",
                        "payload": "Nieuw kaartje",
                    },
                    {
                        "content_type": "text",
                        "title": "Adres toevoegen",
                        "payload": "Adres toevoegen",
                    }
                ];
                sendQuickReply(userId, display_message, replies);




                //Database Operation
                // let sqlString = "INSERT INTO users(firstname, lastname, gender, user_id, CreatedAt) VALUES ?";
                let sql = { firstname: user.first_name, lastname: user.last_name, gender: user.gender, user_id: user.id, CreatedAt: new Date() };
                // let sqlValue = [user.first_name, user.last_name, user.gender, 1, new Date()]
                con.query('INSERT INTO users SET ?', sql, function(err, result) {
                    if (err) throw err;
                    console.log("Number of records inserted: " + result.affectedRows);
                });


            } else {
                console.log("Cannot get data for fb user with id",
                    userId);
            }
        } else {
            console.error(response.error);
        }

    });
    return user;
}

function Nietakkoord_payload(SENDER) {
    //Quick Replies
    let message = "Jammer! Ik was je graag van dienst geweest.";
    let replies = [{
            "content_type": "text",
            "title": "Oké, toch akkoord",
            "payload": "Oké, toch akkoord",
        },
        {
            "content_type": "text",
            "title": "Houdoe",
            "payload": "Houdoe",
        }
    ];
    sendQuickReply(SENDER, message, replies);

    //INSERT USER DATA INTO DATABASE
}


function Nieuwkaartje_payload(SENDER) {
    let display_message = 'Cool! Een kaartje versturen is zo gebeurd. Waar moet ie naartoe?';
    let button = [{
            "type": "postback",
            "title": "Bestaand adres",
            "payload": "Bestaand adres"
        },
        {
            "type": "postback",
            "title": "Nieuw adres",
            "payload": "Nieuw adres"
        }
    ];



    sendButtonMessage(SENDER, display_message, button);
}

function Adrestoevoegen_payload(SENDER) {
    //TODO
}


function Bestaandadres_payload(SENDER) {
    console.log("Bestaandadres_payload");
    var cardAddressData = new Array();
    var title = [];
    let resultData = null;
    let id = user_id;
    // sendTextMessage(SENDER, 'Oké, ik pak je adresboekje er even bij');
    sendTypingOn(SENDER);
    con.query("SELECT * FROM postcard_recipient WHERE user_id = ? ORDER BY id DESC LIMIT 3", id, function(err, result) {
        if (err) throw err;
        // console.log("RECORD FETCH FROM DB: " + result);
        // console.log("USER ID: ", user_id);
        // console.log("THE JSON RESULT", JSON.stringify(result));
        resultData = result;
        // for (let i = 0; i < result.length; i++) {
        //     console.log("LOG FILE LOOP", result[i].address);
        //     title.push(result[i].address);

        //     var message = {
        //             title: result[i].address,
        //             subtitle: "",
        //             image_url: "https://www.oxfordlearning.com/wp-content/uploads/2011/09/a-guide-for-parents-on-getting-involved-in-kids-education-860x420.jpg",
        //             buttons: [{
        //                     "type": "postback",
        //                     "title": "Verstuur naar dit adres",
        //                     "payload": "Verstuur naar dit adres"
        //                 },
        //                 {
        //                     "type": "postback",
        //                     "title": "Naam aanpassen",
        //                     "payload": "Naam aanpassen"
        //                 },
        //                 {
        //                     "type": "postback",
        //                     "title": "Adres aanpassen",
        //                     "payload": "Adres aanpassen"
        //                 }
        //             ]

        //         }
        //         //cardAddressData.push(message);

        // }

        for (let i = 0; i < result.length; i++) {
            AddressData[i] = { address: result[i].address, recipientName: result[i].recipient_name };
            let message = {
                title: result[i].address,
                subtitle: "",
                imageUrl: "",
                buttons: [{
                        "text": "Verstuur naar dit adres",
                        "postback": result[i].address
                    },
                    {
                        "text": "Naam aanpassen",
                        "postback": "Naam aanpassen"
                    },
                    {
                        "text": "Adres aanpassen",
                        "postback": "Adres aanpassen"
                    }
                ]

            };

            cardAddressData.push(message);

        }
        handleCardMessages(cardAddressData, SENDER);
        console.log("LOG DATA FILE:--- ", AddressData);

        // SEND QUICK REPLIES

        // let replies = [{
        //         "content_type": "text",
        //         "title": "Naam aanpassen",
        //         "payload": "Naam aanpassen",
        //     },
        //     {
        //         "content_type": "text",
        //         "title": "Adres aanpassen",
        //         "payload": "Adres aanpassen",
        //     }
        // ];
        // sendQuickReply(SENDER, "THE TIME IS NOW", replies);


    });



    // console.log("THE TITLE LIST ARE: ", title);


    setTimeout(() => {
        console.log("LOG DATA FILE:--- ", cardAddressData);
        // handleCardMessages(cardAddressData, SENDER);

        //SEND QUICK REPLIES

        let replies = [{
                "content_type": "text",
                "title": "Naam aanpassen",
                "payload": "Naam aanpassen",
            },
            {
                "content_type": "text",
                "title": "Adres aanpassen",
                "payload": "Adres aanpassen",
            }
        ];
        sendQuickReply(SENDER, "Oké, ik pak je adresboekje er even bij", replies);
    }, 5000);
}

function processAdressPayload(address, reciepientName, sender) {
    let msg = `Gaaf! We gaan een kaartje sturen naar ${reciepientName}`;

    //sendTextMessage(sender, msg);
    //INSERT DATA INTO DB (CARD TABLE);

    let sql = { senderID: user_id, recipientAddress: address, recipientName: reciepientName, dateCreated: new Date() };
    con.query('INSERT INTO cards SET ?', sql, function(err, result) {
        if (err) throw err;
        console.log("Number of records inserted: " + result.affectedRows);
    });

    let replies = [{
        "content_type": "text",
        "title": "Doorgaan met",
        "payload": "Doorgaan met",
    }];
    sendQuickReply(sender, msg, replies);
}

function kummar(parameters, sender) {
    if (parameters.hasOwnProperty("postalCode") && parameters["postalCode"] == '' && parameters.hasOwnProperty("houseNumber") && parameters["houseNumber"] == '') {
        sendTextMessage(sender,
            `Kom maar op met dat adres. Aan postcode en huisnummer heb ik genoeg. 
    `);
        setTimeout(() => {
            sendTextMessage(sender,
                `voer je postcode in?`);
        }, 1000);

    } else if (parameters.hasOwnProperty("houseNumber") && parameters["houseNumber"] == '') {

        sendTextMessage(sender, `voer je huisnummer in?`);
    } else if (parameters.hasOwnProperty("postalCode") && parameters["postalCode"] != '' && parameters.hasOwnProperty("houseNumber") && parameters["houseNumber"] != '') {
        let postalCode = parameters["postalCode"];
        let houseNumber = parameters["houseNumber"];

        getAddress(postalCode, houseNumber, sender);

    }
}

function getAddress(postalCode, houseNumber, sender) {
    var request = require('request');

    var headers = {
        'X-Api-Key': 'J829ZSrL5l9bEUMlsM69M2Bm22uREgbW3BJRhl43'
    };

    var options = {
        url: `https://api.postcodeapi.nu/v2/addresses/?postcode=${postalCode}&number=${houseNumber}`,
        headers: headers
    };

    function callback(error, response, body) {
        console.log("The DATA FROM API", body);
        if (!error && response.statusCode == 200) {

            let data = JSON.parse(body);
            if (data._embedded.addresses.length > 0 && !data.error) {
                let addressObject = data._embedded.addresses[0];
                address = `${addressObject.street} ${addressObject.number} in ${addressObject.municipality.label}`;
                let message = `${address} Klopt dit, ${firstname} ?`

                let replies = [{
                        "content_type": "text",
                        "title": "Klopt",
                        "payload": "Klopt",
                    },
                    {
                        "content_type": "text",
                        "title": "Klopt niet",
                        "payload": "Klopt niet",
                    }
                ];
                sendQuickReply(sender, message, replies);
                // sendTextMessage(sender, `${address}`);
            } else if (data.error || data._embedded.addresses.length === 0) {
                sendTextMessage(sender, `We hebben helaas geen geldig adres gevonden bij deze postcode huisnummer combinatie. `);
                //Go BAck to Kummar and action new-ticket
            }
        } else {
            sendTextMessage(sender, `We hebben helaas geen geldig adres gevonden bij deze postcode huisnummer combinatie. `);
            //Go BAck to Kummar and action new-ticket

        }
    }

    request(options, callback);
}

function klop_action(parameters, sender) {
    if (parameters.hasOwnProperty("living") && parameters["living"] == '') {
        sendTextMessage(sender, `Wie woont er op dit adres?`);
    }

    if (parameters.hasOwnProperty("living") && parameters["living"] != '') {
        recipientName = parameters["living"];
        let display_message = `${recipientName} woont op ${address}`;
        let button = [{
                "content_type": "text",
                "title": "Waar",
                "payload": "Waar"
            },
            {
                "content_type": "text",
                "title": "Klopt niet",
                "payload": "Klopt niet_2"
            }
        ];

        sendQuickReply(sender, display_message, button);
    }

}

function klop_2_payload(sender) {
    //Database Operation
    let sql = { user_id, address, recipient_name: recipientName, dateCreated: new Date() };
    con.query('INSERT INTO postcard_recipient SET ?', sql, function(err, result) {
        if (err) throw err;
        console.log("Number of records inserted: " + result.affectedRows);
    });

    let display_message =
        ` Die staat erin! Wil je ook meteen een kaartje sturen aan ${recipientName}?`;
    let button = [{
            "type": "postback",
            "title": "Zeker",
            "payload": "Zeker"
        },
        {
            "type": "postback",
            "title": "Nope",
            "payload": "Nope"
        }
    ];

    sendButtonMessage(sender, display_message, button);

}

function Nope_theEnd(sender) {
    sendTextMessage(sender, ' No problemo!');
}

function postcard_picture_text(parameters, sender) {
    if (parameters.hasOwnProperty("card-text") && parameters["card-text"] == '') {
        sendTextMessage(sender, `Wat moet er op het kaartje komen te staan?`);

    }
    // else if (parameters.hasOwnProperty("card-picture") && parameters["card-picture"] == '') {

    //     sendTextMessage(sender, `Bijna klaar, tijd voor de foto!`);
    // }
    else if (parameters.hasOwnProperty("card-text") && parameters["card-text"] != '') {
        post_text = parameters["card-text"];
        let post_picture = parameters["card-picture"];

        sendTextMessage(sender, `Bijna klaar, tijd voor de foto!`);


        // sendTextMessage(sender, `The Picture Data:`);
        // sendTextMessage(sender, `PIx: ${post_picture}`);
        console.log("THE DATA AND PICTURE DATA", post_picture);
        console.log("THE DATA AND TEXT DATA", post_text);

    }

    if (typeof ImageDataObj === String) {
        sendTextMessage(sender, `Successfully recieved your Picture`);
        console.log("THE DATA IMAGE: ", ImageDataObj);
    }

    setTimeout(() => {
        if (post_picture === null) {
            sendTextMessage(sender, `Hey ${firstname} ik verwachtte een foto van je`);
        }
    }, 1000 * 120);
}

function pictureUpload(sender) {
    tokenGenerator();
    let msg = `All right, dit kaartje gaan we zo naar ${recipientName} versturen!`;
    let button = [{
            "type": "postback",
            "title": "Betalen",
            "payload": "Betalen"
        },
        {
            "type": "postback",
            "title": "Aanpassen",
            "payload": "Aanpassen"
        }
    ];

    sendButtonMessage(sender, msg, button);

}

function BetalenPayload(sender)
{

    sendTextMessage(sender, 'Wait we will process your payment soon');
    sendTextMessage(sender, tokenData.toString());
    console.log('The Token: ', tokenData);

    //CREATE PAYMENT REQUEST

    var request = require('request');

var headers = {
    'Authorization': 'Bearer CJV2IBcpivITQWCAlX2gzHshnP8E',
    'API-Key': 'gUgTBlRtV9OQN4N92YwhybDHxDnXAKpS',
    'Content-Type': 'application/json'
};

var dataString = {
	    "amountInCents": "100",
	    "currency": "EUR",
	    "description": "Payment",
	    "externalId": "1"
	};

var options = {
    url: 'https://api-sandbox.abnamro.com/v1/tikkie/platforms/18f60e32-1401-40d3-9716-f5443ccb143b/users/c1802531-7680-41c6-9a9e-09ba7b6de2c1/bankaccounts/dce2cd2b-0390-4ae3-83a9-52b8cff4f84b/paymentrequests',
    method: 'POST',
    headers: headers,
    body: dataString
};

function callback(error, response, body) {
    if (!error && response.statusCode == 200) {
        console.log(body);
    }
}

request(options, callback);

}

function tokenGenerator()
{
var jwt = require('jsonwebtoken');
var fs = require('fs');
var algo='RS256';
var payload={
    nbf:Math.floor(Date.now() / 1000),
        exp:Math.floor(Date.now() / 1000) + 300,
        sub:'gUgTBlRtV9OQN4N92YwhybDHxDnXAKpS',
        iss:'me',
        aud:'https://auth-sandbox.abnamro.com/oauth/token'
};

// sign with RSA SHA256
var cert =fs.readFileSync('./private_rsa.pem');  // get private key
 jwt.sign(payload, cert, { algorithm: algo},function(error,token){
 console.log(token);
tokenData=token;
 });
}

// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})