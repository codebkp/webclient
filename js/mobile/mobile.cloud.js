/**
 * Functionality for rendering the mobile file manager (cloud drive view) and public folder links
 */
mobile.cloud = {

    /** A boolean flag to store whether the initial folder view has been displayed by the user or not */
    initialFolderOverlayShown: false,

    /** A dictionary of folder handles and the total number of files within that folder */
    folderAndFileCounts: null,

    /**
     * Initial rendering
     */
    renderLayout: function() {

        'use strict';

        // If a public folder link and the initial folder overlay has not been shown yet
        if (pfid && this.initialFolderOverlayShown === false) {

            // Show the initial folder overlay, the button for viewing in the browser
            // will trigger this function again to render the file manager view.
            this.renderInitialFolderOverlay();

            // Hide the loading progress
            loadingDialog.hide();
            loadingInitDialog.hide();

            // Don't render anything else for now
            return false;
        }

        // jQuery selectors
        var $fileManager = $('.mobile.file-manager-block');

        // Render the file manager header, folders, files and footer
        this.renderHeader();
        this.renderFoldersAndFiles();
        this.renderFooter();
        this.showEmptyCloudIfEmpty();

        // Init folder and file row handlers
        this.initFileRowClickHandler();
        this.initFolderRowClickHandler();

        // Initialise context menu on each row
        mobile.cloud.contextMenu.init();

        // Hide the loading progress
        loadingDialog.hide();
        loadingInitDialog.hide();

        // Show the file manager after everything is ready
        $fileManager.removeClass('hidden');

        // Set viewmode to show thumbnails and render thumbnails after everything else because it can take longer
        M.viewmode = 1;
        fm_thumbnails();
    },

    /**
     * Renders updates to the cloud drive without doing a full render, e.g. new
     * files being added by action packets or files being moved out of the folder
     */
    renderUpdate: function() {

        'use strict';

        // jQuery selectors
        var $fileManager = $('.mobile.file-manager-block');
        var $fileManagerRows = $fileManager.find('.fm-row .fm-scrolling');
        var $folderTemplateSelector = $fileManagerRows.find('.folder.template');
        var $fileTemplateSelector = $fileManagerRows.find('.file.template');

        var newNodesOutput = '';

        // Loop through new nodes
        for (var i = 0; i < newnodes.length; i++) {

            var node = newnodes[i];
            var nodeHandle = node.h;
            var nodeName = node.name;
            var nodeType = node.t;
            var nodeParentHandle = node.p;

            // If the new node does not have a parent handle that is the same as the current
            // view's node handle, then it's for a subfolder or something else so skip it
            if (M.currentdirid !== nodeParentHandle) {
                continue;
            }

            var $nodeTemplate = null;
            var $existingNode = $('#' + nodeHandle);

            // If folder type, render a folder
            if (nodeType === 1) {
                $nodeTemplate = this.updateFolderTemplate($folderTemplateSelector, node);
            }
            else {
                // Otherwise render a file
                $nodeTemplate = this.updateFileTemplate($fileTemplateSelector, node);
            }

            // Render common items
            $nodeTemplate.find('.fm-item-name').text(nodeName);
            $nodeTemplate.attr('data-handle', nodeHandle);
            $nodeTemplate.attr('id', nodeHandle);

            // If the node is already rendered and this is an update of it
            if ($existingNode.length > 0) {

                // Insert the updated node before the existing one, then remove the existing node
                $nodeTemplate.insertBefore($existingNode);
                $existingNode.remove();
            }
            else {
                // Otherwise append to the current output
                newNodesOutput += $nodeTemplate.prop('outerHTML');
            }
        }

        // Render the new nodes at the end of the existing ones
        $fileManagerRows.append(newNodesOutput);

        // Render the footer to update number of files/folders in the current folder, if empty show an icon and message
        this.showEmptyCloudIfEmpty();
        this.countAndUpdateSubFolderTotals();
        this.renderFooter();

        // Re-initialise click handlers
        this.initFileRowClickHandler();
        this.initFolderRowClickHandler();

        // Initialise context menu on each row
        mobile.cloud.contextMenu.init();

        // Set viewmode to show thumbnails and render thumbnails after everything else because it can take longer
        M.viewmode = 1;
        fm_thumbnails();
    },

    /**
     * After an action packet update to the cloud drive, this function
     * updates the folder and file count for each folder in the current view
     */
    countAndUpdateSubFolderTotals: function() {

        'use strict';

        // Loop through current view
        for (var i = 0; i < M.v.length; i++) {

            var node = M.v[i];
            var nodeHandle = node.h;
            var nodeType = node.t;

            // If folder type
            if (nodeType === 1) {

                var numOfFolders = node.td;
                var numOfFiles = node.tf;

                // Translate the text for 1 file/folder or x files/folders
                var foldersWording = numOfFolders === 1 ? l[834] : l[832].replace('[X]', numOfFolders);
                var filesWording = numOfFiles === 1 ? l[835] : l[833].replace('[X]', numOfFiles);

                // Find the existing node and update the number of folders and files
                $('#' + nodeHandle + ' .num-files').text(foldersWording + ', ' + filesWording);
            }
        }
    },

    /**
     * Removes a node from the current view if applicable, updates the footer with the new
     * file/folder count and also shows an empty cloud drive/folder message if applicable
     * @param {String} nodeHandle The handle of the node to be removed
     * @param {String} parentHandle The parent handle of the node to be removed
     */
    renderDelete: function(nodeHandle, parentHandle) {

        'use strict';

        // Remove the node if in the current view
        $('#' + nodeHandle).remove();

        // Update the file/folder count in the footer and show an Empty message and icon if no files
        mobile.cloud.showEmptyCloudIfEmpty();
        mobile.cloud.countAndUpdateSubFolderTotals();
        mobile.cloud.renderFooter();

        // If in the current folder and this got removed, then we need to go back up and open the parent folder
        if (M.currentdirid === nodeHandle || M.isCircular(nodeHandle, M.currentdirid) === true) {
            parentHandle = parentHandle || Object(M.getNodeByHandle(nodeHandle)).p || M.getNodeRoot(nodeHandle);
            M.openFolder(parentHandle);
        }
    },

    /**
     * Updates a node in the file manager to show if it has a public link or not
     * @param {String} nodeHandle The node handle of the item to be updated
     */
    updateLinkStatus: function(nodeHandle) {

        'use strict';

        // Find the current node row in the file manager
        var $nodeRow = $('#' + nodeHandle);

        // If the node exists in the current view, update it
        if ($nodeRow.length > 0) {
            var $icon = $nodeRow.find('.fm-icon.link');

            // If it is a public link
            if (typeof M.d[nodeHandle].shares !== 'undefined' && typeof M.d[nodeHandle].shares.EXP !== 'undefined') {

                // Show the link icon
                $icon.removeClass('hidden');
            }
            else {
                // Otherwise hide the link icon
                $icon.addClass('hidden');
            }
        }
    },

    /**
     * Renders the initital folder link overlay asking whether they want to open in the browser or app
     */
    renderInitialFolderOverlay: function() {

        'use strict';

        var $initialFolderView = $('.mobile.inital-folder-view');
        var $folderSize = $initialFolderView.find('.filesize');
        var $folderName = $initialFolderView.find('.filename');
        var $openInBrowserButton = $initialFolderView.find('.red-button.first');
        var $openInAppButton = $initialFolderView.find('.red-button.second');

        // Set the flag so it won't show again
        this.initialFolderOverlayShown = true;

        // Get the current folder name and size
        var currentFolder = M.d[M.currentdirid];
        var currentFolderSize = this.getFullSizeOfFolder();
        var currentFolderName = currentFolder.name;

        // Show the overlay
        $initialFolderView.removeClass('hidden');
        $folderSize.text(currentFolderSize);
        $folderName.text(currentFolderName);

        // If they choose to Open in Browser, then show the file manager
        $openInBrowserButton.off('tap').on('tap', function(event) {

            // Prevent default redirect to / path
            event.preventDefault();

            // Hide the overlay and render the layout
            $initialFolderView.addClass('hidden');
            mobile.cloud.renderLayout();
            return false;
        });

        // If they choose to Open in MEGA App
        $openInAppButton.off('tap').on('tap', function() {

            // Open the folder in the app
            mobile.downloadOverlay.redirectToApp($(this), M.currentdirid);
            return false;
        });
    },

    /**
     * Renders the header of the mobile file manager or public folder link
     */
    renderHeader: function() {

        'use strict';

        // Get selectors
        var $fileManagerHeader = $('.mobile.file-manager-block .fm-header');
        var $backButton = $fileManagerHeader.find('.fm-icon.back');
        var $cloudIcon = $fileManagerHeader.find('.fm-icon.cloud');
        var $uploadIcon = $fileManagerHeader.find('.fm-icon.upload');
        var $menuIcon = $fileManagerHeader.find('.fm-icon.menu');
        var $folderIcon = $fileManagerHeader.find('.fm-icon.folder');
        var $folderName = $fileManagerHeader.find('.fm-header-txt span');
        var $folderSize = $fileManagerHeader.find('.fm-folder-size');

        // Reset header to blank slate so only buttons/items are enabled as needed
        $backButton.addClass('hidden');
        $cloudIcon.addClass('hidden');
        $uploadIcon.addClass('hidden');
        $menuIcon.addClass('hidden');
        $fileManagerHeader.removeClass('folder-link');
        $folderIcon.addClass('hidden');
        $folderName.text('');
        $folderSize.addClass('hidden');

        // Get the current folder
        var currentFolder = M.d[M.currentdirid];

        // If the user is currently in a public folder link
        if (pfid) {

            // If this is the root folder link
            if (M.currentdirid === M.RootID) {

                // Get the full size of the folder including sub directories
                var fileSizesTotal = this.getFullSizeOfFolder();

                // Show a folder icon, the folder name and total size in the center
                $fileManagerHeader.addClass('folder-link');
                $folderIcon.removeClass('hidden');
                $folderSize.text(fileSizesTotal).removeClass('hidden');
            }
            else {
                // Otherwise show the back button
                mobile.showAndInitBackButton($backButton);
            }

            // Update the header with the current folder name
            $folderName.text(currentFolder.name);
        }
        else {
            // Otherwise if this is the root folder of the regular cloud drive, show the cloud icon and text
            if (M.currentdirid === M.RootID) {
                $cloudIcon.removeClass('hidden');
                // $uploadIcon.removeClass('hidden');    // ToDo: re-enable when finished
                $folderName.text(l[164]);               // Cloud Drive
            }
            else {
                // Otherwise if a subfolder of the cloud drive, show the back button and the folder name
                mobile.showAndInitBackButton($backButton);
                $folderName.text(currentFolder.name);
            }

            // Show the hamburger menu and initialise the upload button
            $menuIcon.removeClass('hidden');
            // mobile.upload.initUploadButton();         // ToDo: re-enable when finished
        }
    },

    /**
     * Sums up all the file sizes (including sub directories) in the folder link
     * @returns {String} Returns the size as a human readable string e.g. 3 KB or 3 MB
     */
    getFullSizeOfFolder: function() {

        'use strict';

        var fileSizesTotal = Object(M.d[M.RootID]).tb;

        // Format the text e.g. 3 KB or 3 MB
        var fileSizesTotalFormatted = numOfBytes(fileSizesTotal);
        var fileSizesTotalFormattedText = fileSizesTotalFormatted.size + ' ' + fileSizesTotalFormatted.unit;

        return fileSizesTotalFormattedText;
    },

    /**
     * Renders the files and folders in the mobile folder view
     */
    renderFoldersAndFiles: function() {

        'use strict';

        // jQuery selectors
        var $fileManager = $('.mobile.file-manager-block');
        var $fileManagerRows = $fileManager.find('.fm-row .fm-scrolling');
        var $folderTemplateSelector = $fileManagerRows.find('.folder.template');
        var $fileTemplateSelector = $fileManagerRows.find('.file.template');

        var output = '';

        // Loop through top level nodes in the current view (M.v)
        for (var i = 0; i < M.v.length; i++) {

            var node = M.v[i];
            var nodeHandle = node.h;
            var nodeName = node.name;
            var nodeType = node.t;

            var $nodeTemplate = null;

            // If folder type, render a folder
            if (nodeType === 1) {
                $nodeTemplate = this.updateFolderTemplate($folderTemplateSelector, node);
            }
            else {
                // Otherwise render a file
                $nodeTemplate = this.updateFileTemplate($fileTemplateSelector, node);
            }

            // If this is an undecryptable node
            if (typeof missingkeys[nodeHandle] !== 'undefined') {
                nodeName = nodeType === 1 ? l[8686] : l[8687];    // undecrypted folder/file
                $nodeTemplate.addClass('undecrypted');
            }

            // Render common items
            $nodeTemplate.find('.fm-item-name').text(nodeName);
            $nodeTemplate.attr('data-handle', nodeHandle);
            $nodeTemplate.attr('id', nodeHandle);

            // Update the current output
            output += $nodeTemplate.prop('outerHTML');
        }

        // Remove files and folders but not the templates so that it can be re-rendered
        $fileManager.find('.fm-item').not('.template').remove();

        // Render the output all at once
        $fileManagerRows.append(output);
    },

    /**
     * If the cloud drive or folder is empty this shows an icon and message in the current view
     */
    showEmptyCloudIfEmpty: function() {

        'use strict';

        // jQuery selectors
        var $fileManager = $('.mobile.file-manager-block');
        var $fileManagerRows = $fileManager.find('.fm-row .fm-scrolling');

        // Reset
        $fileManagerRows.removeClass('empty-cloud empty-folder');

        // If there are no items in the current view
        if (M.v.length === 0) {

            // If the root of the cloud add text "No files in your Cloud Drive"
            if (M.currentdirid === M.RootID) {
                $fileManagerRows.addClass('empty-cloud');
            }
            else {
                // Otherwise add text "Empty folder"
                $fileManagerRows.addClass('empty-folder');
            }
        }
    },

    /**
     * Updates the footer with the count of folders and files inside this folder
     */
    renderFooter: function() {

        'use strict';

        var $bottomInfoBar = $('.mobile.file-manager-block .fm-bottom');
        var numOfFolders = 0;
        var numOfFiles = 0;

        // Loop through top level nodes in the current view (M.v)
        for (var i = 0; i < M.v.length; i++) {

            var node = M.v[i];
            var nodeType = node.t;

            // Increment the total of folders
            if (nodeType === 1) {
                numOfFolders++;
            }
            else {
                // Increment the total of files
                numOfFiles++;
            }
        }

        // Change pluralisation e.g. 1 folder or x folders and 1 file or x files
        var folderWording = numOfFolders === 1 ? l[834] : l[832].replace('[X]', numOfFolders);
        var fileWording = numOfFiles === 1 ? l[835] : l[833].replace('[X]', numOfFiles);

        // Update the footer with the count of folders and files inside
        $bottomInfoBar.text(folderWording + ', ' + fileWording);
    },

    /**
     * Populate the template row for a folder
     * @param {Object} $templateSelector The jQuery selector for the template
     * @param {Object} node The node object with values
     * @returns {Object} A populated template jQuery object
     */
    updateFolderTemplate: function($templateSelector, node) {

        'use strict';

        var numOfFolders = node.td;
        var numOfFiles = node.tf;

        // Translate the text for 1 file/folder or x files/folders
        var foldersWording = numOfFolders === 1 ? l[834] : l[832].replace('[X]', numOfFolders);
        var filesWording = numOfFiles === 1 ? l[835] : l[833].replace('[X]', numOfFiles);

        // Clone the template
        var $template = $templateSelector.clone().removeClass('template');

        // Show the number of files in that folder
        $template.find('.num-files').text(foldersWording + ', ' + filesWording);

        // If in regular cloud drive (not a public folder link)
        if (!pfid) {

            // Enable the open folder, link and delete options and open context menu icon
            $template.find('.fm-item-link.open-folder').removeClass('hidden');
            $template.find('.fm-item-link.link').removeClass('hidden');
            $template.find('.fm-item-link.delete').removeClass('hidden');
            $template.find('.fm-icon.open-context-menu').removeClass('hidden');

            // Show the link icon if it already has a public link
            if (typeof node.shares !== 'undefined' && typeof node.shares.EXP !== 'undefined') {
                $template.find('.fm-icon.link').removeClass('hidden');
            }
        }

        return $template;
    },

    /**
     * Populate the template row for a file
     * @param {Object} $templateSelector The jQuery selector for the template
     * @param {Object} node The node object with values
     * @returns {Object} A populated template jQuery object
     */
    updateFileTemplate: function($templateSelector, node) {

        'use strict';

        // Format file size
        var sizeBytes = node.s;
        var sizeFormatted = numOfBytes(sizeBytes);

        // Use the modified timestamp if available, or the MEGA created timestamp, then format date as 12 January 2016
        var modifiedTimestamp = node.mtime || node.ts;
        var fileDate = time2date(modifiedTimestamp, 2);

        // Map the file extension back to the image icon
        var iconName = fileIcon(node);
        var iconPath = mobile.imagePath + iconName + '.png';

        // Update seen property so thumbnails will render
        node.seen = true;

        // Clone the template
        var $template = $templateSelector.clone().removeClass('template');

        // Update template
        $template.find('.file-size').text(sizeFormatted.size + ' ' + sizeFormatted.unit);
        $template.find('.date').text(fileDate);
        $template.removeClass('file-template');
        $template.find('.fm-item-img img').attr('src', iconPath);

        // If in regular cloud drive (not a public folder link)
        if (!pfid) {

            // Enable the open context menu, link and delete options
            $template.find('.fm-icon.open-context-menu').removeClass('hidden');
            $template.find('.fm-item-link.link').removeClass('hidden');
            $template.find('.fm-item-link.delete').removeClass('hidden');

            // Show the link icon if it already has a public link
            if (typeof node.shares !== 'undefined' && typeof node.shares.EXP !== 'undefined') {
                $template.find('.fm-icon.link').removeClass('hidden');
            }
        }

        return $template;
    },

    /**
     * Functionality for tapping on a file row which expands or hide the file options (Download / Link / Delete)
     */
    initFileRowClickHandler: function() {

        'use strict';

        var $fileManagerBlock = $('.mobile.file-manager-block');
        var $scrollBlock = $fileManagerBlock.find('.fm-scrolling');
        var $folderAndFileRows = $scrollBlock.find('.fm-item');
        var $fileRows = $folderAndFileRows.filter('.file');

        // If a file row is tapped
        $fileRows.off('tap').on('tap', function() {

            // Get the node handle and node
            var $currentFileRow = $(this);
            var nodeHandle = $currentFileRow.data('handle');
            var node = M.d[nodeHandle];
            var fileName = node.name;

            // If this is an image, load the preview slideshow, otherwise toggle the options
            if (is_image(fileName)) {
                mobile.slideshow.init(nodeHandle);
            }
            else {
                // Otherwise show the download overlay immediately
                mobile.downloadOverlay.showOverlay(nodeHandle);
            }

            // Prevent pre clicking one of the Open in Browser/App buttons
            return false;
        });
    },

    /**
     * Functionality for tapping a folder row which expands the row and shows an Open button
     */
    initFolderRowClickHandler: function() {

        'use strict';

        var $scrollBlock = $('.mobile.file-manager-block .fm-scrolling');
        var $folderAndFileRows = $scrollBlock.find('.fm-item');
        var $folderRows = $folderAndFileRows.filter('.folder');

        // If a folder row is tapped
        $folderRows.off('tap').on('tap', function() {

            // Get the node handle
            var $currentFolderRow = $(this);
            var nodeHandle = $currentFolderRow.data('handle');

            // Open the folder immediately
            M.openFolder(nodeHandle);

            // Prevent pre clicking one of the Open in Browser/App buttons
            return false;
        });
    },

    /**
     * Shows or hides the link icon in the file manager indicating if this file/folder has a public link
     * @param {String} nodeHandle The internal node handle
     */
    updateLinkIcon: function(nodeHandle) {

        'use strict';

        var node = M.d[nodeHandle];
        var $icon = $('#' + nodeHandle).find('.fm-icon.link');

        // If this has a public link, show the link icon
        if (node.ph) {
            $icon.removeClass('hidden');
        }
        else {
            // Otherwise hide it
            $icon.addClass('hidden');
        }
    }
};
