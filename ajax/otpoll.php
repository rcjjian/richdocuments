<?php

/**
 * @license
 * Copyright (C) 2013 KO GmbH <copyright@kogmbh.com>
 *
 * @licstart
 * The JavaScript code in this page is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License
 * (GNU AGPL) as published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.  The code is distributed
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU AGPL for more details.
 *
 * As additional permission under GNU AGPL version 3 section 7, you
 * may distribute non-source (e.g., minimized or compacted) forms of
 * that code without the copy of the GNU GPL normally required by
 * section 4, provided you include this license notice and a URL
 * through which recipients can access the Corresponding Source.
 *
 * As a special exception to the AGPL, any HTML file which merely makes function
 * calls to this code, and for that purpose includes it by reference shall be
 * deemed a separate work for copyright law purposes. In addition, the copyright
 * holders of this code give you permission to combine this code with free
 * software libraries that are released under the GNU LGPL. You may copy and
 * distribute such a system following the terms of the GNU AGPL for this code
 * and the LGPL for the libraries. If you modify this code, you may extend this
 * exception to your version of the code, but you are not obligated to do so.
 * If you do not wish to do so, delete this exception statement from your
 * version.
 *
 * This license applies to this entire compilation.
 * @licend
 * @source: http://www.webodf.org/
 * @source: http://gitorious.org/webodf/webodf/
 */

namespace OCA\Documents;

 \OCP\JSON::checkLoggedIn();
 \OCP\JSON::checkAppEnabled('documents');
 // session_write_close();

$response = array();
try{
	$request = new Request();
	$command = $request->getParam('command');
	switch ($command){
		case 'query_memberdata_list':
			$ids = $request->getParam('args/member_ids');
			$members = Member::getMembersAsArray($ids);
			$response["memberdata_list"] = array_map(
					function($x){
						$x['display_name'] = \OCP\User::getDisplayName($x['uid']);
						
						// Do we have OC_Avatar in out disposal?
						if (!method_exists('\OCP\Avatar', 'get') || \OC_Config::getValue('enable_avatars', true) !== true){
							$x['avatar_url'] = \OCP\Util::linkToRoute('documents_user_avatar');
						} else {
							$avatar = new \OC_Avatar();
							$image = $avatar->get($x['uid'], 64);
							// User has an avatar 
							if ($image instanceof \OC_Image) {
								$x['avatar_url'] = \OC_Helper::linkToRoute(
										'core_avatar_get',
										array( 'user' => $x['uid'], 'size' => 64)
								);
							} else {
								//shortcircuit if it's not an image
								$x['avatar_url'] = \OCP\Util::linkToRoute('documents_user_avatar');
							}
						}
						return $x;
					}, 
					$members
			);
					
			break;
		case 'sync_ops':
			$seqHead = (string) $request->getParam('args/seq_head');
			if (!is_null($seqHead)){
				$esId = $request->getParam('args/es_id');
				$memberId = $request->getParam('args/member_id');
				$ops = $request->getParam('args/client_ops');
				$hasOps = is_array($ops) && count($ops)>0;

				$currentHead = Op::getHeadSeq($esId);
				try {
					Member::updateMemberActivity($memberId);
				} catch (\Exception $e){
					
				}

				// TODO handle the case ($currentHead == "") && ($seqHead != "")
				if ($seqHead == $currentHead) {
					// matching heads
					if ($hasOps) {
						// incoming ops without conflict
						// Add incoming ops, respond with a new head
						$newHead = Op::addOpsArray($esId, $memberId, $ops);
						$response["result"] = 'added';
						$response["head_seq"] = $newHead ? $newHead : $currentHead;
					} else {
						// no incoming ops (just checking for new ops...)
						$response["result"] = 'new_ops';
						$response["ops"] = array();
						$response["head_seq"] = $currentHead;
					}
				} else { // HEADs do not match
					$response["ops"] = Op::getOpsAfterJson($esId, $seqHead);
					$response["head_seq"] = $currentHead;
					$response["result"] = $hasOps ? 'conflict' : 'new_ops';
				}
				
				$inactiveMembers = Member::cleanSession($esId);
				if (is_array($inactiveMembers)){
					foreach ($inactiveMembers as $member){
						Op::removeCursor($esId, $member['member_id']);
					}
				}
				
			} else {
				// Error - no seq_head passed
				throw new BadRequestException();
			}

			break;
		default:
			$ex = new BadRequestException();
			$ex->setBody("{err:'bad request: [" . $request->getRawRequest() . "]'}");
			throw $ex;
			break;
	}

	\OCP\JSON::success($response);
} catch (BadRequestException $e){
	header('HTTP/1.1 400: BAD REQUEST');
	print("");
	print($e->getBody());
	print("");
}
exit();
	
class BadRequestException extends Exception {

	protected $body = "";

	public function setBody($body){
		$this->body = $body;
	}

	public function getBody(){
		return $this->body;
	}
}
