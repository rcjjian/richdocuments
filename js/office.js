/*globals $,OC,fileDownloadPath,t,document,odf,webodfEditor,alert,require */
var officeMain = {
	onStartup: function() {
		"use strict"; alert("ready A");
		require(["dojo/ready"], function(ready) {
			ready(function(){alert("ready B!");});
		});
	},
	onView: function(dir, file) {
		"use strict";
		(function no_op() {return {no_op:function(){}};}()).no_op(function() {
			OC.addScript('office', 'webodf').done(function() {
				OC.addScript('office', 'webodf_bootstrap').done(function() {
					OC.addScript('office', 'boot_editor').done(function() {
						var doclocation = fileDownloadPath(dir, file);

						// fade out files menu and add odf menu
						$('.documentslist').fadeOut('slow').promise().done(function() {
							// odf action toolbar
							var odfToolbarHtml =
							'<div id="odf-toolbar">' +
								'<button id="odf_close">' + t('files_odfviewer', 'Close') +
								'</button></div>';
							$('#controls').append(odfToolbarHtml);
						});

						// fade out file list and show WebODF canvas
						$('table').fadeOut('slow').promise().done(function() {
							var odfelement, odfcanvas, canvashtml = '<div id = "mainContainer" style="display: none;">'+
								'<div id = "editor">'+
								'<span id = "toolbar"></span>'+
								'<div id = "container">'+
								'<div id="canvas"></div>'+
								'</div>'+
								'</div>'+
								'</div>';

							$('table').after(canvashtml);
							// in case we are on the public sharing page we shall display the odf into the preview tag
							// $('#preview').html(canvashtml);

							webodfEditor.boot(
							{
								collaborative: 0,
								docUrl: doclocation,
								callback: function() { alert('live!'); }
							}
							);

							// odfelement = document.getElementById("odf-canvas");
							// odfcanvas = new odf.OdfCanvas(odfelement);
							// odfcanvas.load(doclocation);
						});
					});
				});
			});
		});
	},
	onClose: function() {
		// Fade out odf-toolbar
		$('#odf-toolbar').fadeOut('slow');
		// Fade out editor
		$('#odf-canvas').fadeOut('slow', function() {
			$('#odf-toolbar').remove();
			$('#odf-canvas').remove();
			$('.actions,#file_access_panel').fadeIn('slow');
			$('table').fadeIn('slow');
		});
		is_editor_shown = false;
	}
};

$(document).ready(function() {


	$('.documentslist tr').click(function(event) {
		event.preventDefault();
		officeMain.onView('', $(this).attr('data-file'));
	});
	$('#odf_close').live('click', officeMain.onClose);
	OC.addScript('office', 'dojo-amalgamation', officeMain.onStartup);
});