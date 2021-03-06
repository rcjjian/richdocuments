/*globals $,OC,fileDownloadPath,t,document,odf,alert,require,dojo,runtime,Handlebars */

$.widget('oc.documentGrid', {
	options : {
		context : '.documentslist',
		documents : {},
		sessions : {},
		members : {}
	},

	render : function(fileId){
		var that = this;
		jQuery.when(this._load(fileId))
			.then(function(){
				that._render();
				documentsMain.renderComplete = true;
			});
	},

	_load : function (fileId){
		documentsMain.initSession();
	},

	_render : function (data){
		var that = this,
			documents = data && data.documents || this.options.documents,
			sessions = data && data.sessions || this.options.sessions,
			members = data && data.members || this.options.members,
			hasDocuments = false
		;

		$(this.options.context + ' .document:not(.template,.progress)').remove();

		if (documentsMain.loadError) {
			$(this.options.context).after('<div id="errormessage">'
				+ '<p>' + documentsMain.loadErrorMessage + '</p><p>'
				+ documentsMain.loadErrorHint
				+ '</p></div>'
			);
			return;
		}
	}
});

$.widget('oc.documentOverlay', {
	options : {
		parent : 'document.body'
	},
	_create : function (){
		$(this.element).hide().appendTo(document.body);
	},
	show : function(){
		$(this.element).fadeIn('fast');
	},
	hide : function(){
		$(this.element).fadeOut('fast');
	}
});

var documentsMain = {
	isEditorMode : false,
	isViewerMode: false,
	ready :false,
	fileName: null,
	baseName: null,
	canShare : false,
	canEdit: false,
	loadError : false,
	loadErrorMessage : '',
	loadErrorHint : '',
	renderComplete: false, // false till page is rendered with all required data about the document(s)
	toolbar : '<div id="ocToolbar"><div id="ocToolbarInside"></div><span id="toolbar" class="claro"></span></div>',

	// generates docKey for given fileId
	_generateDocKey: function(wopiFileId) {
		var ocurl = OC.generateUrl('apps/richdocuments/wopi/files/{file_id}', {file_id: wopiFileId});
		if (richdocuments_canonical_webroot) {
			if (!richdocuments_canonical_webroot.startsWith('/'))
				richdocuments_canonical_webroot = '/' + richdocuments_canonical_webroot;

			ocurl = ocurl.replace(OC.webroot, richdocuments_canonical_webroot);
		}

		return ocurl;
	},

	UI : {
		/* Editor wrapper HTML */
		container : '<div id="mainContainer" class="claro">' +
					'</div>',

		viewContainer: '<div id="revViewerContainer" class="claro">' +
					   '<div id="revViewer"></div>' +
					   '</div>',

		revHistoryContainerTemplate: '<div id="revPanelContainer" class="loleaflet-font">' +
			'<div id="revPanelHeader">' +
			'<h2>Revision History</h2>' +
			'<span>{{filename}}</span>' +
			'<a class="closeButton"><img src={{closeButtonUrl}} width="22px" height="22px"></a>' +
			'</div>' +
			'<div id="revisionsContainer" class="loleaflet-font">' +
			'<ul></ul>' +
			'</div>' +
			'<input type="button" id="show-more-versions" class="loleaflet-font" value="{{moreVersionsLabel}}" />' +
			'</div>',

		revHistoryItemTemplate: '<li>' +
			'<a href="{{downloadUrl}}" class="downloadVersion has-tooltip" title="' + t('richdocuments', 'Download this revision') + '"><img src="{{downloadIconUrl}}" />' +
			'<a class="versionPreview"><span class="versiondate has-tooltip" title="{{formattedTimestamp}}">{{relativeTimestamp}}</span></a>' +
			'<a href="{{restoreUrl}}" class="restoreVersion has-tooltip" title="' + t('richdocuments', 'Restore this revision') + '"><img src="{{restoreIconUrl}}" />' +
			'</a>' +
			'</li>',

		/* Previous window title */
		mainTitle : '',
		/* Number of revisions already loaded */
		revisionsStart: 0,

		init : function(){
			documentsMain.UI.mainTitle = parent.document.title;
		},

		showViewer: function(fileId, title){
			// remove previous viewer, if open, and set a new one
			if (documentsMain.isViewerMode) {
				$('#revViewer').remove();
				$('#revViewerContainer').prepend($('<div id="revViewer">'));
			}

			var ocurl = documentsMain._generateDocKey(fileId);
			// WOPISrc - URL that loolwsd will access (ie. pointing to ownCloud)
			var wopiurl = window.location.protocol + '//' + window.location.host + ocurl;

			// urlsrc - the URL from discovery xml that we access for the particular
			// document; we add various parameters to that.
			// The discovery is available at
			//	 https://<loolwsd-server>:9980/hosting/discovery
			var urlsrc = documentsMain.urlsrc +
				"WOPISrc=" + wopisrc +
				"&title=" + encodeURIComponent(title) +
				"&lang=" + OC.getLocale().replace('_', '-') + // loleaflet expects a BCP47 language tag syntax
				"&closebutton=1" +
				"&revisionhistory=1";
			if (!documentsMain.canEdit || action === "view") {
				urlsrc += "&permission=readonly";
			}

			// access_token - must be passed via a form post
			var access_token = encodeURIComponent(documentsMain.token);

			// form to post the access token for WOPISrc
			var form = '<form id="loleafletform" name="loleafletform" target="loleafletframe" action="' + urlsrc + '" method="post">' +
				'<input name="access_token" value="' + access_token + '" type="hidden"/></form>';

			// iframe that contains the Collabora Online
			var frame = '<iframe id="loleafletframe" name= "loleafletframe" allowfullscreen style="width:100%;height:100%;position:absolute;" />';

			$('#mainContainer').append(form);
			$('#mainContainer').append(frame);

			// Listen for App_LoadingStatus as soon as possible
			$('#loleafletframe').ready(function() {
				var editorInitListener = function(e) {
					var msg = JSON.parse(e.data);
					if (msg.MessageId === 'App_LoadingStatus') {
						window.removeEventListener('message', editorInitListener, false);
					}
				};
				window.addEventListener('message', editorInitListener, false);
			});

			$('#loleafletframe').load(function(){
				// And start listening to incoming post messages
				window.addEventListener('message', function(e){
					if (documentsMain.isViewerMode) {
						return;
					}

					try {
						var msg = JSON.parse(e.data);
						var msgId = msg.MessageId;
						var args = msg.Values;
						var deprecated = !!args.Deprecated;
					} catch(exc) {
						msgId = e.data;
					}

					if (msgId === 'UI_Close' || msgId === 'close' /* deprecated */) {
						// If a postmesage API is deprecated, we must ignore it and wait for the standard postmessage
						// (or it might already have been fired)
						if (deprecated)
							return;

						documentsMain.onClose();
					} else if (msgId === 'UI_FileVersions' || msgId === 'rev-history' /* deprecated */) {
						if (deprecated)
							return;

						documentsMain.UI.showRevHistory(documentsMain.fullPath);
					} else if (msgId === 'UI_SaveAs') {
						// TODO it's not possible to enter the
						// filename into the OC.dialogs.filepicker; so
						// it will be necessary to use an own tree
						// view or something :-(
						//OC.dialogs.filepicker(t('richdocuments', 'Save As'),
						//      function(val) {
						//              console.log(val);
						//              documentsMain.WOPIPostMessage($('#loleafletframe')[0], Action_SaveAs', {'Filename': val});
						//      }, false, null, true);
						OC.dialogs.prompt(t('richdocuments', 'Please enter the filename to store the document as.'),
						                  t('richdocuments', 'Save As'),
						                  function(result, value) {
							                  if (result === true) {
								                  documentsMain.WOPIPostMessage($('#loleafletframe')[0], 'Action_SaveAs', {'Filename': value});
							                  }
						                  },
						                  true,
						                  t('richdocuments', 'New filename'),
						                  false);
					}
				});

				// Tell the LOOL iframe that we are ready now
				documentsMain.WOPIPostMessage($('#loleafletframe')[0], 'Host_PostmessageReady', {});

				// LOOL Iframe is ready, turn off our overlay
				// This should ideally be taken off when we receive App_LoadingStatus, but
				// for backward compatibility with older lool, lets keep it here till we decide
				// to break older lools
				documentsMain.overlay.documentOverlay('hide');
			});

			// submit that
			$('#loleafletform').submit();

		},

		hideEditor : function(){
			// Fade out editor
			$('#mainContainer').fadeOut('fast', function() {
				$('#mainContainer').remove();
				$('#content-wrapper').fadeIn('fast');
				$(document.body).removeClass('claro');
				parent.document.title = documentsMain.UI.mainTitle;
			});
		},

		showProgress : function(message){
			if (!message){
				message = '&nbsp;';
			}
			$('.documentslist .progress div').text(message);
			$('.documentslist .progress').show();
		},

		hideProgress : function(){
			$('.documentslist .progress').hide();
		},

		notify : function(message){
			OC.Notification.show(message);
			setTimeout(OC.Notification.hide, 10000);
		}
	},

	onStartup: function() {
		var fileId;
		documentsMain.UI.init();

		// Does anything indicate that we need to autostart a session?
		fileId = getURLParameter('fileid').replace(/^\W*/, '');

		documentsMain.show(fileId);

		if (fileId) {
			documentsMain.overlay.documentOverlay('show');
			documentsMain.prepareSession();
		}

		documentsMain.ready = true;
	},

	WOPIPostMessage: function(iframe, msgId, values) {
		if (iframe) {
			var msg = {
				'MessageId': msgId,
				'SendTime': Date.now(),
				'Values': values
			};

			iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
		}
	},

	prepareSession : function(){
		documentsMain.isEditorMode = true;
		documentsMain.overlay.documentOverlay('show');
	},

	initSession: function() {
		documentsMain.urlsrc = richdocuments_urlsrc;
		documentsMain.fullPath = richdocuments_path;
		documentsMain.token = richdocuments_token;

		$('footer,nav').hide();
		$(documentsMain.toolbar).appendTo('#header');

		documentsMain.canShare = typeof OC.Share !== 'undefined' && richdocuments_permissions & OC.PERMISSION_SHARE;

		// fade out file list and show the cloudsuite
		$('#content-wrapper').fadeOut('fast').promise().done(function() {

			documentsMain.fileId = richdocuments_fileId;
			documentsMain.fileName = richdocuments_title;

			documentsMain.canEdit = Boolean(richdocuments_permissions & OC.PERMISSION_UPDATE);

			documentsMain.loadDocument(documentsMain.fileName, documentsMain.fileId);
		});
	},

	view : function(id){
		OC.addScript('richdocuments', 'viewer/viewer', function() {
			$(window).off('beforeunload');
			$(window).off('unload');
			var path = $('li[data-id='+ id +']>a').attr('href');
			odfViewer.isDocuments = true;
			odfViewer.onView(path);
		});
	},

	loadDocument: function(title, fileId) {
		documentsMain.UI.showEditor(title, fileId, 'write');
	},

	onEditorShutdown : function (message){
			OC.Notification.show(message);

			$(window).off('beforeunload');
			$(window).off('unload');
			if (documentsMain.isEditorMode){
				documentsMain.isEditorMode = false;
				parent.location.hash = "";
			} else {
				setTimeout(OC.Notification.hide, 7000);
			}
			documentsMain.UI.hideEditor();

			documentsMain.show();
			$('footer,nav').show();
	},


	onClose: function() {
		documentsMain.isEditorMode = false;
		$(window).off('beforeunload');
		$(window).off('unload');
		parent.location.hash = "";

		$('footer,nav').show();
		documentsMain.UI.hideEditor();
		$('#ocToolbar').remove();

		parent.document.title = documentsMain.UI.mainTitle;
		parent.postMessage('close', '*');
	},

	onCloseViewer: function() {
		$('#revisionsContainer *').off();

		$('#revPanelContainer').remove();
		$('#revViewerContainer').remove();
		documentsMain.isViewerMode = false;
		documentsMain.UI.revisionsStart = 0;

		$('#loleafletframe').focus();
	},

	show: function(fileId){
		documentsMain.UI.showProgress(t('richdocuments', 'Loading documents…'));
		documentsMain.docs.documentGrid('render', fileId);
		documentsMain.UI.hideProgress();
	}
};

$(document).ready(function() {

	if (!OCA.Files) {
		OCA.Files = {};
		OCA.Files.App = {};
		OCA.Files.App.fileList = FileList;
	}

	if (!OC.Share) {
		OC.Share = {};
	}

	window.Files = FileList;

	documentsMain.docs = $('.documentslist').documentGrid();
	documentsMain.overlay = $('<div id="documents-overlay" class="icon-loading"></div><div id="documents-overlay-below" class="icon-loading-dark"></div>').documentOverlay();

	$('li.document a').tipsy({fade: true, live: true});


	documentsMain.onStartup();
});
