var React = require("react");
var utils = require("./utils.jsx");
var MegaRenderMixin = require("../stores/mixins.js").MegaRenderMixin;
var RenderDebugger = require("../stores/mixins.js").RenderDebugger;
var ContactsUI = require('./../chat/ui/contacts.jsx');
var PerfectScrollbar = require('./perfectScrollbar.jsx').PerfectScrollbar;

var Dropdown = React.createClass({
    mixins: [MegaRenderMixin],
    getInitialState: function() {
        return {}
    },
    getDefaultProps: function() {
        return {
            'requiresUpdateOnResize': true,
        };
    },
    componentWillUpdate: function(nextProps, nextState) {
        if (this.props.active != nextProps.active) {
            this.onActiveChange(nextProps.active)
        }
    },
    specificShouldComponentUpdate: function(nextProps, nextState) {
        if (this.props.active != nextProps.active) {
            if (this.props.onBeforeActiveChange) {
                this.props.onBeforeActiveChange(nextProps.active);
            }
            return true;
        }
        else if (this.props.focused != nextProps.focused) {
            return true;
        }
        else if (this.state && this.state.active != nextState.active) {
            return true;
        }
        else {
            // not sure, leave to the render mixing to decide.
            return undefined;
        }
    },
    onActiveChange: function(newVal) {
        if (this.props.onActiveChange) {
            this.props.onActiveChange(newVal);
        }
    },
    componentDidUpdate: function() {
        var self = this;

        if (this.props.active === true) {
            if (this.getOwnerElement()) {
                var $element = $(this.popupElement);
                var positionToElement = $('.button.active:visible');
                var offsetLeft = 0;
                var $container = $element.closest('.jspPane:first');

                if ($container.size() == 0) {
                    $container = $(document.body);
                }

                $element.css('margin-left','');

                $element.position({
                    of: positionToElement,
                    my: self.props.positionMy ? self.props.positionMy : "center top",
                    at: self.props.positionAt ? self.props.positionAt : "center bottom",
                    collision: "flip flip",
                    within: $container,
                    using: function (obj, info) {
                        var vertOffset = 0;
                        var horizOffset = 0;

                        if (!self.props.noArrow) {
                            if (info.vertical != "top") {
                                $(this)
                                    .removeClass("up-arrow")
                                    .addClass("down-arrow");
                            }
                            else {
                                $(this)
                                    .removeClass("down-arrow")
                                    .addClass("up-arrow");
                            }

                            var $arrow = $('.dropdown-white-arrow', $element);
                            vertOffset += (info.vertical == "top" ? $arrow.outerHeight() : 0);
                        }


                        if (self.props.vertOffset) {
                           vertOffset += (self.props.vertOffset * (info.vertical == "top" ? 1 : -1));
                        }

                        if (self.props.horizOffset) {
                            horizOffset += self.props.horizOffset;
                        }


                        $(this).css({
                            left: (obj.left + (offsetLeft ? offsetLeft/2 : 0) + horizOffset) + 'px',
                            top: (obj.top + vertOffset + 'px')
                        });
                    }
                });
            }
        }
    },
    componentWillUnmount: function() {
        if (this.props.active) {
            // fake an active=false so that any onActiveChange handlers would simply trigger back UI to the state
            // in which this element is not active any more (since it would be removed from the DOM...)
            this.onActiveChange(false);
        }
    },
    renderChildren: function () {
        var self = this;

        return React.Children.map(this.props.children, function (child) {
            if (child) {
                return React.cloneElement(child, {
                    active: self.props.active || self.state.active
                });
            }
            else {
                return null;
            }
        }.bind(this))
    },
    render: function() {
        if (this.props.active !== true) {


            return null;
        }
        else {
            var classes = (
                "dropdown body " + (!this.props.noArrow ? "dropdown-arrow up-arrow" : "") + " " + this.props.className
            );

            var styles;

            // calculate and move the popup arrow to the correct position.
            if (this.getOwnerElement()) {
                styles = {
                    'zIndex': 123,
                    'position': 'absolute',
                    'width': this.props.styles ? this.props.styles.width : undefined
                };
            }

            var self = this;

            var child = null;

            if (this.props.children) {
                child = <div>{self.renderChildren()}</div>;
            }
            else if (this.props.dropdownItemGenerator) {
                child = this.props.dropdownItemGenerator(this);
            }
            else {
                child = null;
            }


            return <utils.RenderTo element={document.body} className={classes} style={styles}
                    popupDidMount={(popupElement) => {
                        self.popupElement = popupElement;
                    }}
                    popupWillUnmount={(popupElement) => {
                        delete self.popupElement;
                    }}>
                    <div>
                        {!this.props.noArrow ? <i className="dropdown-white-arrow"></i> : null}
                        {child}
                    </div>
                </utils.RenderTo>;
        }
    }
});


var DropdownContactsSelector = React.createClass({
    mixins: [MegaRenderMixin],
    getDefaultProps: function() {
        return {
            requiresUpdateOnResize: true
        };
    },
    getInitialState: function() {
        return {
            'selected': this.props.selected ? this.props.selected : []
        }
    },
    specificShouldComponentUpdate: function(nextProps, nextState) {
        if (this.props.active != nextProps.active) {
            return true;
        }
        else if (this.props.focused != nextProps.focused) {
            return true;
        }
        else if (this.state && this.state.active != nextState.active) {
            return true;
        }
        else if (this.state && JSON.stringify(this.state.selected) != JSON.stringify(nextState.selected)) {
            return true;
        }
        else {
            // not sure, leave to the render mixing to decide.
            return undefined;
        }
    },
    onSelected: function(nodes) {
        this.setState({'selected': nodes});
        if (this.props.onSelected) {
            this.props.onSelected(nodes);
        }
        this.forceUpdate();
    },
    onSelectClicked: function() {
        this.props.onSelectClicked();
    },
    render: function() {
        var self = this;

        return <Dropdown className={"popup contacts-search " + this.props.className}
                         active={this.props.active}
                         closeDropdown={this.props.closeDropdown}
                         ref="dropdown"
                         positionMy={this.props.positionMy}
                         positionAt={this.props.positionAt}
                >
                <ContactsUI.ContactPickerWidget
                    active={this.props.active}
                    className="popup contacts-search"
                    contacts={this.props.contacts}
                    megaChat={this.props.megaChat}
                    exclude={this.props.exclude}
                    multiple={this.props.multiple}
                    onSelectDone={this.props.onSelectDone}
                    multipleSelectedButtonLabel={this.props.multipleSelectedButtonLabel}
                    singleSelectedButtonLabel={this.props.singleSelectedButtonLabel}
                    nothingSelectedButtonLabel={this.props.nothingSelectedButtonLabel}
                    />
        </Dropdown>;
    }
});

var DropdownItem = React.createClass({
    mixins: [MegaRenderMixin],
    getDefaultProps: function() {
        return {
            requiresUpdateOnResize: true
        };
    },
    getInitialState: function() {
        return {'isClicked': false}
    },
    renderChildren: function () {
        var self = this;
        return React.Children.map(this.props.children, function (child) {
            return React.cloneElement(child, {
                active: self.state.isClicked,
                closeDropdown: function() {
                    self.setState({'isClicked': false});
                }
            });
        }.bind(this))
    },
    onClick: function(e) {
        var self = this;

        if (this.props.children) {
            self.setState({'isClicked': !self.state.isClicked});

            e.stopPropagation();
            e.preventDefault();
        }
    },
    render: function() {
        var self = this;

        var icon;
        if (this.props.icon) {
            icon = <i className={"small-icon " + this.props.icon}></i>
        }
        var label;
        if (this.props.label) {
            label = this.props.label;
        }

        var child = null;

        child = <div>
                {self.renderChildren()}
            </div>;

        return <div
                    className={"dropdown-item " + self.props.className}
                    onClick={self.props.onClick ? (e) => {
                        $(document).trigger('closeDropdowns');
                        self.props.onClick(e);
                    } : self.onClick}
                >
                    {icon}
                    {label}
                    {child}
                </div>;
    }
});

module.exports = window.DropdownsUI = {
    Dropdown,
    DropdownItem,
    DropdownContactsSelector
};
