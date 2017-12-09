var React = require("react");
var MegaRenderMixin = require("../../stores/mixins.js").MegaRenderMixin;
var RenderDebugger = require("../../stores/mixins.js").RenderDebugger;
var utils = require("../../ui/utils.jsx");


var ContactsListItem = React.createClass({
    mixins: [MegaRenderMixin, RenderDebugger],
    render: function() {
        var classString = "nw-conversations-item";

        var contact = this.props.contact;

        if (!contact) {
            return null;
        }

        classString += " " + this.props.megaChat.userPresenceToCssClass(
            contact.presence
        );

        return (
            <div>
                <div className={classString}
                     onClick={this.props.onContactClicked}>
                    <div className="nw-contact-status"></div>
                    <div className="nw-conversations-unread">0</div>
                    <div className="nw-conversations-name">
                        {M.getNameByHandle(contact.u)}
                    </div>
                </div>
            </div>
        );
    }
});


var ContactVerified = React.createClass({
    mixins: [MegaRenderMixin],
    render: function() {
        var self = this;

        var contact = this.props.contact;

        if (!contact) {
            return null;
        }

        var verifiedElement = null;

        if (u_authring && u_authring.Ed25519) {
            var verifyState = u_authring.Ed25519[contact.u] || {};
            verifiedElement = (
                verifyState.method >= authring.AUTHENTICATION_METHOD.FINGERPRINT_COMPARISON ?
                    <div className={"user-card-verified " + this.props.className}></div> : null
            );
        }
        else {
            var self = this;

            crypt.getPubEd25519(contact.u)
                .done(function() {
                    if(self.isMounted()) {
                        self.safeForceUpdate();
                    }
                })
        }


        return verifiedElement;
    }
});
var ContactPresence = React.createClass({
    mixins: [MegaRenderMixin],
    render: function() {
        var self = this;
        var contact = this.props.contact;
        if (!contact) {
            return null;
        }

        var pres = (this.props.megaChat ? this.props.megaChat : megaChat).userPresenceToCssClass(contact.presence);

        return <div className={"user-card-presence " + pres + " " + this.props.className}></div>;
    }
});

var _noAvatars = {};

var Avatar = React.createClass({
    mixins: [MegaRenderMixin, RenderDebugger],
    render: function() {
        var self = this;
        var contact = this.props.contact;

        if (!contact) {
            return null;
        }

        if (!contact.m && contact.email) {
            contact.m = contact.email;
        }

        var avatarMeta = useravatar.generateContactAvatarMeta(contact);

        var classes = (this.props.className ? this.props.className : 'small-rounded-avatar') + ' ' + contact.u;

        var letterClass = 'avatar-letter';

        var displayedAvatar;


        var verifiedElement = null;

        if (!this.props.hideVerifiedBadge) {
            verifiedElement = <ContactVerified contact={this.props.contact} className={this.props.verifiedClassName} />
        }

        if (!avatars[contact.u] && !_noAvatars[contact.u]) {
            useravatar.loadAvatar(contact.u)
                .done(function() {
                    self.safeForceUpdate();
                })
                .fail(function(e) {
                    _noAvatars[contact.u] = true;
                });
        }

        if(avatarMeta.type === "image") {
            displayedAvatar = <div className={classes} style={this.props.style}>
                {verifiedElement}
                <img src={avatarMeta.avatar} style={this.props.imgStyles}/>
            </div>;
        } else {
            classes += " color" + avatarMeta.avatar.colorIndex;

            displayedAvatar = <div className={classes} style={this.props.style}>{verifiedElement}
                <div className={letterClass} data-user-letter={avatarMeta.avatar.letters}></div></div>;

        }

        return displayedAvatar;
    }
});

var ContactCard = React.createClass({
    mixins: [MegaRenderMixin, RenderDebugger],
    getDefaultProps: function() {
        return {
            'dropdownButtonClasses': "default-white-button tiny-button",
            'dropdownIconClasses': "tiny-icon grey-down-arrow"
        }
    },
    specificShouldComponentUpdate: function(nextProps, nextState) {
        var self = this;

        var foundKeys = Object.keys(self.props);
        array.remove(foundKeys, 'dropdowns', true);

        var shouldUpdate = undefined;
        foundKeys.forEach(function(k) {
            if (typeof(shouldUpdate) === 'undefined') {
                if (!shallowEqual(nextProps[k], self.props[k])) {
                    shouldUpdate = false;
                }
                else {
                    shouldUpdate = true;
                }
            }
        });

        if (!shouldUpdate) {
            // ^^ if false or undefined.
            if (!shallowEqual(nextState, self.state)) {
                shouldUpdate = false;
            }
            else {
                shouldUpdate = true;
            }
        }
        if (!shouldUpdate && self.state.props.dropdowns && nextProps.state.dropdowns) {
            // ^^ if still false or undefined.
            if (self.state.props.dropdowns.map && nextProps.state.dropdowns.map) {
                var oldKeys = self.state.props.dropdowns.map(child => child.key);
                var newKeys = nextProps.state.dropdowns.map(child => child.key);
                if (!shallowEqual(oldKeys, newKeys)) {
                    shouldUpdate = true;
                }
            }
        }

        return shouldUpdate;
    },
    render: function() {
        var self = this;

        var contact = this.props.contact;
        if (!contact) {
            return null;
        }

        var pres =
            (this.props.megaChat ? this.props.megaChat : window.megaChat).userPresenceToCssClass(contact.presence);
        var avatarMeta = generateAvatarMeta(contact.u);

        var contextMenu;
        if (!this.props.noContextMenu) {
            var ButtonsUI = require('./../../ui/buttons.jsx');
            var DropdownsUI = require('./../../ui/dropdowns.jsx');

            var moreDropdowns = this.props.dropdowns ? $.extend([], this.props.dropdowns) : [];

            if (contact.c === 1) {
                if (moreDropdowns.length > 0) {
                    moreDropdowns.unshift(
                        <hr key="separator" />
                    );
                }
                moreDropdowns.unshift(
                    <DropdownsUI.DropdownItem
                            key="view" icon="human-profile" label={__(l[8866])} onClick={() => {
                                loadSubPage('fm/' + contact.u);
                            }} />
                );
            }
            else if (contact.c === 0) {
                if (moreDropdowns.length > 0) {
                    moreDropdowns.unshift(
                        <hr key="separator" />
                    );
                }
                moreDropdowns.unshift(
                    <DropdownsUI.DropdownItem
                        key="view" icon="human-profile" label={__(l[101])} onClick={() => {
                        loadingDialog.show();

                        asyncApiReq({
                            'a': 'uge',
                            'u': contact.u
                        })
                            .done(function(r) {
                                if (r) {
                                    var exists = false;
                                    Object.keys(M.opc).forEach(function (k) {
                                        if (!exists && M.opc[k].m === r) {
                                            exists = true;
                                            return false;
                                        }
                                    });

                                    if (exists) {
                                        closeDialog();
                                        msgDialog('warningb', '', l[7413]);
                                    } else {
                                        M.inviteContact(M.u[u_handle].m, r);
                                        var title = l[150];

                                        var msg = l[5898].replace('[X]', r);

                                        closeDialog();
                                        msgDialog('info', title, msg);
                                    }
                                }
                            })
                            .always(function() {
                                loadingDialog.hide();
                            });
                    }} />
                );
            }

            if (moreDropdowns.length > 0) {
                contextMenu = <ButtonsUI.Button
                    className={self.props.dropdownButtonClasses}
                    icon={self.props.dropdownIconClasses}
                    disabled={moreDropdowns.length === 0 || self.props.dropdownDisabled}>
                    <DropdownsUI.Dropdown className="contact-card-dropdown"
                                          positionMy="right top"
                                          positionAt="right bottom"
                                          vertOffset={4}
                                          noArrow={true}
                    >
                        {moreDropdowns}
                    </DropdownsUI.Dropdown>
                </ButtonsUI.Button>;
            }
        }

        return <div
                    className={
                        "contacts-info body " +
                        (pres === "offline" ? "offline" : "") +
                        (this.props.className ? " " + this.props.className : "")
                    }
                    onClick={(e) => {
                        if (self.props.onClick) {
                            self.props.onClick(contact, e);
                        }
                    }}
                    onDoubleClick={(e) => {
                        if (self.props.onDoubleClick) {
                            self.props.onDoubleClick(contact, e);
                        }
                    }}
                    style={self.props.style}
                    >
                <ContactPresence contact={contact} className={this.props.presenceClassName}/>
                <Avatar contact={contact} className="small-rounded-avatar" />

                {contextMenu}

                <div className="user-card-data">
                    <div className="user-card-name light">
                        {this.props.namePrefix ? this.props.namePrefix : null}{M.getNameByHandle(contact.u)}
                    </div>
                    <div className="user-card-email">{contact.m}</div>
                </div>
            </div>;
    }
});

var ContactPickerWidget = React.createClass({
    mixins: [MegaRenderMixin],
    getInitialState: function() {
        return {
            'searchValue': '',
            'selected': false,
        }
    },
    getDefaultProps: function() {
        return {
            multipleSelectedButtonLabel: false,
            singleSelectedButtonLabel: false,
            nothingSelectedButtonLabel: false
        }
    },
    onSearchChange: function(e) {
        var self = this;
        self.setState({searchValue: e.target.value});
    },
    render: function() {
        var self = this;

        var contacts = [];

        var footer = null;

        if (self.props.multiple) {
            var onSelectDoneCb = (e) => {
                e.preventDefault();
                e.stopPropagation();

                $(document).trigger('closeDropdowns');

                if (self.props.onSelectDone) {
                    self.props.onSelectDone(self.state.selected);
                }
            };

            if (!self.state.selected || self.state.selected.length === 0) {
                footer = <div className="fm-dialog-footer">
                    <div className="fm-dialog-footer-txt">{
                        self.props.nothingSelectedButtonLabel ?
                            self.props.nothingSelectedButtonLabel
                            :
                            __(l[8889])
                    }</div>
                </div>;
            }
            else if (self.state.selected.length === 1) {
                footer = <div className="contacts-search-footer">
                    <div className="fm-dialog-footer">
                        <a href="javascript:;" className="default-white-button right" onClick={onSelectDoneCb}>
                            {self.props.singleSelectedButtonLabel ? self.props.singleSelectedButtonLabel : l[5885]}
                        </a>
                    </div>
                </div>
            }
            else if (self.state.selected.length > 1) {
                footer = <div className="contacts-search-footer">
                    <div className="fm-dialog-footer">
                        <a href="javascript:;" className="default-white-button right" onClick={onSelectDoneCb}>
                            {
                                self.props.multipleSelectedButtonLabel ?
                                    self.props.multipleSelectedButtonLabel
                                    :
                                    __(l[8890])
                            }
                        </a>
                    </div>
                </div>
            }
        }


        self.props.contacts.forEach(function(v, k) {
            if (self.props.exclude && self.props.exclude.indexOf(v.u) > -1) {
                // continue;
                return;
            }

            var pres = self.props.megaChat.getPresence(
                v.u
            );

            if (v.c != 1 || v.u == u_handle) {
                return;
            }

            var avatarMeta = generateAvatarMeta(v.u);

            if (self.state.searchValue && self.state.searchValue.length > 0) {
                // DON'T add to the contacts list if the contact's name or email does not match the search value
                if (
                    avatarMeta.fullName.toLowerCase().indexOf(self.state.searchValue.toLowerCase()) === -1 &&
                    v.m.toLowerCase().indexOf(self.state.searchValue.toLowerCase()) === -1
                ) {
                    return;
                }
            }


            if (pres === "chat") {
                pres = "online";
            }

            var selectedClass = "";
            if (self.state.selected && self.state.selected.indexOf(v.u) !== -1) {
                selectedClass = "selected";
            }
            contacts.push(
                <ContactCard
                    contact={v}
                    className={"contacts-search " + selectedClass}

                    onClick={(contact, e) => {
                        var contactHash = contact.u;

                        // differentiate between a click and a double click.
                        if (contactHash === self.lastClicked && (new Date() - self.clickTime) < 500) {
                            // is a double click
                            if (self.props.onSelected) {
                                self.props.onSelected([contactHash]);
                            }
                            self.props.onSelectDone([contactHash]);
                            return;
                        }
                        else {
                            var selected = clone(self.state.selected || []);

                            // is a single click
                            if (selected.indexOf(contactHash) === -1) {
                                selected.push(contactHash);
                                if (self.props.onSelected) {
                                    self.props.onSelected(selected);
                                }
                            }
                            else {
                                array.remove(selected, contactHash);
                                if (self.props.onSelected) {
                                    self.props.onSelected(selected);
                                }
                            }
                            self.setState({'selected': selected});
                        }
                        self.clickTime = new Date();
                        self.lastClicked = contactHash;
                    }}
                    noContextMenu={true}
                    key={v.u}
                />
            );
        });

        var innerDivStyles = {};

        if (contacts.length < 6) {
            innerDivStyles['height'] = Math.max(48, contacts.length * 48);
            innerDivStyles['overflow'] = "visible";
        }

        if (contacts.length === 0) {
            var noContactsMsg = "";
            if (M.u.length < 2) {
                noContactsMsg = __(l[8877]);
            }
            else {
                noContactsMsg = __(l[8878]);
            }

            contacts = <em>{noContactsMsg}</em>;
        }


        return <div className={this.props.className}>
            <div className={"contacts-search-header " + this.props.headerClasses}>
                <i className="small-icon search-icon"></i>
                <input
                    type="search"
                    placeholder={__(l[8010])}
                    ref="contactSearchField"
                    onChange={this.onSearchChange}
                    value={this.state.searchValue}
                />
            </div>

            <utils.JScrollPane className="contacts-search-scroll" selected={this.state.selected}>
                <div style={innerDivStyles}>
                    {contacts}
                </div>
            </utils.JScrollPane>

            {footer}
        </div>;
    }
});

module.exports = {
    ContactsListItem,
    ContactCard,
    Avatar,
    ContactPickerWidget,
    ContactVerified,
    ContactPresence
};
