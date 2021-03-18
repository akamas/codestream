import React from "react";
import { useDispatch } from "react-redux";
import Icon from "../../Icon";
import { Button } from "@codestream/webview/src/components/Button";
import { OutlineBox, FlexRow } from "./PullRequest";
import { api } from "../../../store/providerPullRequests/actions";
import { PRHeadshotName } from "@codestream/webview/src/components/HeadshotName";
import Tooltip from "../../Tooltip";
import { Link } from "../../Link";
import { GitLabMergeRequest } from "@codestream/protocols/agent";

export const ApproveBox = (props: { pr: GitLabMergeRequest }) => {
	const dispatch = useDispatch();

	// once we can get additional approval data, we can relax/remove this
	if (!props.pr.userPermissions?.canMerge) return null;

	const onApproveClick = async (e: React.MouseEvent<Element, MouseEvent>, approve: boolean) => {
		dispatch(
			api("togglePullRequestApproval", {
				approve: approve
			})
		);
	};

	const approvers = props.pr.approvedBy ? props.pr.approvedBy.nodes : [];
	const iHaveApproved = approvers.find(_ => _.login === props.pr.viewer.login);
	const isApproved = approvers.length > 0;

	return (
		<OutlineBox>
			<FlexRow>
				<div style={{ position: "relative" }}>
					<Icon name="person" className="bigger" />
					<Icon name="check" className="overlap" />
				</div>
				{!props.pr.merged && (
					<>
						{iHaveApproved ? (
							<Tooltip title="Revoke approval" placement="top">
								<Button
									className="action-button"
									variant="warning"
									onClick={e => onApproveClick(e, !iHaveApproved)}
								>
									Revoke
								</Button>
							</Tooltip>
						) : (
							<Button className="action-button" onClick={e => onApproveClick(e, !iHaveApproved)}>
								Approve
							</Button>
						)}
					</>
				)}

				<div className="pad-left">
					{isApproved ? (
						<>
							<b>Merge request approved. </b>
							Approved by{" "}
							{approvers.map(_ => (
								<PRHeadshotName person={_} />
							))}
						</>
					) : (
						<>
							Approval is optional{" "}
							<Link
								href={`${props.pr.baseWebUrl}/help/user/project/merge_requests/merge_request_approvals`}
							>
								<Icon name="info" title="About this feature" placement="top" />
							</Link>
						</>
					)}
				</div>
			</FlexRow>
		</OutlineBox>
	);
};