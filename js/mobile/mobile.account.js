/**
 * Functionality for the mobile My Account section
 */
mobile.account = {

    /**
     * Initialise the page
     */
    init: function() {

        'use strict';

        // If not logged in, return to the login page
        if (typeof u_attr === 'undefined') {
            loadSubPage('login');
            return false;
        }

        // Cache selectors
        var $page = $('.mobile.my-account-page');

        // Initialise functionality
        mobile.account.displayAvatarAndNameDetails($page);
        mobile.account.displayProPlanDetails($page);
        mobile.account.fetchAndDisplayStorageUsage($page);
        mobile.account.initUpgradeAccountButton($page);
        mobile.account.initAchievementsButton($page);
        mobile.account.fetchSubscriptionInformation($page);

        // Initialise the top menu
        topmenuUI();

        // Show the account page content
        $page.removeClass('hidden');

        // Add a server log
        api_req({ a: 'log', e: 99672, m: 'Mobile web My Account page accessed' });
    },

    /**
     * Displays the user's avatar, name and email
     * @param {String} $page The jQuery selector for the current page
     */
    displayAvatarAndNameDetails: function($page) {

        'use strict';

        // Cache selectors
        var $avatarNameBlock = $page.find('.avatar-name-block');
        var $avatar = $avatarNameBlock.find('.main-avatar');
        var $userName = $avatarNameBlock.find('.user-name');
        var $userEmail = $avatarNameBlock.find('.user-email');

        // Generate the avatar from the user handle
        var avatar = useravatar.contact(u_handle, '', 'div');

        // Show the user's avatar and name
        $avatarNameBlock.removeClass('hidden');
        $avatar.safeHTML(avatar);
        $avatar.find('.avatar').addClass('small-rounded-avatar');
        $userName.text(u_attr.name);
        $userEmail.text(u_attr.email);
    },

    /**
     * Display the Pro plan details
     * @param {String} $page The jQuery selector for the current page
     */
    displayProPlanDetails: function($page) {

        'use strict';

        // Get the Pro name and icon class
        var proNum = u_attr.p;
        var proClassName = proNum >= 1 ? 'pro' + proNum : 'free';
        var proPlanName = pro.getProPlanName(proNum);

        // Show the Pro name and icon class
        $page.find('.icon.pro-mini').addClass(proClassName);
        $page.find('.pro-plan-name').text(proPlanName);
    },

    /**
     * Fetch and display the user's storage usage
     */
    fetchAndDisplayStorageUsage: function() {

        'use strict';

        // Show loading dialog until API request completes
        loadingDialog.show();

        // Make API request to fetch the user's storage usage
        api_req({ a: 'uq', strg: 1 }, {
            callback: function(result) {

                loadingDialog.hide();

                // If response was successful
                if (typeof result === 'object') {

                    // jQuery selectors
                    var $accountUsageBlock = $('.mobile.account-usage-block');
                    var $usedStorage = $accountUsageBlock.find('.used');
                    var $totalStorage = $accountUsageBlock.find('.total');
                    var $percentageUsed = $accountUsageBlock.find('.percentage');

                    // Format percentage used to X.XX%, used space to 'X.X GB' and total space to 'X GB' format
                    var spaceUsed = result.cstrg;
                    var spaceTotal = result.mstrg;
                    var percentageUsed = spaceUsed / spaceTotal * 100;
                    var percentageUsedText = percentageUsed.toFixed(2);
                    var spaceUsedText = bytesToSize(spaceUsed, 1);
                    var spaceTotalText = bytesToSize(spaceTotal, 0);

                    // Display the used and total storage e.g. 0.02% (4.8 GB of 200 GB)
                    $usedStorage.text(spaceUsedText);
                    $totalStorage.text(spaceTotalText);
                    $percentageUsed.text(percentageUsedText);

                    // Colour text red and show a message if over quota, or use orange if close to using all quota
                    if (percentageUsed >= 100) {
                        $accountUsageBlock.addClass('over-quota');
                    }
                    else if (percentageUsed >= 85) {
                        $accountUsageBlock.addClass('warning');
                    }
                }
            }
        });
    },

    /**
     * Initialise the Upgrade Account button
     * @param {String} $page The jQuery selector for the current page
     */
    initUpgradeAccountButton: function($page) {

        'use strict';

        // On clicking/tapping the Upgrade Account button
        $page.find('.account-upgrade-block').off('tap').on('tap', function() {

            // Load the Pro page
            loadSubPage('pro');
            return false;
        });
    },

    /**
     * Initialise the Achievements button to see the main Achievements page
     * @param {String} $page The jQuery selector for the current page
     */
    initAchievementsButton: function($page) {

        'use strict';

        var $achievementsButton = $page.find('.account-achievements-block');

        // If achievements are enabled, show the button
        if (typeof u_attr.flags.ach !== 'undefined' && u_attr.flags.ach) {
            $achievementsButton.removeClass('hidden');
        }

        // On clicking/tapping the Achievements button
        $achievementsButton.off('tap').on('tap', function() {

            // Hide the account page
            $page.addClass('hidden');

            // Render the achievements information
            loadSubPage('fm/account/achievements');
            return false;
        });
    },

    /**
     * Displays the bonus information and achievement status
     * @param {String} $page The jQuery selector for the current page
     */
    fetchSubscriptionInformation: function($page) {

        'use strict';

        // Show a loading dialog while the data is fetched from the API
        loadingDialog.show();

        // Fetch all account data from the API
        M.accountData(function() {

            // Hide the loading dialog after request completes
            loadingDialog.hide();

            mobile.account.renderCancelSubscriptionButton($page);
        });
    },

    /**
     * Initialise the Cancel Subscription button and only show it if they have a subscription
     * @param {String} $page The jQuery selector for the current page
     */
    renderCancelSubscriptionButton: function($page) {

        'use strict';

        // Cache selector
        var $cancelSubscriptionBlock = $page.find('.account-cancel-subscription-block');

        /*/ Mock data for testing
        u_attr.p = 3;                       // Pro level
        M.account.stype = 'S';              // Subscription
        M.account.srenew = [1639480953];    // Expiry timestamp
        M.account.sgw = ['Credit Card'];    // Payment type
        M.account.sgwids = [16];            // Gateway
        //*/

        // If they have Pro and if they have a recurring Credit Card subscription
        if (u_attr.p && M.account.stype === 'S') {

            // Get the date their subscription will renew, the payment type and gateway
            var timestamp = M.account.srenew.length > 0 ? M.account.srenew[0] : 0;    // Timestamp e.g. 1493337569
            var gatewayId = M.account.sgwids.length > 0 ? M.account.sgwids[0] : null; // Gateway ID e.g. 15, 16 etc

            // Display the date their subscription will renew if known
            if (timestamp > 0) {

                // Convert timestamp to date format yyyy-mm-dd
                var dateString = time2date(timestamp, 1);

                // Set text on the button to: Renews yyyy-mm-dd
                $cancelSubscriptionBlock.find('.subscription-text').text(l[6971] + ' ' + dateString);
            }

            // If Apple or Google subscription (see pro.getPaymentGatewayName function for codes)
            if (gatewayId === 2 || gatewayId === 3) {

                // Show the button, which when clicked will tell them they need to cancel their plan off-site
                mobile.account.initShowSubscriptionInfoOverlay($page);
            }

            // Otherwise if ECP or Sabadell
            else if (gatewayId === 16 || gatewayId === 17) {

                // Show a loading dialog while the data is fetched from the API
                loadingDialog.show();

                // Check if there are any active subscriptions
                // ccqns = Credit Card Query Number of Subscriptions
                api_req({ a: 'ccqns' }, {
                    callback: function(numOfSubscriptions) {

                        /*/ Mock data for testing
                        numOfSubscriptions = 1;
                        //*/

                        // Hide the loading dialog after request completes
                        loadingDialog.hide();

                        // If there is an active subscription
                        if (numOfSubscriptions > 0) {

                            // Show and initialise the Cancel Subscription confirmation overlay
                            mobile.account.initShowCancelSubscriptionConfirmOverlay($page);
                        }
                    }
                });
            }
        }
    },

    /**
     * Show an info dialog for Google/Apple subscription users on how they can cancel their subscription off-site
     * @param {String} $page The jQuery selector for the current page
     */
    initShowSubscriptionInfoOverlay: function($page) {

        'use strict';

        // Cache selectors
        var $cancelSubscriptionBlock = $page.find('.account-cancel-subscription-block');
        var $cancelSubscriptionInfoOverlay = $('.mobile.cancel-subscription-information-overlay');
        var $confirmButton = $cancelSubscriptionInfoOverlay.find('.confirm-ok-button');

        // Show the Cancel Subscription button
        $cancelSubscriptionBlock.removeClass('hidden');

        // On click/tap of the Cancel Subscription button
        $cancelSubscriptionBlock.off('tap').on('tap', function() {

            // Show message in an overlay
            $cancelSubscriptionInfoOverlay.removeClass('hidden');
            return false;
        });

        // Add click/tap handler
        $confirmButton.off('tap').on('tap', function() {

            // Hide the error overlay
            $cancelSubscriptionInfoOverlay.addClass('hidden');
            return false;
        });
    },

    /**
     * Show an overlay asking the user if they are sure they want to cancel their subscription
     * @param {String} $page The jQuery selector for the current page
     */
    initShowCancelSubscriptionConfirmOverlay: function($page) {

        'use strict';

        // Cache selectors
        var $cancelSubscriptionButton = $page.find('.account-cancel-subscription-block');
        var $cancelSubscriptionOverlay = $('.mobile.cancel-subscription-overlay');
        var $confirmButton = $cancelSubscriptionOverlay.find('.confirm-ok-button');
        var $closeButton = $cancelSubscriptionOverlay.find('.close-button');

        // On clicking/tapping the Cancel Subscription button
        $cancelSubscriptionButton.off('tap').on('tap', function() {

            // Show Cancel Subscription overlay
            $cancelSubscriptionOverlay.removeClass('hidden');
            return false;
        });

        // Add click/tap handler for the Confirm button to cancel their subscription
        $confirmButton.off('tap').on('tap', function() {

            // Show a loading dialog while the data is fetched from the API
            loadingDialog.show();

            // Cancel the user's subscription/s (cccs = Credit Card Cancel Subscriptions, r = reason)
            api_req({ a: 'cccs', r: 'No reason (automated mobile web cancel subscription)' }, {
                callback: function() {

                    // Hide the loading dialog after request completes
                    loadingDialog.hide();

                    // Hide the Cancel Subscription button and overlay
                    $cancelSubscriptionButton.addClass('hidden');
                    $cancelSubscriptionOverlay.addClass('hidden');
                }
            });

            // Prevent double taps
            return false;
        });

        // On clicking/tapping the Close button
        $closeButton.off('tap').on('tap', function() {

            // Hide the overlay
            $cancelSubscriptionOverlay.addClass('hidden');
            return false;
        });

        // Show the Cancel Subscription button
        $cancelSubscriptionButton.removeClass('hidden');
    }
};
