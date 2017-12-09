var React = require("react");
var ReactDOM = require("react-dom");
var MegaRenderMixin = require('./../../stores/mixins.js').MegaRenderMixin;
var ButtonsUI = require('./../../ui/buttons.jsx');


var EmojiAutocomplete = React.createClass({
    mixins: [MegaRenderMixin],
    data_emojis: null,
    getDefaultProps: function() {
        return {
            'requiresUpdateOnResize': true,
            'emojiSearchQuery': false,
            'disableCheckingVisibility': true,
            'maxEmojis': 12
        }
    },
    getInitialState: function() {
        return {
            'selected': 0
        };
    },

    preload_emojis: function() {
        var self = this;
        if (!self.loadingPromise) {
            self.loadingPromise = megaChat.getEmojiDataSet('emojis')
                .done(function (emojis) {
                    Soon(function() {
                        self.data_emojis = emojis;
                        self.safeForceUpdate();
                    });
                });
        };
    },
    unbindKeyEvents: function() {
        $(document).unbind('keydown.emojiAutocomplete' + this.getUniqueId());
    },
    bindKeyEvents: function() {
        var self = this;
        $(document).rebind('keydown.emojiAutocomplete' + self.getUniqueId(), function(e) {
            if (!self.props.emojiSearchQuery) {
                self.unbindKeyEvents();
                return;
            }

            var key = e.keyCode || e.which;


            if (!$(e.target).is("textarea")) {
                console.error("this should never happen.");
                return;
            }

            var selected = $.isNumeric(self.state.selected) ? self.state.selected : 0;
            var handled = false;
            if (key === 37 || key === 38) {
                // up/left
                selected = selected - 1;
                selected = selected < 0 ? self.maxFound - 1 : selected;
                self.setState({'selected': selected});
                handled = true;
            }
            else if (key === 39 || key === 40 || key === 9) {
                // down, right, tab
                selected = selected + 1;
                selected = selected >= self.props.maxEmojis ? 0 : selected;
                self.setState({'selected': selected});
                handled = true;
            }
            else if (key === 13) {
                // enter
                self.unbindKeyEvents();
                self.props.onSelect(false, ":" + self.found[selected].n + ":");
                handled = true;
            }
            else if (key === 27) {
                // esc
                self.unbindKeyEvents();
                self.props.onCancel();
                handled = true;
            }

            if (handled) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        });
    },
    componentDidUpdate: function() {
        if (!this.props.emojiSearchQuery) {
            this.unbindKeyEvents();
        }
        else {
            this.bindKeyEvents();
        }
    },
    componentWillUnmount: function() {
        this.unbindKeyEvents();
    },
    render: function() {
        var self = this;
        if (!self.props.emojiSearchQuery) {
            return null;
        }

        self.preload_emojis();

        if (self.loadingPromise && self.loadingPromise.state() === 'pending') {
            return <div className="textarea-autofill-bl">
                <div className="textarea-autofill-info">
                    {l[5533]}
                </div>
            </div>;
        }

        // strip "^:"
        var q = self.props.emojiSearchQuery.substr(1, self.props.emojiSearchQuery.length);

        var exactMatch = [];
        var partialMatch = [];
        var emojis = (self.data_emojis || []);
        for (var i = 0; i < emojis.length; i++) {
            var emoji = emojis[i];
            var match = emoji.n.indexOf(q);
            if (match !== -1) {
                if (match === 0) {
                    exactMatch.push(emoji);
                }
                else if (partialMatch.length < (self.props.maxEmojis - exactMatch.length)) {
                    partialMatch.push(emoji);
                }
            }
            if (exactMatch.length >= self.props.maxEmojis) {
                break;
            }
        };

        var found = exactMatch.concat(partialMatch).slice(0, self.props.maxEmojis);

        // explicit mem cleanup
        exactMatch = partialMatch = null;

        this.maxFound = found.length;
        this.found = found;

        if (!found || found.length === 0) {
            return null;
        }


        var emojisDomList = [];

        for (var i = 0; i < found.length; i++) {
            var meta = found[i];
            var filename = twemoji.convert.toCodePoint(meta.u);

            emojisDomList.push(
                <div className={"emoji-preview shadow " + (this.state.selected === i ? "active" : "")}
                     key={meta.n + "_" + (this.state.selected === i ? "selected" : "inselected")}
                     title={":" + meta.n + ":"}
                     onClick={function(e) {
                         self.props.onSelect(e, e.target.title);
                         self.unbindKeyEvents();
                     }}>
                    <img
                        width="20"
                        height="20"
                        className="emoji emoji-loading"
                        draggable="false"
                        alt={meta.u}
                        onLoad={(e) => {
                            e.target.classList.remove('emoji-loading');
                        }}
                        onError={(e) => {
                            e.target.classList.remove('emoji-loading');
                            e.target.classList.add('emoji-loading-error');
                        }}
                        src={
                            staticpath +
                            "images/mega/twemojis/2_v2/72x72/" +
                            filename + ".png"
                        }
                    />
                    <div className="emoji title">{":" + meta.n + ":"}</div>
                </div>
            );
        }

        return <div className="textarea-autofill-bl">
            <div className="textarea-autofill-info">
                <strong>tab</strong> or  <i className="small-icon tab-icon"></i> to navigate
                <i className="small-icon enter-icon left-pad"></i> to select <strong className="left-pad">esc</strong>
                to dismiss
            </div>
            <div className="textarea-autofill-emoji">

                {emojisDomList}

            </div>
        </div>;
    }
});

module.exports = {
    EmojiAutocomplete,
};

