import React, { useState, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import CancelButton from "./CancelButton";
import { CodeStreamState } from "../store";
import { HostApi } from "../webview-api";
import { Button } from "../src/components/Button";
import styled from "styled-components";
import { ButtonRow } from "./ChangeUsernamePanel";
import { UpdateUserRequestType } from "../protocols/agent/agent.protocol.users";
import { logError, logWarning } from "../logger";
import { FormattedMessage } from "react-intl";
import { CSMe } from "@codestream/protocols/api";
import { Link } from "./Link";
import { TextInput } from "../Authentication/TextInput";
import { isEmailValid } from "../Authentication/Signup";
import { GetUserInfoRequestType } from "@codestream/protocols/agent";
import { CSText } from "../src/components/CSText";
import { useDidMount } from "../utilities/hooks";

const Root = styled.div`
	#controls {
		padding-top: 10px;
	}
`;

export const ChangeEmailPanel = props => {
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		return { currentEmail: currentUser.email };
	});
	const [loading, setLoading] = useState(false);
	const [email, setEmail] = useState(derivedState.currentEmail);
	const [emailValidity, setEmailValidity] = useState(true);
	const [unexpectedError, setUnexpectedError] = useState("");
	const [pendingChange, setPendingChange] = useState(false);
	const [emailSent, setEmailSent] = useState(false);
	const [scmEmail, setScmEmail] = useState("");

	useDidMount(() => {
		const getUserInfo = async () => {
			const response = await HostApi.instance.send(GetUserInfoRequestType, {});
			setScmEmail(response.email || "");
		};
		getUserInfo();
	});

	const onValidityChanged = useCallback((field: string, validity: boolean) => {
		switch (field) {
			case "email":
				setEmailValidity(validity);
				break;
			default: {
				logWarning(`${field} not handled`);
			}
		}
	}, []);

	const onSubmit = async (event: React.SyntheticEvent) => {
		setUnexpectedError("");
		event.preventDefault();
		onValidityChanged("email", isEmailValid(email));
		if (!emailValidity) return;

		setLoading(true);
		try {
			const response = await HostApi.instance.send(UpdateUserRequestType, { email });
			HostApi.instance.track("Email Change Request", {});
			if (
				response.user &&
				(response.user as any).$set &&
				(response.user as any).$set.email === email
			) {
				// this means the email was changed, rather than a confirmation email issued, which means
				// we are in an on-prem environment where email confirmation is not required ... in this
				// case we can skip the confirmation panel
				props.closePanel();
				return;
			}
			setPendingChange(true);
			// props.closePanel();
		} catch (error) {
			logError(`Unexpected error during change email: ${error}`, { email });
			setUnexpectedError(error);
		}
		// @ts-ignore
		setLoading(false);
	};

	const onClickSendEmail = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			setEmailSent(false);
			await HostApi.instance.send(UpdateUserRequestType, { email });
			setEmailSent(true);
		},
		[email]
	);

	const renderError = () => {
		return (
			<div className="error-message form-error" style={{ textAlign: "left" }}>
				{unexpectedError.includes("USRC-1025") && <>This email is already taken.</>}
				{!unexpectedError.includes("USRC-1025") && (
					<>
						<FormattedMessage
							id="error.unexpected"
							defaultMessage="Something went wrong! Please try again, or "
						/>
						<FormattedMessage id="contactSupport" defaultMessage="contact support">
							{text => <Link href="https://help.codestream.com">{text}</Link>}
						</FormattedMessage>
					</>
				)}
			</div>
		);
	};

	const renderChangeEmail = () => {
		return (
			<>
				{" "}
				<h3>Change Email</h3>
				<div id="controls">
					<div className="small-spacer" />
					{scmEmail && scmEmail !== derivedState.currentEmail && (
						<div style={{ fontSize: "smaller" }}>
							<CSText as="span">
								Your CodeStream and git commit emails don't match (
								<b>{derivedState.currentEmail}</b> vs. <b>{scmEmail}</b>), which impairs
								CodeStream's ability to identify which commits are yours. Please either update your
								gitconfig or set your CodeStream email to match.
								<br />
								<br />
							</CSText>
						</div>
					)}
					{unexpectedError && renderError()}
					<div className="control-group">
						<label>Email</label>
						<TextInput
							name="email"
							value={email}
							autoFocus
							onChange={setEmail}
							onValidityChanged={onValidityChanged}
							validate={isEmailValid}
						/>
						{!emailValidity && (
							<small className="explainer error-message">
								<FormattedMessage id="signUp.email.invalid" />
							</small>
						)}
						<ButtonRow>
							<Button isLoading={loading}>Save Email</Button>
						</ButtonRow>
					</div>
				</div>
			</>
		);
	};

	const renderConfirmEmail = () => {
		return (
			<>
				<h3>Confirm Email</h3>
				<FormattedMessage id="confirmation.instructionsLinkEmail" tagName="p" />
				<FormattedMessage id="confirmation.didNotReceive">
					{text => (
						<p>
							{text}{" "}
							<FormattedMessage id="confirmation.sendAnother">
								{text => <Link onClick={onClickSendEmail}>{text}</Link>}
							</FormattedMessage>
							. {emailSent && <strong>Email sent!</strong>}
						</p>
					)}
				</FormattedMessage>
				<ButtonRow>
					<Button onClick={props.closePanel}>OK</Button>
				</ButtonRow>
			</>
		);
	};

	return (
		<Root className="full-height-panel onboarding-page" style={{ padding: 0 }}>
			<form className="standard-form vscroll" onSubmit={onSubmit}>
				<div className="panel-header">
					<CancelButton onClick={props.closePanel} />
				</div>
				<fieldset className="form-body" style={{ width: "18em" }}>
					<div className="outline-box">
						{pendingChange ? renderConfirmEmail() : renderChangeEmail()}
					</div>
				</fieldset>
			</form>
		</Root>
	);
};
