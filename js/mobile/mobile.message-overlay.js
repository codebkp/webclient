/**
 * Shows a custom message e.g. error or success message in a popup overlay
 */
mobile.messageOverlay = {

    /**
     * Shows the error overlay
     * @param {String} firstMessage The main message to be displayed
     * @param {String} optionalSecondMessage An optional second message to be displayed after the first
     */
    show: function(firstMessage, optionalSecondMessage) {

        'use strict';

        // Cache selectors
        var $overlay = $('#mobile-ui-error');
        var $firstMessage = $overlay.find('.first-message');
        var $optionalSecondMessage = $overlay.find('.optional-second-message');

        // Set the first message
        $firstMessage.text(firstMessage);

        // If there is a second message, set that
        if (typeof optionalSecondMessage !== 'undefined' && optionalSecondMessage) {
            $optionalSecondMessage.text(optionalSecondMessage);
        }

        // Initialise the OK/close button
        this.initConfirmOkButton($overlay);

        // Show the error overlay
        $overlay.removeClass('hidden');
    },

    /**
     * Initialise the OK button to close the error overlay
     * @param {Object} $overlay A cached selector for the error overlay
     */
    initConfirmOkButton: function($overlay) {

        'use strict';

        var $okButton = $overlay.find('.confirm-ok-button');

        // Add click/tap handler
        $okButton.off('tap').on('tap', function() {

            // Hide the error overlay
            $overlay.addClass('hidden');

            // Remove the loading spinner if on the Login page and came back from an error
            if (page === 'login') {
                $('.mobile.signin-button').removeClass('loading');
            }

            // Prevent clicking behind
            return false;
        });
    }
};
