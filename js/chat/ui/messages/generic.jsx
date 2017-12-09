var React = require("react");
var utils = require('./../../../ui/utils.jsx');
var getMessageString = require('./utils.jsx').getMessageString;
var ConversationMessageMixin = require('./mixin.jsx').ConversationMessageMixin;
var ContactsUI = require('./../contacts.jsx');
var TypingAreaUI = require('./../typingArea.jsx');

/* 1h as confirmed by Mathias */
var MESSAGE_NOT_EDITABLE_TIMEOUT = window.MESSAGE_NOT_EDITABLE_TIMEOUT = 60*60;

var CLICKABLE_ATTACHMENT_CLASSES = '.message.data-title, .message.file-size, .data-block-view.medium';

var GenericConversationMessage = React.createClass({
    mixins: [ConversationMessageMixin],
    getInitialState: function() {
        return {
            'editing': this.props.editing
        };
    },
    isBeingEdited: function() {
        return this.state.editing === true || this.props.editing === true;
    },
    componentDidUpdate: function(oldProps, oldState) {
        var self = this;
        if (self.isBeingEdited() && self.isMounted()) {
            var $generic = $(self.findDOMNode());
            var $textarea = $('textarea', $generic);
            if ($textarea.size() > 0 && !$textarea.is(":focus")) {
                $textarea.focus();
                moveCursortoToEnd($textarea[0]);
            }
            if (!oldState.editing) {
                if (self.props.onEditStarted) {
                    self.props.onEditStarted($generic);
                }
            }
        }
        else if (self.isMounted() && !self.isBeingEdited() && oldState.editing === true) {
            if (self.props.onUpdate) {
                self.props.onUpdate();
            }
        }
        $(self.props.message).rebind('onChange.GenericConversationMessage' + self.getUniqueId(), function() {
            Soon(function() {
                if (self.isMounted()) {
                    self.eventuallyUpdate();
                }
            });
        });
    },
    componentDidMount: function() {
        var self = this;
        var $node = $(self.findDOMNode());

        if (self.isBeingEdited() && self.isMounted()) {
            var $generic = $(self.findDOMNode());
            var $textarea = $('textarea', $generic);
            if ($textarea.size() > 0 && !$textarea.is(":focus")) {
                $textarea.focus();
                moveCursortoToEnd($textarea[0]);
            }
        }

        $node.delegate(
            CLICKABLE_ATTACHMENT_CLASSES,
            'click.dropdownShortcut',
            function(e){
                if (e.target.classList.contains('button')) {
                    // prevent recursion
                    return;
                }

                var $block = $(e.target).parents('.message.shared-block');
                if ($('.block-view.medium.thumb', $block).size() === 0) {
                    // if its not a 'media' (image)
                    Soon(function() {
                        // a delay is needed, otherwise React would receive the same click event and close the dropdown
                        // even before displaying it in the UI.
                        $('.button.default-white-button.tiny-button', $block).trigger('click');
                    });
                }
            });
    },
    componentWillUnmount: function() {
        var self = this;
        var $node = $(self.findDOMNode());

        $(self.props.message).unbind('onChange.GenericConversationMessage' + self.getUniqueId());
        $node.undelegate(CLICKABLE_ATTACHMENT_CLASSES, 'click.dropdownShortcut');
    },
    _nodeUpdated: function(h) {
        var self = this;
        // because it seems the webclient can trigger stuff before the actual
        // change is done on the node, this function would need to be queued
        // using Soon, so that its executed after the node modify code
        Soon(function() {
            if (self.isMounted() && self.isComponentVisible()) {
                self.forceUpdate();
                if (self.dropdown) {
                    self.dropdown.forceUpdate();
                }
            }
        });
    },
    doDelete: function(e, msg) {
        e.preventDefault(e);
        e.stopPropagation(e);

        if (
            msg.getState() === Message.STATE.NOT_SENT_EXPIRED
        ) {
            this.doCancelRetry(e, msg);
        }
        else {
            this.props.onDeleteClicked(e, this.props.message);
        }
    },
    doCancelRetry: function(e, msg) {
        e.preventDefault(e);
        e.stopPropagation(e);
        var chatRoom = this.props.message.chatRoom;

        chatRoom.messagesBuff.messages.removeByKey(msg.messageId);

        chatRoom.megaChat.plugins.chatdIntegration.discardMessage(
            chatRoom,
            msg.messageId
        );
    },
    doRetry: function(e, msg) {
        var self = this;
        e.preventDefault(e);
        e.stopPropagation(e);
        var chatRoom = this.props.message.chatRoom;
        this.doCancelRetry(e, msg);
        chatRoom._sendMessageToTransport(msg)
            .done(function(internalId) {
                msg.internalId = internalId;

                self.safeForceUpdate();

            });


    },
    _favourite: function(h) {
        var newFavState = Number(!M.isFavourite(h));
        M.favourite([h], newFavState);
    },
    _addFavouriteButtons: function(h, arr) {
        var self = this;

        if (M.getNodeRights(h) > 1) {
            var isFav = M.isFavourite(h);

            arr.push(
                <DropdownsUI.DropdownItem icon={"context " + (isFav ? "broken-heart" : "heart")}
                                          label={isFav ? l[5872] : l[5871]}
                                          isFav={isFav}
                                          key="fav"
                                          onClick={(e) => {
                                              self._favourite(h);
                                              e.stopPropagation();
                                              e.preventDefault();
                                              return false;
                                          }}/>
            );
            return isFav;
        }
        else {
            return false;
        }
    },
    _isNodeHavingALink: function(h) {
        return M.getNodeShare(h) !== false;
    },
    _addLinkButtons: function(h, arr) {
        var self = this;

        var haveLink = self._isNodeHavingALink(h) === true;

        var getManageLinkText = haveLink ? l[6909] : l[59];

        arr.push(
            <DropdownsUI.DropdownItem icon="icons-sprite chain"
                                      key="getLinkButton"
                                      label={getManageLinkText}
                                      onClick={self._getLink.bind(self, h)}
            />);

        if (haveLink) {
            arr.push(
                <DropdownsUI.DropdownItem icon="context remove-link"
                                          key="removeLinkButton"
                                          label={__(l[6821])}
                                          onClick={self._removeLink.bind(self, h)}
                />);
            return true;
        }
        else {
            return false;
        }
    },
    _startDownload: function(v) {
        M.addDownload([v]);
    },
    _addToCloudDrive: function(v) {
        M.injectNodes(v, M.RootID, function(res) {
            if (res === 0) {
                msgDialog(
                    'info',
                    __(l[8005]),
                    __(l[8006])
                );
            }
        });
    },

    _getLink: function(h, e) {
        if (u_type === 0) {
            ephemeralDialog(l[1005]);
        }
        else {
            mega.Share.initCopyrightsDialog([h]);
        }
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
    },
    _removeLink: function(h, e) {
        if (u_type === 0) {
            ephemeralDialog(l[1005]);
        }
        else {
            var exportLink = new mega.Share.ExportLink({'updateUI': true, 'nodesToProcess': [h]});
            exportLink.removeExportLink();
        }

        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
    },

    _startPreview: function(v, e) {
        var chatRoom = this.props.message.chatRoom;
        assert(M.chat, 'Not in chat.');
        M.v = chatRoom.images.values();
        slideshow(v.h);
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
    },

    render: function () {
        var self = this;

        var message = this.props.message;
        var megaChat = this.props.message.chatRoom.megaChat;
        var chatRoom = this.props.message.chatRoom;
        var contact = self.getContact();
        var timestampInt = self.getTimestamp();
        var timestamp = self.getTimestampAsString();

        var textMessage;


        var additionalClasses = "";
        var buttonsBlock = null;
        var spinnerElement = null;
        var messageNotSendIndicator = null;
        var messageIsNowBeingSent = false;

        if (this.props.className) {
            additionalClasses += this.props.className;
        }

        if (message.revoked) {
            // skip doing tons of stuff and just return null, in case this message was marked as revoked.
            return null;
        }

        // if this is a text msg.
        if (message instanceof Message) {
            // Convert ot HTML and pass it to plugins to do their magic on styling the message if needed.
            if (!message.messageHtml) {
                message.messageHtml = htmlentities(
                    message.textContents
                ).replace(/\n/gi, "<br/>");
            }

            var event = new $.Event("onBeforeRenderMessage");
            megaChat.trigger(event, {
                message: message,
                room: chatRoom
            });

            if (event.isPropagationStopped()) {
                self.logger.warn("Event propagation stopped receiving (rendering) of message: ", message);
                return false;
            }
            textMessage = message.messageHtml;


            if (
                (message instanceof Message) ||
                (typeof(message.userId) !== 'undefined' && message.userId === u_handle)
            ) {
                if (
                    message.getState() === Message.STATE.NULL
                ) {
                    additionalClasses += " error";
                }
                else if (
                    message.getState() === Message.STATE.NOT_SENT
                ) {
                    messageIsNowBeingSent = (unixtime() - message.delay < 5);


                    if (!messageIsNowBeingSent) {
                        additionalClasses += " not-sent";

                        if (message.sending === true) {
                            message.sending = false;


                            $(message).trigger(
                                'onChange',
                                [
                                    message,
                                    "sending",
                                    true,
                                    false
                                ]
                            );
                        }

                        if (!message.requiresManualRetry) {
                            additionalClasses += " retrying";
                        }
                        else {
                            additionalClasses += " retrying requires-manual-retry";
                        }

                        buttonsBlock = null;
                    }
                    else {
                        additionalClasses += " sending";
                        spinnerElement = <div className="small-blue-spinner"></div>;

                        if (!message.sending) {
                            message.sending = true;
                            if (self._rerenderTimer) {
                                clearTimeout(self._rerenderTimer);
                            }
                            self._rerenderTimer = setTimeout(function () {
                                if (chatRoom.messagesBuff.messages[message.messageId] && message.sending === true) {
                                    chatRoom.messagesBuff.trackDataChange();
                                    if (self.isMounted()) {
                                        self.forceUpdate();
                                    }
                                }
                            }, (5 - (unixtime() - message.delay)) * 1000);
                        }
                    }
                }
                else if (message.getState() === Message.STATE.SENT) {
                    additionalClasses += " sent";
                }
                else if (message.getState() === Message.STATE.DELIVERED) {
                    additionalClasses += " delivered";
                }
                else if (message.getState() === Message.STATE.NOT_SEEN) {
                    additionalClasses += " unread";
                }
                else if (message.getState() === Message.STATE.SEEN) {
                    additionalClasses += " seen";
                }
                else if (message.getState() === Message.STATE.DELETED) {
                    additionalClasses += " deleted";
                }
                else {
                    additionalClasses += " not-sent";
                }
            }

            var displayName;
            if (contact) {
                displayName = generateAvatarMeta(contact.u).fullName;
            }
            else {
                displayName = contact;
            }

            var textContents = message.textContents;

            if (textContents.substr && textContents.substr(0, 1) === Message.MANAGEMENT_MESSAGE_TYPES.MANAGEMENT) {
                if (textContents.substr(1, 1) === Message.MANAGEMENT_MESSAGE_TYPES.ATTACHMENT) {
                    textContents = textContents.substr(2, textContents.length);

                    try {
                        var attachmentMeta = JSON.parse(textContents);
                    } catch(e) {
                        debugger;
                        return null;
                    }

                    var files = [];

                    self.attachments = [];

                    attachmentMeta.forEach(function(v, attachmentKey) {
                        self.attachments.push(v);

                        var attachmentMetaInfo;
                        // cache ALL current attachments, so that we can revoke them later on in an ordered way.
                        if (message.messageId) {
                            if (
                                chatRoom.attachments &&
                                chatRoom.attachments[v.h] &&
                                chatRoom.attachments[v.h][message.messageId]
                            ) {
                                attachmentMetaInfo = chatRoom.attachments[v.h][message.messageId];
                            }
                            else {
                                // if the chatRoom.attachments is not filled in yet, just skip the rendering
                                // and this attachment would be re-rendered on the next loop.
                                return;
                            }
                        }





                        // generate preview/icon
                        var icon = fileIcon(v);

                        var dropdown = null;
                        var previewButton = null;

                        if (!attachmentMetaInfo.revoked) {
                            if (v.fa && is_image(v)) {
                                var imagesListKey = message.messageId + "_" + v.h;
                                if (!chatRoom.images.exists(imagesListKey)) {
                                    v.id = imagesListKey;
                                    v.delay = message.delay;
                                    chatRoom.images.push(v);
                                }
                                previewButton = <span key="previewButton">
                                    <DropdownsUI.DropdownItem icon="search-icon" label={__(l[1899])}
                                                              onClick={self._startPreview.bind(self, v)}/>
                                    <hr/>
                                </span>;
                            }
                            if (contact.u === u_handle) {
                                dropdown = <ButtonsUI.Button
                                    className="default-white-button tiny-button"
                                    icon="tiny-icon grey-down-arrow">
                                    <DropdownsUI.Dropdown
                                        ref={(refObj) => {
                                            self.dropdown = refObj;
                                        }}
                                        className="white-context-menu attachments-dropdown"
                                        noArrow={true}
                                        positionMy="left top"
                                        positionAt="left bottom"
                                        horizOffset={-4}
                                        vertOffset={3}
                                        onBeforeActiveChange={(newState) => {
                                            if (newState === true) {
                                                self.forceUpdate();
                                            }
                                        }}
                                        dropdownItemGenerator={function(dd) {
                                            var linkButtons = [];
                                            var firstGroupOfButtons = [];
                                            var revokeButton = null;
                                            if (message.isEditable && message.isEditable()) {
                                                revokeButton = <DropdownsUI.DropdownItem icon="red-cross"
                                                    label={__(l[83])} className="red" onClick={() => {
                                                        chatRoom.megaChat.plugins.chatdIntegration.updateMessage(
                                                            chatRoom,
                                                            (
                                                                message.internalId ?
                                                                    message.internalId : message.orderValue
                                                            ),
                                                            ""
                                                        );
                                                    }} />
                                            }

                                            self._addLinkButtons(v.h, linkButtons);

                                            firstGroupOfButtons.push(
                                                <DropdownsUI.DropdownItem icon="context info" label={__(l[6859])}
                                                                          key="infoDialog"
                                                                          onClick={() => {
                                                                              $.selected = [v.h];
                                                                              propertiesDialog();
                                                                          }} />
                                            );


                                            self._addFavouriteButtons(v.h, firstGroupOfButtons);

                                            return <div>
                                                {previewButton}
                                                {firstGroupOfButtons}
                                                {firstGroupOfButtons && firstGroupOfButtons.length > 0 ? <hr /> : ""}
                                                <DropdownsUI.DropdownItem icon="rounded-grey-down-arrow" label={__(l[1187])}
                                                                          onClick={self._startDownload.bind(self, v)}/>
                                                {linkButtons}
                                                {revokeButton ? <hr /> : ""}
                                                {revokeButton}
                                            </div>;
                                        }}
                                    />
                                </ButtonsUI.Button>;

                            }
                            else {
                                dropdown = <ButtonsUI.Button
                                    className="default-white-button tiny-button"
                                    icon="tiny-icon grey-down-arrow">
                                    <DropdownsUI.Dropdown
                                        className="white-context-menu attachments-dropdown"
                                        noArrow={true}
                                        positionMy="left top"
                                        positionAt="left bottom"
                                        horizOffset={-4}
                                        vertOffset={3}
                                    >
                                        {previewButton}
                                        <DropdownsUI.DropdownItem icon="rounded-grey-down-arrow" label={__(l[1187])}
                                                                  onClick={self._startDownload.bind(self, v)}/>
                                        <DropdownsUI.DropdownItem icon="grey-cloud" label={__(l[8005])}
                                                                  onClick={self._addToCloudDrive.bind(self, v)}/>
                                    </DropdownsUI.Dropdown>
                                </ButtonsUI.Button>;
                            }
                        }
                        else {
                            // else if (attachmentMetaInfo.revoked) { ... don't show revoked files
                            debugger;
                            return;
                        }

                        var attachmentClasses = "message shared-data";
                        var preview = <div className="data-block-view medium">
                            {dropdown}

                            <div className="data-block-bg">
                                <div className={"block-view-file-type " + icon}></div>
                            </div>
                        </div>;

                        if (M.chat && !message.revoked) {
                            if (v.fa && is_image(v)) {
                                var src = thumbnails[v.h];
                                if (!src) {
                                    src = M.getNodeByHandle(v.h);

                                    if (!src || src !== v) {
                                        M.v.push(v);
                                        if (!v.seen) {
                                            v.seen = 1; // HACK
                                        }
                                        delay('thumbnails', fm_thumbnails, 90);
                                    }
                                    src = window.noThumbURI || '';

                                    v.imgId = "thumb" + message.messageId + "_" + attachmentKey + "_" + v.h;
                                }

                                preview =  (src ? (<div id={v.imgId} className="shared-link img-block">
                                    <div className="img-overlay" onClick={self._startPreview.bind(self, v)}></div>
                                    <div className="button overlay-button" onClick={self._startPreview.bind(self, v)}>
                                        <i className="huge-white-icon loupe"></i>
                                    </div>

                                    {dropdown}

                                    <img alt="" className={"thumbnail-placeholder " + v.h} src={src}
                                         width="156"
                                         height="156"
                                         onClick={self._startPreview.bind(self, v)}
                                    />
                                </div>) :  preview);
                            }
                        }

                        files.push(
                            <div className={attachmentClasses} key={v.h}>
                                <div className="message shared-info">
                                    <div className="message data-title">
                                        {v.name}
                                    </div>
                                    <div className="message file-size">
                                        {bytesToSize(v.s)}
                                    </div>
                                </div>

                                {preview}
                                <div className="clear"></div>

                            </div>
                        );
                    });


                    var avatar = null;
                    var datetime = null;
                    var name = null;
                    if (this.props.grouped) {
                        additionalClasses += " grouped";
                    }
                    else {
                        avatar = <ContactsUI.Avatar contact={contact} className="message small-rounded-avatar"/>;
                        datetime = <div className="message date-time"
                                        title={time2date(timestampInt)}>{timestamp}</div>;
                        name = <div className="message user-card-name">{displayName}</div>;
                    }

                    return <div className={message.messageId + " message body" + additionalClasses}>
                        {avatar}
                        <div className="message content-area">
                            {name}
                            {datetime}

                            <div className="message shared-block">
                                {files}
                            </div>
                            {buttonsBlock}
                            {spinnerElement}
                        </div>
                    </div>;
                }
                else if (textContents.substr(1, 1) === Message.MANAGEMENT_MESSAGE_TYPES.CONTACT) {
                    textContents = textContents.substr(2, textContents.length);

                    try {
                        var attachmentMeta = JSON.parse(textContents);
                    } catch(e) {
                        return null;
                    }

                    var contacts = [];

                    attachmentMeta.forEach(function(v) {
                        var contact = M.u && M.u[v.u] ? M.u[v.u] : v;
                        var contactEmail = contact.email ? contact.email : contact.m;
                        if (!contactEmail) {
                            contactEmail = v.email ? v.email : v.m;
                        }

                        var deleteButtonOptional = null;

                        if (
                            message.userId === u_handle &&
                            (unixtime() - message.delay) < MESSAGE_NOT_EDITABLE_TIMEOUT
                        ) {
                            deleteButtonOptional = <DropdownsUI.DropdownItem
                                icon="red-cross"
                                label={l[83]}
                                className="red"
                                onClick={(e) => {
                                        self.doDelete(e, message);
                                }}
                            />;

                        }
                        var dropdown = null;
                        if (!M.u[contact.u]) {
                            M.u.set(contact.u, new MegaDataObject(MEGA_USER_STRUCT, true, {
                                'u': contact.u,
                                'name': contact.name,
                                'm': contact.email ? contact.email : contactEmail,
                                'c': 0
                            }));
                        }
                        else if (M.u[contact.u] && !M.u[contact.u].m) {
                            // if already added from group chat...add the email,
                            // since that contact got shared in a chat room
                            M.u[contact.u].m = contact.email ? contact.email : contactEmail;
                        }

                        if (M.u[contact.u] && M.u[contact.u].c === 1) {
                            // Only show this dropdown in case this user is a contact, e.g. don't show it if thats me
                            // OR it is a share contact, etc.
                            dropdown = <ButtonsUI.Button
                                className="default-white-button tiny-button"
                                icon="tiny-icon grey-down-arrow">
                                <DropdownsUI.Dropdown
                                    className="white-context-menu shared-contact-dropdown"
                                    noArrow={true}
                                    positionMy="left bottom"
                                    positionAt="right bottom"
                                    horizOffset={4}
                                >
                                    <DropdownsUI.DropdownItem
                                        icon="human-profile"
                                        label={__(l[5868])}
                                        onClick={() => {
                                            loadSubPage("fm/" + contact.u);
                                        }}
                                    />
                                    <hr/>
                                    { null /*<DropdownsUI.DropdownItem
                                     icon="rounded-grey-plus"
                                     label={__(l[8631])}
                                     onClick={() => {
                                     loadSubPage("fm/" + contact.u);
                                     }}
                                     />*/}
                                    <DropdownsUI.DropdownItem
                                        icon="conversations"
                                        label={__(l[8632])}
                                        onClick={() => {
                                            loadSubPage("fm/chat/" + contact.u);
                                        }}
                                    />
                                    {deleteButtonOptional ? <hr /> : null}
                                    {deleteButtonOptional}
                                </DropdownsUI.Dropdown>
                            </ButtonsUI.Button>;
                        }
                        else if (M.u[contact.u] && M.u[contact.u].c === 0) {
                            dropdown = <ButtonsUI.Button
                                className="default-white-button tiny-button"
                                icon="tiny-icon grey-down-arrow">
                                <DropdownsUI.Dropdown
                                    className="white-context-menu shared-contact-dropdown"
                                    noArrow={true}
                                    positionMy="left bottom"
                                    positionAt="right bottom"
                                    horizOffset={4}
                                >
                                    <DropdownsUI.DropdownItem
                                        icon="rounded-grey-plus"
                                        label={__(l[71])}
                                        onClick={() => {
                                            var exists = false;
                                            Object.keys(M.opc).forEach(function(k) {
                                                if (!exists && M.opc[k].m === contactEmail) {
                                                    exists = true;
                                                    return false;
                                                }
                                            });

                                            if (exists) {
                                                closeDialog();
                                                msgDialog('warningb', '', l[7413]);
                                            }
                                            else {
                                                M.inviteContact(M.u[u_handle].m, contactEmail);

                                                // Contact invited
                                                var title = l[150];

                                                // The user [X] has been invited and will appear in your contact list
                                                // once accepted."
                                                var msg = l[5898].replace('[X]', contactEmail);


                                                closeDialog();
                                                msgDialog('info', title, msg);
                                            }
                                        }}
                                    />
                                    {deleteButtonOptional ? <hr /> : null}
                                    {deleteButtonOptional}
                                </DropdownsUI.Dropdown>
                            </ButtonsUI.Button>;
                        }

                        contacts.push(
                            <div key={contact.u}>
                                <div className="message shared-info">
                                    <div className="message data-title">{M.getNameByHandle(contact.u)}</div>
                                    {
                                        M.u[contact.u] ?
                                            <ContactsUI.ContactVerified className="big" contact={contact} /> :
                                            null
                                    }

                                    <div className="user-card-email">{contactEmail}</div>
                                </div>
                                <div className="message shared-data">
                                    <div className="data-block-view medium">
                                        {
                                            M.u[contact.u] ?
                                                <ContactsUI.ContactPresence className="big" contact={contact} /> :
                                                null
                                        }
                                        {dropdown}
                                        <div className="data-block-bg">
                                            <ContactsUI.Avatar className="medium-avatar share" contact={contact} />
                                        </div>
                                    </div>
                                    <div className="clear"></div>
                                </div>
                            </div>
                        );
                    });


                    var avatar = null;
                    var datetime = null;
                    var name = null;
                    if (this.props.grouped) {
                        additionalClasses += " grouped";
                    }
                    else {
                        avatar = <ContactsUI.Avatar contact={contact} className="message small-rounded-avatar"/>;
                        datetime = <div className="message date-time"
                                        title={time2date(timestampInt)}>{timestamp}</div>;
                        name = <div className="message user-card-name">{displayName}</div>;
                    }

                    return <div className={message.messageId + " message body" + additionalClasses}>
                        {avatar}
                        <div className="message content-area">
                            {name}
                            {datetime}

                            <div className="message shared-block">
                                {contacts}
                            </div>
                            {buttonsBlock}
                            {spinnerElement}
                        </div>
                    </div>;
                }
                else if (textContents.substr &&
                 textContents.substr(1, 1) === Message.MANAGEMENT_MESSAGE_TYPES.REVOKE_ATTACHMENT) {
                    // don't show anything if this is a 'revoke' message
                    return null;
                }
                else {
                    chatRoom.logger.warn("Invalid 2nd byte for a management message: ", textContents);
                    return null;
                }
            }
            else {
                // this is a text message.
                if (message.textContents === "") {
                    message.deleted = true;
                }
                var messageActionButtons = null;
                if (message.getState() === Message.STATE.NOT_SENT) {
                    messageActionButtons = null;

                    if (!spinnerElement) {
                        if (!message.requiresManualRetry) {
                            messageNotSendIndicator = <div className="not-sent-indicator tooltip-trigger"
                                                           data-tooltip="not-sent-notification">
                                <i className="small-icon yellow-triangle"></i>
                            </div>;
                        }
                        else {
                            if (self.isBeingEdited()  !== true) {
                                messageNotSendIndicator = <div className="not-sent-indicator">
                                        <span className="tooltip-trigger"
                                              key="retry"
                                              data-tooltip="not-sent-notification-manual"
                                              onClick={(e) => {
                                                self.doRetry(e, message);
                                            }}>
                                          <i className="small-icon refresh-circle"></i>
                                    </span>
                                    <span className="tooltip-trigger"
                                          key="cancel"
                                          data-tooltip="not-sent-notification-cancel"
                                          onClick={(e) => {
                                                    self.doCancelRetry(e, message);
                                                }}>
                                            <i className="small-icon red-cross"></i>
                                    </span>
                                </div>;
                            }
                        }
                    }
                }

                var avatar = null;
                var datetime = null;
                var name = null;
                if (this.props.grouped) {
                    additionalClasses += " grouped";
                }
                else {
                    avatar = <ContactsUI.Avatar contact={contact} className="message small-rounded-avatar"/>;
                    datetime = <div className="message date-time"
                                    title={time2date(timestampInt)}>{timestamp}</div>;
                    name = <div className="message user-card-name">{displayName}</div>;
                }

                var messageDisplayBlock;
                if (self.isBeingEdited() === true) {
                    var msgContents = message.textContents;
                    msgContents = megaChat.plugins.emoticonsFilter.fromUtfToShort(msgContents);

                    messageDisplayBlock = <TypingAreaUI.TypingArea
                        iconClass="small-icon writing-pen textarea-icon"
                        initialText={msgContents}
                        chatRoom={self.props.message.chatRoom}
                        showButtons={true}
                        className="edit-typing-area"
                        onUpdate={() => {
                            if (self.props.onUpdate) {
                                self.props.onUpdate();
                            }
                        }}
                        onConfirm={(messageContents) => {
                            self.setState({'editing': false});

                            if (self.props.onEditDone) {
                                Soon(function() {
                                    var tmpMessageObj = {
                                        'textContents': messageContents
                                    };
                                    megaChat.plugins.emoticonsFilter.processOutgoingMessage({}, tmpMessageObj);
                                    self.props.onEditDone(tmpMessageObj.textContents);
                                    if (self.isMounted()) {
                                        self.forceUpdate();
                                    }
                                });
                            }

                            return true;
                        }}
                    />;
                }
                else if (message.deleted) {
                    return null;
                }
                else {
                    if (message.updated > 0) {
                        textMessage = textMessage + " <em>" + __(l[8887]) + "</em>";
                    }
                    if (self.props.initTextScrolling) {
                        messageDisplayBlock =
                            <utils.JScrollPane className="message text-block scroll">
                                <div className="message text-scroll" dangerouslySetInnerHTML={{__html:textMessage}}>
                                </div>
                            </utils.JScrollPane>;
                    } else {
                        messageDisplayBlock =
                            <div className="message text-block" dangerouslySetInnerHTML={{__html:textMessage}}></div>;
                    }
                }
                if (!message.deleted) {
                    if (
                        contact && contact.u === u_handle &&
                        (unixtime() - message.delay) < MESSAGE_NOT_EDITABLE_TIMEOUT &&
                        self.isBeingEdited() !== true &&
                        chatRoom.isReadOnly() === false &&
                        !message.requiresManualRetry
                    ) {
                        messageActionButtons = <ButtonsUI.Button
                            className="default-white-button tiny-button"
                            icon="tiny-icon grey-down-arrow">
                            <DropdownsUI.Dropdown
                                className="white-context-menu attachments-dropdown"
                                noArrow={true}
                                positionMy="left bottom"
                                positionAt="right bottom"
                                horizOffset={4}
                            >
                                <DropdownsUI.DropdownItem
                                    icon="writing-pen"
                                    label={__(l[1342])}
                                    className=""
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();

                                        self.setState({'editing': true});
                                }}
                                />
                                <hr/>
                                <DropdownsUI.DropdownItem
                                    icon="red-cross"
                                    label={__(l[1730])}
                                    className="red"
                                    onClick={(e) => {
                                        self.doDelete(e, message);
                                }}
                                />
                            </DropdownsUI.Dropdown>
                        </ButtonsUI.Button>;

                    }
                }

                return (
                    <div className={message.messageId + " message body " + additionalClasses}>
                        {avatar}
                        <div className="message content-area">
                            {name}
                            {datetime}

                            {self.props.hideActionButtons ? null : messageActionButtons}
                            {messageNotSendIndicator}
                            {messageDisplayBlock}
                            {buttonsBlock}
                            {spinnerElement}
                        </div>
                    </div>
                );
            }
        }
        // if this is an inline dialog
        else if (
            message.type
        ) {
            textMessage = getMessageString(message.type);
            if (!textMessage) {
                console.error("Message with type: ", message.type, " - no text string defined. Message: ", message);
                return;
            }
            // if is an array.
            if (textMessage.splice) {
                var tmpMsg = textMessage[0].replace("[X]", htmlentities(M.getNameByHandle(contact.u)));

                if (message.currentCallCounter) {
                    tmpMsg += " " +
                        textMessage[1].replace("[X]", "[[ " + secToDuration(message.currentCallCounter)) + "]] "
                }
                textMessage = tmpMsg;
                textMessage = textMessage
                    .replace("[[ ", "<span className=\"grey-color\">")
                    .replace("]]", "</span>");
            }
            else {
                textMessage = textMessage.replace("[X]", htmlentities(M.getNameByHandle(contact.u)));
            }

            message.textContents = textMessage;

            // mapping css icons to msg types
            if (message.type === "call-rejected") {
                message.cssClass = "crossed-handset red";
            }
            else if (message.type === "call-missed") {
                message.cssClass = "horizontal-handset yellow"
            }
            else if (message.type === "call-handled-elsewhere") {
                message.cssClass = "handset-with-arrow green";
            }
            else if (message.type === "call-failed") {
                message.cssClass = "horizontal-handset red";
            }
            else if (message.type === "call-timeout") {
                message.cssClass = "horizontal-handset yellow";
            }
            else if (message.type === "call-failed-media") {
                message.cssClass = "diagonal-handset yellow";
            }
            else if (message.type === "call-canceled") {
                message.cssClass = "horizontal-handset grey";
            }
            else if (message.type === "call-ended") {
                message.cssClass = "horizontal-handset grey";
            }
            else if (message.type === "call-feedback") {
                message.cssClass = "diagonal-handset grey";
            }
            else if (message.type === "call-starting") {
                message.cssClass = "diagonal-handset blue";
            }
            else if (message.type === "call-initialising") {
                message.cssClass = "diagonal-handset blue";
            }
            else if (message.type === "call-started") {
                message.cssClass = "diagonal-handset green";
            }
            else if (message.type === "incoming-call") {
                message.cssClass = "diagonal-handset green";
            }
            else if (message.type === "outgoing-call") {
                message.cssClass = "diagonal-handset blue";
            }
            else {
                message.cssClass = message.type;
            }

            var buttons = [];
            if (message.buttons) {
                Object.keys(message.buttons).forEach(function (k) {
                    var button = message.buttons[k];
                    var classes = button.classes;
                    var icon;
                    if (button.icon) {
                        icon = <i className={"small-icon " + button.icon}></i>;
                    }
                    buttons.push(
                        <div className={classes} key={k}  onClick={((e) => { button.callback.call(e.target); })}>
                            {icon}
                            {button.text}
                        </div>
                    );
                });
            }

            var buttonsCode;
            if (buttons.length > 0) {
                buttonsCode = <div className="buttons-block">
                    {buttons}
                    <div className="clear" />
                </div>;
            }

            return (
                <div className={message.messageId + " message body" + additionalClasses}
                     data-id={"id" + message.messageId}>
                    <div className="feedback round-icon-block">
                        <i className={"round-icon " + message.cssClass}></i>
                    </div>

                    <div className="message content-area">
                        <div className="message date-time">{timestamp}</div>

                        <div className="message text-block" dangerouslySetInnerHTML={{__html:textMessage}}></div>
                        {buttonsCode}
                    </div>
                </div>
            )
        }
    }
});

module.exports = {
    GenericConversationMessage
};
