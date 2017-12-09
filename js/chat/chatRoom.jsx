var utils = require("../utils.jsx");
var React = require("react");
var ConversationPanelUI = require("./ui/conversationpanel.jsx");



/**
 * Class used to represent a MUC Room in which the current user is present
 *
 * @param megaChat {Chat}
 * @param roomId
 * @param type {String} only "private" is supported for now
 * @param users {Array}
 * @param ctime {Integer} unix time
 * @param [lastActivity] {Integer} unix time
 * @returns {ChatRoom}
 * @constructor
 */
var ChatRoom = function(megaChat, roomId, type, users, ctime, lastActivity, chatId, chatShard, chatdUrl) {
    var self = this;

    this.logger = MegaLogger.getLogger("room[" + roomId + "]", {}, megaChat.logger);

    this.megaChat = megaChat;

    MegaDataObject.attachToExistingJSObject(
        this,
        {
            state: null,
            users: [],
            attachments: null,
            roomId: null,
            type: null,
            messages: [],
            ctime: 0,
            lastActivity: 0,
            callRequest: null,
            callIsActive: false,
            isCurrentlyActive: false,
            _messagesQueue: [],
            unreadCount: 0,
            chatId: undefined,
            chatdUrl: undefined,
            chatShard: undefined,
            members: {},
            membersLoaded: false,
            topic: ""
        },
        true
    );

    this.roomId = roomId;
    this.type = type;
    this.ctime = ctime;
    this.lastActivity = lastActivity ? lastActivity : 0;
    this.chatId = chatId;
    this.chatIdBin = chatId ? base64urldecode(chatId) : "";

    this.chatShard = chatShard;
    this.chatdUrl = chatdUrl;

    this.callRequest = null;
    this.callIsActive = false;
    this.shownMessages = {};
    this.attachments = new MegaDataMap(this);
    this.images = new MegaDataSortedMap("id", "delay", this);

    self.members = {};

    if (type === "private") {
        users.forEach(function(userHandle) {
            self.members[userHandle] = 3;
        });
    }
    else {
        users.forEach(function(userHandle) {
            // while loading, set permissions to read only
            self.members[userHandle] = 0;
        });
    }
    this.options = {

        /**
         * Don't resend any messages in the queue, if older then Xs
         */
        'dontResendAutomaticallyQueuedMessagesOlderThen': 1*60,

        /**
         * The maximum time allowed for plugins to set the state of the room to PLUGINS_READY
         */
        'pluginsReadyTimeout': 60000, // XX: Because of the middle earth's internet, this should have been increased :)

        /**
         * Default media options
         */
        'mediaOptions': {
            audio: true,
            video: true
        }
    };

    this.setState(ChatRoom.STATE.INITIALIZED);

    this.isCurrentlyActive = false;

    // Events
    this.bind('onStateChange', function(e, oldState, newState) {
        self.logger.debug("Will change state from: ",
         ChatRoom.stateToText(oldState), " to ", ChatRoom.stateToText(newState));

        if (newState === ChatRoom.STATE.JOINING) {
        }
        else if (newState === ChatRoom.STATE.READY) {
        }
    });


    // activity on a specific room (show, hidden, got new message, etc)
    self.rebind('onMessagesBuffAppend.lastActivity', function(e, msg) {
        var ts = msg.delay ? msg.delay : msg.ts;
        if (!ts) {
            return;
        }

        if (self.lastActivity && self.lastActivity >= ts) {
            // this is an old message, DON'T update the lastActivity.
            return;
        }

        self.lastActivity = ts;
        if (msg.userId === u_handle) {
            self.didInteraction(u_handle, ts);
            return;
        }

        if (self.type === "private") {
            var targetUserId = self.getParticipantsExceptMe()[0];

            var targetUserNode;
            if (M.u[targetUserId]) {
                targetUserNode = M.u[targetUserId];
            }
            else if(msg.userId) {
                targetUserNode = M.u[msg.userId];
            }
            else {
                console.error("Missing participant in a 1on1 room.");
                return;
            }


            assert(targetUserNode && targetUserNode.u, 'No hash found for participant');
            assert(M.u[targetUserNode.u], 'User not found in M.u');

            if (targetUserNode) {
                self.didInteraction(targetUserNode.u, self.lastActivity);
            }
        }
        else if (self.type === "group") {
            var contactHash;
            if (msg.authorContact) {
                contactHash = msg.authorContact.h;
            }
            else if (msg.userId) {
                contactHash = msg.userId;
            }
            else if (msg.getFromJid) {
                debugger; // should not happen
                contactHash = megaChat.getContactHashFromJid(msg.getFromJid());
            }

            if (contactHash && M.u[contactHash]) {
                self.didInteraction(contactHash, self.lastActivity);
            }
            assert(contactHash, 'Invalid hash for user (extracted from inc. message)');
        }
        else {
            throw new Error("Not implemented");
        }
    });

    /**
     * Manually proxy contact related data change events, for more optimal UI rerendering.
     */
    var membersSnapshot = {};
    self.rebind('onMembersUpdated.chatRoomMembersSync', function() {
        var roomRequiresUpdate = false;

        Object.keys(membersSnapshot).forEach(function(u_h) {
            var contact = M.u[u_h];
            if (contact) {
                contact.removeChangeListener(membersSnapshot[u_h]);
                if (!self.members[u_h]) {
                    roomRequiresUpdate = true;
                }
            }
            delete membersSnapshot[u_h];
        });

        Object.keys(self.members).forEach(function(u_h) {
            var contact = M.u[u_h];
            if (contact) {
                membersSnapshot[u_h] = contact.addChangeListener(function() {
                    self.trackDataChange();
                });
            }
        });
        if (roomRequiresUpdate) {
            self.trackDataChange();
        }
    });

    self.getParticipantsExceptMe().forEach(function(userHandle) {
        var contact = M.u[userHandle];
        if (contact) {
            getLastInteractionWith(contact.u);
        }
    });
    self.megaChat.trigger('onRoomCreated', [self]);

    $(window).rebind("focus." + self.roomId, function() {
        if (self.isCurrentlyActive) {
            self.trigger("onChatShown");
        }
    });

    self.megaChat.rebind("onRoomDestroy." + self.roomId, function(e, room) {
        if (room.roomId == self.roomId) {
            $(window).unbind("focus." + self.roomId);
        }
    });

    return this;
};

/**
 * Add support for .on, .bind, .unbind, etc
 */
makeObservable(ChatRoom);

/**
 * Room states
 *
 * @type {{INITIALIZED: number,
           JOINING: number,
           JOINED: number,
           WAITING_FOR_PARTICIPANTS: number,
           PARTICIPANTS_HAD_JOINED: number,
           READY: number,
           LEAVING: number,
           LEFT: number}}
 */
ChatRoom.STATE = {
    'INITIALIZED': 5,
    'JOINING': 10,
    'JOINED': 20,

    'READY': 150,

    'ENDED': 190,

    'LEAVING': 200,

    'LEFT': 250
};

ChatRoom.prototype._retrieveTurnServerFromLoadBalancer = function(timeout) {
    var self = this;

    var $promise = new MegaPromise();

    var anonId = "";

    if (self.megaChat.rtc && self.megaChat.rtc.ownAnonId) {
        anonId = self.megaChat.rtc.ownAnonId;
    }
    $.ajax("https://" + self.megaChat.options.loadbalancerService + "/?service=turn&anonid=" + anonId, {
        method: "GET",
        timeout: timeout ? timeout : 10000
    })
        .done(function(r) {
            if (r.turn && r.turn.length > 0) {
                var servers = [];
                r.turn.forEach(function(v) {
                    var transport = v.transport;
                    if (!transport) {
                        transport = "udp";
                    }

                    servers.push({
                        urls: ['turn:' + v.host + ':' + v.port + '?transport=' + transport],
                        username: "inoo20jdnH",
                        credential: '02nNKDBkkS'
                    });
                });
                self.megaChat.rtc.updateIceServers(servers);

                $promise.resolve();
            }
            else {
                $promise.resolve();
            }
        })
        .fail(function() {
            $promise.reject();
        });

    return $promise;
};

ChatRoom.prototype._resetCallStateNoCall = function() {

};



ChatRoom.prototype._resetCallStateInCall = function() {

};

/**
 * Convert state to text (helper function)
 *
 * @param state {Number}
 * @returns {String}
 */
ChatRoom.stateToText = function(state) {
    var txt = null;
    $.each(ChatRoom.STATE, function(k, v) {
        if (state === v) {
            txt = k;

            return false; // break
        }
    });

    return txt;
};

/**
 * Change the state of this room
 *
 * @param newState {ChatRoom.STATE} the new state
 * @param [isRecover] {Boolean}
 */
ChatRoom.prototype.setState = function(newState, isRecover) {
    var self = this;

    assert(newState, 'Missing state');

    if (newState === self.state) {
        self.logger.debug("Ignoring .setState, newState === oldState, current state: ", self.getStateAsText());
        return;
    }

    if (self.state) { // if not === null, e.g. setting to INITIALIZED
        // only allow state changes to be increasing the .state value (5->10->....150...) with the exception when a
        // PLUGINS_PAUSED is the current or new state
        assert(
            (newState === ChatRoom.STATE.JOINING && isRecover) ||
            (newState === ChatRoom.STATE.INITIALIZED && isRecover) ||
            newState > self.state,
            'Invalid state change. Current:'
            + ChatRoom.stateToText(self.state)
            +  "to"
            + ChatRoom.stateToText(newState)
        );
    }

    var oldState = self.state;
    self.state = newState;

    self.trigger('onStateChange', [oldState, newState]);
};

/**
 * Returns current state as text
 *
 * @returns {String}
 */
ChatRoom.prototype.getStateAsText = function() {
    var self = this;
    return ChatRoom.stateToText(self.state);
};


/**
 * Change/set the type of the room
 *
 * @param type
 */
ChatRoom.prototype.setType = function(type) {
    var self = this;

    if (!type) {
        if (window.d) {
            debugger;
        }
        self.logger.error("missing type in .setType call");
    }

    self.type = type;
};

/**
 * Get all participants in a chat room.
 *
 * @returns {Array}
 */
ChatRoom.prototype.getParticipants = function() {
    var self = this;

    return Object.keys(self.members);
};

/**
 * Get a list of the current participants for this room, excluding my handle (or if provided, userHandles
 * would be used instead of the current room participants).
 *
 * @param [userHandles] {Array}
 * @returns {Array}
 */
ChatRoom.prototype.getParticipantsExceptMe = function(userHandles) {
    var self = this;
    if (!userHandles) {
        userHandles = self.getParticipants();
    }
    var handlesWithoutMyself = clone(userHandles);
    handlesWithoutMyself.splice($.inArray(u_handle, handlesWithoutMyself), 1);

    return handlesWithoutMyself;
};


/**
 * Get room title
 *
 * @returns {string}
 */
ChatRoom.prototype.getRoomTitle = function() {
    var self = this;
    if (this.type == "private") {
        var participants = self.getParticipantsExceptMe();
        return M.getNameByHandle(participants[0]) || "";
    }
    else {
        if (self.topic && self.topic.substr) {
            return self.topic.substr(0, 30);
        }

        var participants = self.members && Object.keys(self.members).length > 0 ? Object.keys(self.members) : [];
        var names = [];
        participants.forEach(function(contactHash) {
            if (contactHash && M.u[contactHash] && contactHash !== u_handle) {
                names.push(
                    M.u[contactHash] ? M.getNameByHandle(contactHash) : "non contact"
                );
            }
        });
        return names.length > 0 ? names.join(", ") : __(l[8888]);
    }
};



/**
 * Leave this chat room
 *
 * @param [notifyOtherDevices] {boolean|undefined} true if you want to notify other devices, falsy value if you don't want action to be sent
 * @returns {undefined|Deferred}
 */
ChatRoom.prototype.leave = function(triggerLeaveRequest) {
    var self = this;

    self._leaving = true;
    self._closing = triggerLeaveRequest;


    self.members[u_handle] = 0;


    if (triggerLeaveRequest) {
        if (self.type == "group") {
            $(self).trigger('onLeaveChatRequested');
        }
        else {
            self.logger.error("Can't leave room of type: " + self.type);
            return;
        }
    }


    if (self.roomId.indexOf("@") != -1) {
        if (self.state !== ChatRoom.STATE.LEFT) {
            self.setState(ChatRoom.STATE.LEAVING);
            self.setState(ChatRoom.STATE.LEFT);
        }
        else {
            return;
        }
    }
    else {
        self.setState(ChatRoom.STATE.LEFT);
    }
};

/**
 * Destroy a room (leave + UI destroy + js cleanup)
 * @param [notifyOtherDevices] {boolean|undefined} true if you want to notify other devices, falsy value if you don't want action to be sent
 */
ChatRoom.prototype.destroy = function(notifyOtherDevices, noRedirect) {
    var self = this;

    self.megaChat.trigger('onRoomDestroy', [self]);
    var mc = self.megaChat;
    var roomJid = self.roomId;

    if (!self.stateIsLeftOrLeaving()) {
        self.leave(notifyOtherDevices);
    }

    if (self.isCurrentlyActive) {
        self.isCurrentlyActive = false;
    }

    Soon(function() {
        mc.chats.remove(roomJid);

        if (!noRedirect) {
            loadSubPage('fm/chat');
        }
    });
};


/**
 * Show UI elements of this room
 */
ChatRoom.prototype.show = function() {
    var self = this;

    if (self.isCurrentlyActive) {
        if (!self.messagesBlockEnabled && self.callManagerCall && self.getUnreadCount() > 0) {
            $(self).trigger('toggleMessages');
        }
        return false;
    }
    self.megaChat.hideAllChats();

    self.isCurrentlyActive = true;

    $('.files-grid-view').addClass('hidden');
    $('.fm-blocks-view').addClass('hidden');
    $('.contacts-grid-view').addClass('hidden');
    $('.fm-contacts-blocks-view').addClass('hidden');

    $('.fm-right-files-block[data-reactid]').removeClass('hidden');
    $('.fm-right-files-block:not([data-reactid])').addClass('hidden');

    //$('.nw-conversations-item').removeClass('selected');


    if (self.megaChat.currentlyOpenedChat && self.megaChat.currentlyOpenedChat != self.roomId) {
        var oldRoom = self.megaChat.getCurrentRoom();
        if (oldRoom) {
            oldRoom.hide();
        }
    }

    M.onSectionUIOpen('conversations');


    self.megaChat.currentlyOpenedChat = self.roomId;
    self.megaChat.lastOpenedChat = self.roomId;

    self.trigger('activity');
    self.trigger('onChatShown');

    Soon(function() {
        if (megaChat.$conversationsAppInstance) {
            megaChat.$conversationsAppInstance.safeForceUpdate();
        }
    });
};

/**
 * Returns true/false if the current room is currently active (e.g. visible)
 */
ChatRoom.prototype.isActive = function() {
    return document.hasFocus() && this.isCurrentlyActive;
};

/**
 * Shows the current room (changes url if needed)
 */
ChatRoom.prototype.setActive = function() {
    // We need to delay this, since it can get called BY openFolder and it would then call again openFolder, which
    // would cause .currentdirid to not be set correctly.
    var self = this;
    Soon(function() {
        loadSubPage(self.getRoomUrl());
    });
};


/**
 * Returns true if messages are still being retrieved from chatd OR in decrypting state
 * (e.g. nothing to render in the messages history pane yet)
 * @returns {MegaPromise|boolean}
 */
ChatRoom.prototype.isLoading = function() {
    var self = this;
    var mb = self.messagesBuff;
    return (mb.messagesHistoryIsLoading() || (mb.isDecrypting && mb.isDecrypting.state() === 'pending'));
};

/**
 * Returns relative url for this room
 *
 * @returns {string}
 */
ChatRoom.prototype.getRoomUrl = function() {
    var self = this;
    if (self.type === "private") {
        var participants = self.getParticipantsExceptMe();
        var contact = M.u[participants[0]];
        if (contact) {
            return "fm/chat/" + contact.u;
        }
    }
    else if (self.type === "group") {
            return "fm/chat/g/" + self.roomId;
    }
    else {
        throw new Error("Can't get room url for unknown room type.");
    }
};

/**
 * If this is not the currently active room, then this method will navigate the user to this room (using window.location)
 */
ChatRoom.prototype.activateWindow = function() {
    var self = this;

    loadSubPage(self.getRoomUrl());
};

/**
 * Hide the UI elements of this room
 */
ChatRoom.prototype.hide = function() {
    var self = this;

    self.isCurrentlyActive = false;

    if (self.megaChat.currentlyOpenedChat === self.roomId) {
        self.megaChat.currentlyOpenedChat = null;
    }
};

/**
 * Append message to the UI of this room.
 * Note: This method will also log the message, so that later when someone asks for message sync this log will be used.
 *
 * @param message {Message|ChatDialogMessage}
 * @returns {boolean}
 */
ChatRoom.prototype.appendMessage = function(message) {
    var self = this;

    if (message.deleted) { // deleted messages should not be .append-ed
        return false;
    }

    if (message.getFromJid && message.getFromJid() === self.roomId) {
        return false; // dont show any system messages (from the conf room)
    }

    if (self.shownMessages[message.messageId]) {

        return false;
    }
    if (!message.orderValue) {
        // append at the bottom
        if (self.messages.length > 0) {
            var prevMsg = self.messagesBuff.messages.getItem(self.messages.length - 1);
            if (!prevMsg) {
                self.logger.error(
                    'self.messages got out of sync...maybe there are some previous JS exceptions that caused that? ' +
                    'note that messages may be displayed OUT OF ORDER in the UI.'
                );
            }
            else {
                message.orderValue = prevMsg.orderValue + 0.1;
            }
        }
    }

    self.trigger('onMessageAppended', message);
    self.messagesBuff.messages.push(message);

    self.shownMessages[message.messageId] = true;

    self.megaChat.updateDashboard();
};


/**
 * Returns the actual DOM Element from the Mega's main navigation (tree) that is related to this chat room.
 *
 * @returns {*|jQuery|HTMLElement}
 */
ChatRoom.prototype.getNavElement = function() {
    var self = this;

    return $('.nw-conversations-item[data-room-id="' + self.chatId + '"]');
};


/**
 * Will check if any of the plugins requires a message to be 'queued' instead of sent.
 *
 * @param [message] {Object} optional message object (currently not used)
 * @returns {boolean}
 */
ChatRoom.prototype.arePluginsForcingMessageQueue = function(message) {
    var self = this;
    var pluginsForceQueue = false;

    $.each(self.megaChat.plugins, function(k) {
        if (self.megaChat.plugins[k].shouldQueueMessage) {
            if (self.megaChat.plugins[k].shouldQueueMessage(self, message) === true) {
                pluginsForceQueue = true;
                return false; // break
            }
        }
    });

    return pluginsForceQueue;
};


/**
 * Send message to this room
 *
 * @param message {String}
 * @param [meta] {Object}
 */
ChatRoom.prototype.sendMessage = function(message) {
    var self = this;
    var megaChat = this.megaChat;

    var messageId = megaChat.generateTempMessageId(self.roomId, message);

    var msgObject = new Message(
        self,
        self.messagesBuff,
        {
            'messageId': messageId,
            'userId': u_handle,
            'message': message,
            'textContents': message,
            'delay': unixtime(),
            'sent': Message.STATE.NOT_SENT
        }
    );


    self.appendMessage(msgObject);

    self._sendMessageToTransport(msgObject)
        .done(function(internalId) {
            msgObject.internalId = internalId;
            msgObject.orderValue = internalId;
        });
};

/**
 * This method will:
 * - eventually (if the user is connected) try to send this message to the chatd server
 * - mark the message as sent or unsent (if the user is not connected)
 *
 * @param messageObject {Message}
 */
ChatRoom.prototype._sendMessageToTransport = function(messageObject) {
    var self = this;
    var megaChat = this.megaChat;

    megaChat.trigger('onBeforeSendMessage', messageObject);

    return megaChat.plugins.chatdIntegration.sendMessage(
        self,
        messageObject
    );
};


/**
 * Internal method to notify the server that the specified `nodeids` are sent/shared to `users`
 * @param nodeids {Array}
 * @param users {Array}
 * @private
 */
ChatRoom.prototype._sendNodes = function(nodeids, users) {
    var promises = [];
    var self = this;

    users.forEach(function(uh) {
        nodeids.forEach(function(nodeId) {
            promises.push(
                asyncApiReq({'a': 'mcga', 'n': nodeId, 'u': uh, 'id': self.chatId, 'v': Chatd.VERSION})
            );
        });
    });

    return MegaPromise.allDone(promises);
};



/**
 * Attach/share (send as message) file/folder nodes to the chat
 * @param ids
 */
ChatRoom.prototype.attachNodes = function(ids) {
    var self = this;

    var users = [];

    $.each(self.getParticipantsExceptMe(), function(k, v) {
        var contact = M.u[v];
        if (contact && contact.u) {
            users.push(
                contact.u
            );
        }
    });

    var $masterPromise = new MegaPromise();

    var waitingPromises = [];
    ids.forEach(function(nodeId) {
        var proxyPromise = new MegaPromise();

        self._sendNodes(
                [nodeId],
                users
            )
            .done(function () {
                var nodesMeta = [];
                var node = M.d[nodeId];
                nodesMeta.push({
                    'h': node.h,
                    'k': node.k,
                    't': node.t,
                    's': node.s,
                    'name': node.name,
                    'hash': node.hash,
                    'fa': node.fa,
                    'ts': node.ts
                });

                // 1b, 1b, JSON
                self.sendMessage(
                    Message.MANAGEMENT_MESSAGE_TYPES.MANAGEMENT +
                    Message.MANAGEMENT_MESSAGE_TYPES.ATTACHMENT +
                    JSON.stringify(nodesMeta)
                );

                proxyPromise.resolve([nodeId]);
            })
            .fail(function(r) {
                proxyPromise.reject(r);
            });

        waitingPromises.push(proxyPromise);
    });

    $masterPromise.linkDoneAndFailTo(MegaPromise.allDone(waitingPromises));

    return $masterPromise;
};


ChatRoom.prototype.lookupPendingUpload = function(faid, handle) {
    if (!this.pendingUploads) {
        return;
    }
    assert(faid || handle, 'lookupPendingUpload is missing both faid and handle args.');

    // find pending upload id by faid
    for (var uid in this.pendingUploads) {
        if (
            (faid && this.pendingUploads[uid].faid === faid) ||
            (handle && this.pendingUploads[uid].h === handle)
        ) {
            return uid;
        }
    }
};

ChatRoom.prototype.onUploadError = function(uid, error) {
    // This upload is never going to succeed...
    if (d) {
        var logger = MegaLogger.getLogger('onUploadEvent[' + this.roomId + ']');
        logger.debug(error === -0xDEADBEEF ? 'upload:abort' : 'upload.error', uid, error);
    }

    var ul = this.pendingUploads ? this.pendingUploads[uid] : null;

    // handle the onUploadError and if no more uploads are queued - clear any listeners
    if (ul) {
        delete this.pendingUploads[uid];
        if (Object.keys(this.pendingUploads).length === 0) {
            this.clearUploadListeners();
        }
    }
};


ChatRoom.prototype.onUploadStart = function(data) {
    var self = this;
    if (!self.pendingUploads) {
        self.pendingUploads = Object.create(null);
    }

    Object.assign(self.pendingUploads, data);

    // perhaps make this more lightweight by just queueing data[].chat entries

    if (!self.uploadListeners) {
        self.uploadListeners = [];
    }

    if (self.uploadListeners.length === 0) {
        var logger = d && MegaLogger.getLogger('onUploadEvent[' + self.roomId + ']');

        self.uploadListeners.push(
            mBroadcaster.addListener('upload:completion', function(uid, handle, faid, chat) {
                if (!chat) {
                    return;
                }
                if (chat.indexOf("/" + self.roomId) === -1) {
                    if (d) {
                        logger.debug('ignoring upload:completion that is unrelated to this chat.');
                    }
                }

                var n = M.d[handle];
                var ul = self.pendingUploads ? self.pendingUploads[uid] : null;

                if (d) {
                    logger.debug('upload:completion', uid, handle, faid, ul, n);
                }

                if (!ul || !n) {
                    // This should not happen...
                    logger.error('Invalid state error...');
                }
                else if (!n.fa && ul.isim) {
                    // The fa was not yet attached to the node, wait for one of pfa:* events
                    ul.faid = faid;
                    ul.h = handle;
                }
                else {
                    // this is not an image, attach node to chat room
                    delete self.pendingUploads[uid];
                    self.onUploadComplete([handle]);
                }
            })
        );


        self.uploadListeners.push(mBroadcaster.addListener('upload:error', self.onUploadError.bind(self)));
        self.uploadListeners.push(mBroadcaster.addListener('upload:abort', self.onUploadError.bind(self)));

        self.uploadListeners.push(
            mBroadcaster.addListener('fa:error', function(faid, error, onStorage) {
                var uid = self.lookupPendingUpload(faid);
                var ul = self.pendingUploads ? self.pendingUploads[uid] : null;

                if (d) {
                    logger.debug('fa:error', faid, error, onStorage, uid, ul);
                }


                delete self.pendingUploads[uid];

                // Attaching the fa to the node failed permanently, handle it.
                if (ul && ul.faid) {
                    var n = M.d[handle];
                    if (n) {
                        self.onUploadComplete([handle]);
                    }
                }
            })
        );

        self.uploadListeners.push(
            mBroadcaster.addListener('fa:ready', function(handle, fa) {
                var uid = self.lookupPendingUpload(false, handle);
                var ul = self.pendingUploads[uid];
                var n = M.d[handle];

                if (d) {
                    logger.debug('fa:ready', handle, fa, uid, ul, n);
                }

                delete self.pendingUploads[uid];

                // The fa is now attached to the node, add it to the chat room
                if (n) {
                    self.onUploadComplete([handle]);
                }
            })
        );
    }
};


ChatRoom.prototype.onUploadComplete = function(uploads) {
    this.attachNodes(uploads);

    this.clearUploadListeners();
};

ChatRoom.prototype.clearUploadListeners = function() {
    if (!this.pendingUploads || Object.keys(this.pendingUploads).length === 0) {
        for (var i = 0; i < this.uploadListeners.length; i++) {
            var listenerId = this.uploadListeners[i];
            mBroadcaster.removeListener(listenerId);
        }
        this.uploadListeners = [];
    }
};

ChatRoom.prototype.uploadFromComputer = function() {
    $('#fileselect1').trigger('click');
};

/**
 * Attach/share (send as message) contact details
 * @param ids
 */
ChatRoom.prototype.attachContacts = function(ids) {
    var self = this;

    var nodesMeta = [];
    $.each(ids, function(k, nodeId) {
        var node = M.u[nodeId];
        var name = M.getNameByHandle(node.u);

        nodesMeta.push({
            'u': node.u,
            'email': node.m,
            'name': name || node.m
        });
    });

    // 1b, 1b, JSON
    self.sendMessage(
        Message.MANAGEMENT_MESSAGE_TYPES.MANAGEMENT +
        Message.MANAGEMENT_MESSAGE_TYPES.CONTACT +
        JSON.stringify(nodesMeta)
    );
};


/**
 * Get message by Id
 * @param messageId {string} message id
 * @returns {boolean}
 */
ChatRoom.prototype.getMessageById = function(messageId) {
    var self = this;
    var found = false;
    $.each(self.messagesBuff.messages, function(k, v) {
        if (v.messageId === messageId) {
            found = v;
            // break;
            return false;
        }
    });

    return found;
};

/**
 * Used to update the DOM element containing data about this room.
 * E.g. unread count
 */
ChatRoom.prototype.renderContactTree = function() {
    var self = this;

    var $navElement = self.getNavElement();

    var $count = $('.nw-conversations-unread', $navElement);


    var count = self.messagesBuff.getUnreadCount();

    if (count > 0) {
        $count.text(
            count > 9 ? "9+" : count
        );
        $navElement.addClass("unread");
    }
    else if (count === 0) {
        $count.text("");
        $navElement.removeClass("unread");
    }

    $navElement.data('chatroom', self);
};

/**
 * Returns the # of messages which are currently marked as unread (uses the chatNotifications plugin)
 *
 * @returns {Integer|undefined}
 */
ChatRoom.prototype.getUnreadCount = function() {
    var self = this;
    return self.messagesBuff.getUnreadCount();
};


/**
 * Re-join - safely join a room after connection error/interruption
 */
ChatRoom.prototype.recover = function() {
    var self = this;

    self.callRequest = null;
    if (self.state !== ChatRoom.STATE.LEFT) {
        self.setState(ChatRoom.STATE.JOINING, true);
        self.megaChat.trigger("onRoomCreated", [self]); // re-initialise plugins
        return MegaPromise.resolve();;
    }
    else {
        return MegaPromise.reject();
    }
};


ChatRoom.prototype.startAudioCall = function() {
    var self = this;
    return self.megaChat.plugins.callManager.startCall(self, {audio: true, video:false});
};

ChatRoom.prototype.startVideoCall = function() {
    var self = this;
    return self.megaChat.plugins.callManager.startCall(self, {audio: true, video: true});
};

ChatRoom.prototype.stateIsLeftOrLeaving = function() {
    return (this.state == ChatRoom.STATE.LEFT || this.state == ChatRoom.STATE.LEAVING);
};

ChatRoom.prototype._clearChatMessagesFromChatd = function() {
    megaChat.plugins.chatdIntegration.chatd.shards[0].retention(
        base64urldecode(this.chatId), 1
    );
};

ChatRoom.prototype.isReadOnly = function() {
    return (
        (this.members && this.members[u_handle] === 0) ||
        this.privateReadOnlyChat ||
        this.state === ChatRoom.STATE.LEAVING ||
        this.state === ChatRoom.STATE.LEFT
    );
};
ChatRoom.prototype.iAmOperator = function() {
    return this.type === "private" || this.members && this.members[u_handle] === 3;
};

/**
 * Internal, utility function that would mark all contacts in a chat (specially for group chats), that I'd interacted
 * with them.
 */
ChatRoom.prototype.didInteraction = function(user_handle, ts) {
    var self = this;
    ts = ts || unixtime();

    if (user_handle === u_handle) {
        Object.keys(self.members).forEach(function (user_handle) {
            var contact = M.u[user_handle];
            if (contact && user_handle !== u_handle) {
                setLastInteractionWith(contact.u, "1:" + ts);
            }
        });
    }
    else {
        var contact = M.u[user_handle];
        if (contact && user_handle !== u_handle) {
            setLastInteractionWith(contact.u, "1:" + ts);
        }
    }
};

window.ChatRoom = ChatRoom;
module.exports = ChatRoom;
